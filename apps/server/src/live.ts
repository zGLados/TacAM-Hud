import { CSGOGSI, type CSGO, type CSGORaw, type PlayerExtension, type Score } from 'csgogsi';
import {
  StatsTracker,
  normalizeMapName,
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

export const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

/** Scenes the automation is allowed to replace. Producer-chosen scenes are left alone. */
const AUTO_SCENES: SceneId[] = ['live', 'pause', 'halftime', 'matchEnd'];

export class LiveHub {
  private gsi = new CSGOGSI();
  readonly tracker = new StatsTracker();
  last: CSGO | null = null;
  lastRaw: CSGORaw | null = null;
  /** Last payload sent to HUDs, replayed to newly connected ones. */
  lastPayload: GsiUpdate | null = null;
  lastUpdate: number | null = null;
  killfeed: KillFeedEntry[] = [];
  private lastSummaryAt = 0;
  private lastRoundsCount = 0;

  constructor(
    private store: Store,
    private io: HudServer
  ) {
    // CS2 uses MR12 with MR3 overtime; csgogsi still defaults to MR15.
    this.gsi.regulationMR = 12;
    this.gsi.overtimeMR = 3;
    this.gsi.on('matchEnd', (score: Score) => this.onMatchEnd(score));
    setInterval(() => this.broadcastStatus(), 2000).unref();
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
    };
  }

  ingest(raw: CSGORaw) {
    const coaches = new Set(
      this.store
        .list('players')
        .filter((p) => p.isCoach)
        .map((p) => p.steamid)
    );
    if (raw.allplayers && coaches.size) {
      raw = {
        ...raw,
        allplayers: Object.fromEntries(
          Object.entries(raw.allplayers).filter(([steamid]) => !coaches.has(steamid))
        ),
      };
    }

    const teams = this.resolveTeams(raw);
    this.gsi.teams.left = teams.left;
    this.gsi.teams.right = teams.right;
    this.gsi.players = this.playerExtensions() as PlayerExtension[];

    const data = this.gsi.digest(raw);
    this.lastRaw = raw;
    this.lastUpdate = Date.now();
    this.lastPayload = { raw, teams };
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
    this.last = data;

    if (Date.now() - this.lastSummaryAt > 500) {
      this.lastSummaryAt = Date.now();
      this.io.to('control').emit('live', this.summary());
    }
  }

  summary(): LiveSummary | null {
    const data = this.last;
    if (!data) return null;
    const profiles = this.store.list('players');
    const team = (orientation: 'left' | 'right') => {
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

  private autoScene(data: CSGO) {
    const scene = this.store.doc('scene');
    if (!scene.auto || !AUTO_SCENES.includes(scene.active)) return;
    const phase = data.phase_countdowns.phase;
    let next: SceneId = 'live';
    if (data.map.phase === 'gameover') next = 'matchEnd';
    else if (data.map.phase === 'intermission') next = 'halftime';
    else if (phase === 'paused') next = 'pause';
    if (next !== scene.active) {
      const updated = this.store.setDoc('scene', { ...scene, active: next });
      this.io.emit('scene', updated);
    }
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
