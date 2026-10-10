import { useEffect, useState } from 'react';
import { api, useData, type Settings } from '../api';
import { Card, CopyField, Field, PageHeader, Toggle, useRun, useToast } from '../components/ui';

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
      () => api.settings.save({ steamPath: draft.steamPath || null, lanAccess: draft.lanAccess, accessPin: draft.accessPin, telnet: draft.telnet, launchOptions: draft.launchOptions }),
      restartNeeded ? 'Saved – LAN access takes effect after restarting the app' : 'Saved'
    );
    if (ok) reload();
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Game connection, OBS browser source and LAN access. OBS WebSocket, Stream Deck, shortcuts and signals are under Integrations."
        actions={<button className="button primary" onClick={save}>Save</button>} />
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
          <Field label="CS2 launch options" hint={`For “Start CS2”. -netconport ${draft.telnet.port} (console for camera control) is added if missing. On Windows the console also needs -tools (Workshop Tools DLC).`}>
            <input value={draft.launchOptions} onChange={(e) => set({ launchOptions: e.target.value })} placeholder="-novid -netconport 2020" />
          </Field>
          <div className="row">
            <button className="button" onClick={() => run(api.game.launch, 'CS2 is starting (via Steam)')}>
              Start CS2
            </button>
            <span className="muted small">Starts CS2 on the computer running TacAM HUD. Save changed options first.</span>
          </div>
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

      </div>
    </>
  );
}
