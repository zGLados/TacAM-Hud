import fs from 'node:fs';
import path from 'node:path';
import express, { type Router } from 'express';
import type { Socket } from 'socket.io';
import { RADAR_CALIBRATION, type HudAction } from '@tacam/shared';
import type { HudServer } from './io.js';
import type { LiveHub } from './live.js';
import type { Store } from './store.js';

/**
 * Compatibility layer for imported HUDs built on the LHM template
 * (lexogrine/cs2-react-hud, also used by JTs-Hud): the REST paths and
 * Socket.io events those HUDs expect. Our own HUD keeps its own events in the
 * `hud` room; imported HUDs register into the `lhm` room.
 */

export const LHM_ROOM = 'lhm';
const room = (dir: string) => `lhm:${dir}`;

/** LHM events are not part of our typed event map (different payloads, e.g. raw `update`). */
type Untyped = { emit: (event: string, ...args: unknown[]) => unknown };
const to = (io: HudServer, target: string) => io.to(target) as unknown as Untyped;

const withLhmIds = <T extends { id: string }>(entity: T) => ({ ...entity, _id: entity.id });

/** Our HUD actions under the names the LHM template listens to (keybindAction). */
const LHM_ACTIONS: Partial<Record<HudAction['type'], string>> = {
  radarBigger: 'radarBigger',
  radarSmaller: 'radarSmaller',
  toggleRadarView: 'toggleRadarView',
};

export function emitHudAction(io: HudServer, type: HudAction['type']) {
  io.emit('action', { type });
  const lhm = LHM_ACTIONS[type];
  if (lhm) to(io, LHM_ROOM).emit('keybindAction', lhm);
}

export function emitRefresh(io: HudServer) {
  io.emit('refresh');
  to(io, LHM_ROOM).emit('refreshHUD');
}

/** Radar image of the built TacAM HUD (Vite names it e.g. assets/mirage-AbC123.png). */
function radarImage(hudDir: string | undefined, map: string) {
  if (!hudDir) return null;
  const assets = path.join(hudDir, 'assets');
  if (!fs.existsSync(assets)) return null;
  const short = map.replace(/^de_/, '');
  const file = fs.readdirSync(assets).find((f) => f.startsWith(`${short}-`) && f.endsWith('.png'));
  return file ? path.join(assets, file) : null;
}

export function lhmRoutes(store: Store, live: LiveHub, uploadsDir: string, hudDir: string | undefined): Router {
  const api = express.Router();
  const uploadPath = (file: string | null | undefined) => (file ? path.join(uploadsDir, path.basename(file)) : null);

  api.get('/teams', (_req, res) => res.json(store.list('teams').map(withLhmIds)));
  api.get('/players', (req, res) => {
    const filter = typeof req.query.steamids === 'string' ? new Set(req.query.steamids.split(';')) : null;
    const players = store.list('players').filter((p) => !filter || filter.has(p.steamid));
    // LHM names the team field `team`; avatars are resolved via /players/avatar/steamid.
    res.json(players.map((p) => ({ ...withLhmIds(p), team: p.teamId ?? '', avatar: p.avatar ? `/uploads/${encodeURIComponent(p.avatar)}` : '' })));
  });
  api.get('/players/avatar/steamid/:steamid', (req, res) => {
    const profile = store.list('players').find((p) => p.steamid === req.params.steamid);
    res.json({ custom: profile?.avatar ? `/uploads/${encodeURIComponent(profile.avatar)}` : '', steam: '' });
  });
  api.get('/teams/logo/direct/:file', (req, res) => {
    const file = uploadPath(req.params.file);
    if (!file || !fs.existsSync(file)) return res.status(404).end();
    res.sendFile(file);
  });
  api.get('/teams/logo/:id', (req, res) => {
    const file = uploadPath(store.get('teams', req.params.id)?.logo);
    if (!file || !fs.existsSync(file)) return res.status(404).end();
    res.sendFile(file);
  });
  api.get('/teams/:id', (req, res, next) => {
    const team = store.get('teams', req.params.id);
    if (!team) return next();
    res.json(withLhmIds(team));
  });
  api.get('/match', (_req, res) => res.json(store.list('matches')));
  api.get('/match/current', (_req, res) => res.json(live.currentMatch()));
  api.get('/tournament', (_req, res) => res.json({ tournament: null }));
  api.get('/camera', (_req, res) => res.json({ availablePlayers: [], uuid: '' }));

  api.get('/game-maps/cs2', (_req, res) =>
    res.json(
      Object.entries(RADAR_CALIBRATION).map(([name, layers]) => ({
        _id: name,
        name: name.replace(/^de_/, ''),
        lhmId: name,
        game: 'cs2',
        inVetoPool: true,
        isActive: true,
        radars: layers.map((l, i) => ({
          id: i,
          lhmId: layers.length === 1 ? 'default' : l.id,
          originX: l.originX,
          originY: l.originY,
          pxPerUX: l.pxPerUX,
          pxPerUY: l.pxPerUY,
          radar: 'radar',
          // LHM: visible when visibleUnderHeight < z < visibleOverHeight
          visibleUnderHeight: l.minHeight ?? null,
          visibleOverHeight: l.maxHeight ?? null,
        })),
      }))
    )
  );
  api.get('/game-maps/cs2/image/:map/radar', (req, res) => {
    const file = radarImage(hudDir, req.params.map);
    if (!file) return res.status(404).end();
    res.sendFile(file);
  });
  return api;
}

/** Socket handshake of LHM-template HUDs: started → readyToRegister → register(name). */
export function attachLhmSocket(socket: Socket, live: LiveHub, panelConfig: (dir: string) => unknown) {
  socket.on('started', () => socket.emit('readyToRegister'));
  socket.on('register', (name: unknown) => {
    socket.join(LHM_ROOM);
    if (typeof name === 'string') {
      socket.join(room(name));
      socket.emit('hud_config', panelConfig(name));
    }
    if (live.lastRaw) socket.emit('update', live.lastRaw);
  });
}

/** Sends the raw GSI payload to imported HUDs (they digest it with csgogsi themselves). */
export function emitLhmUpdate(io: HudServer, raw: unknown) {
  to(io, LHM_ROOM).emit('update', raw);
}

export function emitHudConfig(io: HudServer, dir: string, config: unknown) {
  to(io, room(dir)).emit('hud_config', config);
}

export function emitHudPanelAction(io: HudServer, dir: string, action: string, data?: unknown) {
  to(io, room(dir)).emit('hud_action', { action, data });
}

export function emitKeybindAction(io: HudServer, dir: string, action: string) {
  to(io, room(dir)).emit('keybindAction', action);
}

/** One input of an LHM panel.json section. */
export interface PanelInput {
  type: 'text' | 'checkbox' | 'select' | 'image' | 'team' | 'match' | 'player' | 'action' | string;
  name: string;
  label?: string;
  values?: { name: string; label: string }[];
}
export interface PanelSection {
  name: string;
  label?: string;
  inputs: PanelInput[];
}

/**
 * `hud_config` payload for an imported HUD: the stored panel values, with
 * team/match/player ids expanded to the objects the LHM template expects.
 * Images stay file names; the HUD loads them via /api/huds/<dir>/<section>/<input>.
 */
export function buildHudConfig(store: Store, panel: PanelSection[] | null, values: Record<string, unknown>) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const section of panel ?? []) {
    const stored = (values[section.name] ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const input of section.inputs) {
      const value = stored[input.name];
      if (value === undefined || value === null || value === '' || input.type === 'action') continue;
      if (input.type === 'match') {
        const match = store.get('matches', String(value));
        if (match) data[input.name] = { type: 'match', id: match.id, match };
      } else if (input.type === 'team') {
        const team = store.get('teams', String(value));
        if (team) data[input.name] = { type: 'team', id: team.id, team: withLhmIds(team) };
      } else if (input.type === 'player') {
        const p = store.list('players').find((x) => x.steamid === value || x.id === value);
        if (p) data[input.name] = { type: 'player', id: p.id, player: { ...withLhmIds(p), team: p.teamId ?? '', avatar: p.avatar ? `/uploads/${encodeURIComponent(p.avatar)}` : '' } };
      } else {
        data[input.name] = value;
      }
    }
    out[section.name] = data;
  }
  return out;
}
