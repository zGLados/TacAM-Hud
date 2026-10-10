import { useEffect, useState } from 'react';
import { SIGNAL_EVENTS, type SignalEvent, type SignalLogEntry, type SignalOutput, type SignalRule } from '@tacam/shared';
import { api, useData, type Settings } from '../api';
import { Card, Field, Toggle, useRun } from '../components/ui';

const EVENT_LABELS: Record<SignalEvent, string> = {
  roundStart: 'Round start (freezetime)',
  roundLive: 'Round live (freezetime over)',
  roundEnd: 'Round end',
  bombPlanted: 'Bomb planted',
  bombDefused: 'Bomb defused',
  bombExploded: 'Bomb exploded',
  ace: 'Ace',
  matchPoint: 'Match point',
  timeout: 'Tactical timeout',
  pause: 'Technical pause',
  halftime: 'Halftime',
  matchEnd: 'Match end',
};

/** Which side an event belongs to, shown next to the filter. */
const FILTER_HINT: Partial<Record<SignalEvent, string>> = {
  roundEnd: 'winner',
  ace: 'player’s team',
  matchPoint: 'team on match point',
  timeout: 'team calling it',
};

const OUTPUT_KINDS: { kind: SignalOutput['kind']; label: string }[] = [
  { kind: 'action', label: 'TacAM action' },
  { kind: 'http', label: 'HTTP request (Companion, webhook)' },
  { kind: 'obsScene', label: 'OBS: switch scene' },
  { kind: 'obsReplay', label: 'OBS: save replay buffer' },
];

const defaultOutput = (kind: SignalOutput['kind']): SignalOutput =>
  kind === 'http'
    ? { kind, method: 'POST', url: 'http://127.0.0.1:8000/api/location/1/0/0/press' }
    : kind === 'action'
      ? { kind, action: 'overlay-scoreboard' }
      : kind === 'obsScene'
        ? { kind, scene: '' }
        : { kind };

/** crypto.randomUUID is missing on plain http LAN access. */
const newId = () => Math.random().toString(36).slice(2, 10);

function RuleEditor({ rule, onChange, onRemove }: { rule: SignalRule; onChange: (r: SignalRule) => void; onRemove: () => void }) {
  const run = useRun();
  const { data: actions } = useData(api.actions.list, []);
  const { data: obs } = useData(api.settings.obsStatus, null);
  const set = (patch: Partial<SignalRule>) => onChange({ ...rule, ...patch });
  const output = rule.output;
  const groups = [...new Set(actions.map((a) => a.group))];
  return (
    <div className={`signal_rule ${rule.enabled ? '' : 'is-off'}`}>
      <div className="signal_rule_row">
        <Toggle checked={rule.enabled} onChange={(enabled) => set({ enabled })} label="" />
        <Field label="When">
          <select value={rule.event} onChange={(e) => set({ event: e.target.value as SignalEvent })}>
            {SIGNAL_EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {EVENT_LABELS[ev]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Only for${FILTER_HINT[rule.event] ? ` (${FILTER_HINT[rule.event]})` : ''}`}>
          <select value={rule.filter ?? ''} onChange={(e) => set({ filter: (e.target.value || null) as SignalRule['filter'] })}>
            <option value="">Any</option>
            <option value="CT">CT</option>
            <option value="T">T</option>
            <option value="left">Left team (HUD)</option>
            <option value="right">Right team (HUD)</option>
          </select>
        </Field>
        <Field label="Delay (s)">
          <input type="number" min={0} max={60} step={0.5} value={rule.delay} onChange={(e) => set({ delay: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      <div className="signal_rule_row">
        <Field label="Then">
          <select value={output.kind} onChange={(e) => set({ output: defaultOutput(e.target.value as SignalOutput['kind']) })}>
            {OUTPUT_KINDS.map((o) => (
              <option key={o.kind} value={o.kind}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {output.kind === 'action' && (
          <Field label="Action">
            <select value={output.action} onChange={(e) => set({ output: { ...output, action: e.target.value } })}>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {actions
                    .filter((a) => a.group === g)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        {output.kind === 'http' && (
          <>
            <Field label="Method">
              <select value={output.method} onChange={(e) => set({ output: { ...output, method: e.target.value as 'GET' | 'POST' } })}>
                <option>POST</option>
                <option>GET</option>
              </select>
            </Field>
            <Field label="URL">
              <input className="grow" value={output.url} onChange={(e) => set({ output: { ...output, url: e.target.value } })} />
            </Field>
          </>
        )}
        {output.kind === 'obsScene' && (
          <Field label="OBS scene">
            {obs?.scenes.length ? (
              <select value={output.scene} onChange={(e) => set({ output: { ...output, scene: e.target.value } })}>
                <option value="">—</option>
                {[...new Set([...obs.scenes, ...(output.scene ? [output.scene] : [])])].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ) : (
              <input value={output.scene} placeholder="Scene name (OBS not connected)" onChange={(e) => set({ output: { ...output, scene: e.target.value } })} />
            )}
          </Field>
        )}
        <div className="signal_rule_buttons">
          <button className="button small" onClick={() => run(async () => {
            const result = await api.signals.test(rule);
            if (!result.ok) throw new Error(result.message);
          }, 'Fired')}>
            Test
          </button>
          <button className="icon_button" aria-label="Remove signal" onClick={onRemove}>
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export function SignalsPanel() {
  const run = useRun();
  const { data: settings, reload } = useData<Settings | null>(api.settings.get, null);
  const [rules, setRules] = useState<SignalRule[] | null>(null);
  const [log, setLog] = useState<SignalLogEntry[]>([]);
  useEffect(() => {
    if (settings && !rules) setRules(settings.signals);
  }, [settings, rules]);
  useEffect(() => {
    const load = () => api.signals.log().then(setLog).catch(() => {});
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);
  if (!settings || !rules) return null;
  const dirty = JSON.stringify(rules) !== JSON.stringify(settings.signals);
  const save = async () => (await run(() => api.settings.saveSignals(rules), 'Signals saved')) && reload();
  const add = () => setRules([...rules, { id: newId(), enabled: true, event: 'roundEnd', filter: null, output: defaultOutput('action'), delay: 0 }]);

  return (
    <>
      <div className="tab_header">
        <p className="muted">
          Game events trigger actions automatically: TacAM actions (overlays, scenes …), HTTP requests for Bitfocus Companion or webhooks, OBS
          scenes and replays.
        </p>
        <div className="row">
          <button className="button ghost" onClick={add}>
            + Signal
          </button>
          <button className="button primary" disabled={!dirty} onClick={save}>
            {dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
      <Card>
        {rules.length ? (
          <div className="stack">
            {rules.map((rule, i) => (
              <RuleEditor
                key={rule.id}
                rule={rule}
                onChange={(r) => setRules(rules.map((x, j) => (j === i ? r : x)))}
                onRemove={() => setRules(rules.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        ) : (
          <p className="muted">
            No signals yet. Example: “Round end → TacAM action: Scoreboard on/off, delay 2 s” plus “Round live → Hide center overlay”, so the
            scoreboard shows between rounds.
          </p>
        )}
        <p className="muted small">
          Companion: enable its HTTP API and use <code>POST http://&lt;companion-ip&gt;:8000/api/location/&lt;page&gt;/&lt;row&gt;/&lt;column&gt;/press</code>. Events also
          fire during the demo match, which makes testing easy.
        </p>
      </Card>
      <Card title="Recent signals">
        {log.length ? (
          <table className="table">
            <tbody>
              {log.map((entry, i) => (
                <tr key={i}>
                  <td className="nowrap muted">{new Date(entry.at).toLocaleTimeString()}</td>
                  <td className="nowrap">{EVENT_LABELS[entry.event]}</td>
                  <td className={entry.ok ? '' : 'bad'}>{entry.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Nothing fired yet.</p>
        )}
      </Card>
    </>
  );
}
