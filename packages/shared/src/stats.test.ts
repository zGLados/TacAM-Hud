import { describe, expect, it } from 'vitest';
import type { CSGO, Player } from 'csgogsi';
import { StatsTracker, classifyBuy, computeRating, inferKills } from './stats.js';
import { formatRoundLabel } from './format.js';

type PlayerInit = {
  steamid: string;
  side: 'CT' | 'T';
  kills?: number;
  deaths?: number;
  assists?: number;
  health?: number;
  killhs?: number;
  dmg?: number;
  equip?: number;
  weapon?: string;
};

const player = (p: PlayerInit): Player =>
  ({
    steamid: p.steamid,
    name: p.steamid.toUpperCase(),
    defaultName: p.steamid,
    team: { side: p.side } as Player['team'],
    stats: { kills: p.kills ?? 0, assists: p.assists ?? 0, deaths: p.deaths ?? 0, mvps: 0, score: 0 },
    weapons: [{ id: 'w', name: `weapon_${p.weapon ?? 'ak47'}`, paintkit: '', state: 'active', type: 'Rifle' }],
    state: {
      health: p.health ?? 100,
      armor: 100,
      helmet: true,
      flashed: 0,
      smoked: 0,
      burning: 0,
      money: 1000,
      round_kills: 0,
      round_killhs: p.killhs ?? 0,
      round_totaldmg: p.dmg ?? 0,
      equip_value: p.equip ?? 4000,
      adr: 0,
    },
    position: [0, 0, 0],
    forward: [0, 0, 0],
    avatar: null,
    country: null,
    realName: null,
    extra: {},
  }) as Player;

const game = (
  round: number,
  phase: 'freezetime' | 'live' | 'over',
  players: PlayerInit[],
  extra: { win?: 'CT' | 'T'; mapPhase?: CSGO['map']['phase'] } = {}
): CSGO =>
  ({
    map: {
      name: 'de_mirage',
      phase: extra.mapPhase ?? 'live',
      round,
      round_wins: extra.win ? { [String(round + 1)]: `${extra.win.toLowerCase()}_win_elimination` } : {},
    },
    round: { phase, win_team: extra.win },
    players: players.map(player),
    bomb: null,
    grenades: [],
    phase_countdowns: { phase_ends_in: 0 },
  }) as unknown as CSGO;

describe('inferKills', () => {
  it('pairs a death with an enemy kill and detects headshots', () => {
    const prev = game(0, 'live', [
      { steamid: 'a', side: 'CT' },
      { steamid: 'b', side: 'T' },
    ]);
    const cur = game(0, 'live', [
      { steamid: 'a', side: 'CT', kills: 1, killhs: 1 },
      { steamid: 'b', side: 'T', deaths: 1, health: 0 },
    ]);
    const [kill] = inferKills(prev, cur, 1000);
    expect(kill.killer?.steamid).toBe('a');
    expect(kill.victim.steamid).toBe('b');
    expect(kill.headshot).toBe(true);
    expect(kill.weapon).toBe('ak47');
  });

  it('reports deaths without a killer as world kills', () => {
    const prev = game(0, 'live', [{ steamid: 'b', side: 'T' }]);
    const cur = game(0, 'live', [{ steamid: 'b', side: 'T', deaths: 1, health: 0 }]);
    const [kill] = inferKills(prev, cur, 0);
    expect(kill.killer).toBeNull();
    expect(kill.weapon).toBe('world');
  });

  it('ignores counter changes across rounds', () => {
    const prev = game(0, 'over', [{ steamid: 'a', side: 'CT' }]);
    const cur = game(1, 'freezetime', [{ steamid: 'a', side: 'CT', kills: 3 }]);
    expect(inferKills(prev, cur, 0)).toEqual([]);
  });
});

describe('StatsTracker', () => {
  it('tracks kills, damage, KAST, opening duels and round history', () => {
    const t = new StatsTracker();
    t.update(game(0, 'freezetime', [{ steamid: 'a', side: 'CT' }, { steamid: 'b', side: 'T' }]), 0);
    t.update(game(0, 'live', [{ steamid: 'a', side: 'CT', equip: 800 }, { steamid: 'b', side: 'T', equip: 800 }]), 1);
    t.update(
      game(0, 'live', [
        { steamid: 'a', side: 'CT', kills: 1, dmg: 100 },
        { steamid: 'b', side: 'T', deaths: 1, health: 0 },
      ]),
      2
    );
    t.update(
      game(0, 'over', [
        { steamid: 'a', side: 'CT', kills: 1, dmg: 100 },
        { steamid: 'b', side: 'T', deaths: 1, health: 0 },
      ], { win: 'CT' }),
      3
    );
    t.update(game(1, 'freezetime', [{ steamid: 'a', side: 'CT', kills: 1 }, { steamid: 'b', side: 'T', deaths: 1 }]), 4);

    const snap = t.snapshot();
    const a = snap.players.find((p) => p.steamid === 'a')!;
    const b = snap.players.find((p) => p.steamid === 'b')!;
    expect(a).toMatchObject({ kills: 1, deaths: 0, adr: 100, kast: 100, openingKills: 1, roundsPlayed: 1 });
    expect(b).toMatchObject({ kills: 0, deaths: 1, kast: 0, openingDeaths: 1 });
    expect(snap.rounds).toHaveLength(1);
    expect(snap.rounds[0]).toMatchObject({ round: 1, winner: 'CT', outcome: 'ct_win_elimination' });
    expect(snap.rounds[0].economy.CT?.buy).toBe('pistol');
  });

  it('marks a death as traded when the killer dies shortly after', () => {
    const t = new StatsTracker();
    const base: PlayerInit[] = [
      { steamid: 'a', side: 'CT' },
      { steamid: 'c', side: 'CT' },
      { steamid: 'b', side: 'T' },
    ];
    t.update(game(0, 'freezetime', base), 0);
    t.update(game(0, 'live', base), 1);
    // b kills a
    t.update(
      game(0, 'live', [
        { steamid: 'a', side: 'CT', deaths: 1, health: 0 },
        { steamid: 'c', side: 'CT' },
        { steamid: 'b', side: 'T', kills: 1 },
      ]),
      1000
    );
    // c trades b within 5s
    const after: PlayerInit[] = [
      { steamid: 'a', side: 'CT', deaths: 1, health: 0 },
      { steamid: 'c', side: 'CT', kills: 1 },
      { steamid: 'b', side: 'T', kills: 1, deaths: 1, health: 0 },
    ];
    t.update(game(0, 'live', after), 3000);
    t.update(game(0, 'over', after, { win: 'CT' }), 3500);
    t.update(game(1, 'freezetime', after), 4000);

    const a = t.snapshot().players.find((p) => p.steamid === 'a')!;
    expect(a.kast).toBe(100);
  });

  it('counts a won 1vX as clutch', () => {
    const t = new StatsTracker();
    const start: PlayerInit[] = [
      { steamid: 'a', side: 'CT' },
      { steamid: 'b', side: 'T' },
      { steamid: 'c', side: 'T' },
    ];
    t.update(game(0, 'freezetime', start), 0);
    t.update(game(0, 'live', start), 1);
    const end: PlayerInit[] = [
      { steamid: 'a', side: 'CT', kills: 2 },
      { steamid: 'b', side: 'T', deaths: 1, health: 0 },
      { steamid: 'c', side: 'T', deaths: 1, health: 0 },
    ];
    t.update(game(0, 'live', end), 2);
    t.update(game(0, 'over', end, { win: 'CT' }), 3);
    t.update(game(1, 'freezetime', end), 4);
    const a = t.snapshot().players.find((p) => p.steamid === 'a')!;
    expect(a.clutchesWon).toBe(1);
    expect(a.multiKills[2]).toBe(1);
  });

  it('counts the running round so mid-round ratings stay sane', () => {
    const t = new StatsTracker();
    const start: PlayerInit[] = [{ steamid: 'a', side: 'CT' }, { steamid: 'b', side: 'T' }];
    t.update(game(0, 'freezetime', start), 0);
    t.update(game(0, 'live', start), 1);
    t.update(game(0, 'live', [{ steamid: 'a', side: 'CT', deaths: 1, health: 0 }, { steamid: 'b', side: 'T', kills: 1, dmg: 100 }]), 2);
    const a = t.snapshot().players.find((p) => p.steamid === 'a')!;
    const b = t.snapshot().players.find((p) => p.steamid === 'b')!;
    expect(a.rating).toBeGreaterThanOrEqual(0);
    expect(b.adr).toBe(100);
  });

  // Plays one round in which `a` kills `b`, starting from the given counters.
  const playRound = (t: StatsTracker, mapRound: number, before: { aK: number; bD: number }, time: number) => {
    const start: PlayerInit[] = [
      { steamid: 'a', side: 'CT', kills: before.aK },
      { steamid: 'b', side: 'T', deaths: before.bD },
    ];
    const end: PlayerInit[] = [
      { steamid: 'a', side: 'CT', kills: before.aK + 1 },
      { steamid: 'b', side: 'T', deaths: before.bD + 1, health: 0 },
    ];
    t.update(game(mapRound, 'freezetime', start), time);
    t.update(game(mapRound, 'live', start), time + 1);
    t.update(game(mapRound, 'live', end), time + 2);
    t.update(game(mapRound + 1, 'over', end, { win: 'CT' }), time + 3);
  };

  it('discards a round that is restored from a backup', () => {
    const t = new StatsTracker();
    playRound(t, 0, { aK: 0, bD: 0 }, 0);
    playRound(t, 1, { aK: 1, bD: 1 }, 100);
    // admins restore round 2: freezetime of round 2 again, counters back to the round start
    playRound(t, 1, { aK: 1, bD: 1 }, 200);
    t.update(game(2, 'freezetime', [{ steamid: 'a', side: 'CT', kills: 2 }, { steamid: 'b', side: 'T', deaths: 2 }]), 300);
    const snap = t.snapshot();
    expect(snap.players.find((p) => p.steamid === 'a')!.kills).toBe(2);
    expect(snap.players.find((p) => p.steamid === 'b')!.deaths).toBe(2);
    expect(snap.rounds.map((r) => r.round)).toEqual([1, 2]);
  });

  it('rolls back several rounds and keeps the earlier ones', () => {
    const t = new StatsTracker();
    playRound(t, 0, { aK: 0, bD: 0 }, 0);
    playRound(t, 1, { aK: 1, bD: 1 }, 100);
    playRound(t, 2, { aK: 2, bD: 2 }, 200);
    // restore to the start of round 2
    t.update(game(1, 'freezetime', [{ steamid: 'a', side: 'CT', kills: 1 }, { steamid: 'b', side: 'T', deaths: 1 }]), 300);
    const snap = t.snapshot();
    expect(snap.players.find((p) => p.steamid === 'a')!.kills).toBe(1);
    expect(snap.rounds.map((r) => r.round)).toEqual([1]);
  });

  it('starts over after mp_restartgame', () => {
    const t = new StatsTracker();
    playRound(t, 0, { aK: 0, bD: 0 }, 0);
    playRound(t, 1, { aK: 1, bD: 1 }, 100);
    t.update(game(0, 'freezetime', [{ steamid: 'a', side: 'CT' }, { steamid: 'b', side: 'T' }]), 300);
    const snap = t.snapshot();
    expect(snap.players.find((p) => p.steamid === 'a')?.kills ?? 0).toBe(0);
    expect(snap.rounds).toEqual([]);
  });

  it('starts over when a different game is played on the same map', () => {
    const t = new StatsTracker();
    playRound(t, 0, { aK: 0, bD: 0 }, 0);
    const others: PlayerInit[] = [{ steamid: 'x', side: 'CT' }, { steamid: 'y', side: 'T' }];
    t.update(game(5, 'live', others), 100);
    const ids = t.snapshot().players.map((p) => p.steamid);
    expect(ids).not.toContain('a');
    expect(t.snapshot().rounds).toEqual([]);
  });

  it('resets on map change', () => {
    const t = new StatsTracker();
    t.update(game(0, 'live', [{ steamid: 'a', side: 'CT' }]), 0);
    const other = { ...game(0, 'live', [{ steamid: 'a', side: 'CT' }]) };
    other.map = { ...other.map, name: 'de_nuke' };
    t.update(other, 1);
    expect(t.snapshot().map).toBe('de_nuke');
  });
});

describe('helpers', () => {
  it('classifies buys', () => {
    expect(classifyBuy(4000, 1)).toBe('pistol');
    expect(classifyBuy(4000, 13)).toBe('pistol');
    expect(classifyBuy(3000, 2)).toBe('eco');
    expect(classifyBuy(8000, 2)).toBe('semi');
    expect(classifyBuy(15000, 2)).toBe('force');
    expect(classifyBuy(25000, 2)).toBe('full');
  });

  it('computes an average rating close to 1.0', () => {
    // 20 rounds, average stats ≈ HLTV averages
    const r = computeRating({ kills: 14, deaths: 14, roundsPlayed: 20, multiKills: { 2: 3, 3: 1, 4: 0, 5: 0 } });
    expect(r).toBeGreaterThan(0.8);
    expect(r).toBeLessThan(1.2);
  });

  it('formats round labels', () => {
    expect(formatRoundLabel(0)).toBe('Round 1/24');
    expect(formatRoundLabel(24)).toBe('OT 1 (1/6)');
    expect(formatRoundLabel(30)).toBe('OT 2 (1/6)');
  });
});
