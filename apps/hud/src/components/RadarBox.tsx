import { useEffect, useState } from 'react';
import type { CSGO } from 'csgogsi';
import { normalizeMapName, type Match } from '@tacam/shared';
import { useHud } from '../state/store';
import { useAction } from '../state/hooks';
import { Radar } from './radar/Radar';

/** "BEST OF 3 · MIRAGE INFERNO ANUBIS" above the radar. */
function MapStrip({ match, game }: { match: Match; game: CSGO }) {
  const picks = match.vetos.filter((v) => v.type !== 'ban' && v.mapName);
  if (!picks.length) return null;
  const current = normalizeMapName(game.map.name);
  // With many maps only show the current one, like the original TacAM layout.
  const shown = picks.length > 3 ? picks.filter((v) => v.mapName === current) : picks;
  return (
    <div className="map-strip">
      <div className="map-strip__series">Best of {match.matchType.replace('bo', '')}</div>
      {shown.map((veto) => (
        <div key={veto.mapName} className={`map-strip__map ${veto.mapName === current ? 'is-current' : ''}`}>
          {veto.mapName.replace('de_', '')}
        </div>
      ))}
    </div>
  );
}

/** Radar in the top left; size and the enlarged view are controlled via keybinds/control panel. */
export function RadarBox({ game }: { game: CSGO }) {
  const config = useHud((s) => s.config.radar);
  const visible = useHud((s) => s.config.visibility.radar);
  const match = useHud((s) => s.match);
  const [size, setSize] = useState(config.size);
  const [enlarged, setEnlarged] = useState(config.enlarged);
  useEffect(() => setSize(config.size), [config.size]);
  useEffect(() => setEnlarged(config.enlarged), [config.enlarged]);
  useAction('radarBigger', () => setSize((s) => s + 10));
  useAction('radarSmaller', () => setSize((s) => Math.max(150, s - 10)));
  useAction('toggleRadarView', () => setEnlarged((e) => !e));

  return (
    <div className={`radar-box ${enlarged ? 'is-enlarged' : ''} ${visible ? '' : 'is-hidden'}`}>
      {match && <MapStrip match={match} game={game} />}
      <Radar game={game} size={enlarged ? 600 : size} />
    </div>
  );
}
