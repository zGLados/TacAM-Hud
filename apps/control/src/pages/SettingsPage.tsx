import { useEffect, useState } from 'react';
import { api, useData, type HlaeStatus, type Settings } from '../api';
import { Card, CopyField, Field, PageHeader, Toggle, useRun, useToast } from '../components/ui';
import { REPORT_ISSUE_URL } from '../issues';

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

/** HLAE installed and updated by TacAM from the advancedfx GitHub releases. */
function HlaeManager({ onInstalled }: { onInstalled: () => void }) {
  const run = useRun();
  const [status, setStatus] = useState<HlaeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.hlae.status(true).then(setStatus).catch(() => {});
  }, []);
  if (!status) return null;
  if (!status.supported) return <p className="muted small">HLAE only runs on Windows.</p>;
  const { installed, latest } = status;
  const outdated = !!installed && !!latest && installed.version !== latest.version;
  const install = async () => {
    setBusy(true);
    const result = await run(api.hlae.install, installed ? 'HLAE updated' : 'HLAE installed');
    setBusy(false);
    if (result) {
      setStatus(await api.hlae.status(true));
      onInstalled();
    }
  };
  return (
    <div className="row wrap">
      <span className={`status_pill ${installed && !outdated ? 'ok' : 'off'}`}>
        {installed ? `HLAE ${installed.version ?? ''} installed${outdated ? ` – ${latest!.version} available` : ''}` : 'HLAE not installed'}
      </span>
      {(!installed || outdated) && (
        <button className="button small primary" disabled={busy || !latest} onClick={install}>
          {busy ? 'Downloading…' : installed ? `Update to ${latest?.version}` : `Install HLAE ${latest?.version ?? ''}`}
        </button>
      )}
      {status.error && <span className="muted small">Could not check for updates: {status.error}</span>}
    </div>
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

  // Shows what actually went to Steam, so a missing -tools is visible right away.
  const launch = async () => {
    const result = await run(api.game.launch);
    if (result) toast(`CS2 is starting: ${result.args.join(' ')}`);
  };

  const save = async () => {
    const restartNeeded = draft.lanAccess !== settings.lanAccess;
    const ok = await run(
      () => api.settings.save({ steamPath: draft.steamPath || null, lanAccess: draft.lanAccess, accessPin: draft.accessPin, telnet: draft.telnet, launchOptions: draft.launchOptions, launchMode: draft.launchMode, hlaePath: draft.hlaePath.trim(), launchBorderless: draft.launchBorderless }),
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
          <Field label="CS2 launch options" hint={`For “Start CS2”. -netconport ${draft.telnet.port} (console for camera control) is added if missing. TacAM adds +engine_no_focus_sleep 0.`}>
            <input value={draft.launchOptions} onChange={(e) => set({ launchOptions: e.target.value })} placeholder="-novid -netconport 2020" />
          </Field>
          <Field
            label="Launch mode"
            hint={
              draft.launchMode === 'hlae'
                ? 'HLAE starts CS2 with -afxFixNetCon: the console works without Workshop Tools and CS2 keeps running when you tab out. HLAE also brings mirv_campath for camera paths. Insecure mode.'
                : draft.launchMode === 'tools'
                  ? 'Workshop Tools (-tools): console works, but CS2 freezes as soon as another program has the focus. Needs the free “Counter-Strike 2 Workshop Tools” DLC. Insecure mode.'
                  : 'Normal start. On Windows the CS2 console does not open this way (CS2 bug), so camera control is not available.'
            }
          >
            <select value={draft.launchMode} onChange={(e) => set({ launchMode: e.target.value as Settings['launchMode'] })}>
              <option value="hlae">HLAE (recommended for the console and camera paths)</option>
              <option value="tools">Workshop Tools (-tools)</option>
              <option value="normal">Normal</option>
            </select>
          </Field>
          <Toggle
            checked={draft.launchBorderless}
            onChange={(launchBorderless) => set({ launchBorderless })}
            label="Borderless window (-windowed -noborder) – keeps CS2 drawing when you tab out to TacAM or OBS"
          />
          <div className="row">
            <button className="button" onClick={launch}>
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

        <Card title="HLAE (camera control)">
          <p className="muted small">
            HLAE starts CS2 so that TacAM can control it (console, camera paths) without Workshop Tools – CS2 keeps running when you tab out.
            Install it here, then “Start CS2” uses it.
          </p>
          <HlaeManager onInstalled={reload} />
          <Field label="Path to HLAE.exe" hint="Set automatically when TacAM installs HLAE. Only change it to use your own HLAE installation.">
            <input value={draft.hlaePath} onChange={(e) => set({ hlaePath: e.target.value })} placeholder="C:\Tools\hlae\HLAE.exe" />
          </Field>
          {draft.launchMode !== 'hlae' && (
            <p className="muted small">The launch mode is currently “{draft.launchMode === 'tools' ? 'Workshop Tools' : 'Normal'}” – choose HLAE under CS2 Game State Integration to use it.</p>
          )}
        </Card>

        <Card title="App updates">
          <p className="muted small">
            Installed version: <b>v{__APP_VERSION__}</b>. The desktop app checks GitHub for new versions on startup (and via <em>TacAM HUD → Check for updates</em>);
            your data stays when updating.
          </p>
          <Toggle
            checked={settings.betaUpdates}
            onChange={(betaUpdates) => run(() => api.settings.updates(betaUpdates), betaUpdates ? 'Beta versions will be offered' : 'Only stable versions will be offered').then(reload)}
            label="Also offer beta versions"
          />
          <p className="muted small">
            Betas (e.g. v0.3.0-beta.1) are test builds before a release – for testing new features at home, not for a live broadcast. Switching back offers the next stable
            version.
          </p>
          <p className="muted small">
            Found a bug or have an idea?{' '}
            <a href={REPORT_ISSUE_URL} target="_blank" rel="noreferrer">
              Open an issue on GitHub
            </a>{' '}
            – with the version, what you did and a screenshot if possible.
          </p>
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
