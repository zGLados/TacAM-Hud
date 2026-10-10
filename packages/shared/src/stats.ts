import type { CSGO, Player } from 'csgogsi';
import type {
  BuyType,
  KillFeedEntry,
  PlayerMatchStats,
  RoundRecord,
  Side,
  StatsSnapshot,
  TeamEconomy,
} from './types.js';

/** Seconds within which a death counts as traded (KAST "T"). */
const TRADE_WINDOW_MS = 5000;

// HLTV rating 1.0 averages
const AVG_KPR = 0.679;
const AVG_SPR = 0.317;
const AVG_RMK = 1.277;

interface PlayerTotals {
  steamid: string;
  name: string;
  side: Side;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  roundsPlayed: number;
  kastRounds: number;
  multiKills: { 2: number; 3: number; 4: number; 5: number };
  openingKills: number;
  openingDeaths: number;
  clutchesWon: number;
}

interface RoundPlayer {
  side: Side;
  kills: number;
  assisted: boolean;
  died: boolean;
  traded: boolean;
  survived: boolean;
  damage: number;
}

interface RoundKill {
  time: number;
  killer: string | null;
  victim: string;
}

interface RoundState {
  number: number;
  players: Map<string, RoundPlayer>;
  kills: RoundKill[];
  economy: { CT: TeamEconomy | null; T: TeamEconomy | null };
  bombPlanted: boolean;
  clutch: { CT: { steamid: string; vs: number } | null; T: { steamid: string; vs: number } | null };
  winner: Side | null;
  outcome: string | null;
  /** Freezetime is over. */
  started: boolean;
  over: boolean;
}

export function classifyBuy(equipment: number, round: number, regulationMR = 12): BuyType {
  if (round === 1 || round === regulationMR + 1) return 'pistol';
  if (equipment < 5000) return 'eco';
  if (equipment < 10000) return 'semi';
  if (equipment < 20000) return 'force';
  return 'full';
}

export function computeRating(p: {
  kills: number;
  deaths: number;
  roundsPlayed: number;
  multiKills: { 2: number; 3: number; 4: number; 5: number };
}): number {
  const rounds = p.roundsPlayed;
  if (rounds === 0) return 0;
  const singleKillRounds = Math.max(
    0,
    p.kills -
      2 * p.multiKills[2] -
      3 * p.multiKills[3] -
      4 * p.multiKills[4] -
      5 * p.multiKills[5]
  );
  const killRating = p.kills / rounds / AVG_KPR;
  const survivalRating = Math.max(0, rounds - p.deaths) / rounds / AVG_SPR;
  const multiKillRating =
    (singleKillRounds +
      4 * p.multiKills[2] +
      9 * p.multiKills[3] +
      16 * p.multiKills[4] +
      25 * p.multiKills[5]) /
    rounds /
    AVG_RMK;
  return (killRating + 0.7 * survivalRating + multiKillRating) / 2.7;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const activeWeapon = (p: Player | undefined) =>
  p?.weapons.find((w) => w.state === 'active')?.name.replace('weapon_', '') ?? '';

const ref = (p: Player) => ({ steamid: p.steamid, name: p.name, side: p.team.side });

/**
 * Infers kill events from two consecutive GSI snapshots. CS2's GSI does not
 * send kill events, so we compare death/kill counters between updates.
 */
export function inferKills(prev: CSGO, cur: CSGO, now: number): KillFeedEntry[] {
  if (prev.map.round !== cur.map.round || prev.map.name !== cur.map.name) return [];
  const before = new Map(prev.players.map((p) => [p.steamid, p]));

  const victims: Player[] = [];
  const killers: Player[] = [];
  const assisters: Player[] = [];
  for (const p of cur.players) {
    const old = before.get(p.steamid);
    if (!old) continue;
    for (let i = 0; i < p.stats.deaths - old.stats.deaths; i++) victims.push(p);
    for (let i = 0; i < p.stats.kills - old.stats.kills; i++) killers.push(p);
    if (p.stats.assists > old.stats.assists) assisters.push(p);
  }

  const entries: KillFeedEntry[] = [];
  for (const victim of victims) {
    // Prefer an enemy; a team kill decrements the killer's counter so it never shows up here.
    let idx = killers.findIndex((k) => k.team.side !== victim.team.side);
    if (idx === -1) idx = killers.findIndex((k) => k.steamid !== victim.steamid);
    const killer = idx >= 0 ? killers.splice(idx, 1)[0] : null;
    const assister =
      assisters.find((a) => a.team.side !== victim.team.side && a.steamid !== killer?.steamid) ??
      null;
    const oldKiller = killer ? before.get(killer.steamid) : undefined;
    entries.push({
      id: `${cur.map.round}-${now}-${victim.steamid}`,
      time: now,
      round: cur.map.round + 1,
      killer: killer ? ref(killer) : null,
      victim: ref(victim),
      assister: assister ? ref(assister) : null,
      weapon: killer ? activeWeapon(oldKiller) || activeWeapon(killer) : 'world',
      headshot:
        !!killer && !!oldKiller && killer.state.round_killhs > oldKiller.state.round_killhs,
    });
  }
  return entries;
}

export class StatsTracker {
  private mapName: string | null = null;
  private totals = new Map<string, PlayerTotals>();
  private rounds: RoundRecord[] = [];
  private round: RoundState | null = null;
  private prev: CSGO | null = null;
  /** Totals at the start of each round, to roll back on round restores. */
  private roundStartTotals = new Map<number, Map<string, PlayerTotals>>();

  constructor(private regulationMR = 12) {}

  reset(mapName: string | null = null) {
    this.mapName = mapName;
    this.totals.clear();
    this.rounds = [];
    this.round = null;
    this.prev = null;
    this.roundStartTotals.clear();
  }

  /** Feed a parsed GSI update. Returns the kill events inferred from it. */
  update(cur: CSGO, now = Date.now()): KillFeedEntry[] {
    const prev = this.prev;
    // Going back in rounds (backup restore, mp_restartgame) is handled per round below.
    // None of the current players are known: a different game on the same map
    // (e.g. the observer switched servers without a warmup in between).
    const differentGame = this.totals.size > 0 && cur.players.length > 0 && !cur.players.some((p) => this.totals.has(p.steamid));
    if (cur.map.name !== this.mapName || differentGame || (prev && prev.map.phase !== 'warmup' && cur.map.phase === 'warmup')) {
      this.reset(cur.map.name);
    }
    this.prev = cur;
    if (cur.map.phase === 'warmup' || !prev) return [];

    const phase = cur.round?.phase ?? null;
    const prevPhase = prev.round?.phase ?? null;

    // A new round starts with freezetime: close the previous one. A freezetime for
    // a different round number than the tracked one means a round was restored.
    if (phase === 'freezetime' && this.round && (prevPhase !== 'freezetime' || this.round.number !== cur.map.round + 1)) {
      this.finalizeRound();
    }
    if (!this.round || (this.round.over && phase !== 'over')) {
      if (this.round) this.finalizeRound();
      this.round = this.newRound(cur.map.round + 1);
    }
    const round = this.round;

    for (const p of cur.players) {
      this.ensureTotals(p);
      const rp = this.ensureRoundPlayer(round, p);
      rp.damage = Math.max(rp.damage, p.state.round_totaldmg);
    }

    // Economy is read when freezetime ends (after buying).
    if (phase === 'live' && (prevPhase === 'freezetime' || !round.economy.CT)) {
      round.economy = {
        CT: this.economy(cur, 'CT', round.number),
        T: this.economy(cur, 'T', round.number),
      };
    }

    if (phase === 'live') round.started = true;
    if (cur.round?.bomb === 'planted' || cur.bomb?.state === 'planted') round.bombPlanted = true;

    const kills = inferKills(prev, cur, now);
    for (const kill of kills) this.applyKill(round, kill);

    if (phase === 'live') this.trackClutch(round, cur);

    if (phase === 'over' && prevPhase !== 'over' && !round.over) {
      round.over = true;
      round.winner = cur.round?.win_team ?? null;
      round.outcome = cur.map.round_wins?.[String(round.number)] ?? null;
      for (const p of cur.players) {
        const rp = round.players.get(p.steamid);
        if (rp) rp.survived = p.state.health > 0;
      }
    }

    if (cur.map.phase === 'gameover' && round.over) this.finalizeRound();

    return kills;
  }

  snapshot(): StatsSnapshot {
    const players: PlayerMatchStats[] = [...this.totals.values()].map((t) => {
      // Kills/deaths of the running round are already counted, so count the round too
      // for the per-round averages; KAST only uses finished rounds.
      const live = this.round?.started ? this.round.players.get(t.steamid) : undefined;
      const rounds = t.roundsPlayed + (live ? 1 : 0);
      const damage = t.damage + (live?.damage ?? 0);
      return {
        ...t,
        multiKills: { ...t.multiKills },
        adr: rounds ? Math.round(damage / rounds) : 0,
        hsPercent: t.kills ? Math.round((100 * t.headshots) / t.kills) : 0,
        kast: t.roundsPlayed ? Math.round((100 * t.kastRounds) / t.roundsPlayed) : 0,
        kpr: rounds ? round2(t.kills / rounds) : 0,
        rating: round2(computeRating({ ...t, roundsPlayed: rounds })),
      };
    });
    players.sort((a, b) => b.rating - a.rating);
    return { map: this.mapName, players, rounds: [...this.rounds] };
  }

  private newRound(number: number): RoundState {
    const cloneTotals = (totals: Map<string, PlayerTotals>) =>
      new Map([...totals].map(([id, t]) => [id, { ...t, multiKills: { ...t.multiKills } }]));
    const known = [...this.roundStartTotals.keys()];
    if (this.roundStartTotals.has(number)) {
      // Round restored: forget everything that happened from this round on.
      this.totals = cloneTotals(this.roundStartTotals.get(number)!);
      for (const key of known) if (key > number) this.roundStartTotals.delete(key);
      this.rounds = this.rounds.filter((r) => r.round < number);
    } else if (known.length && number < Math.min(...known)) {
      // Restored to a round from before we started tracking: start over.
      this.totals.clear();
      this.rounds = [];
      this.roundStartTotals.clear();
      this.roundStartTotals.set(number, new Map());
    } else {
      this.roundStartTotals.set(number, cloneTotals(this.totals));
    }
    return {
      number,
      players: new Map(),
      kills: [],
      economy: { CT: null, T: null },
      bombPlanted: false,
      clutch: { CT: null, T: null },
      winner: null,
      outcome: null,
      started: false,
      over: false,
    };
  }

  private ensureTotals(p: Player): PlayerTotals {
    let t = this.totals.get(p.steamid);
    if (!t) {
      t = {
        steamid: p.steamid,
        name: p.name,
        side: p.team.side,
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        damage: 0,
        roundsPlayed: 0,
        kastRounds: 0,
        multiKills: { 2: 0, 3: 0, 4: 0, 5: 0 },
        openingKills: 0,
        openingDeaths: 0,
        clutchesWon: 0,
      };
      this.totals.set(p.steamid, t);
    }
    t.name = p.name;
    t.side = p.team.side;
    return t;
  }

  private ensureRoundPlayer(round: RoundState, p: Player): RoundPlayer {
    let rp = round.players.get(p.steamid);
    if (!rp) {
      rp = {
        side: p.team.side,
        kills: 0,
        assisted: false,
        died: false,
        traded: false,
        survived: false,
        damage: 0,
      };
      round.players.set(p.steamid, rp);
    }
    return rp;
  }

  private economy(cur: CSGO, side: Side, round: number): TeamEconomy {
    const team = cur.players.filter((p) => p.team.side === side);
    const equipment = team.reduce((sum, p) => sum + p.state.equip_value, 0);
    const money = team.reduce((sum, p) => sum + p.state.money, 0);
    return { equipment, money, buy: classifyBuy(equipment, round, this.regulationMR) };
  }

  private applyKill(round: RoundState, kill: KillFeedEntry) {
    const victim = this.totals.get(kill.victim.steamid);
    const victimRound = round.players.get(kill.victim.steamid);
    if (victim) victim.deaths++;
    if (victimRound) victimRound.died = true;

    if (kill.killer && kill.killer.side !== kill.victim.side) {
      const killer = this.totals.get(kill.killer.steamid);
      const killerRound = round.players.get(kill.killer.steamid);
      if (killer) {
        killer.kills++;
        if (kill.headshot) killer.headshots++;
      }
      if (killerRound) killerRound.kills++;

      if (round.kills.length === 0) {
        if (killer) killer.openingKills++;
        if (victim) victim.openingDeaths++;
      }

      // The victim avenged an earlier death → that earlier victim was traded.
      for (const earlier of round.kills) {
        if (earlier.killer === kill.victim.steamid && kill.time - earlier.time <= TRADE_WINDOW_MS) {
          const traded = round.players.get(earlier.victim);
          if (traded) traded.traded = true;
        }
      }
    }
    if (kill.assister) {
      const assister = this.totals.get(kill.assister.steamid);
      const assisterRound = round.players.get(kill.assister.steamid);
      if (assister) assister.assists++;
      if (assisterRound) assisterRound.assisted = true;
    }
    round.kills.push({ time: kill.time, killer: kill.killer?.steamid ?? null, victim: kill.victim.steamid });
  }

  private trackClutch(round: RoundState, cur: CSGO) {
    const alive = (side: Side) => cur.players.filter((p) => p.team.side === side && p.state.health > 0);
    for (const side of ['CT', 'T'] as const) {
      const own = alive(side);
      const enemies = alive(side === 'CT' ? 'T' : 'CT');
      if (!round.clutch[side] && own.length === 1 && enemies.length >= 1) {
        round.clutch[side] = { steamid: own[0].steamid, vs: enemies.length };
      }
    }
  }

  private finalizeRound() {
    const round = this.round;
    this.round = null;
    if (!round || !round.over) return;

    for (const [steamid, rp] of round.players) {
      const t = this.totals.get(steamid);
      if (!t) continue;
      t.roundsPlayed++;
      t.damage += rp.damage;
      if (rp.kills >= 2) t.multiKills[Math.min(rp.kills, 5) as 2 | 3 | 4 | 5]++;
      if (rp.kills > 0 || rp.assisted || rp.survived || rp.traded) t.kastRounds++;
    }
    if (round.winner) {
      const clutch = round.clutch[round.winner];
      const clutcher = clutch && this.totals.get(clutch.steamid);
      if (clutcher) clutcher.clutchesWon++;
    }
    this.rounds = this.rounds.filter((r) => r.round !== round.number);
    this.rounds.push({
      round: round.number,
      winner: round.winner,
      // round_wins may only be filled in a tick after the round ended
      outcome: round.outcome ?? this.prev?.map.round_wins?.[String(round.number)] ?? null,
      bombPlanted: round.bombPlanted,
      economy: round.economy,
    });
    this.rounds.sort((a, b) => a.round - b.round);
  }
}
