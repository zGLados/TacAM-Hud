import { useEffect, useState } from 'react';
import { prettyMapName, type LivePlayerSummary, type TeamProfile } from '@tacam/shared';
import { api, useData, useLive, type QuickTeam } from '../api';
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

/** One step for both teams: choose or create the team per side, create unknown players, set the match. */
function QuickSetupModal({ onClose }: { onClose: () => void }) {
  const run = useRun();
  const summary = useLive((s) => s.summary);
  const { data: teams, error: teamsError } = useData(api.teams.list, null as TeamProfile[] | null);
  const teamsLoaded = teams !== null || !!teamsError;
  // Preselect: a team named like the server's mp_teamname, else a new team with that name,
  // else the team TacAM already assumes for the side (players or current match).
  const initial = (slot: 'left' | 'right') => {
    const gsiName = summary?.[slot].gsiName?.trim() ?? '';
    const named = gsiName && (teams ?? []).find((t) => t.name.toLowerCase() === gsiName.toLowerCase());
    if (named) return { id: named.id, name: '' };
    if (gsiName) return { id: 'new', name: gsiName };
    return { id: summary?.[slot].teamId ?? 'new', name: '' };
  };
  const [choice, setChoice] = useState<{ left: string; right: string; leftName: string; rightName: string } | null>(null);
  useEffect(() => {
    // wait for the team list so names can be matched
    if (choice || !summary || !teamsLoaded) return;
    const l = initial('left');
    const r = initial('right');
    setChoice({ left: l.id, right: r.id, leftName: l.name, rightName: r.name });
  });
  const [reassign, setReassign] = useState(true);
  const [setMatch, setSetMatch] = useState(true);
  if (!summary || !choice) return null;
  const team = (slot: 'left' | 'right'): QuickTeam | null => {
    const id = choice[slot];
    if (id && id !== 'new') return { teamId: id };
    const name = (slot === 'left' ? choice.leftName : choice.rightName).trim();
    return name ? { name, shortName: '' } : null;
  };
  const left = team('left');
  const right = team('right');
  const apply = async () => {
    if (!left || !right) return;
    const result = await run(() => api.live.quickSetup({ left, right, reassign, setMatch }));
    if (result) onClose();
  };
  const unknown = (side: string) => summary.players.filter((p) => p.side === side && !p.profileId).length;
  return (
    <Modal
      title="Quick setup"
      onClose={onClose}
      footer={
        <>
          <button className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!left || !right} onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <p className="muted">Assign a team to each side of the running game. Unknown players are created and added to it.</p>
      <div className="grid two">
        {(['left', 'right'] as const).map((slot) => (
          <div key={slot} className="stack">
            <Field label={`${slot === 'left' ? 'Left' : 'Right'} · ${summary[slot].side} · ${unknown(summary[slot].side)} unknown players`}>
              <select value={choice[slot] || 'new'} onChange={(e) => setChoice({ ...choice, [slot]: e.target.value })}>
                <option value="new">New team…</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            {(!choice[slot] || choice[slot] === 'new') && (
              <Field label="Team name">
                <input
                  value={slot === 'left' ? choice.leftName : choice.rightName}
                  onChange={(e) => setChoice({ ...choice, [slot === 'left' ? 'leftName' : 'rightName']: e.target.value })}
                />
              </Field>
            )}
          </div>
        ))}
      </div>
      <Toggle checked={reassign} onChange={setReassign} label="Also move known players to these teams" />
      <Toggle checked={setMatch} onChange={setSetMatch} label="Use these teams for the current match (creates a BO1 if there is none)" />
    </Modal>
  );
}

export function LivePage() {
  const run = useRun();
  const status = useLive((s) => s.status);
  const summary = useLive((s) => s.summary);
  const { data: demo, setData: setDemo } = useData(api.demo.status, { running: false });
  const [adding, setAdding] = useState<LivePlayerSummary | null>(null);
  const [quickSetup, setQuickSetup] = useState(false);

  return (
    <>
      <PageHeader
        title="Live"
        description="Current game state from CS2. Unknown players can be created right here with their SteamID."
        actions={
          <>
            {summary && (
              <button className="button ghost" onClick={() => setQuickSetup(true)}>
                Quick setup
              </button>
            )}
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
      {quickSetup && <QuickSetupModal onClose={() => setQuickSetup(false)} />}
    </>
  );
}
