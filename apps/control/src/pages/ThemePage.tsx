import { useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME, THEME_COLOR_KEYS, type Theme, type ThemeColorKey } from '@tacam/shared';
import { api, uploadUrl, useData } from '../api';
import { HudMonitor } from '../components/HudMonitor';
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

/** One rotating sponsor: replace the logo in place, rename, reorder or remove it. */
function SponsorItem({
  sponsor,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  sponsor: Theme['sponsors'][number];
  first: boolean;
  last: boolean;
  onChange: (sponsor: Theme['sponsors'][number]) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="sponsor_item">
      <img src={uploadUrl(sponsor.file)!} alt={sponsor.label} title="Klicken zum Ersetzen" onClick={() => input.current?.click()} />
      <input value={sponsor.label} placeholder="Name" onChange={(e) => onChange({ ...sponsor, label: e.target.value })} />
      <div className="row">
        <button className="button small" onClick={() => onMove(-1)} disabled={first} aria-label="Nach vorne">
          ←
        </button>
        <button className="button small" onClick={() => input.current?.click()}>
          Ersetzen
        </button>
        <button className="button small" onClick={() => onMove(1)} disabled={last} aria-label="Nach hinten">
          →
        </button>
      </div>
      <button className="icon_button" onClick={onRemove} aria-label="Entfernen">
        ×
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const result = await run(() => api.upload(file));
          if (result) onChange({ ...sponsor, file: result.file });
        }}
      />
    </div>
  );
}

/** Upload and manage the background videos for the starting soon / BRB / upcoming scenes. */
function BackgroundVideos({ videos, onChange }: { videos: Theme['backgroundVideos']; onChange: (videos: Theme['backgroundVideos']) => void }) {
  const run = useRun();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <Card title="Hintergrundvideos">
      <p className="muted">
        Laufen in zufälliger Reihenfolge hinter Starting Soon, Be Right Back und Kommende Matches (ohne Ton). MP4 oder WebM bis 500 MB,
        am besten 1920×1080 und wenige MBit/s, damit OBS flüssig bleibt.
      </p>
      <div className="stack">
        {videos.map((video, i) => (
          <div key={video.id} className="row">
            <video className="video_thumb" src={uploadUrl(video.file)!} muted preload="metadata" />
            <input
              value={video.label}
              placeholder="Name"
              onChange={(e) => onChange(videos.map((v, j) => (j === i ? { ...v, label: e.target.value } : v)))}
            />
            <button className="icon_button" onClick={() => onChange(videos.filter((_, j) => j !== i))} aria-label="Entfernen">
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="button" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? 'Wird hochgeladen…' : 'Video hochladen'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setUploading(true);
          const result = await run(() => api.uploadVideo(file), 'Video hochgeladen – Speichern nicht vergessen');
          setUploading(false);
          if (result) {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            onChange([...videos, { id, file: result.file, label: file.name.replace(/\.[^.]+$/, '') }]);
          }
        }}
      />
    </Card>
  );
}

/** HUD monitor that also receives the unsaved theme. */
function ThemePreview({ reloadKey, theme }: { reloadKey: number; theme: Theme }) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Push the unsaved theme into the preview; only the iframe sees it, not OBS.
  const post = () => frame.current?.contentWindow?.postMessage({ type: 'tacam:theme-preview', theme }, window.location.origin);
  useEffect(post, [theme]);
  return <HudMonitor key={reloadKey} src="/hud/" title="HUD-Vorschau" iframeRef={frame} onLoad={() => setTimeout(post, 500)} />;
}

export function ThemePage() {
  const run = useRun();
  const { data: saved, setData: setSaved } = useData(api.theme.get, DEFAULT_THEME);
  const [theme, setTheme] = useState<Theme>(saved);
  const [previewKey, setPreviewKey] = useState(0);
  useEffect(() => setTheme(saved), [saved]);
  const set = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch }));
  const dirty = JSON.stringify(theme) !== JSON.stringify(saved);
  const save = async () => {
    const stored = await run(() => api.theme.save(theme), 'Theme gespeichert – HUD aktualisiert');
    if (!stored) return;
    // The saved state is the new baseline for "dirty", otherwise the button compares against the old one.
    setSaved(stored);
    setPreviewKey((k) => k + 1);
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
            <p className="muted">
              Rotieren oben rechts neben dem Logo. Logo anklicken oder „Ersetzen“ tauscht es aus, die Pfeile ändern die Reihenfolge, ×
              entfernt es. Danach speichern.
            </p>
            <div className="sponsor_list">
              {theme.sponsors.map((s, i) => (
                <SponsorItem
                  key={s.id}
                  sponsor={s}
                  first={i === 0}
                  last={i === theme.sponsors.length - 1}
                  onChange={(sponsor) => set({ sponsors: theme.sponsors.map((x, j) => (j === i ? sponsor : x)) })}
                  onMove={(delta) => {
                    const sponsors = [...theme.sponsors];
                    [sponsors[i], sponsors[i + delta]] = [sponsors[i + delta], sponsors[i]];
                    set({ sponsors });
                  }}
                  onRemove={() => set({ sponsors: theme.sponsors.filter((_, j) => j !== i) })}
                />
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
          </Card>

          <Card
            title="Logo oben rechts"
            actions={<Toggle checked={theme.showBrandLogo} onChange={(showBrandLogo) => set({ showBrandLogo })} label="Anzeigen" />}
          >
            <p className="muted">Steht ganz rechts oben im HUD, unabhängig von den Sponsoren. Standard ist das TacAM-Logo.</p>
            <div className="form_with_image">
              <ImageUpload value={theme.brandLogo} onChange={(brandLogo) => set({ brandLogo })} label="Logo" />
              <Toggle
                checked={theme.brandLogoGrayscale}
                onChange={(brandLogoGrayscale) => set({ brandLogoGrayscale })}
                label="Graustufig und gedämpft (TacAM-Stil)"
              />
            </div>
          </Card>

          <BackgroundVideos videos={theme.backgroundVideos} onChange={(backgroundVideos) => set({ backgroundVideos })} />
        </div>

        <Card title="Vorschau" className="preview_card">
          <ThemePreview reloadKey={previewKey} theme={theme} />
          <p className="muted small">Die Vorschau zeigt Änderungen sofort, OBS erst nach dem Speichern. Für Live-Daten das Demo-Match im Live-Tab starten.</p>
        </Card>
      </div>
    </>
  );
}
