import type { CSGO } from 'csgogsi';
import type { RoundRules, Side, SignalEvent, SignalLogEntry, SignalRule } from '@tacam/shared';
import type { TriggerAction } from './actions.js';
import type { ObsBridge } from './obs.js';
import type { Store } from './store.js';

export interface GameEvent {
  type: SignalEvent;
  /** Side the event belongs to (round winner, planting T, defusing CT, ace player …). */
  side: Side | null;
}

/** Wins a team needs at the current score (regulation, then each overtime). */
export function winsNeeded(roundsPlayed: number, rules: RoundRules) {
  const regulation = rules.regulationMR * 2;
  if (roundsPlayed < regulation) return rules.regulationMR + 1;
  const overtime = Math.floor((roundsPlayed - regulation) / (rules.overtimeMR * 2));
  return rules.regulationMR + (overtime + 1) * rules.overtimeMR + 1;
}

/** Derives game events from two consecutive GSI states (GSI has no events of its own). */
export function detectGameEvents(prev: CSGO | null, cur: CSGO, rules: RoundRules): GameEvent[] {
  if (!prev) return [];
  const events: GameEvent[] = [];
  const add = (type: SignalEvent, side: Side | null = null) => events.push({ type, side });
  const roundPhase = cur.round?.phase;
  const prevRoundPhase = prev.round?.phase;

  if (roundPhase === 'freezetime' && prevRoundPhase !== 'freezetime') {
    add('roundStart');
    const needed = winsNeeded(cur.map.round, rules);
    for (const team of [cur.map.team_ct, cur.map.team_t]) {
      if (team.score === needed - 1) add('matchPoint', team.side);
    }
  }
  if (roundPhase === 'live' && prevRoundPhase === 'freezetime') add('roundLive');
  if (roundPhase === 'over' && prevRoundPhase !== 'over') add('roundEnd', cur.round?.win_team ?? null);

  const bomb = cur.round?.bomb;
  if (bomb && bomb !== prev.round?.bomb) {
    if (bomb === 'planted') add('bombPlanted', 'T');
    if (bomb === 'defused') add('bombDefused', 'CT');
    if (bomb === 'exploded') add('bombExploded', 'T');
  }

  for (const player of cur.players) {
    const before = prev.players.find((p) => p.steamid === player.steamid);
    if (player.state.round_kills >= 5 && (before?.state.round_kills ?? 0) < 5) add('ace', player.team.side);
  }

  const phase = cur.phase_countdowns.phase;
  if (phase !== prev.phase_countdowns.phase) {
    if (phase === 'timeout_ct') add('timeout', 'CT');
    if (phase === 'timeout_t') add('timeout', 'T');
    if (phase === 'paused') add('pause');
  }
  if (cur.map.phase === 'intermission' && prev.map.phase !== 'intermission') add('halftime');
  if (cur.map.phase === 'gameover' && prev.map.phase !== 'gameover') add('matchEnd');
  return events;
}

/**
 * Runs the signal rules from the settings for detected game events: HTTP
 * requests (Companion buttons, webhooks), TacAM actions or OBS requests.
 */
export class SignalEngine {
  private log: SignalLogEntry[] = [];

  constructor(
    private store: Store,
    private actions: TriggerAction[],
    private obs: ObsBridge,
    /** Display slot (left/right) of a side right now, honoring flip and swap. */
    private slotOf: (side: Side) => 'left' | 'right' | null
  ) {}

  recent() {
    return this.log;
  }

  handle(events: GameEvent[]) {
    if (!events.length) return;
    for (const rule of this.store.doc('settings').signals) {
      if (!rule.enabled) continue;
      for (const event of events) {
        if (event.type !== rule.event || !this.matches(rule, event)) continue;
        const fire = () => void this.fire(rule, event.type);
        if (rule.delay > 0) setTimeout(fire, rule.delay * 1000).unref();
        else fire();
      }
    }
  }

  private matches(rule: SignalRule, event: GameEvent) {
    if (!rule.filter) return true;
    if (!event.side) return false;
    if (rule.filter === 'CT' || rule.filter === 'T') return event.side === rule.filter;
    return this.slotOf(event.side) === rule.filter;
  }

  /** Runs one rule's output; also used by the "Test" button. */
  async fire(rule: SignalRule, event: SignalEvent = rule.event) {
    let ok = true;
    let message = '';
    try {
      message = await this.run(rule);
    } catch (error) {
      ok = false;
      message = (error as Error).message;
    }
    this.log = [{ at: Date.now(), ruleId: rule.id, event, ok, message }, ...this.log].slice(0, 30);
    return { ok, message };
  }

  private async run(rule: SignalRule): Promise<string> {
    const output = rule.output;
    switch (output.kind) {
      case 'http': {
        const res = await fetch(output.url, { method: output.method, signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`${output.method} ${output.url} → HTTP ${res.status}`);
        return `${output.method} ${output.url} → ${res.status}`;
      }
      case 'action': {
        const action = this.actions.find((a) => a.id === output.action);
        if (!action) throw new Error(`Unknown action: ${output.action}`);
        action.run();
        return action.label;
      }
      case 'obsScene':
        if (!this.obs.status().connected) throw new Error('OBS is not connected');
        await this.obs.setProgramScene(output.scene);
        return `OBS scene: ${output.scene}`;
      case 'obsReplay':
        if (!this.obs.status().connected) throw new Error('OBS is not connected');
        await this.obs.call('SaveReplayBuffer');
        return 'OBS replay buffer saved';
    }
  }
}
