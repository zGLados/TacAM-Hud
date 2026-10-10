import { useRef } from 'react';
import type { CSGO, Player } from 'csgogsi';
import { ctWinProbability, type SideState } from '@tacam/shared';
import type { Sides } from '../state/hooks';

const sideState = (players: Player[]): SideState => {
  const alive = players.filter((p) => p.state.health > 0);
  return {
    alive: alive.length,
    health: alive.reduce((sum, p) => sum + p.state.health, 0),
    equipment: alive.reduce((sum, p) => sum + p.state.equip_value, 0),
    money: players.reduce((sum, p) => sum + p.state.money, 0),
    hasKit: alive.some((p) => p.state.defusekit),
  };
};

/** Round win estimate (shared/prediction.ts) as a bar under the match bar; hidden in freezetime. */
export function WinProbability({ game, sides }: { game: CSGO; sides: Sides }) {
  // Remember the explosion countdown: during a defuse GSI reports the defuse time instead.
  const bombLeft = useRef<number | undefined>(undefined);
  const phase = game.round?.phase ?? 'live';
  const bombState = game.bomb?.state;
  const planted = bombState === 'planted' || bombState === 'defusing';
  if (bombState === 'planted' && game.bomb?.countdown !== undefined) bombLeft.current = Number(game.bomb.countdown);
  if (!planted) bombLeft.current = undefined;

  const ct = sideState(game.players.filter((p) => p.team.side === 'CT'));
  const t = sideState(game.players.filter((p) => p.team.side === 'T'));
  const pCt = ctWinProbability({
    phase: phase === 'over' ? 'over' : phase === 'freezetime' ? 'freezetime' : 'live',
    ct,
    t,
    bombPlanted: planted,
    bombSecondsLeft: bombLeft.current,
    winner: game.round?.win_team ?? null,
  });
  const left = sides.left.side === 'CT' ? pCt : 1 - pCt;
  const leftPct = Math.round(left * 100);
  return (
    <div className={`win-probability ${phase === 'freezetime' ? '' : 'is-visible'}`}>
      <div className="win-probability__value" data-side={sides.left.side}>
        {leftPct}%
      </div>
      <div className="win-probability__bar">
        <div className="win-probability__fill" data-side={sides.left.side} style={{ width: `${left * 100}%` }} />
        <div className="win-probability__fill" data-side={sides.right.side} style={{ width: `${(1 - left) * 100}%` }} />
        <span className="win-probability__label">Win probability</span>
      </div>
      <div className="win-probability__value" data-side={sides.right.side}>
        {100 - leftPct}%
      </div>
    </div>
  );
}
