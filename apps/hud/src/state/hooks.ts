import { useEffect, useRef } from 'react';
import type { Events, Player, Team } from 'csgogsi';
import type { HudAction } from '@tacam/shared';
import { GSI, onAction, useHud } from './store';

/** Runs `handler` whenever the server sends this HUD action. */
export function useAction(type: HudAction['type'], handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onAction((action) => action.type === type && ref.current()), [type]);
}

/** Subscribes to a csgogsi event for the lifetime of the component. */
export function useGsiEvent<K extends keyof Events>(event: K, handler: Events[K]) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = ((...args: unknown[]) => (ref.current as (...a: unknown[]) => void)(...args)) as Events[K];
    GSI.on(event, listener as never);
    return () => {
      GSI.off(event, listener as never);
    };
  }, [event]);
}

export interface Sides {
  left: Team;
  right: Team;
  leftPlayers: Player[];
  rightPlayers: Player[];
}

/** Left/right teams as displayed, honoring the "swap teams" switch from the control panel. */
export function useSides(): Sides | null {
  const game = useHud((s) => s.game);
  const swap = useHud((s) => s.config.swapTeams);
  if (!game) return null;
  const { team_ct, team_t } = game.map;
  let left = team_ct.orientation === 'left' ? team_ct : team_t;
  let right = left === team_ct ? team_t : team_ct;
  if (swap) [left, right] = [right, left];
  const bySlot = (a: Player, b: Player) => ((a.observer_slot || 10) - (b.observer_slot || 10));
  return {
    left,
    right,
    leftPlayers: game.players.filter((p) => p.team.side === left.side).sort(bySlot),
    rightPlayers: game.players.filter((p) => p.team.side === right.side).sort(bySlot),
  };
}

export const isFreezetime = (phase: string | undefined) => phase === 'freezetime';
