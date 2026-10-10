import { describe, expect, it } from 'vitest';
import { captainSteps, remainingMaps, vetoMapsNeeded } from './veto.js';
import type { Veto } from './types.js';

const veto = (type: Veto['type'], mapName: string): Veto => ({
  type,
  mapName,
  teamId: null,
  side: 'NO',
  reverseSide: false,
  score: {},
  winner: null,
  mapEnd: false,
});

describe('captain veto steps', () => {
  it('alternates teams and adds a side choice after each pick', () => {
    const steps = captainSteps('bo3', 'right', true, [veto('ban', 'a'), veto('ban', 'b'), veto('pick', 'c')]);
    expect(steps.map((s) => `${s.kind}:${s.team}`)).toEqual([
      'ban:right',
      'ban:left',
      'pick:right',
      'side:left',
      'pick:left',
      'side:right',
      'ban:right',
      'ban:left',
    ]);
    expect(steps[3]).toMatchObject({ kind: 'side', mapName: 'c' });
    expect(steps[5]).toMatchObject({ kind: 'side', mapName: null });
  });

  it('has six bans for a BO1 and needs seven maps', () => {
    expect(captainSteps('bo1', 'left', true).map((s) => s.kind)).toEqual(Array(6).fill('ban'));
    expect(vetoMapsNeeded('bo1')).toBe(7);
    expect(vetoMapsNeeded('bo2')).toBe(4);
  });

  it('lists the maps that are still available', () => {
    expect(remainingMaps(['a', 'b', 'c'], [veto('ban', 'b')])).toEqual(['a', 'c']);
  });
});
