import type { Player, Team } from 'csgogsi';
import { sideInRound, type PlayerMatchStats, type RoundRecord, type TeamEconomy } from '@tacam/shared';
import { GSI, useHud } from '../state/store';
import type { Sides } from '../state/hooks';
import { defaultAvatar } from '../lib/assets';
import { TeamLogo } from './TeamLogo';

/** Center overlay chosen in the control panel (`HudConfig.overlay`); one at a time. */
export function HudOverlay({ sides }: { sides: Sides }) {
  const overlay = useHud((s) => s.config.overlay);
  if (overlay === 'scoreboard') return <Scoreboard sides={sides} />;
  if (overlay === 'economy') return <EconomyGraph sides={sides} />;
  if (overlay === 'comparison') return <PlayerComparison />;
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

const GRAPH = { width: 1040, height: 260, padLeft: 56, padBottom: 26, padTop: 10 };

/** Equipment value per round for both teams, following them across side switches. */
function EconomyGraph({ sides }: { sides: Sides }) {
  const rounds = useHud((s) => s.stats.rounds);
  const game = useHud((s) => s.game);
  if (!game) return null;
  const currentRound = game.map.round + 1;
  const rules = { regulationMR: GSI.regulationMR, overtimeMR: GSI.overtimeMR };
  const economyOf = (team: Team, record: RoundRecord): TeamEconomy | null =>
    record.economy[sideInRound(team.side, currentRound, record.round, rules)];
  const max = Math.max(10000, ...rounds.flatMap((r) => [r.economy.CT?.equipment ?? 0, r.economy.T?.equipment ?? 0]));
  // multiples of 10k keep the middle grid line at a round value
  const top = Math.ceil(max / 10000) * 10000;
  const slots = Math.max(GSI.regulationMR * 2, rounds.length);
  const plotW = GRAPH.width - GRAPH.padLeft;
  const plotH = GRAPH.height - GRAPH.padBottom - GRAPH.padTop;
  const slotW = plotW / slots;
  const barW = Math.max(3, slotW / 2 - 3);
  const y = (value: number) => GRAPH.padTop + plotH - (value / top) * plotH;
  const teams = [
    { team: sides.left, offset: 0 },
    { team: sides.right, offset: barW + 1 },
  ];
  return (
    <div className="hud-overlay economy-graph">
      <div className="economy-graph__header">
        <span className="economy-graph__title">Economy</span>
        {teams.map(({ team }) => (
          <span key={team.side} className="economy-graph__legend" data-side={team.side}>
            {team.name}
          </span>
        ))}
      </div>
      <svg width={GRAPH.width} height={GRAPH.height} className="economy-graph__chart">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="economy-graph__grid" x1={GRAPH.padLeft} x2={GRAPH.width} y1={y(top * f)} y2={y(top * f)} />
            <text className="economy-graph__axis" x={GRAPH.padLeft - 8} y={y(top * f) + 4} textAnchor="end">
              ${Math.round((top * f) / 1000)}k
            </text>
          </g>
        ))}
        {rounds.map((record) => {
          const x = GRAPH.padLeft + (record.round - 1) * slotW + (slotW - 2 * barW - 1) / 2;
          return (
            <g key={record.round}>
              {teams.map(({ team, offset }) => {
                const eco = economyOf(team, record);
                if (!eco) return null;
                const won = record.winner === sideInRound(team.side, currentRound, record.round, rules);
                return (
                  <rect
                    key={team.side}
                    className={`economy-graph__bar ${won ? 'is-winner' : ''}`}
                    data-side={team.side}
                    x={x + offset}
                    y={y(eco.equipment)}
                    width={barW}
                    height={Math.max(1, y(0) - y(eco.equipment))}
                  />
                );
              })}
              <text className="economy-graph__axis" x={x + barW} y={GRAPH.height - 8} textAnchor="middle">
                {record.round}
              </text>
            </g>
          );
        })}
        {GSI.regulationMR < slots && (
          <line
            className="economy-graph__half"
            x1={GRAPH.padLeft + GSI.regulationMR * slotW}
            x2={GRAPH.padLeft + GSI.regulationMR * slotW}
            y1={GRAPH.padTop}
            y2={y(0)}
          />
        )}
      </svg>
    </div>
  );
}

const COMPARE_ROWS: { label: string; value: (p: PlayerMatchStats) => number; format?: (v: number) => string; lowerIsBetter?: boolean }[] = [
  { label: 'Rating', value: (p) => p.rating, format: (v) => v.toFixed(2) },
  { label: 'Kills', value: (p) => p.kills },
  { label: 'Deaths', value: (p) => p.deaths, lowerIsBetter: true },
  { label: 'ADR', value: (p) => p.adr },
  { label: 'KAST', value: (p) => p.kast, format: (v) => `${v}%` },
  { label: 'HS', value: (p) => p.hsPercent, format: (v) => `${v}%` },
  { label: 'Opening kills', value: (p) => p.openingKills },
  { label: 'Clutches won', value: (p) => p.clutchesWon },
  { label: 'Multi-kills', value: (p) => p.multiKills[2] + p.multiKills[3] + p.multiKills[4] + p.multiKills[5] },
];

/** Two players chosen in the control panel, side by side with their match stats. */
function PlayerComparison() {
  const comparison = useHud((s) => s.config.comparison);
  const stats = useHud((s) => s.stats.players);
  const left = stats.find((p) => p.steamid === comparison.left);
  const right = stats.find((p) => p.steamid === comparison.right);
  if (!left || !right) return null;
  return (
    <div className="hud-overlay player-comparison">
      <div className="player-comparison__header">
        <ComparedPlayer player={left} align="left" />
        <div className="player-comparison__vs">VS</div>
        <ComparedPlayer player={right} align="right" />
      </div>
      {COMPARE_ROWS.map((row) => {
        const a = row.value(left);
        const b = row.value(right);
        const better = a === b ? null : (a > b) !== !!row.lowerIsBetter ? 'left' : 'right';
        const share = a + b > 0 ? (100 * a) / (a + b) : 50;
        const format = row.format ?? String;
        return (
          <div key={row.label} className="player-comparison__row">
            <div className={`player-comparison__value ${better === 'left' ? 'is-better' : ''}`}>{format(a)}</div>
            <div className="player-comparison__stat">
              <div className="player-comparison__label">{row.label}</div>
              <div className="player-comparison__bar">
                <div className="player-comparison__fill" data-side={left.side} style={{ width: `${share}%` }} />
                <div className="player-comparison__fill" data-side={right.side} style={{ width: `${100 - share}%` }} />
              </div>
            </div>
            <div className={`player-comparison__value ${better === 'right' ? 'is-better' : ''}`}>{format(b)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ComparedPlayer({ player, align }: { player: PlayerMatchStats; align: 'left' | 'right' }) {
  const profile = useHud((s) => s.players.find((p) => p.steamid === player.steamid));
  const team = useHud((s) => s.teams.find((t) => t.id === profile?.teamId));
  return (
    <div className="player-comparison__player" data-align={align} data-side={player.side}>
      <img className="player-comparison__avatar" src={profile?.avatar || defaultAvatar(player.side)} alt="" />
      <div>
        <div className="player-comparison__name">{profile?.name || player.name}</div>
        {team && <div className="player-comparison__team">{team.name}</div>}
      </div>
    </div>
  );
}
