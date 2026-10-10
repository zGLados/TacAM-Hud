import type { CSGORaw, PlayerRaw, WeaponRaw } from 'csgogsi';
import type { Store } from './store.js';

/**
 * Simulates a CS2 match on de_mirage and produces GSI payloads, so the HUD,
 * stats and scenes can be tested without running the game.
 */

type Side = 'CT' | 'T';
type Vec = [number, number, number];

interface SimPlayer {
  steamid: string;
  name: string;
  slot: number;
  side: Side;
  health: number;
  armor: number;
  helmet: boolean;
  defusekit: boolean;
  money: number;
  equip: number;
  kills: number;
  deaths: number;
  assists: number;
  mvps: number;
  roundKills: number;
  roundKillHs: number;
  roundDmg: number;
  pos: Vec;
  target: Vec;
  flashed: number;
  hasBomb: boolean;
  nades: string[];
}

const WAYPOINTS: Vec[] = [
  [1250, 30, -160], // T spawn
  [-1650, -1950, -170], // CT spawn
  [-500, -2000, -170], // A site
  [-2100, 300, -160], // B site
  [-400, -700, -100], // mid
  [400, -1500, -100], // palace
];

export const DEMO_TEAMS = [
  { name: 'TacAM Red', shortName: 'TCR', country: 'DE' },
  { name: 'Blue Phoenix', shortName: 'BPX', country: 'AT' },
];

export const DEMO_PLAYERS = [
  ['zGLados', 'Finn'],
  ['nexo', 'Nico'],
  ['kRypt', 'Kai'],
  ['vandal', 'Vince'],
  ['lumen', 'Lukas'],
  ['shadow', 'Sam'],
  ['falk', 'Felix'],
  ['raptor', 'Ralf'],
  ['m1ka', 'Mika'],
  ['juno', 'Jonas'],
].map(([name, first], i) => ({ steamid: `7656119800000${String(i).padStart(4, '0')}`, name, first }));

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export class DemoMatch {
  private timer: NodeJS.Timeout | null = null;
  private players: SimPlayer[] = [];
  private round = 0;
  private phase: 'freezetime' | 'live' | 'over' | 'gameover' = 'freezetime';
  private phaseEnds = 0;
  private scores: Record<Side, number> = { CT: 0, T: 0 };
  private losses: Record<Side, number> = { CT: 0, T: 0 };
  private roundWins: Record<string, string> = {};
  private winTeam: Side | undefined;
  private bomb: { state: string; pos: Vec; countdown: number; player?: string } = { state: 'carried', pos: [0, 0, 0], countdown: 0 };
  private observed = 0;
  private liveTime = 0;
  private smoke: { pos: Vec; started: number } | null = null;

  constructor(private send: (raw: CSGORaw) => void) {}

  get running() {
    return !!this.timer;
  }

  start() {
    if (this.timer) return;
    this.players = DEMO_PLAYERS.map((p, i) => ({
      steamid: p.steamid,
      name: p.name,
      slot: (i + 1) % 10,
      side: i < 5 ? 'CT' : 'T',
      health: 100,
      armor: 0,
      helmet: false,
      defusekit: false,
      money: 800,
      equip: 200,
      kills: 0,
      deaths: 0,
      assists: 0,
      mvps: 0,
      roundKills: 0,
      roundKillHs: 0,
      roundDmg: 0,
      pos: [0, 0, 0],
      target: [0, 0, 0],
      flashed: 0,
      hasBomb: false,
      nades: [],
    }));
    this.round = 0;
    this.scores = { CT: 0, T: 0 };
    this.losses = { CT: 0, T: 0 };
    this.roundWins = {};
    this.startFreezetime();
    this.timer = setInterval(() => this.tick(), 100);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private now() {
    return Date.now() / 1000;
  }

  private alive(side?: Side) {
    return this.players.filter((p) => p.health > 0 && (!side || p.side === side));
  }

  private startFreezetime() {
    this.phase = 'freezetime';
    this.phaseEnds = this.now() + 15;
    this.winTeam = undefined;
    this.smoke = null;
    const pistol = this.round === 0 || this.round === 12;
    for (const p of this.players) {
      p.health = 100;
      p.roundKills = 0;
      p.roundKillHs = 0;
      p.roundDmg = 0;
      p.flashed = 0;
      p.hasBomb = false;
      if (pistol) p.money = 800;
      p.pos = [...WAYPOINTS[p.side === 'T' ? 0 : 1]] as Vec;
      p.pos[0] += rand(-150, 150);
      p.pos[1] += rand(-150, 150);
      p.target = [...p.pos] as Vec;
    }
    const ts = this.players.filter((p) => p.side === 'T');
    pick(ts).hasBomb = true;
    this.bomb = { state: 'carried', pos: [0, 0, 0], countdown: 0 };
  }

  private buy() {
    for (const p of this.players) {
      const pistol = this.round === 0 || this.round === 12;
      const budget = pistol ? 800 : p.money;
      let spend = 0;
      if (budget >= 3700) spend = 2700 + (p.side === 'CT' ? 400 : 0);
      else if (budget >= 1500) spend = rand(500, budget - 200);
      p.armor = budget >= 1000 ? 100 : 0;
      p.helmet = budget >= 2000;
      p.defusekit = p.side === 'CT' && budget >= 3500;
      p.nades = budget >= 2500 ? ['smokegrenade', 'flashbang', p.side === 'T' ? 'molotov' : 'incgrenade', 'hegrenade'].slice(0, Math.ceil(rand(1, 4))) : [];
      const utilCost = p.nades.length * 300 + (p.armor ? 650 : 0) + (p.helmet ? 350 : 0);
      spend = Math.min(budget, Math.round(spend + utilCost));
      p.money -= Math.min(p.money, spend);
      p.equip = 200 + spend;
    }
  }

  private weapons(p: SimPlayer): Record<string, WeaponRaw> {
    const list: WeaponRaw[] = [{ name: 'weapon_knife', paintkit: 'default', type: 'Knife', state: 'holstered' }];
    const rich = p.equip > 3000;
    const pistolName = p.side === 'CT' ? 'weapon_usp_silencer' : 'weapon_glock';
    list.push({ name: pistolName, paintkit: 'default', type: 'Pistol', ammo_clip: 12, ammo_clip_max: 12, ammo_reserve: 24, state: 'holstered' });
    if (rich) {
      const primary = p.side === 'CT' ? pick(['weapon_m4a1', 'weapon_m4a1_silencer', 'weapon_awp']) : pick(['weapon_ak47', 'weapon_ak47', 'weapon_awp']);
      list.push({ name: primary, paintkit: 'default', type: primary.includes('awp') ? 'SniperRifle' : 'Rifle', ammo_clip: Math.ceil(rand(5, 30)), ammo_clip_max: 30, ammo_reserve: 90, state: 'active' });
    } else {
      list[1].state = 'active';
    }
    for (const nade of p.nades) list.push({ name: `weapon_${nade}`, paintkit: 'default', type: 'Grenade', ammo_reserve: 1, state: 'holstered' });
    if (p.hasBomb) list.push({ name: 'weapon_c4', paintkit: 'default', type: 'C4', state: 'holstered' });
    return Object.fromEntries(list.map((w, i) => [`weapon_${i}`, w]));
  }

  private endRound(winner: Side, outcome: string) {
    this.phase = 'over';
    this.phaseEnds = this.now() + 5;
    this.winTeam = winner;
    this.scores[winner]++;
    const loser: Side = winner === 'CT' ? 'T' : 'CT';
    this.losses[winner] = 0;
    this.losses[loser] = Math.min(this.losses[loser] + 1, 4);
    this.round++;
    this.roundWins[String(this.round)] = outcome;
    const mvp = this.alive(winner).sort((a, b) => b.roundKills - a.roundKills)[0];
    if (mvp) mvp.mvps++;
    for (const p of this.players) {
      p.money = Math.min(16000, p.money + (p.side === winner ? 3250 : 1400 + this.losses[loser] * 500));
    }
  }

  private kill() {
    const attackerSide: Side = Math.random() < 0.5 ? 'CT' : 'T';
    const attackers = this.alive(attackerSide);
    const victims = this.alive(attackerSide === 'CT' ? 'T' : 'CT');
    if (!attackers.length || !victims.length) return;
    const attacker = pick(attackers);
    const victim = pick(victims);
    const hs = Math.random() < 0.45;
    attacker.kills++;
    attacker.roundKills++;
    if (hs) attacker.roundKillHs++;
    attacker.roundDmg += victim.health;
    victim.health = 0;
    victim.deaths++;
    if (victim.hasBomb) {
      victim.hasBomb = false;
      this.bomb = { state: 'dropped', pos: [...victim.pos] as Vec, countdown: 0 };
    }
    const helpers = this.alive(attackerSide).filter((p) => p !== attacker);
    if (helpers.length && Math.random() < 0.3) {
      const helper = pick(helpers);
      helper.assists++;
      helper.roundDmg += Math.round(rand(41, 80));
    }
  }

  private tick() {
    const now = this.now();
    if (this.phase === 'freezetime' && now >= this.phaseEnds) {
      this.buy();
      this.phase = 'live';
      this.phaseEnds = now + 115;
      this.liveTime = now;
      for (const p of this.players) p.target = [...pick(WAYPOINTS.slice(2))] as Vec;
    } else if (this.phase === 'over' && now >= this.phaseEnds) {
      const total = this.scores.CT + this.scores.T;
      if (this.scores.CT === 13 || this.scores.T === 13) {
        this.phase = 'gameover';
        this.phaseEnds = now + 20;
      } else {
        if (total === 12) {
          // halftime: teams swap sides, scores follow the teams
          for (const p of this.players) p.side = p.side === 'CT' ? 'T' : 'CT';
          this.scores = { CT: this.scores.T, T: this.scores.CT };
          this.losses = { CT: 0, T: 0 };
        }
        this.startFreezetime();
      }
    } else if (this.phase === 'gameover' && now >= this.phaseEnds) {
      this.stop();
      this.start();
      return;
    } else if (this.phase === 'live') {
      this.simulateLive(now);
    }
    if (now - this.observed > 8 || !this.players[this.observedIndex()]?.health) {
      this.observed = now;
      const alive = this.alive();
      this.observedSteamid = (alive.length ? pick(alive) : this.players[0]).steamid;
    }
    this.send(this.payload(now));
  }

  private observedSteamid = '';
  private observedIndex() {
    return this.players.findIndex((p) => p.steamid === this.observedSteamid);
  }

  private simulateLive(now: number) {
    for (const p of this.alive()) {
      const dx = p.target[0] - p.pos[0];
      const dy = p.target[1] - p.pos[1];
      const dist = Math.hypot(dx, dy);
      if (dist < 50) p.target = [...pick(WAYPOINTS.slice(2))] as Vec;
      else {
        p.pos[0] += (dx / dist) * 25 + rand(-5, 5);
        p.pos[1] += (dy / dist) * 25 + rand(-5, 5);
      }
      p.flashed = Math.max(0, p.flashed - 20);
    }
    const elapsed = now - this.liveTime;
    if (!this.smoke && elapsed > 6) this.smoke = { pos: [-400, -700, -100], started: now };
    if (Math.random() < 0.02) {
      const victim = pick(this.alive());
      if (victim) victim.flashed = 255;
    }
    if (Math.random() < 0.025) this.kill();

    const carrier = this.players.find((p) => p.hasBomb && p.health > 0);
    if (this.bomb.state === 'carried' && carrier && elapsed > 25 && Math.random() < 0.03) {
      this.bomb = { state: 'planting', pos: [...carrier.pos] as Vec, countdown: 3.2, player: carrier.steamid };
    } else if (this.bomb.state === 'planting') {
      this.bomb.countdown -= 0.1;
      if (carrier?.health === 0) this.bomb = { state: 'dropped', pos: this.bomb.pos, countdown: 0 };
      else if (this.bomb.countdown <= 0) {
        if (carrier) carrier.hasBomb = false;
        this.bomb = { state: 'planted', pos: this.bomb.pos, countdown: 40 };
      }
    } else if (this.bomb.state === 'planted' || this.bomb.state === 'defusing') {
      this.bomb.countdown -= 0.1;
      const cts = this.alive('CT');
      if (this.bomb.state === 'planted' && cts.length && Math.random() < 0.01) {
        const defuser = pick(cts);
        this.bomb = { ...this.bomb, state: 'defusing', player: defuser.steamid };
        this.defuseEnds = now + (defuser.defusekit ? 5 : 10);
      }
      if (this.bomb.state === 'defusing' && now >= this.defuseEnds) {
        this.bomb = { ...this.bomb, state: 'defused' };
        return this.endRound('CT', 'ct_win_defuse');
      }
      if (this.bomb.countdown <= 0) {
        this.bomb = { ...this.bomb, state: 'exploded' };
        for (const p of this.alive('CT')) p.health = 0;
        return this.endRound('T', 't_win_bomb');
      }
      if (!cts.length) return this.endRound('T', 't_win_elimination');
      return;
    }
    if (!this.alive('T').length) return this.endRound('CT', 'ct_win_elimination');
    if (!this.alive('CT').length) return this.endRound('T', 't_win_elimination');
    if (now >= this.phaseEnds) return this.endRound('CT', 'ct_win_time');
  }

  private defuseEnds = 0;

  private payload(now: number): CSGORaw {
    const vec = (v: Vec) => v.map((n) => n.toFixed(2)).join(', ');
    const allplayers: Record<string, PlayerRaw> = {};
    for (const p of this.players) {
      allplayers[p.steamid] = {
        name: p.name,
        observer_slot: p.slot,
        team: p.side,
        match_stats: { kills: p.kills, assists: p.assists, deaths: p.deaths, mvps: p.mvps, score: p.kills * 2 + p.assists },
        weapons: p.health > 0 ? this.weapons(p) : {},
        state: {
          health: p.health,
          armor: p.health > 0 ? p.armor : 0,
          helmet: p.helmet,
          defusekit: p.defusekit,
          flashed: p.flashed,
          smoked: 0,
          burning: 0,
          money: p.money,
          round_kills: p.roundKills,
          round_killhs: p.roundKillHs,
          round_totaldmg: p.roundDmg,
          equip_value: p.equip,
        },
        position: vec(p.pos),
        forward: '0.70, 0.70, 0.00',
      };
    }
    const observed = this.players.find((p) => p.steamid === this.observedSteamid) ?? this.players[0];
    const team = (side: Side) => ({
      score: this.scores[side],
      consecutive_round_losses: this.losses[side],
      timeouts_remaining: 1,
      matches_won_this_series: 0,
    });
    const roundPhase = this.phase === 'gameover' ? 'over' : this.phase;
    const phaseEnds = Math.max(0, this.phaseEnds - now);
    let countdownPhase: string = this.phase === 'gameover' ? 'over' : this.phase;
    let endsIn = phaseEnds;
    if (this.bomb.state === 'planted' || this.bomb.state === 'defusing') {
      countdownPhase = this.bomb.state === 'defusing' ? 'defuse' : 'bomb';
      endsIn = this.bomb.countdown;
    }
    const grenades: Record<string, unknown> = {};
    if (this.smoke && this.phase === 'live') {
      const effect = now - this.smoke.started;
      if (effect < 20) {
        grenades['900'] = {
          owner: this.players[0].steamid,
          position: vec(this.smoke.pos),
          velocity: '0.00, 0.00, 0.00',
          lifetime: effect.toFixed(1),
          type: 'smoke',
          effecttime: effect.toFixed(1),
        };
      }
    }
    return {
      provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 14000, steamid: '76561198000000000', timestamp: Math.floor(now) },
      map: {
        mode: 'competitive',
        name: 'de_mirage',
        phase: this.phase === 'gameover' ? 'gameover' : this.scores.CT + this.scores.T === 12 && this.phase === 'over' ? 'intermission' : 'live',
        round: this.round,
        team_ct: team('CT'),
        team_t: team('T'),
        num_matches_to_win_series: 0,
        current_spectators: 0,
        souvenirs_total: 0,
        round_wins: this.roundWins as never,
      },
      round: {
        phase: roundPhase,
        ...(this.bomb.state === 'planted' || this.bomb.state === 'defusing' ? { bomb: 'planted' as const } : {}),
        ...(this.winTeam ? { win_team: this.winTeam } : {}),
      },
      player: {
        steamid: observed.steamid,
        name: observed.name,
        observer_slot: observed.slot,
        team: observed.side,
        activity: 'playing',
        state: allplayers[observed.steamid].state as never,
        spectarget: observed.steamid,
        position: vec(observed.pos),
        forward: '0.70, 0.70, 0.00',
      },
      allplayers,
      bomb: {
        state: this.bomb.state as never,
        position: vec(this.bomb.state === 'carried' ? this.players.find((p) => p.hasBomb)?.pos ?? [0, 0, 0] : this.bomb.pos),
        ...(this.bomb.player ? { player: this.bomb.player } : {}),
        ...(['planted', 'defusing', 'planting'].includes(this.bomb.state) ? { countdown: this.bomb.countdown.toFixed(2) } : {}),
      },
      grenades: grenades as never,
      phase_countdowns: { phase: countdownPhase as never, phase_ends_in: endsIn.toFixed(1) },
    };
  }
}

/** Creates demo teams, players and a current BO3 match matching the simulated steamids. */
export function seedDemoData(store: Store) {
  const teamIds = DEMO_TEAMS.map((t) => {
    const existing = store.list('teams').find((x) => x.name === t.name);
    return (existing ?? store.insert('teams', { ...t, logo: null, extra: {} })).id;
  });
  DEMO_PLAYERS.forEach((p, i) => {
    if (store.list('players').some((x) => x.steamid === p.steamid)) return;
    store.insert('players', {
      steamid: p.steamid,
      username: p.name,
      firstName: p.first,
      lastName: '',
      country: i < 5 ? 'DE' : 'AT',
      avatar: null,
      teamId: teamIds[i < 5 ? 0 : 1],
      isCoach: false,
      extra: {},
    });
  });
  const matches = store.list('matches').map((m) => ({ ...m, current: false }));
  store.replaceAll('matches', matches);
  return store.insert('matches', {
    left: { id: teamIds[0], wins: 0 },
    right: { id: teamIds[1], wins: 0 },
    matchType: 'bo3',
    current: true,
    title: 'Demo – Grand Final',
    startTime: null,
    roundsPerHalf: null,
    vetos: [
      { type: 'ban', mapName: 'de_nuke', teamId: teamIds[0], side: 'NO', reverseSide: false, score: {}, winner: null, mapEnd: false },
      { type: 'ban', mapName: 'de_ancient', teamId: teamIds[1], side: 'NO', reverseSide: false, score: {}, winner: null, mapEnd: false },
      { type: 'pick', mapName: 'de_mirage', teamId: teamIds[0], side: 'CT', reverseSide: false, score: {}, winner: null, mapEnd: false },
      { type: 'pick', mapName: 'de_inferno', teamId: teamIds[1], side: 'T', reverseSide: false, score: {}, winner: null, mapEnd: false },
      { type: 'decider', mapName: 'de_anubis', teamId: null, side: 'NO', reverseSide: false, score: {}, winner: null, mapEnd: false },
    ],
  });
}
