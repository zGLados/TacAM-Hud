import { useEffect, useState } from 'react';
import type { HudConfig, HudOverlay, SceneId, SceneState } from '@tacam/shared';
import { api, useData, useLive } from '../api';
import { Card, Field, ImageUpload, PageHeader, Toggle, useRun } from '../components/ui';
import { HudMonitor } from '../components/HudMonitor';

const SCENES: { id: SceneId; label: string; hint: string }[] = [
  { id: 'live', label: 'Live HUD', hint: 'Regular in-game HUD' },
  { id: 'starting', label: 'Starting Soon', hint: 'Teams & veto, optional countdown' },
  { id: 'brb', label: 'Be Right Back', hint: 'Short break' },
  { id: 'pause', label: 'Technical pause', hint: 'Score & stats' },
  { id: 'halftime', label: 'Halftime', hint: 'Score, round history, stats' },
  { id: 'veto', label: 'Map veto', hint: 'Bans, picks, decider' },
  { id: 'scoreboard', label: 'Scoreboard', hint: 'Detailed stats of both teams' },
  { id: 'matchEnd', label: 'Match end', hint: 'Winner, MVP & stats' },
  { id: 'upcoming', label: 'Upcoming matches', hint: 'Next matches with start time' },
  { id: 'playerToWatch', label: 'Player to Watch', hint: 'Player card with match stats' },
];

const CONFIRM_KEY = 'tacam.confirmSceneChanges';

/** Per-device preference, stored in localStorage (may be unavailable, e.g. private mode). */
function useConfirmSceneChanges() {
  const [confirm, setConfirm] = useState(() => {
    try {
      return localStorage.getItem(CONFIRM_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const update = (value: boolean) => {
    setConfirm(value);
    try {
      localStorage.setItem(CONFIRM_KEY, String(value));
    } catch {
      // preference just isn't remembered
    }
  };
  return [confirm, update] as const;
}

const sceneLabel = (id: SceneId) => SCENES.find((s) => s.id === id)?.label ?? id;

function ScenePanel() {
  const run = useRun();
  const scene = useLive((s) => s.scene);
  const [confirm, setConfirm] = useConfirmSceneChanges();
  // Scene queued for the next "Take" (preview/program like a vision mixer).
  const [preview, setPreview] = useState<SceneId | null>(null);
  // Drop the queued scene once it is on air (also when the automation switched to it).
  useEffect(() => {
    if (preview && preview === scene?.active) setPreview(null);
  }, [preview, scene?.active]);
  if (!scene) return null;
  const save = (patch: Partial<SceneState>) => run(() => api.scene.save({ ...scene, ...patch }));
  // Starting Soon shows a countdown only when it is started explicitly (Countdown field below).
  const take = (id: SceneId) => save({ active: id });
  const select = (id: SceneId) => {
    if (!confirm) return take(id);
    setPreview(id === scene.active ? null : id);
  };

  return (
    <Card
      title="Scenes"
      actions={
        <>
          <Toggle checked={confirm} onChange={setConfirm} label="Confirm scene changes" />
          <Toggle checked={scene.auto} onChange={(auto) => save({ auto })} label="Automatic (pause / halftime / match end)" />
        </>
      }
    >
      <div className="scene_grid">
        {SCENES.map((s) => (
          <button
            key={s.id}
            className={`scene_button ${scene.active === s.id ? 'active' : ''} ${preview === s.id ? 'queued' : ''}`}
            onClick={() => select(s.id)}
          >
            {scene.active === s.id && <span className="scene_badge live">Live</span>}
            {preview === s.id && <span className="scene_badge queued">Preview</span>}
            <span className="scene_label">{s.label}</span>
            <span className="scene_hint">{s.hint}</span>
          </button>
        ))}
      </div>
      {confirm && (
        <>
          <div className={`take_bar ${preview ? 'has_preview' : ''}`}>
            <span>
              {preview ? (
                <>
                  <b>{sceneLabel(scene.active)}</b> → <b>{sceneLabel(preview)}</b>
                </>
              ) : (
                'Click a scene to queue it. It only goes live with “Take”.'
              )}
            </span>
            <div className="row">
              <button className="button ghost" disabled={!preview} onClick={() => setPreview(null)}>
                Discard
              </button>
              <button className="button primary take_button" disabled={!preview} onClick={() => preview && take(preview)}>
                Take
              </button>
            </div>
          </div>
          <div className="monitors">
            <div className="monitor">
              <div className="monitor_label queued">Preview{preview ? `: ${sceneLabel(preview)}` : ''}</div>
              <HudMonitor src={`/hud/?scene=${preview ?? scene.active}`} title="Preview" />
            </div>
            <div className="monitor">
              <div className="monitor_label live">Live: {sceneLabel(scene.active)}</div>
              <HudMonitor src="/hud/" title="Live" />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** Texts and values used by the scenes: player to watch, headline, countdown. */
function SceneContentPanel() {
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
    <Card title="Scene content">
      {config && (
        <Field label="Player to Watch" hint="Player for the “Player to Watch” scene">
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
        <Field label="Text / headline" hint="Replaces the default title of the scene">
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Technical issues on team A" />
        </Field>
        <button className="button" onClick={() => save({ message })}>
          Apply text
        </button>
      </div>
      <div className="row wrap">
        <Field label="Countdown for Starting Soon (minutes)">
          <input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </Field>
        <button className="button" onClick={() => save({ countdownTo: Date.now() + minutes * 60_000 })}>
          Start countdown
        </button>
        <button className="button ghost" onClick={() => save({ countdownTo: null })}>
          Remove countdown
        </button>
      </div>
      {scene.countdownTo && <p className="muted small">Countdown running until {new Date(scene.countdownTo).toLocaleTimeString()} (shown on Starting Soon).</p>}
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
    <Card title="HUD elements">
      <div className="toggle_grid">
        <Toggle checked={vis.hud} onChange={(v) => setVis('hud', v)} label="HUD visible" />
        <Toggle checked={vis.radar} onChange={(v) => setVis('radar', v)} label="Radar" />
        <Toggle checked={vis.killfeed} onChange={(v) => setVis('killfeed', v)} label="Own kill feed (instead of the CS kill feed)" />
        <Toggle checked={vis.roundHistory} onChange={(v) => setVis('roundHistory', v)} label="Round history" />
        <Toggle checked={vis.economy} onChange={(v) => setVis('economy', v)} label="Economy box" />
        <Toggle checked={vis.sponsors} onChange={(v) => setVis('sponsors', v)} label="Sponsors" />
        <Toggle checked={config.swapTeams} onChange={(swapTeams) => save({ swapTeams })} label="Swap teams left/right" />
        <Toggle
          checked={config.keepTeamSides}
          onChange={(keepTeamSides) => save({ keepTeamSides })}
          label="Keep team sides after halftime"
        />
        <Toggle checked={!config.sideBoxes.hidden} onChange={(v) => save({ sideBoxes: { ...config.sideBoxes, hidden: !v } })} label="Side boxes" />
      </div>
      <p className="muted small">
        With real CS2, use the game's kill feed: <code>cl_draw_only_deathnotices 1</code> in the observer client hides the CS HUD except
        the kill feed. The own kill feed is only needed when the CS HUD is completely off; it is always shown in the demo match.
      </p>
      <p className="muted small">
        CS2 always shows CT on the left, so the teams change sides at halftime. “Keep team sides” keeps each team where it started the map
        (teams are recognized by their players or the CS team name). The observer’s number keys stay the in-game slots.
      </p>
      <div className="row wrap">
        <button className="button" onClick={() => run(() => api.hud.action('radarBigger'))}>
          Radar +
        </button>
        <button className="button" onClick={() => run(() => api.hud.action('radarSmaller'))}>
          Radar −
        </button>
        <button className="button" onClick={() => run(() => api.hud.action('toggleRadarView'))}>
          Radar large/small
        </button>
        <button className="button ghost" onClick={() => run(api.hud.refresh, 'HUD neu geladen')}>
          Reload HUD
        </button>
      </div>
      <Field label="Team logo as player avatar">
        <select value={config.replaceAvatars} onChange={(e) => save({ replaceAvatars: e.target.value as HudConfig['replaceAvatars'] })}>
          <option value="never">Never</option>
          <option value="if_missing">Only without avatar</option>
          <option value="always">Always</option>
        </select>
      </Field>
    </Card>
  );
}

const OVERLAYS: { id: HudOverlay; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'scoreboard', label: 'Scoreboard' },
  { id: 'economy', label: 'Economy graph' },
  { id: 'comparison', label: 'Player comparison' },
];

const NO_PLAYERS: { steamid: string; name: string }[] = [];

function OverlayPanel() {
  const { config, save } = useConfigEditor();
  const livePlayers = useLive((s) => s.summary?.players) ?? NO_PLAYERS;
  if (!config) return null;
  return (
    <Card title="Overlays">
      <div className="row wrap">
        {OVERLAYS.map((o) => (
          <button key={o.id} className={`button ${config.overlay === o.id ? 'primary' : ''}`} onClick={() => save({ overlay: o.id })}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="grid two">
        {(['left', 'right'] as const).map((slot) => (
          <Field key={slot} label={slot === 'left' ? 'Compare: player 1' : 'Compare: player 2'}>
            <select
              value={config.comparison[slot] ?? ''}
              onChange={(e) => save({ comparison: { ...config.comparison, [slot]: e.target.value || null } })}
            >
              <option value="">—</option>
              {livePlayers.map((p) => (
                <option key={p.steamid} value={p.steamid}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <p className="muted small">
        Shown in the center of the live HUD, one at a time. The comparison uses the players of the running game. Also available as Stream
        Deck actions.
      </p>
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
    <Card title="Trivia" actions={<Toggle checked={config.trivia.visible} onChange={(visible) => save({ trivia: { ...config.trivia, visible } })} label="Show" />}>
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Text">
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <button className="button primary" onClick={() => save({ trivia: { title, content, visible: true } })}>
        Apply & show
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
    <Card title="Preview overlays">
      <Field label="Player preview">
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
        label="Show player preview"
      />
      <Field label="Next match">
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
        label="Show match preview"
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
      <h3>{side === 'left' ? 'Left' : 'Right'}</h3>
      <Field label="Title">
        <input value={draft[side].title} onChange={(e) => setDraft({ ...draft, [side]: { ...draft[side], title: e.target.value } })} />
      </Field>
      <Field label="Subtitle">
        <input value={draft[side].subtitle} onChange={(e) => setDraft({ ...draft, [side]: { ...draft[side], subtitle: e.target.value } })} />
      </Field>
      <ImageUpload value={draft[side].image} onChange={(image) => setDraft({ ...draft, [side]: { ...draft[side], image } })} label="Logo" />
    </div>
  );
  return (
    <Card title="Side boxes (freezetime)" actions={<button className="button primary" onClick={() => save({ sideBoxes: draft })}>Save</button>}>
      <p className="muted">Shown above the money boxes during freezetime, only when a title is set.</p>
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
    <Card title="Match & stats">
      <div className="row wrap">
        <button className="button" disabled={!current} onClick={() => current && run(() => api.matches.reverseCurrentMap(current.id), 'Sides of the current map swapped')}>
          Swap teams of the current map (veto)
        </button>
        <button className="button ghost" onClick={() => run(api.stats.reset, 'Stats reset')}>
          Reset stats
        </button>
      </div>
      {!current && <p className="muted">No current match set.</p>}
    </Card>
  );
}

const SECTIONS = [
  { id: 'scenes', label: 'Scenes' },
  { id: 'hud', label: 'HUD' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'content', label: 'Content' },
  { id: 'match', label: 'Match' },
];

export function DirectorPage() {
  const jump = (id: string) => document.getElementById(`director-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <>
      <PageHeader title="Director" description="Control scenes and the HUD live – also works from a second device (Settings → LAN access)." />
      <nav className="jump_bar">
        {SECTIONS.map((s) => (
          <button key={s.id} className="jump_link" onClick={() => jump(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <section id="director-scenes" className="director_section">
        <ScenePanel />
      </section>
      <div className="grid two">
        <section id="director-hud" className="director_section">
          <HudControls />
        </section>
        <section id="director-overlays" className="director_section">
          <OverlayPanel />
        </section>
      </div>
      <section id="director-content" className="director_section">
        <div className="grid two">
          <SceneContentPanel />
          <TriviaPanel />
          <PreviewPanel />
        </div>
        <div className="director_spacer" />
        <SideBoxPanel />
      </section>
      <section id="director-match" className="director_section">
        <MatchControls />
      </section>
    </>
  );
}
