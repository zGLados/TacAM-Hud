import { useEffect, useState } from 'react';
import type { HudConfig, SceneId, SceneState } from '@tacam/shared';
import { api, useData, useLive } from '../api';
import { Card, Field, ImageUpload, PageHeader, Toggle, useRun } from '../components/ui';

const SCENES: { id: SceneId; label: string; hint: string }[] = [
  { id: 'live', label: 'Live-HUD', hint: 'Normales In-Game-HUD' },
  { id: 'starting', label: 'Starting Soon', hint: 'Countdown, Teams & Veto' },
  { id: 'brb', label: 'Be Right Back', hint: 'Kurze Unterbrechung' },
  { id: 'pause', label: 'Technische Pause', hint: 'Score & Stats' },
  { id: 'halftime', label: 'Halbzeit', hint: 'Score, Rundenverlauf, Stats' },
  { id: 'veto', label: 'Map-Veto', hint: 'Bans, Picks, Decider' },
  { id: 'scoreboard', label: 'Scoreboard', hint: 'Detaillierte Stats beider Teams' },
  { id: 'matchEnd', label: 'Match-Ende', hint: 'Sieger, MVP & Stats' },
  { id: 'upcoming', label: 'Kommende Matches', hint: 'Nächste Matches mit Startzeit' },
  { id: 'playerToWatch', label: 'Player to Watch', hint: 'Spieler-Karte mit Match-Stats' },
];

function ScenePanel() {
  const run = useRun();
  const scene = useLive((s) => s.scene);
  const { config, save: saveConfig } = useConfigEditor();
  const { data: players } = useData(api.players.list, []);
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState(10);
  useEffect(() => setMessage(scene?.message ?? ''), [scene?.message]);
  if (!scene) return null;
  const save = (patch: Partial<SceneState>) => run(() => api.scene.save({ ...scene, ...patch }));

  return (
    <Card
      title="Szenen"
      actions={<Toggle checked={scene.auto} onChange={(auto) => save({ auto })} label="Automatisch (Pause / Halbzeit / Match-Ende)" />}
    >
      <div className="scene_grid">
        {SCENES.map((s) => (
          <button
            key={s.id}
            className={`scene_button ${scene.active === s.id ? 'active' : ''}`}
            onClick={() =>
              save({
                active: s.id,
                countdownTo: s.id === 'starting' && !scene.countdownTo ? Date.now() + minutes * 60_000 : scene.countdownTo,
              })
            }
          >
            <span className="scene_label">{s.label}</span>
            <span className="scene_hint">{s.hint}</span>
          </button>
        ))}
      </div>
      {config && (
        <Field label="Player to Watch" hint="Spieler für die Szene „Player to Watch“">
          <select value={config.playerToWatch ?? ''} onChange={(e) => saveConfig({ playerToWatch: e.target.value || null })}>
            <option value="">—</option>
            {[...players]
              .sort((a, b) => a.username.localeCompare(b.username))
              .map((p) => (
                <option key={p.id} value={p.steamid}>
                  {p.username}
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="row wrap">
        <Field label="Text / Überschrift" hint="Ersetzt den Standardtitel der Szene">
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="z. B. Technische Probleme bei Team A" />
        </Field>
        <button className="button" onClick={() => save({ message })}>
          Text übernehmen
        </button>
      </div>
      <div className="row wrap">
        <Field label="Countdown (Minuten)">
          <input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </Field>
        <button className="button" onClick={() => save({ countdownTo: Date.now() + minutes * 60_000 })}>
          Countdown starten
        </button>
        <button className="button ghost" onClick={() => save({ countdownTo: null })}>
          Countdown entfernen
        </button>
      </div>
    </Card>
  );
}

function useConfigEditor() {
  const run = useRun();
  const config = useLive((s) => s.config);
  const save = (patch: Partial<HudConfig>) => config && run(() => api.hud.saveConfig({ ...config, ...patch }));
  return { config, save };
}

function HudControls() {
  const run = useRun();
  const { config, save } = useConfigEditor();
  if (!config) return null;
  const vis = config.visibility;
  const setVis = (key: keyof HudConfig['visibility'], value: boolean) => save({ visibility: { ...vis, [key]: value } });
  return (
    <Card title="HUD-Elemente">
      <div className="toggle_grid">
        <Toggle checked={vis.hud} onChange={(v) => setVis('hud', v)} label="HUD sichtbar" />
        <Toggle checked={vis.radar} onChange={(v) => setVis('radar', v)} label="Radar" />
        <Toggle checked={vis.killfeed} onChange={(v) => setVis('killfeed', v)} label="Killfeed" />
        <Toggle checked={vis.roundHistory} onChange={(v) => setVis('roundHistory', v)} label="Rundenverlauf" />
        <Toggle checked={vis.economy} onChange={(v) => setVis('economy', v)} label="Economy-Box" />
        <Toggle checked={vis.sponsors} onChange={(v) => setVis('sponsors', v)} label="Sponsoren" />
        <Toggle checked={config.swapTeams} onChange={(swapTeams) => save({ swapTeams })} label="Teams links/rechts tauschen" />
        <Toggle checked={!config.sideBoxes.hidden} onChange={(v) => save({ sideBoxes: { ...config.sideBoxes, hidden: !v } })} label="Seitenboxen" />
      </div>
      <div className="row wrap">
        <button className="button" onClick={() => run(() => api.hud.action('radarBigger'))}>
          Radar +
        </button>
        <button className="button" onClick={() => run(() => api.hud.action('radarSmaller'))}>
          Radar −
        </button>
        <button className="button" onClick={() => run(() => api.hud.action('toggleRadarView'))}>
          Radar groß/klein
        </button>
        <button className="button ghost" onClick={() => run(api.hud.refresh, 'HUD neu geladen')}>
          HUD neu laden
        </button>
      </div>
      <Field label="Teamlogo als Spieler-Avatar">
        <select value={config.replaceAvatars} onChange={(e) => save({ replaceAvatars: e.target.value as HudConfig['replaceAvatars'] })}>
          <option value="never">Nie</option>
          <option value="if_missing">Nur wenn kein Avatar</option>
          <option value="always">Immer</option>
        </select>
      </Field>
    </Card>
  );
}

function TriviaPanel() {
  const { config, save } = useConfigEditor();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  useEffect(() => {
    setTitle(config?.trivia.title ?? '');
    setContent(config?.trivia.content ?? '');
  }, [config?.trivia.title, config?.trivia.content]);
  if (!config) return null;
  return (
    <Card title="Trivia" actions={<Toggle checked={config.trivia.visible} onChange={(visible) => save({ trivia: { ...config.trivia, visible } })} label="Anzeigen" />}>
      <Field label="Titel">
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Text">
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <button className="button primary" onClick={() => save({ trivia: { title, content, visible: true } })}>
        Übernehmen & anzeigen
      </button>
    </Card>
  );
}

function PreviewPanel() {
  const { config, save } = useConfigEditor();
  const { data: players } = useData(api.players.list, []);
  const { data: matches } = useData(api.matches.list, []);
  const { data: teams } = useData(api.teams.list, []);
  if (!config) return null;
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '?';
  return (
    <Card title="Vorschau-Einblendungen">
      <Field label="Spieler-Vorschau">
        <select
          value={config.playerPreview.steamid ?? ''}
          onChange={(e) => save({ playerPreview: { ...config.playerPreview, steamid: e.target.value || null } })}
        >
          <option value="">—</option>
          {players.map((p) => (
            <option key={p.id} value={p.steamid}>
              {p.username}
            </option>
          ))}
        </select>
      </Field>
      <Toggle
        checked={config.playerPreview.visible}
        onChange={(visible) => save({ playerPreview: { ...config.playerPreview, visible } })}
        label="Spieler-Vorschau anzeigen"
      />
      <Field label="Nächstes Match">
        <select
          value={config.matchPreview.matchId ?? ''}
          onChange={(e) => save({ matchPreview: { ...config.matchPreview, matchId: e.target.value || null } })}
        >
          <option value="">—</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {teamName(m.left.id)} vs {teamName(m.right.id)} {m.title && `· ${m.title}`}
            </option>
          ))}
        </select>
      </Field>
      <Toggle
        checked={config.matchPreview.visible}
        onChange={(visible) => save({ matchPreview: { ...config.matchPreview, visible } })}
        label="Match-Vorschau anzeigen"
      />
    </Card>
  );
}

function SideBoxPanel() {
  const { config, save } = useConfigEditor();
  const [draft, setDraft] = useState(config?.sideBoxes);
  useEffect(() => setDraft(config?.sideBoxes), [config?.sideBoxes]);
  if (!config || !draft) return null;
  const box = (side: 'left' | 'right') => (
    <div className="stack">
      <h3>{side === 'left' ? 'Links' : 'Rechts'}</h3>
      <Field label="Titel">
        <input value={draft[side].title} onChange={(e) => setDraft({ ...draft, [side]: { ...draft[side], title: e.target.value } })} />
      </Field>
      <Field label="Untertitel">
        <input value={draft[side].subtitle} onChange={(e) => setDraft({ ...draft, [side]: { ...draft[side], subtitle: e.target.value } })} />
      </Field>
      <ImageUpload value={draft[side].image} onChange={(image) => setDraft({ ...draft, [side]: { ...draft[side], image } })} label="Logo" />
    </div>
  );
  return (
    <Card title="Seitenboxen (Freezetime)" actions={<button className="button primary" onClick={() => save({ sideBoxes: draft })}>Speichern</button>}>
      <p className="muted">Erscheinen in der Freezetime über den Geldboxen, nur wenn ein Titel gesetzt ist.</p>
      <div className="grid two">
        {box('left')}
        {box('right')}
      </div>
    </Card>
  );
}

function MatchControls() {
  const run = useRun();
  const { data: matches } = useData(api.matches.list, []);
  const current = matches.find((m) => m.current);
  return (
    <Card title="Match & Statistik">
      <div className="row wrap">
        <button className="button" disabled={!current} onClick={() => current && run(() => api.matches.reverseCurrentMap(current.id), 'Seiten der aktuellen Map getauscht')}>
          Teams der aktuellen Map tauschen (Veto)
        </button>
        <button className="button ghost" onClick={() => run(api.stats.reset, 'Statistik zurückgesetzt')}>
          Statistik zurücksetzen
        </button>
      </div>
      {!current && <p className="muted">Kein aktuelles Match gesetzt.</p>}
    </Card>
  );
}

export function DirectorPage() {
  return (
    <>
      <PageHeader title="Regie" description="Szenen und HUD live steuern – funktioniert auch auf einem zweiten Gerät (Einstellungen → LAN-Zugriff)." />
      <ScenePanel />
      <div className="grid two">
        <HudControls />
        <TriviaPanel />
        <PreviewPanel />
        <MatchControls />
      </div>
      <SideBoxPanel />
    </>
  );
}
