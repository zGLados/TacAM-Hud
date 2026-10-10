import { useState } from 'react';
import { useHud } from '../state/store';
import { useAction, useSides } from '../state/hooks';
import { MatchBar, SeriesBar } from './MatchBar';
import { TeamPanel } from './TeamPanel';
import { FocusPlayer } from './FocusPlayer';
import { SideColumn } from './SideColumn';
import { KillFeed } from './KillFeed';
import { RoundHistory } from './RoundHistory';
import { RadarBox } from './RadarBox';
import { MapSeries } from './MapSeries';
import { Sponsors } from './Sponsors';
import { MatchTeaser, PhaseBanners, PlayerSpotlight, Trivia } from './Overlays';

/** In-game HUD. Element placement follows the original TacAM layout. */
export function Layout() {
  const game = useHud((s) => s.game);
  const config = useHud((s) => s.config);
  const match = useHud((s) => s.match);
  const rounds = useHud((s) => s.stats.rounds);
  const demo = useHud((s) => s.demo);
  const sides = useSides();
  const [hudHidden, setHudHidden] = useState(false);
  useAction('toggleHud', () => setHudHidden((h) => !h));

  if (!game || !sides) return null;
  const freezetime = game.round?.phase === 'freezetime' || game.phase_countdowns.phase === 'freezetime';
  const { visibility } = config;
  const round = game.map.round + 1;

  return (
    <div className={`hud__layout ${visibility.hud && !hudHidden ? '' : 'is-hidden'}`}>
      <Sponsors />
      {/* With real CS2 data the game's own kill feed is used, see HudConfig.visibility.killfeed */}
      {(visibility.killfeed || demo) && <KillFeed />}
      <RadarBox game={game} />
      <MatchBar />
      <PhaseBanners game={game} />
      <SeriesBar />
      {visibility.roundHistory && (
        <RoundHistory rounds={rounds} left={sides.left} currentRound={round} show={freezetime && rounds.length > 0} />
      )}
      <FocusPlayer />
      <TeamPanel team={sides.left} players={sides.leftPlayers} align="left" />
      <TeamPanel team={sides.right} players={sides.rightPlayers} align="right" />
      <div className="center-stack">
        <Trivia />
        <PlayerSpotlight game={game} />
      </div>
      <MatchTeaser />
      <MapSeries match={match} teams={[sides.left, sides.right]} visible={freezetime} mapName={game.map.name} />
      {(['left', 'right'] as const).map((align) => (
        <SideColumn
          key={align}
          align={align}
          team={align === 'left' ? sides.left : sides.right}
          players={align === 'left' ? sides.leftPlayers : sides.rightPlayers}
          infoBox={config.sideBoxes[align]}
          infoBoxHidden={config.sideBoxes.hidden}
          visible={freezetime && !config.sideBoxes.hidden}
          showEconomy={visibility.economy}
          round={round}
        />
      ))}
    </div>
  );
}
