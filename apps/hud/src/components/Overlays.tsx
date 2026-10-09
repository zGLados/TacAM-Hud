import { useEffect, useState } from 'react';
import type { CSGO } from 'csgogsi';
import { countryFlagEmoji, type Match, type TeamProfile } from '@tacam/shared';
import { useHud } from '../state/store';
import { defaultAvatar } from '../lib/assets';
import { TeamLogo } from './TeamLogo';

const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

/** Text box in the center, controlled from the control panel. */
export function Trivia() {
  const trivia = useHud((s) => s.config.trivia);
  return (
    <div className={`trivia ${trivia.visible ? 'is-visible' : ''}`}>
      <div className="trivia__title">{trivia.title}</div>
      <div className="trivia__text">{trivia.content}</div>
    </div>
  );
}

/** PAUSE / "<TEAM> TIMEOUT" / warmup notice, driven by the game phase. */
export function PhaseBanners({ game }: { game: CSGO }) {
  const phase = game.phase_countdowns;
  const timeout = phase.phase === 'timeout_ct' || phase.phase === 'timeout_t';
  const timeoutTeam = phase.phase === 'timeout_t' ? game.map.team_t : game.map.team_ct;
  return (
    <>
      <div className={`phase-banner ${phase.phase === 'paused' ? 'is-visible' : ''}`}>PAUSE</div>
      <div className={`phase-banner ${timeout && Math.ceil(phase.phase_ends_in) > 2 ? 'is-visible' : ''}`}>{timeoutTeam.name} TIMEOUT</div>
      <div className={`phase-banner phase-banner--warmup ${phase.phase === 'warmup' ? 'is-visible' : ''}`}>
        <div className="phase-banner__title">Warmup Phase</div>
        <div className="phase-banner__message">Waiting for match to start...</div>
      </div>
    </>
  );
}

function fillPercent(value: number, max?: number) {
  if (!value) return 0;
  const limit = max ?? Math.ceil(value / 100) * 100;
  return value > limit ? 100 : (100 * value) / limit;
}

/** Player preview with avatar and stat bars. */
export function PlayerSpotlight({ game }: { game: CSGO }) {
  const preview = useHud((s) => s.config.playerPreview);
  const players = useHud((s) => s.players);
  const stats = useHud((s) => s.stats);
  if (!preview.steamid) return null;
  const profile = players.find((p) => p.steamid === preview.steamid);
  const live = game.players.find((p) => p.steamid === preview.steamid);
  const matchStats = stats.players.find((p) => p.steamid === preview.steamid);
  if (!profile && !live) return null;
  const side = live?.team.side;
  const name = profile?.realName || profile?.name || live?.name || '';
  const flag = countryFlagEmoji(profile?.country ?? live?.country);
  const kills = live?.stats.kills ?? 0;
  const rows = [
    { label: 'KILLS', value: kills, fill: fillPercent(kills, kills <= 30 ? 30 : 40) },
    { label: 'HS', value: `${matchStats?.hsPercent ?? 0}%`, fill: fillPercent(matchStats?.hsPercent ?? 0, 100) },
    { label: 'ADR', value: matchStats?.adr ?? 0, fill: fillPercent(matchStats?.adr ?? 0) },
    { label: 'KAST', value: `${matchStats?.kast ?? 0}%`, fill: fillPercent(matchStats?.kast ?? 0, 100) },
    { label: 'RATING', value: (matchStats?.rating ?? 0).toFixed(2), fill: fillPercent((matchStats?.rating ?? 0) * 50, 100) },
  ];
  return (
    <div className={`player-spotlight ${preview.visible ? 'is-visible' : ''}`} data-side={side}>
      <div className="player-spotlight__picture">
        <img src={profile?.avatar || defaultAvatar(side)} alt={name} />
      </div>
      <div className="player-spotlight__name">
        {flag && <span className="player-spotlight__flag">{flag}</span>}
        {name}
      </div>
      <div>
        {rows.map((row) => (
          <div key={row.label} className="player-spotlight__stat">
            <div className="player-spotlight__label">
              {row.label}: {row.value}
            </div>
            <div className="player-spotlight__bar">
              <div className="player-spotlight__fill" style={{ width: `${row.fill}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Upcoming match" teaser with both team logos. */
export function MatchTeaser() {
  const preview = useHud((s) => s.config.matchPreview);
  const teams = useHud((s) => s.teams);
  const [match, setMatch] = useState<Match | null>(null);
  useEffect(() => {
    if (!preview.matchId) return setMatch(null);
    fetch('/api/matches')
      .then((r) => r.json())
      .then((matches: Match[]) => setMatch(matches.find((m) => m.id === preview.matchId) ?? null))
      .catch(() => setMatch(null));
  }, [preview.matchId]);
  if (!match) return null;
  const left = teams.find((t) => t.id === match.left.id);
  const right = teams.find((t) => t.id === match.right.id);
  if (!left || !right) return null;
  const team = (t: TeamProfile) => (
    <div className="match-teaser__team">
      <TeamLogo team={{ logo: uploadUrl(t.logo) }} height={40} />
      <div className="match-teaser__team-name">{t.name || t.shortName}</div>
    </div>
  );
  return (
    <div className={`match-teaser ${preview.visible ? 'is-visible' : ''}`}>
      <div className="match-teaser__title">Upcoming match</div>
      <div className="match-teaser__teams">
        {team(left)}
        <div className="match-teaser__vs">vs</div>
        {team(right)}
      </div>
    </div>
  );
}
