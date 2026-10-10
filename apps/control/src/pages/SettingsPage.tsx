import { useEffect, useState } from 'react';
import { api, useData, type Settings } from '../api';
import { Card, ConfirmButton, CopyField, copyText, Field, PageHeader, Toggle, useRun, useToast } from '../components/ui';

const OBS_SCENES: [string, string][] = [
  ['live', 'In-game HUD only'],
  ['starting', 'Starting Soon'],
  ['brb', 'Be Right Back'],
  ['pause', 'Technical pause'],
  ['halftime', 'Halftime'],
  ['veto', 'Map veto'],
  ['scoreboard', 'Scoreboard'],
  ['matchEnd', 'Match end'],
  ['upcoming', 'Upcoming matches'],
  ['playerToWatch', 'Player to Watch'],
];

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
        plugin. The key in the URL is secret: anyone with it can trigger the actions.
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
                    <td className="right">
                      <button className="button small" onClick={() => run(() => copyText(url(a.id)), 'Copied')}>
                        Copy
                      </button>
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

export function SettingsPage() {
  const run = useRun();
  const toast = useToast();
  const { data: settings, reload } = useData<Settings | null>(api.settings.get, null);
  const [draft, setDraft] = useState<Settings | null>(null);
  useEffect(() => setDraft(settings), [settings]);
  if (!draft || !settings) return null;
  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch });
  const origin = window.location.origin;
  const port = window.location.port || '1349';

  const save = async () => {
    const restartNeeded = draft.lanAccess !== settings.lanAccess;
    const ok = await run(
      () => api.settings.save({ steamPath: draft.steamPath || null, lanAccess: draft.lanAccess, accessPin: draft.accessPin, telnet: draft.telnet }),
      restartNeeded ? 'Saved – LAN access takes effect after restarting the app' : 'Saved'
    );
    if (ok) reload();
  };

  return (
    <>
      <PageHeader title="Settings" actions={<button className="button primary" onClick={save}>Save</button>} />
      <div className="grid two">
        <Card title="CS2 Game State Integration">
          <div className="status_row">
            <span className={`status_pill ${settings.gsiInstalled ? 'ok' : 'off'}`}>{settings.gsiInstalled ? 'Config installed' : 'Config missing'}</span>
          </div>
          <Field label="Steam folder" hint={settings.cs2CfgDir ? `CS2 found: ${settings.cs2CfgDir}` : 'Leave empty to search automatically'}>
            <input value={draft.steamPath ?? ''} placeholder="C:\Program Files (x86)\Steam" onChange={(e) => set({ steamPath: e.target.value })} />
          </Field>
          <div className="row wrap">
            <button
              className="button primary"
              onClick={async () => {
                await save();
                const result = await run(api.settings.installGsi);
                if (result) {
                  toast(`Installed: ${result.file}`);
                  reload();
                }
              }}
            >
              Install GSI config
            </button>
            <a className="button ghost" href="/api/settings/gsi-config">
              Download config
            </a>
          </div>
          <p className="muted small">Restart CS2 after installing. The config sends to port {settings.gsiPort} and contains a secret token.</p>
        </Card>

        <Card title="OBS / browser source">
          <CopyField label="HUD URL (1920×1080, transparent)" value={`${origin}/hud/`} />
          <p className="muted small">Add it in OBS as a 1920×1080 browser source. Leave “Custom CSS” empty.</p>
          <details>
            <summary className="small">Fixed URL per scene (switch scenes in OBS)</summary>
            <p className="muted small">
              Each OBS scene gets its own browser source. These URLs ignore the scene chosen in the control panel;
              “In-game HUD only” never shows a full-screen scene.
            </p>
            {OBS_SCENES.map(([id, label]) => (
              <CopyField key={id} label={label} value={`${origin}/hud/?scene=${id}`} />
            ))}
          </details>
        </Card>

        <Card title="Access from other devices" className="span_two">
          <Toggle checked={draft.lanAccess} onChange={(lanAccess) => set({ lanAccess })} label="Allow LAN access (director on a tablet / second PC)" />
          <Field label="PIN" hint="4–12 digits. Asked once on other devices.">
            <input value={draft.accessPin} inputMode="numeric" onChange={(e) => set({ accessPin: e.target.value.replace(/\D/g, '') })} />
          </Field>
          {settings.lanAccess && settings.addresses.length > 0 && (
            <div className="stack">
              {settings.addresses.map((ip) => (
                <CopyField key={ip} label={`Control panel via ${ip}`} value={`http://${ip}:${port}/control/`} />
              ))}
            </div>
          )}
          <p className="muted small">
            Without LAN access the server only listens on this computer (127.0.0.1). Changes to LAN access take effect after restarting the app.
          </p>
        </Card>

        <TriggerUrls settings={settings} onKeyChange={reload} />
        <Keybinds settings={settings} onSaved={reload} />
      </div>
    </>
  );
}
