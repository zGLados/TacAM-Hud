import type { Team } from 'csgogsi';
import { prettyMapName, type Match } from '@tacam/shared';
import { useHud } from '../state/store';
import { mapBanner } from '../lib/assets';
import { TeamLogo } from './TeamLogo';

const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

/** Overview of all picked maps with picker, winner and score (top right, freezetime). */
export function MapSeries({ match, teams, visible, mapName }: { match: Match | null; teams: Team[]; visible: boolean; mapName: string }) {
  const profiles = useHud((s) => s.teams);
  if (!match || !match.vetos.length) return null;
  const logoOf = (id: string | null) => {
    if (!id) return null;
    const live = teams.find((t) => t.id === id);
    if (live) return <TeamLogo team={live} />;
    const profile = profiles.find((t) => t.id === id);
    return profile ? <TeamLogo team={{ logo: uploadUrl(profile.logo) }} /> : null;
  };
  return (
    <div className={`map-series ${visible ? 'is-visible' : ''}`}>
      <div className="map-series__header">
        <div className="map-series__column">Picked</div>
        <div className="map-series__column">Winner</div>
        <div className="map-series__column">Score</div>
      </div>
      {match.vetos
        .filter((v) => v.type !== 'ban' && v.mapName)
        .map((veto) => {
          const banner = mapBanner(veto.mapName);
          const score = Object.values(veto.score);
          return (
            <div key={`${veto.mapName}${veto.teamId}`} className={`map-series__map ${mapName.endsWith(veto.mapName) ? 'is-current' : ''}`}>
              <div className="map-series__name" style={banner ? { backgroundImage: `url(${banner})` } : undefined}>
                {prettyMapName(veto.mapName)}
              </div>
              <div className="map-series__picker">{logoOf(veto.teamId)}</div>
              <div className="map-series__winner">{logoOf(veto.winner)}</div>
              <div className="map-series__score">{score.length ? score.sort().join(':') : '-:-'}</div>
              <div className="map-series__live">
                <div className="map-series__live-label">Currently playing</div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
