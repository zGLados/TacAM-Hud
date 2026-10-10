import { useEffect, useState, type ReactNode } from 'react';
import { formatClock, prettyMapName, type PlayerMatchStats, type Side } from '@tacam/shared';
import { useHud } from '../state/store';
import { useActiveScene, useSides } from '../state/hooks';
import { BackgroundVideo } from './BackgroundVideo';
import { UpcomingMatches } from './UpcomingMatches';
import { PlayerToWatch } from './PlayerToWatch';
import { defaultTeamLogo, mapBanner } from '../lib/assets';
import { RoundHistory } from '../components/RoundHistory';
import { seriesWins } from '../components/MatchBar';

const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

interface SceneTeam {
  id: string | null;
  name: string;
  logo: string | null;
  side: Side | null;
  score: number | null;
  seriesWins: number;
}

/** Teams for full-screen scenes: from the live game if running, else from the current match. */
function useSceneTeams(): { left: SceneTeam; right: SceneTeam } {
  const sides = useSides();
  const match = useHud((s) => s.match);
  const teams = useHud((s) => s.teams);
  if (sides) {
    const toScene = (t: typeof sides.left): SceneTeam => ({
      id: t.id,
      name: t.name,
      logo: t.logo,
      side: t.side,
      score: t.score,
      seriesWins: seriesWins(t, match),
    });
    return { left: toScene(sides.left), right: toScene(sides.right) };
  }
  const fromMatch = (id: string | null, wins: number, fallback: string): SceneTeam => {
    const profile = teams.find((t) => t.id === id);
    return { id, name: profile?.name ?? fallback, logo: uploadUrl(profile?.logo ?? null), side: null, score: null, seriesWins: wins };
  };
  return {
    left: fromMatch(match?.left.id ?? null, match?.left.wins ?? 0, 'Team A'),
    right: fromMatch(match?.right.id ?? null, match?.right.wins ?? 0, 'Team B'),
  };
}

function Logo({ team, size = 120 }: { team: SceneTeam; size?: number }) {
  return <img className="score-header__logo" style={{ width: size, height: size }} src={team.logo || defaultTeamLogo(team.side ?? 'CT')} alt={team.name} />;
}

function SceneFrame({ title, subtitle, children, className = '', video = false }: { title: string; subtitle?: string; children?: ReactNode; className?: string; video?: boolean }) {
  const theme = useHud((s) => s.theme);
  const match = useHud((s) => s.match);
  const tournamentLogo = uploadUrl(theme.tournamentLogo);
  const withVideo = video && theme.backgroundVideos.length > 0;
  return (
    <div className={`scene ${className} ${withVideo ? 'scene--with-video' : ''}`}>
      {withVideo && <BackgroundVideo />}
      <div className="scene__header">
        {tournamentLogo && <img className="scene__tournament-logo" src={tournamentLogo} alt="" />}
        <div className="scene__titles">
          {(theme.tournamentName || match?.title) && (
            <div className="scene__kicker">{[theme.tournamentName, match?.title].filter(Boolean).join(' · ')}</div>
          )}
          <div className="scene__title">{title}</div>
          {subtitle && <div className="scene__subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="scene__body">{children}</div>
    </div>
  );
}

function ScoreHeader({ showSeries = true }: { showSeries?: boolean }) {
  const { left, right } = useSceneTeams();
  const match = useHud((s) => s.match);
  const game = useHud((s) => s.game);
  const live = left.score !== null && right.score !== null;
  return (
    <div className="score-header">
      <div className="score-header__team" data-align="left" data-side={left.side ?? undefined}>
        <Logo team={left} />
        <div className="score-header__team-name">{left.name}</div>
      </div>
      <div className="score-header__center">
        {live ? (
          <div className="score-header__score">
            <span data-side={left.side ?? undefined}>{left.score}</span>
            <span className="score-header__divider">:</span>
            <span data-side={right.side ?? undefined}>{right.score}</span>
          </div>
        ) : (
          <div className="score-header__vs">VS</div>
        )}
        {game && <div className="score-header__map">{prettyMapName(game.map.name)}</div>}
        {showSeries && match && (
          <div className="score-header__series">
            Maps {left.seriesWins} – {right.seriesWins} · {match.matchType.toUpperCase()}
          </div>
        )}
      </div>
      <div className="score-header__team" data-align="right" data-side={right.side ?? undefined}>
        <div className="score-header__team-name">{right.name}</div>
        <Logo team={right} />
      </div>
    </div>
  );
}

const STAT_COLUMNS: { key: keyof PlayerMatchStats; label: string; format?: (v: number) => string }[] = [
  { key: 'kills', label: 'K' },
  { key: 'assists', label: 'A' },
  { key: 'deaths', label: 'D' },
  { key: 'adr', label: 'ADR' },
  { key: 'kast', label: 'KAST', format: (v) => `${v}%` },
  { key: 'hsPercent', label: 'HS', format: (v) => `${v}%` },
  { key: 'openingKills', label: 'FK' },
  { key: 'clutchesWon', label: 'CL' },
  { key: 'rating', label: 'Rating', format: (v) => v.toFixed(2) },
];

function StatsTable({ team, players }: { team: SceneTeam; players: PlayerMatchStats[] }) {
  return (
    <div className="stats-table" data-side={team.side ?? undefined}>
      <div className="stats-table__title">{team.name}</div>
      <table>
        <thead>
          <tr>
            <th className="stats-table__name">Player</th>
            {STAT_COLUMNS.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.steamid}>
              <td className="stats-table__name">{p.name}</td>
              {STAT_COLUMNS.map((c) => {
                const value = p[c.key] as number;
                return (
                  <td key={c.key} className={c.key === 'rating' ? (value >= 1.1 ? 'is-good' : value < 0.9 ? 'is-bad' : '') : ''}>
                    {c.format ? c.format(value) : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Splits match stats into left/right using the players currently on each side. */
function useTeamStats() {
  const stats = useHud((s) => s.stats);
  const sides = useSides();
  if (!sides) return { left: [], right: [] };
  const leftIds = new Set(sides.leftPlayers.map((p) => p.steamid));
  const rightIds = new Set(sides.rightPlayers.map((p) => p.steamid));
  return {
    left: stats.players.filter((p) => leftIds.has(p.steamid)),
    right: stats.players.filter((p) => rightIds.has(p.steamid)),
  };
}

function BothStatsTables() {
  const teams = useSceneTeams();
  const stats = useTeamStats();
  if (!stats.left.length && !stats.right.length) return null;
  return (
    <div className="stats-tables">
      <StatsTable team={teams.left} players={stats.left} />
      <StatsTable team={teams.right} players={stats.right} />
    </div>
  );
}

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, (to - now) / 1000);
  return <div className="scene__countdown">{formatClock(left)}</div>;
}

function VetoList() {
  const match = useHud((s) => s.match);
  const teams = useHud((s) => s.teams);
  if (!match) return null;
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.shortName || teams.find((t) => t.id === id)?.name || '';
  const teamLogo = (id: string | null) => uploadUrl(teams.find((t) => t.id === id)?.logo ?? null);
  return (
    <div className="veto-list">
      {match.vetos.map((veto, i) => {
        const logo = teamLogo(veto.teamId);
        const winner = veto.winner ? teamName(veto.winner) : null;
        const banner = mapBanner(veto.mapName);
        return (
          <div key={`${veto.mapName}${i}`} className="veto-card" data-type={veto.type}>
            {banner && <div className="veto-card__banner" style={{ backgroundImage: `url(${banner})` }} />}
            <div className="veto-card__type">{veto.type === 'decider' ? 'Decider' : veto.type === 'ban' ? 'Ban' : 'Pick'}</div>
            <div className="veto-card__map">{prettyMapName(veto.mapName)}</div>
            <div className="veto-card__team">
              {logo && <img src={logo} alt="" />}
              <span>{veto.type === 'decider' ? 'Left over' : teamName(veto.teamId)}</span>
            </div>
            {veto.type !== 'ban' && veto.side !== 'NO' && <div className="veto-card__side" data-side={veto.side}>Start {veto.side}</div>}
            {veto.mapEnd && winner && (
              <div className="veto-card__result">
                {winner} {Object.values(veto.score).sort((a, b) => b - a).join(':')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MvpCard() {
  const stats = useHud((s) => s.stats);
  const players = useHud((s) => s.players);
  const sides = useSides();
  if (!sides || !stats.players.length) return null;
  const winner = sides.left.score >= sides.right.score ? sides.left : sides.right;
  const winnerIds = new Set((winner === sides.left ? sides.leftPlayers : sides.rightPlayers).map((p) => p.steamid));
  const mvp = stats.players.filter((p) => winnerIds.has(p.steamid)).sort((a, b) => b.rating - a.rating)[0];
  if (!mvp) return null;
  const profile = players.find((p) => p.steamid === mvp.steamid);
  return (
    <div className="mvp-card" data-side={winner.side}>
      <div className="mvp-card__label">MVP</div>
      {profile?.avatar && <img className="mvp-card__avatar" src={profile.avatar} alt="" />}
      <div className="mvp-card__name">{mvp.name}</div>
      {profile?.realName && <div className="mvp-card__real-name">{profile.realName}</div>}
      <div className="mvp-card__stats">
        <div><b>{mvp.rating.toFixed(2)}</b>Rating</div>
        <div><b>{mvp.kills}-{mvp.deaths}</b>K-D</div>
        <div><b>{mvp.adr}</b>ADR</div>
        <div><b>{mvp.kast}%</b>KAST</div>
      </div>
    </div>
  );
}

export function SceneOverlay() {
  const scene = useHud((s) => s.scene);
  const active = useActiveScene();
  const game = useHud((s) => s.game);
  const rounds = useHud((s) => s.stats.rounds);
  const sides = useSides();
  const { left, right } = useSceneTeams();

  switch (active) {
    case 'live':
      return null;
    case 'starting':
      return (
        <SceneFrame title={scene.message || 'Starting Soon'} className="scene--starting" video>
          {scene.countdownTo && <Countdown to={scene.countdownTo} />}
          <ScoreHeader />
          <VetoList />
        </SceneFrame>
      );
    case 'brb':
      return (
        <SceneFrame title="We'll be right back" subtitle={scene.message} className="scene--brb" video>
          <ScoreHeader />
        </SceneFrame>
      );
    case 'pause':
      return (
        <SceneFrame title={scene.message || 'Technical Pause'} className="scene--pause">
          <ScoreHeader />
          <BothStatsTables />
        </SceneFrame>
      );
    case 'halftime':
      return (
        <SceneFrame title="Halftime" subtitle={scene.message} className="scene--halftime">
          <ScoreHeader />
          {sides && game && <RoundHistory rounds={rounds} left={sides.left} currentRound={game.map.round + 1} show />}
          <BothStatsTables />
        </SceneFrame>
      );
    case 'veto':
      return (
        <SceneFrame title={scene.message || 'Map Veto'} subtitle={`${left.name} vs ${right.name}`} className="scene--veto">
          <VetoList />
        </SceneFrame>
      );
    case 'scoreboard':
      return (
        <SceneFrame title={scene.message || 'Scoreboard'} className="scene--scoreboard">
          <ScoreHeader />
          <BothStatsTables />
        </SceneFrame>
      );
    case 'upcoming':
      return (
        <SceneFrame title={scene.message || 'Upcoming Matches'} className="scene--upcoming" video>
          <UpcomingMatches />
        </SceneFrame>
      );
    case 'playerToWatch':
      return (
        <SceneFrame title={scene.message || 'Player to Watch'} className="scene--player-to-watch">
          <PlayerToWatch />
        </SceneFrame>
      );
    case 'matchEnd': {
      const winner = left.score !== null && right.score !== null ? (left.score >= right.score ? left : right) : null;
      return (
        <SceneFrame title={winner ? `${winner.name} wins!` : 'Map Over'} subtitle={scene.message} className="scene--matchend">
          <ScoreHeader />
          <div className="scene__match-end">
            <MvpCard />
            <BothStatsTables />
          </div>
        </SceneFrame>
      );
    }
  }
}
