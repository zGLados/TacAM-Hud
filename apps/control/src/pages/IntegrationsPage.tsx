import { useEffect, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { SCENE_IDS, SCENE_LABELS, type ObsSettings, type ObsStatus } from '@tacam/shared';
import { api, useData, type Settings } from '../api';
import { Card, ConfirmButton, copyText, Field, Group, PageHeader, Toggle, useRun } from '../components/ui';
import { SignalsPanel } from './SignalsPage';

/** OBS WebSocket connection and scene mapping (apps/server/src/obs.ts). */
function ObsCard({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const run = useRun();
  const [draft, setDraft] = useState<ObsSettings>(settings.obs);
  const [status, setStatus] = useState<ObsStatus | null>(null);
  useEffect(() => {
    const load = () => api.settings.obsStatus().then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);
  const set = (patch: Partial<ObsSettings>) => setDraft({ ...draft, ...patch });
  const save = async () => (await run(() => api.settings.saveObs(draft), 'OBS settings saved')) && onSaved();
  const scenes = status?.scenes ?? [];
  return (
    <Card
      title="OBS WebSocket"
      className="span_two"
      actions={
        <button className="button primary small" onClick={save}>
          Save
        </button>
      }
    >
      <div className="row wrap">
        <Toggle checked={draft.enabled} onChange={(enabled) => set({ enabled })} label="Connect to OBS" />
        {status?.enabled && (
          <span className={`status_pill ${status.connected ? 'ok' : 'off'}`}>{status.connected ? 'Connected' : status.error ? `Not connected: ${status.error}` : 'Connecting…'}</span>
        )}
      </div>
      <div className="grid two">
        <Field label="WebSocket URL" hint="OBS → Tools → WebSocket Server Settings (OBS 28 or newer)">
          <input value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="ws://127.0.0.1:4455" />
        </Field>
        <Field label="Password">
          <input type="password" value={draft.password} onChange={(e) => set({ password: e.target.value })} />
        </Field>
      </div>
      <Group label="Switch OBS scene with the TacAM scene" hint="Leave empty to keep OBS where it is for that scene.">
        <table className="table trigger_table">
          <tbody>
            {SCENE_IDS.map((id) => (
              <tr key={id}>
                <td>{SCENE_LABELS[id]}</td>
                <td className="right">
                  <select
                    value={draft.sceneMap[id] ?? ''}
                    onChange={(e) => set({ sceneMap: { ...draft.sceneMap, [id]: e.target.value } })}
                  >
                    <option value="">—</option>
                    {/* keep a mapped scene selectable even while OBS is offline */}
                    {[...new Set([...scenes, ...(draft.sceneMap[id] ? [draft.sceneMap[id]!] : [])])].map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Group>
    </Card>
  );
}

/** Turns a keydown into an Electron accelerator ("Ctrl+Shift+F5"); null while only modifiers are held. */
function toAccelerator(e: KeyboardEvent): string | null {
  const code = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) key = `num${code.slice(6)}`;
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else {
    const named: Record<string, string> = {
      Space: 'Space', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
      Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
      BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
    };
    key = named[code] ?? null;
  }
  if (!key) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  return mods.length ? [...mods, key].join('+') : null;
}

function ShortcutInput({ value, onChange }: { value: string; onChange: (accelerator: string) => void }) {
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') return setRecording(false);
      const accelerator = toAccelerator(e);
      if (!accelerator) return;
      setRecording(false);
      onChange(accelerator);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, onChange]);
  return (
    <div className="row">
      <button className={`button small shortcut_input ${recording ? 'primary' : ''}`} onClick={() => setRecording(!recording)}>
        {recording ? 'Press keys… (Esc cancels)' : value || '—'}
      </button>
      {value && !recording && (
        <button className="icon_button" aria-label="Remove shortcut" onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  );
}

/** Global shortcuts of the desktop app, bound to the same actions as the trigger URLs. */
function Keybinds({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const run = useRun();
  const { data: actions } = useData(api.actions.list, []);
  const save = async (id: string, accelerator: string) => {
    const ok = await run(() => api.settings.saveKeybinds({ ...settings.keybinds, [id]: accelerator }), accelerator ? `${accelerator} saved` : 'Shortcut removed');
    if (ok) onSaved();
  };
  const groups = [...new Set(actions.map((a) => a.group))];
  return (
    <Card title="Keyboard shortcuts (desktop app)" className="span_two">
      <p className="muted small">
        Global shortcuts: they work while the TacAM HUD app runs, even when CS2 or OBS has the focus, and take the key combination away
        from other programs. Use at least one modifier (Ctrl, Alt, Shift). In the browser version they have no effect.
      </p>
      {groups.map((group) => (
        <details key={group} open={group === 'HUD'}>
          <summary className="small">{group}</summary>
          <table className="table trigger_table">
            <tbody>
              {actions
                .filter((a) => a.group === group)
                .map((a) => (
                  <tr key={a.id}>
                    <td>{a.label}</td>
                    <td className="right">
                      <ShortcutInput value={settings.keybinds[a.id] ?? ''} onChange={(accelerator) => save(a.id, accelerator)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      ))}
    </Card>
  );
}

/** Trigger URLs for Stream Deck / Bitfocus Companion, see apps/server/src/actions.ts. */
function TriggerUrls({ settings, onKeyChange }: { settings: Settings; onKeyChange: () => void }) {
  const run = useRun();
  const { data: actions } = useData(api.actions.list, []);
  const port = window.location.port || '1349';
  // Other devices only reach the server with LAN access (it listens on 127.0.0.1 otherwise).
  const hosts = ['127.0.0.1', ...(settings.lanAccess ? settings.addresses : [])];
  const [host, setHost] = useState(hosts[0]);
  const url = (id: string) => `http://${host}:${port}/api/trigger/${id}?key=${settings.actionKey}`;
  const stateUrl = (id: string) => `http://${host}:${port}/api/trigger-status/${id}?key=${settings.actionKey}&format=text`;
  const groups = [...new Set(actions.map((a) => a.group))];
  return (
    <Card
      title="Stream Deck / Companion"
      className="span_two"
      actions={
        <ConfirmButton className="small ghost" onConfirm={async () => (await run(api.settings.newActionKey, 'New key – old URLs no longer work')) && onKeyChange()}>
          New key
        </ConfirmButton>
      }
    >
      <p className="muted small">
        Each action is a URL (GET or POST). In Bitfocus Companion use the “Generic HTTP” module, on a Stream Deck any “open URL” / API
        plugin. The key in the URL is secret: anyone with it can trigger the actions. “State” copies a URL that returns 1 or 0 (e.g. scene is
        live, overlay is on) for button feedback in Companion; <code>/api/trigger-status?key=…</code> returns everything as JSON.
      </p>
      <Field label="Address used in the URLs" hint={settings.lanAccess ? undefined : 'Enable LAN access to use the buttons from another computer.'}>
        <select value={host} onChange={(e) => setHost(e.target.value)}>
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h === '127.0.0.1' ? '127.0.0.1 (this computer)' : h}
            </option>
          ))}
        </select>
      </Field>
      {groups.map((group) => (
        <details key={group}>
          <summary className="small">{group}</summary>
          <table className="table trigger_table">
            <tbody>
              {actions
                .filter((a) => a.group === group)
                .map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{a.label}</td>
                    <td className="mono small trigger_url">{url(a.id)}</td>
                    <td className="right nowrap">
                      <button className="button small" onClick={() => run(() => copyText(url(a.id)), 'Copied')}>
                        Copy
                      </button>{' '}
                      {a.hasState && (
                        <button className="button small ghost" title="Returns 1 or 0" onClick={() => run(() => copyText(stateUrl(a.id)), 'State URL copied')}>
                          State
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      ))}
    </Card>
  );
}


const TABS = [
  { id: 'obs', label: 'OBS' },
  { id: 'streamdeck', label: 'Stream Deck / Companion' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'signals', label: 'Signals' },
] as const;

/** Connections to other tools: OBS, Stream Deck / Companion, global shortcuts and signals. */
export function IntegrationsPage() {
  const { tab } = useParams();
  const { data: settings, reload } = useData<Settings | null>(api.settings.get, null);
  if (!TABS.some((t) => t.id === tab)) return <Navigate to="/integrations/obs" replace />;
  return (
    <>
      <PageHeader title="Integrations" description="OBS, Stream Deck / Companion, keyboard shortcuts and automatic signals from game events." />
      <nav className="tabs">
        {TABS.map((t) => (
          <NavLink key={t.id} to={`/integrations/${t.id}`} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      {tab === 'signals' ? (
        <SignalsPanel />
      ) : !settings ? null : tab === 'obs' ? (
        <ObsCard settings={settings} onSaved={reload} />
      ) : tab === 'streamdeck' ? (
        <TriggerUrls settings={settings} onKeyChange={reload} />
      ) : (
        <Keybinds settings={settings} onSaved={reload} />
      )}
    </>
  );
}
