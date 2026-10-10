import { CSGOGSI, type CSGO, type CSGORaw, type PlayerExtension, type Score } from 'csgogsi';
import {
  StatsTracker,
  normalizeMapName,
  roundRules,
  type GsiStatus,
  type GsiUpdate,
  type HudPlayerExtension,
  type HudTeamExtension,
  type KillFeedEntry,
  type LiveSummary,
  type Match,
  type SceneId,
  type Side,
} from '@tacam/shared';
import type { Store } from './store.js';
import type { HudServer } from './io.js';
import { detectGameEvents, type GameEvent } from './signals.js';

export const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

/** True when `round` completed rounds end a half (regulation or overtime). */
export function isHalfBreak(round: number, regulationMR: number, overtimeMR: number) {
  if (round === regulationMR) return true;
  const overtime = round - 2 * regulationMR;
  return overtime > 0 && overtime % overtimeMR === 0;
}

/**
 * Removes coaches from the payload. They occupy a team slot in CS2 but must not
 * show up in the HUD, count for team detection/orientation or get stats; a
 * spectated coach POV is dropped as well, so the HUD shows no focus player.
 */
export function withoutCoaches(raw: CSGORaw, coaches: Set<string>): CSGORaw {
  const { player, ...rest } = raw;
  return {
    ...rest,
    ...(player && !coaches.has(player.steamid) ? { player } : {}),
    allplayers: raw.allplayers && Object.fromEntries(Object.entries(raw.allplayers).filter(([steamid]) => !coaches.has(steamid))),
  };
}

/** Scenes the automation is allowed to replace. Producer-chosen scenes are left alone. */
const AUTO_SCENES: SceneId[] = ['live', 'pause', 'halftime', 'matchEnd'];

export class LiveHub {
  private gsi = this.createGsi();
  /** Where the current data comes from; switching resets the session. */
  private source: 'demo' | 'game' | null = null;
  readonly tracker = new StatsTracker();
  last: CSGO | null = null;
  lastRaw: CSGORaw | null = null;
  /** Last payload sent to HUDs, replayed to newly connected ones. */
  lastPayload: GsiUpdate | null = null;
  lastUpdate: number | null = null;
  killfeed: KillFeedEntry[] = [];
  private lastSummaryAt = 0;
  private lastRoundsCount = 0;
  /** Last scene the automation chose, to only react to phase changes. */
  private lastAutoScene: SceneId | null = null;
  /** Team shown on the left when `keepTeamSides` took effect on this map. */
  private sideAnchor: { map: string; leftKey: string } | null = null;
  private flip = false;
  /** Receives game events derived from consecutive updates (signals). */
  onEvents: ((events: GameEvent[]) => void) | null = null;

  constructor(
    private store: Store,
    private io: HudServer
  ) {
    setInterval(() => this.broadcastStatus(), 2000).unref();
  }

  private createGsi() {
    const gsi = new CSGOGSI();
    // CS2 uses MR12 with MR3 overtime; csgogsi still defaults to MR15.
    gsi.regulationMR = 12;
    gsi.overtimeMR = 3;
    gsi.on('matchEnd', (score: Score) => this.onMatchEnd(score));
    return gsi;
  }

  /**
   * Forgets everything about the previous game (stats, kill feed, parser state)
   * and makes HUDs reload, e.g. when real CS2 data replaces the demo match.
   */
  private resetSession() {
    this.gsi = this.createGsi();
    this.tracker.reset(null);
    this.killfeed = [];
    this.last = null;
    this.lastRoundsCount = 0;
    this.lastAutoScene = null;
    this.sideAnchor = null;
    this.flip = false;
    this.io.emit('stats', this.tracker.snapshot());
    this.io.emit('refresh');
  }

  get status(): GsiStatus {
    const connected = !!this.lastUpdate && Date.now() - this.lastUpdate < 5000;
    return {
      connected,
      lastUpdate: this.lastUpdate,
      map: this.last?.map.name ?? null,
      phase: this.last?.phase_countdowns.phase ?? null,
    };
  }

  currentMatch(): Match | null {
    return this.store.list('matches').find((m) => m.current) ?? null;
  }

  playerExtensions(): HudPlayerExtension[] {
    return this.store
      .list('players')
      .filter((p) => !p.isCoach)
      .map((p) => ({
        id: p.id,
        name: p.username,
        steamid: p.steamid,
        realName: `${p.firstName} ${p.lastName}`.trim() || null,
        country: p.country,
        avatar: uploadUrl(p.avatar),
        teamId: p.teamId,
        extra: p.extra,
      }));
  }

  private teamExtension(teamId: string | null, match: Match | null): HudTeamExtension | null {
    if (!teamId) return null;
    const team = this.store.get('teams', teamId);
    if (!team) return null;
    const mapScore =
      match?.left.id === teamId ? match.left.wins : match?.right.id === teamId ? match.right.wins : 0;
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      country: team.country,
      logo: uploadUrl(team.logo),
      map_score: mapScore,
      extra: team.extra,
    };
  }

  /**
   * Finds the database team playing on each side by looking at which team the
   * connected players belong to, falling back to the current match's left/right.
   */
  private resolveTeams(raw: CSGORaw) {
    const match = this.currentMatch();
    const players = this.store.list('players');
    const bySide: Record<Side, string | null> = { CT: null, T: null };
    for (const side of ['CT', 'T'] as const) {
      const tally = new Map<string, number>();
      for (const [steamid, p] of Object.entries(raw.allplayers ?? {})) {
        if (p.team !== side) continue;
        const teamId = players.find((x) => x.steamid === steamid)?.teamId;
        if (teamId) tally.set(teamId, (tally.get(teamId) ?? 0) + 1);
      }
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 2) bySide[side] = best[0];
    }

    // Same orientation rule as csgogsi: the side holding the lower observer slots is left.
    const slots = Object.values(raw.allplayers ?? {});
    const ct = slots.find((p) => p.team === 'CT' && p.observer_slot !== undefined);
    const t = slots.find((p) => p.team === 'T' && p.observer_slot !== undefined);
    const isCTLeft = !(ct && t && (ct.observer_slot || 10) > (t.observer_slot || 10));

    let leftId = isCTLeft ? bySide.CT : bySide.T;
    let rightId = isCTLeft ? bySide.T : bySide.CT;

    if (match && (!leftId || !rightId)) {
      const mapName = raw.map ? normalizeMapName(raw.map.name) : '';
      const veto = match.vetos.find((v) => v.mapName === mapName);
      const [a, b] = veto?.reverseSide ? [match.right.id, match.left.id] : [match.left.id, match.right.id];
      leftId = leftId ?? (rightId === a ? b : a);
      rightId = rightId ?? (leftId === b ? a : b);
    }
    return {
      left: this.teamExtension(leftId, match),
      right: this.teamExtension(rightId, match),
      leftSide: (isCTLeft ? 'CT' : 'T') as Side,
    };
  }

  /**
   * With `keepTeamSides`, remembers which team was on the left when the map (or
   * the setting) started and flips the display once that team shows up on the
   * right. Only the display is flipped, so observer slot numbers stay correct.
   * Teams are recognized by their database profile, else by the CS team name.
   */
  private sideFlip(raw: CSGORaw, teams: ReturnType<LiveHub['resolveTeams']>) {
    if (!this.store.doc('hudConfig').keepTeamSides || !raw.map) {
      this.sideAnchor = null;
      return false;
    }
    const rawName = (side: Side) => (side === 'CT' ? raw.map?.team_ct?.name : raw.map?.team_t?.name) ?? null;
    const rightSide: Side = teams.leftSide === 'CT' ? 'T' : 'CT';
    const leftKey = teams.left?.id ?? rawName(teams.leftSide);
    const rightKey = teams.right?.id ?? rawName(rightSide);
    // Unknown or ambiguous teams: keep the current state instead of guessing.
    if (!leftKey || !rightKey || leftKey === rightKey) return this.flip;
    const map = raw.map.name;
    if (this.sideAnchor?.map !== map) {
      this.sideAnchor = { map, leftKey };
      return false;
    }
    if (this.sideAnchor.leftKey === leftKey) return false;
    if (this.sideAnchor.leftKey === rightKey) return true;
    // Different teams than at the start (e.g. a new match on the same map).
    this.sideAnchor = { map, leftKey };
    return false;
  }

  ingest(raw: CSGORaw, demo = false) {
    const source = demo ? 'demo' : 'game';
    if (this.source && this.source !== source) this.resetSession();
    this.source = source;

    const coaches = new Set(
      this.store
        .list('players')
        .filter((p) => p.isCoach)
        .map((p) => p.steamid)
    );
    if (coaches.size) raw = withoutCoaches(raw, coaches);

    // Wingman (MR8) comes from the game mode, custom 1v1/2v2 servers from the match.
    const rules = roundRules(raw.map?.mode, this.currentMatch()?.roundsPerHalf);
    this.gsi.regulationMR = rules.regulationMR;
    this.gsi.overtimeMR = rules.overtimeMR;
    this.tracker.regulationMR = rules.regulationMR;

    const teams = this.resolveTeams(raw);
    this.gsi.teams.left = teams.left;
    this.gsi.teams.right = teams.right;
    this.gsi.players = this.playerExtensions() as PlayerExtension[];
    this.flip = this.sideFlip(raw, teams);

    const data = this.gsi.digest(raw);
    this.lastRaw = raw;
    this.lastUpdate = Date.now();
    this.lastPayload = { raw, teams: { left: teams.left, right: teams.right }, demo, flip: this.flip, rules };
    this.io.emit('update', this.lastPayload);
    if (!data) return;

    const kills = this.tracker.update(data);
    for (const kill of kills) {
      this.killfeed = [...this.killfeed.slice(-19), kill];
      this.io.emit('kill', kill);
    }
    const snapshot = this.tracker.snapshot();
    if (kills.length || snapshot.rounds.length !== this.lastRoundsCount) {
      this.lastRoundsCount = snapshot.rounds.length;
      this.io.emit('stats', snapshot);
    }
    if (data.round?.phase === 'freezetime' && this.last?.round?.phase !== 'freezetime') {
      this.killfeed = [];
    }

    this.autoScene(data);
    this.onEvents?.(detectGameEvents(this.last, data, rules));
    this.last = data;

    if (Date.now() - this.lastSummaryAt > 500) {
      this.lastSummaryAt = Date.now();
      this.io.to('control').emit('live', this.summary());
    }
  }

  /** Where a side is shown right now (left/right), honoring the halftime flip and the swap switch. */
  displaySlot(side: Side): 'left' | 'right' | null {
    if (!this.last) return null;
    const team = side === 'CT' ? this.last.map.team_ct : this.last.map.team_t;
    const swapped = this.flip !== this.store.doc('hudConfig').swapTeams;
    return swapped ? (team.orientation === 'left' ? 'right' : 'left') : team.orientation;
  }

  summary(): LiveSummary | null {
    const data = this.last;
    if (!data) return null;
    const profiles = this.store.list('players');
    const team = (displayed: 'left' | 'right') => {
      const orientation = this.flip ? (displayed === 'left' ? 'right' : 'left') : displayed;
      const t = data.map.team_ct.orientation === orientation ? data.map.team_ct : data.map.team_t;
      return { name: t.name, side: t.side, score: t.score, teamId: t.id };
    };
    return {
      map: data.map.name,
      mapPhase: data.map.phase,
      roundPhase: data.round?.phase ?? null,
      round: data.map.round,
      left: team('left'),
      right: team('right'),
      observed: data.player?.steamid ?? null,
      players: data.players.map((p) => {
        const profile = profiles.find((x) => x.steamid === p.steamid);
        return {
          steamid: p.steamid,
          name: p.defaultName,
          side: p.team.side,
          observerSlot: p.observer_slot ?? null,
          kills: p.stats.kills,
          deaths: p.stats.deaths,
          assists: p.stats.assists,
          health: p.state.health,
          money: p.state.money,
          profileId: profile?.id ?? null,
          teamId: profile?.teamId ?? null,
        };
      }),
    };
  }

  /** Scene the automation wants for the current game phase. */
  private autoSceneFor(data: CSGO): SceneId {
    if (data.map.phase === 'gameover') return 'matchEnd';
    if (data.map.phase === 'intermission') return 'halftime';
    if (data.phase_countdowns.phase === 'paused') {
      // Tournament configs pause the match at halftime (mp_halftime_pausematch),
      // then CS2 reports "paused" instead of "intermission".
      return isHalfBreak(data.map.round, this.gsi.regulationMR, this.gsi.overtimeMR) ? 'halftime' : 'pause';
    }
    return 'live';
  }

  /**
   * Switches scenes only when the automatic target changes (edge-triggered),
   * so a scene the producer picks by hand stays until the game phase changes.
   */
  private autoScene(data: CSGO) {
    const next = this.autoSceneFor(data);
    if (next === this.lastAutoScene) return;
    this.lastAutoScene = next;
    const scene = this.store.doc('scene');
    if (!scene.auto || !AUTO_SCENES.includes(scene.active) || next === scene.active) return;
    const updated = this.store.setDoc('scene', { ...scene, active: next });
    this.io.emit('scene', updated);
  }

  /** Writes the map result into the current match's veto and series score. */
  private onMatchEnd(score: Score) {
    const match = this.currentMatch();
    if (!match) return;
    const mapName = normalizeMapName(score.map.name);
    const veto = match.vetos.find((v) => v.mapName === mapName && v.type !== 'ban');
    if (!veto || veto.mapEnd) return;
    const winnerId = score.winner.id;
    const loserId = score.loser.id;
    if (!winnerId || !loserId) return;
    veto.mapEnd = true;
    veto.winner = winnerId;
    veto.score = { [winnerId]: score.winner.score, [loserId]: score.loser.score };
    const left = { ...match.left, wins: match.left.wins + (match.left.id === winnerId ? 1 : 0) };
    const right = { ...match.right, wins: match.right.wins + (match.right.id === winnerId ? 1 : 0) };
    const updated = this.store.update('matches', match.id, { vetos: [...match.vetos], left, right });
    this.io.emit('match', updated ?? null);
  }

  resetStats() {
    this.tracker.reset(this.last?.map.name ?? null);
    this.killfeed = [];
    this.io.emit('stats', this.tracker.snapshot());
  }

  private broadcastStatus() {
    this.io.to('control').emit('gsiStatus', this.status);
  }
}
