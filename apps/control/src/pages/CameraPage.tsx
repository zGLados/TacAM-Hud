import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { prettyMapName, type CameraShot, type LivePlayerSummary } from '@tacam/shared';
import { api, useLive, type CameraStatus } from '../api';
import { Card, ConfirmButton, Field, PageHeader, Toggle, useRun } from '../components/ui';

/**
 * Camera control through HLAE: saved views per map, jumps and smooth paths
 * (apps/server/src/camera.ts). Needs CS2 started via HLAE and the console.
 */
/** One button per player of the running game (spec_player + spec_mode 1), grouped by HUD side. */
function PlayerPicker() {
  const run = useRun();
  const summary = useLive((s) => s.summary);
  if (!summary) return <p className="muted">No game data – the players appear as soon as CS2 (or a demo) sends GSI data.</p>;
  // Key 0 is the tenth slot in CS2, so it sorts last.
  const order = (p: LivePlayerSummary) => (p.observerSlot === null ? 11 : p.observerSlot === 0 ? 10 : p.observerSlot);
  const slotLabel = (p: LivePlayerSummary) => (p.observerSlot === null ? '–' : String(p.observerSlot));
  const column = (side: 'left' | 'right') => {
    const team = summary[side];
    const players = summary.players.filter((p) => p.side === team.side).sort((a, b) => order(a) - order(b));
    return (
      <div className="camera_team" data-side={team.side}>
        <div className="camera_team_name">{team.name}</div>
        {players.map((p) => (
          <button
            key={p.steamid}
            className={`camera_player ${summary.observed === p.steamid ? 'is-observed' : ''} ${p.health <= 0 ? 'is-dead' : ''}`}
            title={/^\d/.test(p.name) ? 'CS2 cannot target names starting with a digit – use Next/Previous' : `spec_player "${p.name}"`}
            onClick={() => run(() => api.camera.spectate(p.steamid))}
          >
            <span className="camera_slot">{slotLabel(p)}</span>
            <span className="camera_player_name">{p.name}</span>
          </button>
        ))}
      </div>
    );
  };
  return (
    <>
      <div className="camera_teams">
        {column('left')}
        {column('right')}
      </div>
      <div className="row">
        <button className="button" onClick={() => run(() => api.camera.step('prev'))}>
          ← Previous player
        </button>
        <button className="button" onClick={() => run(() => api.camera.step('next'))}>
          Next player →
        </button>
      </div>
    </>
  );
}

/** Console commands TacAM runs when a demo / map loads and when CS2 is back in the main menu. */
function MapCommands({ status, onSaved }: { status: CameraStatus; onSaved: () => void }) {
  const run = useRun();
  const [load, setLoad] = useState(status.mapLoadCommands);
  const [menu, setMenu] = useState(status.menuCommands);
  const dirty = load !== status.mapLoadCommands || menu !== status.menuCommands;
  return (
    <Card title="Console commands on demo / map load">
      <p className="muted small">
        One command per line, <code>//</code> starts a comment. Run over the CS2 console when GSI reports a loaded map (before the free camera) and when CS2 is back
        in the main menu. Avoid toggles such as <code>ignoremsg</code> / <code>ignorerad</code> – every run flips them.
      </p>
      <div className="camera_commands">
        <Field label="Demo / map loaded">
          <textarea rows={5} spellCheck={false} value={load} onChange={(e) => setLoad(e.target.value)} />
        </Field>
        <Field label="Back in the main menu">
          <textarea rows={5} spellCheck={false} value={menu} onChange={(e) => setMenu(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <button className="button primary" disabled={!dirty} onClick={() => run(() => api.camera.options({ mapLoadCommands: load, menuCommands: menu }), 'Commands saved').then(onSaved)}>
          Save commands
        </button>
      </div>
    </Card>
  );
}

export function CameraPage() {
  const run = useRun();
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [hlae, setHlae] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [allMaps, setAllMaps] = useState(false);
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [duration, setDuration] = useState(5);
  const [hold, setHold] = useState(true);

  const load = () => api.camera.status().then(setStatus).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);
  const check = async () => {
    const result = await run(api.camera.check);
    setHlae(result ? result.hlae : null);
    load();
  };
  useEffect(() => {
    void api.camera.check().then((r) => setHlae(r.hlae)).catch(() => setHlae(null));
  }, []);

  if (!status) return null;
  const shots = status.shots.filter((s) => allMaps || !status.map || s.map === status.map);
  const save = async () => {
    const shot = await run(() => api.camera.save(name.trim() || `View ${status.shots.length + 1}`), 'View saved');
    if (shot) {
      setName('');
      load();
    }
  };
  const togglePath = (id: string) => setPathIds(pathIds.includes(id) ? pathIds.filter((x) => x !== id) : [...pathIds, id]);
  const move = async (shot: CameraShot, delta: number) => {
    const list = [...status.shots];
    const i = list.findIndex((s) => s.id === shot.id);
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await run(() => api.camera.update(list.map(({ id, name }) => ({ id, name }))));
    load();
  };
  const rename = async (shot: CameraShot) => {
    const next = window.prompt('Name of the view', shot.name)?.trim();
    if (!next) return;
    await run(() => api.camera.update(status.shots.map((s) => ({ id: s.id, name: s.id === shot.id ? next : s.name }))));
    load();
  };

  return (
    <>
      <PageHeader
        title="Camera"
        description="Saved camera views per map and smooth camera paths, controlled through HLAE."
        actions={
          <button className="button primary" onClick={() => run(api.camera.release, 'Back to the game view')}>
            Back to game view
          </button>
        }
      />
      <div className="status_row">
        <span className={`status_pill ${status.connected ? 'ok' : 'off'}`}>{status.connected ? 'Console connected' : 'Console not connected'}</span>
        <span className={`status_pill ${hlae ? 'ok' : 'off'}`}>{hlae === null ? 'HLAE: unknown' : hlae ? 'Running via HLAE' : 'Not running via HLAE'}</span>
        <span className="status_pill">{status.map ? prettyMapName(status.map) : 'No map (no game data)'}</span>
        <button className="button small" onClick={check}>
          Check
        </button>
      </div>
      {hlae === false && (
        <Card>
          <p className="muted">
            Camera control needs CS2 started via HLAE: <Link to="/settings">Settings</Link> → HLAE → install, launch mode HLAE, then “Start CS2”. The console must
            be connected (<Link to="/integrations/console">Integrations → CS2 console</Link>).
          </p>
        </Card>
      )}

      <Card title="Free camera (HLAE)">
        <div className="row">
          <button className="button primary" onClick={() => run(api.camera.free)}>
            Free camera from the current view
          </button>
          <Toggle
            checked={status.freeCameraOnMapLoad}
            onChange={(freeCameraOnMapLoad) => run(() => api.camera.options({ freeCameraOnMapLoad })).then(load)}
            label="Start in the free camera when a demo / map loads"
          />
        </div>
        <table className="camera_keys">
          <tbody>
            <tr><td>W A S D</td><td>move</td><td>R / F</td><td>up / down</td></tr>
            <tr><td>Mouse</td><td>look</td><td>Z / X</td><td>tilt (roll)</td></tr>
            <tr><td>Page Up / Page Down, mouse wheel</td><td>zoom (FOV)</td><td>Home / Numpad 5</td><td>reset view (FOV 90°, no tilt)</td></tr>
            <tr><td>Numpad + / −</td><td>faster / slower</td><td>Esc</td><td>end free camera</td></tr>
          </tbody>
        </table>
        <p className="muted small">
          HLAE keys while CS2 has the focus. If the picture shrinks to a dot or stays tilted, a key got stuck (e.g. after tabbing out): press Home, or use the button
          above / <em>Back to game view</em>.
        </p>
      </Card>

      <Card title="Players">
        <p className="muted small">
          Follow a player in first person – ends a free camera or camera path first. Also available as Stream Deck actions (Spectate player on slot 1–0, Next/Previous player).
        </p>
        <PlayerPicker />
      </Card>

      <Card title="Save the current view">
        <p className="muted small">
          Fly to a spot in CS2 (free camera, or HLAE camera mode: <code>mirv_input camera</code>, WASD + mouse) or spectate a player, then save. The view is
          stored for the current map.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. A site overview" />
          <button className="button primary" type="submit">
            Save current view
          </button>
        </form>
      </Card>

      <Card
        title={`Views${status.map && !allMaps ? ` · ${prettyMapName(status.map)}` : ''}`}
        actions={<Toggle checked={allMaps} onChange={setAllMaps} label="All maps" />}
      >
        {shots.length ? (
          <div className="camera_shots">
            {shots.map((shot) => {
              const order = pathIds.indexOf(shot.id);
              return (
                <div key={shot.id} className={`camera_shot ${order >= 0 ? 'is-in-path' : ''}`}>
                  <button className="button primary camera_go" onClick={() => run(() => api.camera.go(shot.id))}>
                    {shot.name}
                  </button>
                  <div className="muted small">
                    {allMaps && `${prettyMapName(shot.map)} · `}fov {Math.round(shot.fov)}
                  </div>
                  <div className="row">
                    <button className={`button small ${order >= 0 ? 'primary' : 'ghost'}`} onClick={() => togglePath(shot.id)} title="Add to / remove from the camera path">
                      {order >= 0 ? `Path #${order + 1}` : '+ Path'}
                    </button>
                    <button className="icon_button" aria-label="Move up" onClick={() => move(shot, -1)}>
                      ↑
                    </button>
                    <button className="icon_button" aria-label="Move down" onClick={() => move(shot, 1)}>
                      ↓
                    </button>
                    <button className="icon_button" aria-label="Rename" onClick={() => rename(shot)}>
                      ✎
                    </button>
                    <ConfirmButton className="small danger" onConfirm={() => run(() => api.camera.remove(shot.id), 'View deleted').then(load)}>
                      ×
                    </ConfirmButton>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No views for this map yet.</p>
        )}
      </Card>

      <Card title="Camera path">
        <p className="muted small">
          Choose views with “+ Path” in the order the camera should fly through them (at least two). The path starts right away and runs over the given
          duration.
        </p>
        <div className="row wrap">
          <Field label="Duration (seconds)">
            <input type="number" min={0.5} max={120} step={0.5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 5)} />
          </Field>
          <Toggle checked={hold} onChange={setHold} label="Stay on the last view afterwards" />
          <button className="button primary" disabled={pathIds.length < 2} onClick={() => run(() => api.camera.path(pathIds, duration, hold), 'Camera path started')}>
            Play path ({pathIds.length} views)
          </button>
          <button className="button ghost" disabled={!pathIds.length} onClick={() => setPathIds([])}>
            Clear selection
          </button>
        </div>
      </Card>

      <MapCommands status={status} onSaved={load} />
    </>
  );
}
