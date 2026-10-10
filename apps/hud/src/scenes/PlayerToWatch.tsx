import { countryFlagEmoji } from '@tacam/shared';
import { useHud } from '../state/store';
import { defaultAvatar } from '../lib/assets';

const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

/** Large player card: profile from the database, numbers from the live match stats. */
export function PlayerToWatch() {
  const steamid = useHud((s) => s.config.playerToWatch);
  const players = useHud((s) => s.players);
  const teams = useHud((s) => s.teams);
  const stats = useHud((s) => s.stats);
  const game = useHud((s) => s.game);

  const profile = players.find((p) => p.steamid === steamid);
  const live = game?.players.find((p) => p.steamid === steamid);
  if (!steamid || (!profile && !live)) {
    return <div className="scene__empty">No player selected</div>;
  }
  const matchStats = stats.players.find((p) => p.steamid === steamid);
  const team = teams.find((t) => t.id === profile?.teamId);
  const side = live?.team.side;
  const flag = countryFlagEmoji(profile?.country ?? null);
  const tiles = matchStats
    ? [
        { label: 'Rating', value: matchStats.rating.toFixed(2) },
        { label: 'K – D', value: `${matchStats.kills} – ${matchStats.deaths}` },
        { label: 'ADR', value: matchStats.adr },
        { label: 'KAST', value: `${matchStats.kast}%` },
        { label: 'HS', value: `${matchStats.hsPercent}%` },
        { label: 'Opening kills', value: matchStats.openingKills },
      ]
    : [];

  return (
    <div className="player-to-watch" data-side={side}>
      <img className="player-to-watch__avatar" src={profile?.avatar || defaultAvatar(side)} alt="" />
      <div className="player-to-watch__info">
        <div className="player-to-watch__name">{profile?.name ?? live?.name}</div>
        {profile?.realName && (
          <div className="player-to-watch__real-name">
            {flag && <span>{flag} </span>}
            {profile.realName}
          </div>
        )}
        {team && (
          <div className="player-to-watch__team">
            {team.logo && <img src={uploadUrl(team.logo)!} alt="" />}
            <span>{team.name}</span>
          </div>
        )}
        {tiles.length ? (
          <div className="player-to-watch__stats">
            {tiles.map((tile) => (
              <div key={tile.label} className="player-to-watch__stat">
                <b>{tile.value}</b>
                <span>{tile.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="player-to-watch__no-stats">Stats appear once the match is live</div>
        )}
      </div>
    </div>
  );
}
