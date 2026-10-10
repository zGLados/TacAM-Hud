import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Router } from 'express';
import { z } from 'zod';
import {
  ACTIVE_MAP_POOL,
  VETO_ORDER,
  captainSteps,
  pickerSide,
  remainingMaps,
  vetoMapsNeeded,
  type CaptainVeto,
  type Match,
  type Veto,
  type VetoSlot,
} from '@tacam/shared';
import type { Store } from './store.js';

/**
 * Map veto done by the team captains on their own devices (or both on one
 * device). Each link carries a secret token, so captains need no PIN; every
 * step is written into `match.vetos`, which updates the veto scene live.
 */

const newToken = () => randomBytes(16).toString('hex');

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** Finds the match and the role (team slot or both) a token belongs to. */
function findSession(store: Store, token: string): { match: Match; role: VetoSlot | 'both' } | null {
  for (const match of store.list('matches')) {
    const tokens = match.captainVeto?.tokens;
    if (!tokens) continue;
    for (const role of ['left', 'right', 'both'] as const) {
      if (safeEqual(token, tokens[role])) return { match, role };
    }
  }
  return null;
}

const emptyVeto = (patch: Partial<Veto>): Veto => ({
  type: 'ban',
  mapName: '',
  teamId: null,
  side: 'NO',
  reverseSide: false,
  score: {},
  winner: null,
  mapEnd: false,
  ...patch,
});

/** Public state for a captain page. */
function sessionState(store: Store, match: Match, role: VetoSlot | 'both') {
  const session = match.captainVeto!;
  const steps = captainSteps(match.matchType, session.first, session.sideChoice, match.vetos);
  const team = (slot: VetoSlot) => {
    const profile = match[slot].id ? store.get('teams', match[slot].id!) : undefined;
    return { name: profile?.name ?? (slot === 'left' ? 'Team A' : 'Team B'), logo: profile?.logo ? `/uploads/${encodeURIComponent(profile.logo)}` : null };
  };
  return {
    role,
    matchType: match.matchType,
    title: match.title,
    teams: { left: team('left'), right: team('right') },
    pool: session.pool,
    remaining: remainingMaps(session.pool, match.vetos),
    vetos: match.vetos.map((v) => ({
      type: v.type,
      mapName: v.mapName,
      team: v.teamId === match.left.id ? 'left' : v.teamId === match.right.id ? 'right' : null,
      side: v.side,
    })),
    step: steps[session.step] ?? null,
    stepIndex: session.step,
    stepCount: steps.length,
    done: session.step >= steps.length,
  };
}

const startSchema = z.object({
  first: z.enum(['left', 'right']),
  sideChoice: z.boolean(),
  pool: z.array(z.string().min(1)).optional(),
});

const actionSchema = z.union([
  z.object({ action: z.enum(['ban', 'pick']), map: z.string().min(1) }),
  z.object({ action: z.literal('side'), side: z.enum(['CT', 'T']) }),
]);

export function captainVetoRoutes(api: Router, store: Store) {
  // --- producer (normal auth) --------------------------------------------

  api.post('/matches/:id/captain-veto', (req, res) => {
    const match = store.get('matches', req.params.id);
    if (!match) return res.status(404).json({ error: 'not found' });
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    const { first, sideChoice } = parsed.data;
    const pool = [...new Set(parsed.data.pool ?? ACTIVE_MAP_POOL)];
    const needed = vetoMapsNeeded(match.matchType);
    const hasDecider = VETO_ORDER[match.matchType].includes('decider');
    // With a decider the pool must come out even, otherwise "the map left over" is ambiguous.
    if (hasDecider ? pool.length !== needed : pool.length < needed) {
      return res.status(400).json({ error: `A ${match.matchType.toUpperCase()} veto needs ${hasDecider ? 'exactly' : 'at least'} ${needed} maps` });
    }
    if (!match.left.id || !match.right.id) return res.status(400).json({ error: 'Both teams must be set' });
    const captainVeto: CaptainVeto = { tokens: { left: newToken(), right: newToken(), both: newToken() }, first, sideChoice, pool, step: 0 };
    res.json(store.update('matches', match.id, { captainVeto, vetos: [] }));
  });

  api.delete('/matches/:id/captain-veto', (req, res) => {
    const match = store.get('matches', req.params.id);
    if (!match) return res.status(404).json({ error: 'not found' });
    // Ends the session; the vetos made so far stay.
    res.json(store.update('matches', match.id, { captainVeto: null }));
  });

  // --- captains (token in the URL, no PIN) --------------------------------

  api.get('/captain/:token', (req, res) => {
    const found = findSession(store, req.params.token);
    if (!found) return res.status(404).json({ error: 'This veto link is no longer valid' });
    res.json(sessionState(store, found.match, found.role));
  });

  api.post('/captain/:token', (req, res) => {
    const found = findSession(store, req.params.token);
    if (!found) return res.status(404).json({ error: 'This veto link is no longer valid' });
    const { match, role } = found;
    const session = match.captainVeto!;
    const steps = captainSteps(match.matchType, session.first, session.sideChoice, match.vetos);
    const step = steps[session.step];
    if (!step) return res.status(409).json({ error: 'The veto is finished' });
    if (role !== 'both' && role !== step.team) return res.status(409).json({ error: 'It is not your turn' });
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.action !== step.kind) return res.status(400).json({ error: `Expected: ${step.kind}` });

    const teamId = match[step.team].id;
    let vetos = [...match.vetos];
    if (parsed.data.action === 'side') {
      // The choosing team starts on the chosen side; Veto.side stores the picking team's side.
      const chosen = parsed.data.side;
      const index = vetos.map((v) => v.type).lastIndexOf('pick');
      vetos[index] = { ...vetos[index], side: pickerSide(chosen) };
    } else {
      const map = parsed.data.map;
      if (!remainingMaps(session.pool, vetos).includes(map)) return res.status(400).json({ error: 'Map not available' });
      vetos.push(emptyVeto({ type: parsed.data.action, mapName: map, teamId }));
    }

    const next = session.step + 1;
    if (next >= steps.length && VETO_ORDER[match.matchType].includes('decider')) {
      const [decider] = remainingMaps(session.pool, vetos);
      if (decider) vetos = [...vetos, emptyVeto({ type: 'decider', mapName: decider })];
    }
    const updated = store.update('matches', match.id, { vetos, captainVeto: { ...session, step: next } })!;
    res.json(sessionState(store, updated, role));
  });
}
