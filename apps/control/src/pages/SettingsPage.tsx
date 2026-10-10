import { useEffect, useState } from 'react';
import { api, useData, type Settings } from '../api';
import { Card, Field, PageHeader, Toggle, useRun, useToast } from '../components/ui';

const OBS_SCENES: [string, string][] = [
  ['live', 'Nur In-Game-HUD'],
  ['starting', 'Starting Soon'],
  ['brb', 'Be Right Back'],
  ['pause', 'Technische Pause'],
  ['halftime', 'Halbzeit'],
  ['veto', 'Map-Veto'],
  ['scoreboard', 'Scoreboard'],
  ['matchEnd', 'Match-Ende'],
  ['upcoming', 'Kommende Matches'],
  ['playerToWatch', 'Player to Watch'],
];

/** navigator.clipboard only exists in secure contexts (not on http://<lan-ip>). */
async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function CopyField({ label, value }: { label: string; value: string }) {
  const run = useRun();
  return (
    <Field label={label}>
      <div className="row">
        <input value={value} readOnly onFocus={(e) => e.target.select()} />
        <button className="button small" onClick={() => run(() => copyText(value), 'Kopiert')}>
          Kopieren
        </button>
      </div>
    </Field>
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
      restartNeeded ? 'Gespeichert – LAN-Zugriff wird nach einem Neustart der App aktiv' : 'Gespeichert'
    );
    if (ok) reload();
  };

  return (
    <>
      <PageHeader title="Einstellungen" actions={<button className="button primary" onClick={save}>Speichern</button>} />
      <div className="grid two">
        <Card title="CS2 Game State Integration">
          <div className="status_row">
            <span className={`status_pill ${settings.gsiInstalled ? 'ok' : 'off'}`}>{settings.gsiInstalled ? 'Config installiert' : 'Config fehlt'}</span>
          </div>
          <Field label="Steam-Ordner" hint={settings.cs2CfgDir ? `CS2 gefunden: ${settings.cs2CfgDir}` : 'Leer lassen für automatische Suche'}>
            <input value={draft.steamPath ?? ''} placeholder="C:\Program Files (x86)\Steam" onChange={(e) => set({ steamPath: e.target.value })} />
          </Field>
          <div className="row wrap">
            <button
              className="button primary"
              onClick={async () => {
                await save();
                const result = await run(api.settings.installGsi);
                if (result) {
                  toast(`Installiert: ${result.file}`);
                  reload();
                }
              }}
            >
              GSI-Config installieren
            </button>
            <a className="button ghost" href="/api/settings/gsi-config">
              Config herunterladen
            </a>
          </div>
          <p className="muted small">Nach der Installation CS2 neu starten. Die Config sendet an Port {settings.gsiPort} und enthält ein geheimes Token.</p>
        </Card>

        <Card title="OBS / Browser-Quelle">
          <CopyField label="HUD-URL (1920×1080, transparent)" value={`${origin}/hud/`} />
          <p className="muted small">In OBS als Browser-Quelle mit 1920×1080 einfügen. „Eigenes CSS“ leer lassen.</p>
          <details>
            <summary className="small">Feste URL pro Szene (Szenenwechsel direkt in OBS)</summary>
            <p className="muted small">
              Jede OBS-Szene bekommt ihre eigene Browser-Quelle. Diese URLs ignorieren die Szenenwahl im Control-Panel;
              „Nur In-Game-HUD“ blendet nie eine Vollbild-Szene ein.
            </p>
            {OBS_SCENES.map(([id, label]) => (
              <CopyField key={id} label={label} value={`${origin}/hud/?scene=${id}`} />
            ))}
          </details>
        </Card>

        <Card title="Zugriff von anderen Geräten" className="span_two">
          <Toggle checked={draft.lanAccess} onChange={(lanAccess) => set({ lanAccess })} label="LAN-Zugriff erlauben (Regie auf Tablet/zweitem PC)" />
          <Field label="PIN" hint="4–12 Ziffern. Wird auf anderen Geräten einmalig abgefragt.">
            <input value={draft.accessPin} inputMode="numeric" onChange={(e) => set({ accessPin: e.target.value.replace(/\D/g, '') })} />
          </Field>
          {settings.lanAccess && settings.addresses.length > 0 && (
            <div className="stack">
              {settings.addresses.map((ip) => (
                <CopyField key={ip} label={`Control-Panel über ${ip}`} value={`http://${ip}:${port}/control/`} />
              ))}
            </div>
          )}
          <p className="muted small">
            Ohne LAN-Zugriff lauscht der Server nur auf diesem Rechner (127.0.0.1). Änderungen am LAN-Zugriff werden nach einem Neustart der App wirksam.
          </p>
        </Card>
      </div>
    </>
  );
}
