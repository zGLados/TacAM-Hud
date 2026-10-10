import { describe, expect, it } from 'vitest';
import { ctWinProbability, type RoundState, type SideState } from './prediction.js';

const side = (alive: number, patch: Partial<SideState> = {}): SideState => ({ alive, health: alive * 100, equipment: alive * 4500, money: 0, ...patch });
const live = (ct: SideState, t: SideState, patch: Partial<RoundState> = {}): RoundState => ({ phase: 'live', ct, t, bombPlanted: false, ...patch });
const pct = (s: RoundState) => Math.round(ctWinProbability(s) * 100);

describe('round win probability', () => {
  it('is even for an even start and moves with the man advantage', () => {
    expect(pct(live(side(5), side(5)))).toBe(50);
    expect(pct(live(side(5), side(4)))).toBeGreaterThan(60);
    expect(pct(live(side(5), side(4)))).toBeLessThan(75);
    expect(pct(live(side(1), side(3)))).toBeLessThan(15);
    expect(pct(live(side(3), side(0)))).toBe(100);
  });

  it('values health and equipment', () => {
    expect(ctWinProbability(live(side(2, { health: 200 }), side(2, { health: 60 })))).toBeGreaterThan(ctWinProbability(live(side(2), side(2))));
    expect(ctWinProbability(live(side(5, { equipment: 3000 }), side(5, { equipment: 25000 })))).toBeLessThan(0.4);
  });

  it('turns towards T once the bomb is planted and the clock runs down', () => {
    const planted = (left: number, kit = false) => live(side(3, { hasKit: kit }), side(3), { bombPlanted: true, bombSecondsLeft: left });
    expect(ctWinProbability(planted(35))).toBeLessThan(0.5);
    expect(ctWinProbability(planted(15))).toBeLessThan(ctWinProbability(planted(35)));
    expect(ctWinProbability(planted(15, true))).toBeGreaterThan(ctWinProbability(planted(15)));
    expect(pct(planted(7))).toBe(1); // no kit: 10 s defuse does not fit
    expect(pct(planted(7, true))).toBeGreaterThan(1); // kit: 5 s fits
    expect(pct(live(side(1), side(0), { bombPlanted: true, bombSecondsLeft: 30 }))).toBe(95);
  });

  it('uses buy power in freezetime and the winner once the round is over', () => {
    const freeze = (ctMoney: number, tMoney: number): RoundState => ({ phase: 'freezetime', ct: side(5, { money: ctMoney, equipment: 0 }), t: side(5, { money: tMoney, equipment: 0 }), bombPlanted: false });
    expect(pct(freeze(20000, 20000))).toBe(50);
    expect(ctWinProbability(freeze(25000, 6000))).toBeGreaterThan(0.75);
    expect(ctWinProbability({ ...live(side(1), side(1)), phase: 'over', winner: 'T' })).toBe(0);
  });
});
