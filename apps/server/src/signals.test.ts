import { describe, expect, it } from 'vitest';
import type { CSGO } from 'csgogsi';
import { detectGameEvents, winsNeeded } from './signals.js';

const mr12 = { regulationMR: 12, overtimeMR: 3 };

/** Just the fields detectGameEvents reads. */
function state(patch: { round?: Partial<NonNullable<CSGO['round']>>; mapRound?: number; scores?: [number, number]; mapPhase?: string; phase?: string; kills?: number }): CSGO {
  return {
    round: { phase: 'live', ...patch.round },
    map: {
      round: patch.mapRound ?? 5,
      phase: patch.mapPhase ?? 'live',
      team_ct: { side: 'CT', score: patch.scores?.[0] ?? 0 },
      team_t: { side: 'T', score: patch.scores?.[1] ?? 0 },
    },
    phase_countdowns: { phase: patch.phase ?? 'live' },
    players: [{ steamid: '1', team: { side: 'T' }, state: { round_kills: patch.kills ?? 0 } }],
  } as unknown as CSGO;
}

describe('signals', () => {
  it('knows how many wins a team needs, also in overtime', () => {
    expect(winsNeeded(0, mr12)).toBe(13);
    expect(winsNeeded(23, mr12)).toBe(13);
    expect(winsNeeded(24, mr12)).toBe(16); // 12:12 → first overtime to 16
    expect(winsNeeded(30, mr12)).toBe(19);
  });

  it('derives events from consecutive states', () => {
    const types = (prev: CSGO, cur: CSGO) => detectGameEvents(prev, cur, mr12).map((e) => `${e.type}:${e.side ?? '-'}`);
    expect(types(state({}), state({ round: { phase: 'over', win_team: 'CT' } }))).toEqual(['roundEnd:CT']);
    expect(types(state({}), state({ round: { bomb: 'planted' } }))).toEqual(['bombPlanted:T']);
    expect(types(state({ kills: 4 }), state({ kills: 5 }))).toEqual(['ace:T']);
    expect(types(state({ round: { phase: 'over' } }), state({ round: { phase: 'freezetime' }, scores: [12, 9], mapRound: 21 }))).toEqual([
      'roundStart:-',
      'matchPoint:CT',
    ]);
    expect(types(state({}), state({ phase: 'timeout_t' }))).toEqual(['timeout:T']);
    expect(types(state({}), state({ mapPhase: 'gameover' }))).toEqual(['matchEnd:-']);
    expect(types(state({}), state({}))).toEqual([]);
  });
});
