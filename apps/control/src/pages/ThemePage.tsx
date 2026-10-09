import { useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME, THEME_COLOR_KEYS, type Theme, type ThemeColorKey } from '@tacam/shared';
import { api, uploadUrl, useData } from '../api';
import { Card, ColorInput, ConfirmButton, Field, ImageUpload, PageHeader, Toggle, useRun } from '../components/ui';

const COLOR_LABELS: Record<ThemeColorKey, string> = {
  primary: 'Akzentfarbe',
  panel: 'Panel-Hintergrund',
  'panel-strong': 'Haupt-Panel',
  ct: 'CT-Farbe',
  t: 'T-Farbe',
  money: 'Geld',
  bomb: 'Bomben-Timer',
  defuse: 'Defuse',
  border: 'Rahmen / Balken',
  text: 'Text',
  'text-muted': 'Text gedämpft',
};

/** Renders the 1920×1080 HUD scaled down to the card width. */
function HudPreview({ reloadKey, theme }: { reloadKey: number; theme: Theme }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // Push the unsaved theme into the preview; only the iframe sees it, not OBS.
  const post = () => frame.current?.contentWindow?.postMessage({ type: 'tacam:theme-preview', theme }, window.location.origin);
  useEffect(post, [theme]);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1920));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="hud_preview" ref={box}>
      <iframe ref={frame} key={reloadKey} src="/hud/" title="HUD-Vorschau" style={{ transform: `scale(${scale})` }} onLoad={() => setTimeout(post, 500)} />
    </div>
  );
}

export function ThemePage() {
  const run = useRun();
  const { data: saved } = useData(api.theme.get, DEFAULT_THEME);
  const [theme, setTheme] = useState<Theme>(saved);
  const [previewKey, setPreviewKey] = useState(0);
  useEffect(() => setTheme(saved), [saved]);
  const set = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch }));
  const dirty = JSON.stringify(theme) !== JSON.stringify(saved);
  const save = async () => {
    if (await run(() => api.theme.save(theme), 'Theme gespeichert – HUD aktualisiert')) setPreviewKey((k) => k + 1);
  };

  return (
    <>
      <PageHeader
        title="Theme-Editor"
        description="Farben, Logos und Sponsoren ändern, ohne CSS anzufassen. Änderungen erscheinen sofort im HUD."
        actions={
          <>
            <ConfirmButton className="ghost" onConfirm={() => setTheme(DEFAULT_THEME)}>
              TacAM-Standard
            </ConfirmButton>
            <button className="button primary" disabled={!dirty} onClick={save}>
              {dirty ? 'Speichern' : 'Gespeichert'}
            </button>
          </>
        }
      />
      <div className="theme_layout">
        <div className="stack">
          <Card title="Farben">
            <div className="color_grid">
              {THEME_COLOR_KEYS.map((key) => (
                <Field key={key} label={COLOR_LABELS[key]}>
                  <ColorInput value={theme.colors[key]} onChange={(value) => set({ colors: { ...theme.colors, [key]: value } })} />
                </Field>
              ))}
            </div>
            <div className="grid two">
              <Field label={`Eckenradius: ${theme.borderRadius}px`}>
                <input type="range" min={0} max={20} value={theme.borderRadius} onChange={(e) => set({ borderRadius: Number(e.target.value) })} />
              </Field>
              <Field label="Schriftart" hint="Muss im OBS-Browser verfügbar sein; Montserrat ist eingebaut">
                <input value={theme.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card title="Turnier">
            <div className="form_with_image">
              <ImageUpload value={theme.tournamentLogo} onChange={(tournamentLogo) => set({ tournamentLogo })} label="Turnierlogo" />
              <Field label="Turniername" hint="Erscheint über den Szenen-Titeln">
                <input value={theme.tournamentName} onChange={(e) => set({ tournamentName: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card title="Sponsoren" actions={<Toggle checked={theme.showSponsors} onChange={(showSponsors) => set({ showSponsors })} label="Anzeigen" />}>
            <p className="muted">Ohne eigene Sponsoren werden die TacAM-Standardlogos verwendet.</p>
            <div className="sponsor_list">
              {theme.sponsors.map((s, i) => (
                <div key={s.id} className="sponsor_item">
                  <img src={uploadUrl(s.file)!} alt={s.label} />
                  <input value={s.label} placeholder="Name" onChange={(e) => set({ sponsors: theme.sponsors.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <button className="icon_button" onClick={() => set({ sponsors: theme.sponsors.filter((_, j) => j !== i) })} aria-label="Entfernen">
                    ×
                  </button>
                </div>
              ))}
              <ImageUpload
                value={null}
                label="Sponsor hinzufügen"
                onChange={(file) => file && set({ sponsors: [...theme.sponsors, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, label: '' }] })}
              />
            </div>
            <Field label={`Wechsel alle ${theme.sponsorInterval} Sekunden`}>
              <input type="range" min={3} max={60} value={theme.sponsorInterval} onChange={(e) => set({ sponsorInterval: Number(e.target.value) })} />
            </Field>
            <Field label="Statisches Marken-Logo (rechts, graustufig)">
              <ImageUpload value={theme.brandLogo} onChange={(brandLogo) => set({ brandLogo })} label="Logo" />
            </Field>
          </Card>
        </div>

        <Card title="Vorschau" className="preview_card">
          <HudPreview reloadKey={previewKey} theme={theme} />
          <p className="muted small">Die Vorschau zeigt Änderungen sofort, OBS erst nach dem Speichern. Für Live-Daten das Demo-Match im Live-Tab starten.</p>
        </Card>
      </div>
    </>
  );
}
