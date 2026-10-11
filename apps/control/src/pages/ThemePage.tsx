import { useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME, THEME_COLOR_KEYS, type Theme, type ThemeColorKey } from '@tacam/shared';
import { api, uploadUrl, useData } from '../api';
import { HudMonitor } from '../components/HudMonitor';
import { Card, ColorInput, ConfirmButton, Field, ImageUpload, PageHeader, Toggle, useRun } from '../components/ui';
import { TransferButtons } from '../components/Transfer';

const COLOR_LABELS: Record<ThemeColorKey, string> = {
  primary: 'Accent',
  panel: 'Panel background',
  'panel-strong': 'Main panel',
  ct: 'CT color',
  t: 'T color',
  money: 'Money',
  bomb: 'Bomb timer',
  defuse: 'Defuse',
  border: 'Borders / bars',
  text: 'Text',
  'text-muted': 'Muted text',
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
      <img src={uploadUrl(sponsor.file)!} alt={sponsor.label} title="Click to replace" onClick={() => input.current?.click()} />
      <input value={sponsor.label} placeholder="Name" onChange={(e) => onChange({ ...sponsor, label: e.target.value })} />
      <div className="row">
        <button className="button small" onClick={() => onMove(-1)} disabled={first} aria-label="Move left">
          ←
        </button>
        <button className="button small" onClick={() => input.current?.click()}>
          Replace
        </button>
        <button className="button small" onClick={() => onMove(1)} disabled={last} aria-label="Move right">
          →
        </button>
      </div>
      <button className="icon_button" onClick={onRemove} aria-label="Remove">
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
    <Card title="Background videos">
      <p className="muted">
        Play in random order behind starting soon, be right back and upcoming matches (muted). MP4 or WebM up to 500 MB,
        ideally 1920×1080 at a few Mbit/s so OBS stays smooth.
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
            <button className="icon_button" onClick={() => onChange(videos.filter((_, j) => j !== i))} aria-label="Remove">
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="button" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? 'Uploading…' : 'Upload video'}
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
          const result = await run(() => api.uploadVideo(file), 'Video uploaded – don’t forget to save');
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
  return <HudMonitor key={reloadKey} src="/hud/" title="HUD preview" iframeRef={frame} onLoad={() => setTimeout(post, 500)} />;
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
    const stored = await run(() => api.theme.save(theme), 'Theme saved – HUD updated');
    if (!stored) return;
    // The saved state is the new baseline for "dirty", otherwise the button compares against the old one.
    setSaved(stored);
    setPreviewKey((k) => k + 1);
  };

  return (
    <>
      <PageHeader
        title="Theme editor"
        description="Change colors, logos and sponsors without touching CSS. The preview shows changes immediately."
        actions={
          <>
            <TransferButtons sections={['hud']} />
            <ConfirmButton
              className="ghost"
              // Only the look; sponsors, logos and videos are kept.
              onConfirm={() =>
                set({ colors: DEFAULT_THEME.colors, borderRadius: DEFAULT_THEME.borderRadius, fontFamily: DEFAULT_THEME.fontFamily })
              }
            >
              Default colors
            </ConfirmButton>
            <button className="button primary" disabled={!dirty} onClick={save}>
              {dirty ? 'Save' : 'Saved'}
            </button>
          </>
        }
      />
      <div className="theme_layout">
        <div className="stack">
          <Card title="Colors">
            <div className="color_grid">
              {THEME_COLOR_KEYS.map((key) => (
                <Field key={key} label={COLOR_LABELS[key]}>
                  <ColorInput value={theme.colors[key]} onChange={(value) => set({ colors: { ...theme.colors, [key]: value } })} />
                </Field>
              ))}
            </div>
            <div className="grid two">
              <Field label={`Corner radius: ${theme.borderRadius}px`}>
                <input type="range" min={0} max={20} value={theme.borderRadius} onChange={(e) => set({ borderRadius: Number(e.target.value) })} />
              </Field>
              <Field label="Font" hint="Must be available in the OBS browser; Montserrat is built in">
                <input value={theme.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card title="Tournament">
            <div className="form_with_image">
              <ImageUpload value={theme.tournamentLogo} onChange={(tournamentLogo) => set({ tournamentLogo })} label="Choose tournament logo" />
              <Field label="Tournament name" hint="Shown above the scene titles">
                <input value={theme.tournamentName} onChange={(e) => set({ tournamentName: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card title="Sponsors" actions={<Toggle checked={theme.showSponsors} onChange={(showSponsors) => set({ showSponsors })} label="Show" />}>
            <p className="muted">
              Rotate in the top right corner next to the logo. Click a logo or “Replace” to swap it, the arrows change the order, ×
              removes it. Save afterwards.
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
                label="Add sponsor"
                onChange={(file) => file && set({ sponsors: [...theme.sponsors, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, label: '' }] })}
              />
            </div>
            <Field label={`Switch every ${theme.sponsorInterval} seconds`}>
              <input type="range" min={3} max={60} value={theme.sponsorInterval} onChange={(e) => set({ sponsorInterval: Number(e.target.value) })} />
            </Field>
          </Card>

          <Card
            title="Logo top right"
            actions={<Toggle checked={theme.showBrandLogo} onChange={(showBrandLogo) => set({ showBrandLogo })} label="Show" />}
          >
            <p className="muted">Sits in the top right corner of the HUD, independent of the sponsors. The default is the TacAM logo.</p>
            <div className="form_with_image">
              <ImageUpload value={theme.brandLogo} onChange={(brandLogo) => set({ brandLogo })} label="Choose logo" />
              <Toggle
                checked={theme.brandLogoGrayscale}
                onChange={(brandLogoGrayscale) => set({ brandLogoGrayscale })}
                label="Grayscale and muted (TacAM style)"
              />
            </div>
          </Card>

          <BackgroundVideos videos={theme.backgroundVideos} onChange={(backgroundVideos) => set({ backgroundVideos })} />
        </div>

        <Card title="Preview" className="preview_card">
          <ThemePreview reloadKey={previewKey} theme={theme} />
          <p className="muted small">The preview shows changes immediately, OBS only after saving. Start the demo match in the Live tab for live data.</p>
        </Card>
      </div>
    </>
  );
}
