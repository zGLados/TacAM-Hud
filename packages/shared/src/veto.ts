import type { MatchType, Side, Veto, VetoType } from './types.js';

/** Standard veto order per format; the decider (if any) is the map left over at the end. */
export const VETO_ORDER: Record<MatchType, VetoType[]> = {
  bo1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'],
  bo2: ['ban', 'ban', 'pick', 'pick'],
  bo3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'],
  bo5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'],
};

export type VetoSlot = 'left' | 'right';

/** Captain veto session of a match (links for the team captains). */
export interface CaptainVeto {
  /** Secret per link: one per captain, `both` for a single shared device (LAN/stage). */
  tokens: { left: string; right: string; both: string };
  /** Team that bans first. */
  first: VetoSlot;
  /** After each pick, the other team chooses its starting side. */
  sideChoice: boolean;
  /** Map pool in display order. */
  pool: string[];
  /** Number of completed steps (see captainSteps). */
  step: number;
}

export type CaptainStep =
  | { kind: 'ban' | 'pick'; team: VetoSlot }
  /** The team chooses the side it starts on for `mapName` (picked by the other team). */
  | { kind: 'side'; team: VetoSlot; mapName: string | null };

const other = (slot: VetoSlot): VetoSlot => (slot === 'left' ? 'right' : 'left');

/** Maps a pool needs: one per ban/pick plus the decider. */
export function vetoMapsNeeded(matchType: MatchType) {
  return VETO_ORDER[matchType].length;
}

/** All captain actions in order (without the automatic decider). Side steps get their map once the pick is made. */
export function captainSteps(matchType: MatchType, first: VetoSlot, sideChoice: boolean, vetos: Veto[] = []): CaptainStep[] {
  const steps: CaptainStep[] = [];
  let picks = 0;
  VETO_ORDER[matchType].forEach((kind, i) => {
    if (kind === 'decider') return;
    const team = i % 2 === 0 ? first : other(first);
    steps.push({ kind, team });
    if (kind === 'pick' && sideChoice) {
      const picked = vetos.filter((v) => v.type === 'pick')[picks];
      steps.push({ kind: 'side', team: other(team), mapName: picked?.mapName ?? null });
    }
    if (kind === 'pick') picks++;
  });
  return steps;
}

/** Maps of the pool not banned or picked yet. */
export function remainingMaps(pool: string[], vetos: Veto[]) {
  const used = new Set(vetos.map((v) => v.mapName));
  return pool.filter((m) => !used.has(m));
}

/** Starting side of the picking team when the other team starts on `chosen`. */
export const pickerSide = (chosen: Side): Side => (chosen === 'CT' ? 'T' : 'CT');
