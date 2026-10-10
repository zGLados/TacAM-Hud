import { useState } from 'react';
import { prettyMapName, type LivePlayerSummary } from '@tacam/shared';
import { api, useData, useLive } from '../api';
import { Card, Field, Modal, PageHeader, Toggle, useRun } from '../components/ui';

function AddPlayerModal({ player, onClose }: { player: LivePlayerSummary; onClose: () => void }) {
  const run = useRun();
  const { data: teams } = useData(api.teams.list, []);
  const [username, setUsername] = useState(player.name);
  const [teamId, setTeamId] = useState<string>('');
  const [isCoach, setIsCoach] = useState(false);
  const save = async () => {
    const created = await run(
      () =>
        api.players.create({
          steamid: player.steamid,
          username,
          firstName: '',
          lastName: '',
          country: null,
          avatar: null,
          teamId: teamId || null,
          isCoach,
          extra: {},
        }),
      `${username} created`
    );
    if (created) onClose();
  };
  return (
    <Modal
      title="Create player"
      onClose={onClose}
      footer={
        <>
          <button className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" onClick={save}>
            Create
          </button>
        </>
      }
    >
      <Field label="SteamID64">
        <input value={player.steamid} disabled />
      </Field>
      <Field label="Name">
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label="Team">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— no team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Toggle checked={isCoach} onChange={setIsCoach} label="Coach (hidden in the HUD)" />
    </Modal>
  );
}

function TeamTable({ side, players, onAdd }: { side: 'left' | 'right'; players: LivePlayerSummary[]; onAdd: (p: LivePlayerSummary) => void }) {
  const summary = useLive((s) => s.summary)!;
  const team = summary[side];
  return (
    <Card title={<span className={`side_${team.side}`}>{team.name} · {team.score}</span>}>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>K</th>
            <th>A</th>
            <th>D</th>
            <th>HP</th>
            <th>$</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {players
            .filter((p) => p.side === team.side)
            .sort((a, b) => (a.observerSlot ?? 10) - (b.observerSlot ?? 10))
            .map((p) => (
              <tr key={p.steamid} className={summary.observed === p.steamid ? 'highlight' : ''}>
                <td>{p.observerSlot}</td>
                <td>
                  {p.name}
                  <div className="muted small">{p.steamid}</div>
                </td>
                <td>{p.kills}</td>
                <td>{p.assists}</td>
                <td>{p.deaths}</td>
                <td>{p.health}</td>
                <td>${p.money}</td>
                <td className="right">
                  {p.profileId ? (
                    <span className="badge ok">known</span>
                  ) : (
                    <button className="button small" onClick={() => onAdd(p)}>
                      + Create
                    </button>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}

export function LivePage() {
  const run = useRun();
  const status = useLive((s) => s.status);
  const summary = useLive((s) => s.summary);
  const { data: demo, setData: setDemo } = useData(api.demo.status, { running: false });
  const [adding, setAdding] = useState<LivePlayerSummary | null>(null);

  return (
    <>
      <PageHeader
        title="Live"
        description="Current game state from CS2. Unknown players can be created right here with their SteamID."
        actions={
          <>
            <button className="button ghost" onClick={() => run(api.demo.seed, 'Demo teams, players and match created')}>
              Create demo data
            </button>
            {demo.running ? (
              <button className="button" onClick={async () => setDemo((await run(api.demo.stop)) ?? demo)}>
                Stop demo
              </button>
            ) : (
              <button className="button primary" onClick={async () => setDemo((await run(api.demo.start)) ?? demo)}>
                Start demo match
              </button>
            )}
          </>
        }
      />
      <div className="status_row">
        <div className={`status_pill ${status?.connected ? 'ok' : 'off'}`}>
          {status?.connected ? 'GSI connected' : 'No GSI data'}
        </div>
        {summary && (
          <>
            <div className="status_pill">{prettyMapName(summary.map)}</div>
            <div className="status_pill">Round {summary.round + 1}</div>
            <div className="status_pill">{summary.roundPhase ?? summary.mapPhase}</div>
          </>
        )}
        {demo.running && <div className="status_pill warn">Demo running</div>}
      </div>
      {!summary ? (
        <Card>
          <p className="muted">
            No data yet. Start CS2 as a spectator (install the GSI config under <b>Settings</b>) or start the demo match.
          </p>
        </Card>
      ) : (
        <div className="grid two">
          <TeamTable side="left" players={summary.players} onAdd={setAdding} />
          <TeamTable side="right" players={summary.players} onAdd={setAdding} />
        </div>
      )}
      {adding && <AddPlayerModal player={adding} onClose={() => setAdding(null)} />}
    </>
  );
}
