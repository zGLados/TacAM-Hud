import type { Side } from './types.js';

/** What the round win estimate looks at, per side (alive players only). */
export interface SideState {
  alive: number;
  /** Summed health of alive players (0–500). */
  health: number;
  /** Summed equipment value of alive players. */
  equipment: number;
  /** Money in the bank, only used during freezetime (buy power). */
  money: number;
  /** CT only: an alive player carries a defuse kit. */
  hasKit?: boolean;
}

export interface RoundState {
  phase: 'freezetime' | 'live' | 'over';
  ct: SideState;
  t: SideState;
  bombPlanted: boolean;
  /** Seconds until the bomb explodes (when planted). */
  bombSecondsLeft?: number;
  /** Round winner once the round is over. */
  winner?: Side | null;
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));

/**
 * Heuristic chance that CT wins the current round (0–1). Not a trained model:
 * fixed weights for the man advantage, damage taken, equipment and the bomb,
 * chosen so that typical situations land near common CS statistics
 * (5v4 ≈ 68 %, 1v3 ≈ 14 %, bomb down with too little time to defuse ≈ 1 %).
 */
export function ctWinProbability(s: RoundState): number {
  if (s.phase === 'over') return s.winner === 'CT' ? 1 : s.winner === 'T' ? 0 : 0.5;
  const ct = s.ct;
  const t = s.t;
  if (s.phase === 'freezetime') {
    // Buy power decides before the round: money plus what is already equipped.
    const ratio = (ct.money + ct.equipment + 1) / (t.money + t.equipment + 1);
    return clamp(logistic(1.1 * Math.log(ratio)));
  }

  if (s.bombPlanted) {
    if (ct.alive === 0) return 0.01;
    const defuseTime = ct.hasKit ? 5 : 10;
    const left = s.bombSecondsLeft ?? 40;
    // Not even a free defuse fits into the remaining time.
    if (left < defuseTime) return 0.01;
    if (t.alive === 0) return left < defuseTime + 3 ? 0.6 : 0.95;
  } else {
    if (ct.alive === 0) return t.alive === 0 ? 0.5 : 0;
    if (t.alive === 0) return 1;
  }

  // Health counts only as damage taken by the alive players (dead players are in `alive`).
  const damage = (p: SideState) => p.alive * 100 - p.health;
  let x = 0.65 * (ct.alive - t.alive) + 0.008 * (damage(t) - damage(ct)) + 0.5 * Math.log((ct.equipment + 500) / (t.equipment + 500));
  if (s.bombPlanted) {
    // Planted bomb: retake disadvantage, growing as time runs out; a kit helps.
    const left = s.bombSecondsLeft ?? 40;
    x -= 0.9 + (40 - Math.min(40, left)) * 0.04;
    if (ct.hasKit) x += 0.35;
  }
  return clamp(logistic(x));
}
