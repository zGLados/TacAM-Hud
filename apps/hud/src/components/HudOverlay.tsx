import type { Player, Team } from 'csgogsi';
import type { PlayerMatchStats } from '@tacam/shared';
import { useHud } from '../state/store';
import type { Sides } from '../state/hooks';
import { TeamLogo } from './TeamLogo';

/** Center overlay chosen in the control panel (`HudConfig.overlay`); one at a time. */
export function HudOverlay({ sides }: { sides: Sides }) {
  const overlay = useHud((s) => s.config.overlay);
  if (overlay === 'scoreboard') return <Scoreboard sides={sides} />;
  return null;
}

function Scoreboard({ sides }: { sides: Sides }) {
  const stats = useHud((s) => s.stats.players);
  return (
    <div className="hud-overlay scoreboard">
      <ScoreboardTeam team={sides.left} players={sides.leftPlayers} stats={stats} />
      <ScoreboardTeam team={sides.right} players={sides.rightPlayers} stats={stats} />
    </div>
  );
}

function ScoreboardTeam({ team, players, stats }: { team: Team; players: Player[]; stats: PlayerMatchStats[] }) {
  return (
    <div className="scoreboard__team" data-side={team.side}>
      <div className="scoreboard__header">
        <TeamLogo team={team} className="scoreboard__logo" />
        <div className="scoreboard__team-name">{team.name}</div>
        <div className="scoreboard__score">{team.score}</div>
      </div>
      <table className="scoreboard__table">
        <thead>
          <tr>
            <th className="scoreboard__player">Player</th>
            <th>HP</th>
            <th>K</th>
            <th>A</th>
            <th>D</th>
            <th>ADR</th>
            <th>KAST</th>
            <th>Rating</th>
            <th className="scoreboard__money">Money</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const s = stats.find((x) => x.steamid === player.steamid);
            const dead = player.state.health <= 0;
            return (
              <tr key={player.steamid} className={dead ? 'is-dead' : ''}>
                <td className="scoreboard__player">
                  <span className="scoreboard__slot">{player.observer_slot}</span>
                  {player.name}
                </td>
                <td>{player.state.health}</td>
                <td>{player.stats.kills}</td>
                <td>{player.stats.assists}</td>
                <td>{player.stats.deaths}</td>
                <td>{s?.adr ?? 0}</td>
                <td>{s?.kast ?? 0}%</td>
                <td className={s && s.rating >= 1.1 ? 'is-good' : s && s.rating < 0.9 ? 'is-bad' : ''}>{(s?.rating ?? 0).toFixed(2)}</td>
                <td className="scoreboard__money">${player.state.money}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
