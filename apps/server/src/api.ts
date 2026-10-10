import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HUD_OVERLAYS, SCENE_IDS, SIGNAL_EVENTS, THEME_COLOR_KEYS, type HudBootstrap } from '@tacam/shared';
import type { Store } from './store.js';
import type { LiveHub } from './live.js';
import type { HudServer } from './io.js';
import { DemoMatch, seedDemoData } from './demo.js';
import { findCs2CfgDir, gsiConfig, gsiConfigInstalled, installGsiConfig } from './gsiInstall.js';
import { loginHandler, statusHandler } from './auth.js';
import { isAccelerator, triggerStatus, TriggerError, validActionKey, type TriggerAction } from './actions.js';
import { captainVetoRoutes } from './captainVeto.js';
import { matchzyConfig } from './matchzy.js';
import { buildHudConfig, emitHudAction, emitHudConfig, emitHudPanelAction, emitKeybindAction, emitRefresh, type PanelSection } from './lhm.js';
import { getHud, hudFile, HudImportError, importHudZip, listHuds, removeHud } from './huds.js';
import type { ObsBridge } from './obs.js';
import type { SignalEngine } from './signals.js';

const str = z.string().trim();
const nullableStr = z.string().trim().nullable();

const playerSchema = z.object({
  steamid: str.regex(/^\d{17}$/, 'SteamID64 must have 17 digits'),
  username: str.min(1),
  firstName: str.default(''),
  lastName: str.default(''),
  country: nullableStr.default(null),
  avatar: nullableStr.default(null),
  teamId: nullableStr.default(null),
  isCoach: z.boolean().default(false),
  extra: z.record(z.string()).default({}),
});

const teamSchema = z.object({
  name: str.min(1),
  shortName: str.default(''),
  country: nullableStr.default(null),
  logo: nullableStr.default(null),
  extra: z.record(z.string()).default({}),
});

const side = z.enum(['CT', 'T']);
const vetoSchema = z.object({
  type: z.enum(['ban', 'pick', 'decider']),
  mapName: str.min(1),
  teamId: nullableStr.default(null),
  side: z.union([side, z.literal('NO')]).default('NO'),
  reverseSide: z.boolean().default(false),
  score: z.record(z.number().int().min(0)).default({}),
  winner: nullableStr.default(null),
  mapEnd: z.boolean().default(false),
});

const matchSchema = z.object({
  left: z.object({ id: nullableStr, wins: z.number().int().min(0).default(0) }),
  right: z.object({ id: nullableStr, wins: z.number().int().min(0).default(0) }),
  matchType: z.enum(['bo1', 'bo2', 'bo3', 'bo5']),
  current: z.boolean().default(false),
  vetos: z.array(vetoSchema).default([]),
  title: str.default(''),
  startTime: nullableStr.default(null),
  roundsPerHalf: z.number().int().min(1).max(30).nullable().default(null),
});

const sideBox = z.object({ title: z.string(), subtitle: z.string(), image: nullableStr });
const hudConfigSchema = z.object({
  trivia: z.object({ title: z.string(), content: z.string(), visible: z.boolean() }),
  sideBoxes: z.object({ left: sideBox, right: sideBox, hidden: z.boolean() }),
  playerPreview: z.object({ steamid: nullableStr, visible: z.boolean() }),
  matchPreview: z.object({ matchId: nullableStr, visible: z.boolean() }),
  swapTeams: z.boolean(),
  keepTeamSides: z.boolean(),
  overlay: z.enum(HUD_OVERLAYS),
  comparison: z.object({ left: nullableStr, right: nullableStr }),
  radar: z.object({ size: z.number().min(150).max(900), enlarged: z.boolean() }),
  visibility: z.object({
    hud: z.boolean(),
    radar: z.boolean(),
    killfeed: z.boolean(),
    roundHistory: z.boolean(),
    economy: z.boolean(),
    sponsors: z.boolean(),
    prediction: z.boolean(),
  }),
  replaceAvatars: z.enum(['never', 'if_missing', 'always']),
  playerToWatch: z.string().regex(/^\d{17}$/).nullable(),
});

// Colors end up in CSS custom properties: allow only color syntax, nothing that could break out.
const cssColor = z.string().regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/, 'Invalid color');
const themeSchema = z.object({
  colors: z.object(Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, cssColor])) as Record<(typeof THEME_COLOR_KEYS)[number], typeof cssColor>),
  borderRadius: z.number().min(0).max(30),
  fontFamily: z.string().regex(/^[\w\s-]{1,40}$/),
  sponsors: z.array(z.object({ id: z.string(), file: z.string(), label: z.string() })),
  sponsorInterval: z.number().min(2).max(120),
  showSponsors: z.boolean(),
  brandLogo: nullableStr,
  showBrandLogo: z.boolean(),
  brandLogoGrayscale: z.boolean(),
  tournamentName: z.string().max(80),
  tournamentLogo: nullableStr,
  backgroundVideos: z.array(z.object({ id: z.string(), file: z.string(), label: z.string() })),
});

const sceneSchema = z.object({
  active: z.enum(SCENE_IDS),
  auto: z.boolean(),
  message: z.string().max(200),
  countdownTo: z.number().nullable(),
});

const settingsSchema = z.object({
  steamPath: nullableStr,
  lanAccess: z.boolean(),
  accessPin: z.string().regex(/^(\d{4,12})?$/, 'PIN must have 4–12 digits'),
  telnet: z.object({ host: str.min(1), port: z.number().int().min(1).max(65535) }),
});

const hudActionSchema = z.object({
  type: z.enum(['radarBigger', 'radarSmaller', 'toggleRadarView', 'toggleHud']),
});

type Handler = (req: Request, res: Response) => unknown;
/** Wraps handlers so zod/other errors become proper 400/500 responses. */
const h = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') });
    } else next(error);
  }
};

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

export interface ApiOptions {
  store: Store;
  live: LiveHub;
  io: HudServer;
  actions: TriggerAction[];
  obs: ObsBridge;
  signals: SignalEngine;
  uploadsDir: string;
  gsiPort: number;
  demo: DemoMatch;
}

export function createApi({ store, live, io, actions, obs, signals, uploadsDir, gsiPort, demo }: ApiOptions) {
  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));

  api.post('/auth/login', loginHandler(store));
  api.get('/auth/status', statusHandler(store));

  api.get(
    '/bootstrap',
    h((_req, res) => {
      const data: HudBootstrap = {
        config: store.doc('hudConfig'),
        theme: store.doc('theme'),
        scene: store.doc('scene'),
        match: live.currentMatch(),
        teams: store.list('teams'),
        players: live.playerExtensions(),
        stats: live.tracker.snapshot(),
        killfeed: live.killfeed,
      };
      res.json(data);
    })
  );

  // --- players / teams ---------------------------------------------------

  for (const [name, schema] of [
    ['players', playerSchema],
    ['teams', teamSchema],
  ] as const) {
    api.get(`/${name}`, (_req, res) => res.json(store.list(name)));
    api.post(
      `/${name}`,
      h((req, res) => {
        const body = schema.parse(req.body);
        if (name === 'players' && store.list('players').some((p) => p.steamid === (body as z.infer<typeof playerSchema>).steamid)) {
          return res.status(409).json({ error: 'A player with this SteamID already exists' });
        }
        res.status(201).json(store.insert(name, body as never));
      })
    );
    api.put(
      `/${name}/:id`,
      h((req, res) => {
        const updated = store.update(name, req.params.id, schema.parse(req.body) as never);
        if (!updated) return res.status(404).json({ error: 'not found' });
        res.json(updated);
      })
    );
    api.delete(`/${name}/:id`, (req, res) => {
      if (name === 'teams') {
        for (const p of store.list('players').filter((p) => p.teamId === req.params.id)) {
          store.update('players', p.id, { teamId: null });
        }
      }
      res.status(store.remove(name, req.params.id) ? 204 : 404).end();
    });
  }

  api.post(
    '/players/import',
    h((req, res) => {
      const rows = z.array(playerSchema).parse(req.body);
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = store.list('players').find((p) => p.steamid === row.steamid);
        if (existing) {
          store.update('players', existing.id, row);
          updated++;
        } else {
          store.insert('players', row);
          created++;
        }
      }
      res.json({ created, updated });
    })
  );

  api.post(
    '/teams/import',
    h((req, res) => {
      // Teams are matched by name; logos are kept (a CSV cannot carry them).
      const rows = z.array(teamSchema.pick({ name: true, shortName: true, country: true })).max(500).parse(req.body);
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = store.list('teams').find((t) => t.name.toLowerCase() === row.name.toLowerCase());
        if (existing) {
          store.update('teams', existing.id, { shortName: row.shortName || existing.shortName, country: row.country ?? existing.country });
          updated++;
        } else {
          store.insert('teams', { ...row, logo: null, extra: {} });
          created++;
        }
      }
      res.json({ created, updated });
    })
  );

  /**
   * Live tab "Quick setup": assigns a team (existing or new) to each side of the
   * running game, creates the unknown players and optionally sets the match.
   */
  const teamChoice = z.union([z.object({ teamId: str.min(1) }), z.object({ name: str.min(1), shortName: str.default('') })]);
  api.post(
    '/live/quick-setup',
    h((req, res) => {
      const body = z.object({ left: teamChoice, right: teamChoice, reassign: z.boolean(), setMatch: z.boolean() }).parse(req.body);
      const summary = live.summary();
      if (!summary) return res.status(409).json({ error: 'No game data yet' });
      // Validate everything before creating anything, so a bad request leaves no half-created team.
      const byName = (name: string) => store.list('teams').find((t) => t.name.toLowerCase() === name.toLowerCase());
      const key = (choice: z.infer<typeof teamChoice>) => ('teamId' in choice ? choice.teamId : byName(choice.name)?.id ?? `new:${choice.name.toLowerCase()}`);
      for (const choice of [body.left, body.right]) {
        if ('teamId' in choice && !store.get('teams', choice.teamId)) return res.status(400).json({ error: 'Team not found' });
      }
      if (key(body.left) === key(body.right)) return res.status(400).json({ error: 'Both sides have the same team' });
      const resolve = (choice: z.infer<typeof teamChoice>) =>
        'teamId' in choice
          ? choice.teamId
          : (byName(choice.name)?.id ?? store.insert('teams', { name: choice.name, shortName: choice.shortName, country: null, logo: null, extra: {} }).id);
      const teamIds = { left: resolve(body.left), right: resolve(body.right) };

      let created = 0;
      let updated = 0;
      for (const slot of ['left', 'right'] as const) {
        const side = summary[slot].side;
        for (const player of summary.players.filter((p) => p.side === side)) {
          const profile = store.list('players').find((p) => p.steamid === player.steamid);
          if (!profile) {
            store.insert('players', {
              steamid: player.steamid,
              username: player.name,
              firstName: '',
              lastName: '',
              country: null,
              avatar: null,
              teamId: teamIds[slot],
              isCoach: false,
              extra: {},
            });
            created++;
          } else if (body.reassign && profile.teamId !== teamIds[slot]) {
            store.update('players', profile.id, { teamId: teamIds[slot] });
            updated++;
          }
        }
      }
      if (body.setMatch) {
        const current = live.currentMatch();
        if (current) {
          store.update('matches', current.id, { left: { ...current.left, id: teamIds.left }, right: { ...current.right, id: teamIds.right } });
        } else {
          const match = store.insert('matches', {
            left: { id: teamIds.left, wins: 0 },
            right: { id: teamIds.right, wins: 0 },
            matchType: 'bo1',
            current: false,
            vetos: [],
            title: '',
            startTime: null,
            roundsPerHalf: null,
            captainVeto: null,
          });
          setCurrent(match.id);
        }
      }
      res.json({ created, updated, teams: teamIds });
    })
  );

  // --- matches -----------------------------------------------------------

  const setCurrent = (id: string | null) => {
    store.replaceAll(
      'matches',
      store.list('matches').map((m) => ({ ...m, current: m.id === id }))
    );
  };

  api.get('/matches', (_req, res) => res.json(store.list('matches')));
  api.get('/matches/current', (_req, res) => res.json(live.currentMatch()));
  api.post(
    '/matches',
    h((req, res) => {
      const body = matchSchema.parse(req.body);
      const created = store.insert('matches', { ...body, captainVeto: null });
      if (body.current) setCurrent(created.id);
      res.status(201).json(created);
    })
  );
  api.put(
    '/matches/:id',
    h((req, res) => {
      const body = matchSchema.parse(req.body);
      const updated = store.update('matches', req.params.id, body);
      if (!updated) return res.status(404).json({ error: 'not found' });
      if (body.current) setCurrent(updated.id);
      res.json(store.get('matches', updated.id));
    })
  );
  api.post('/matches/:id/current', (req, res) => {
    const match = store.get('matches', req.params.id);
    if (!match) return res.status(404).json({ error: 'not found' });
    setCurrent(match.current ? null : match.id);
    res.json(store.get('matches', match.id));
  });
  api.post('/matches/:id/reverse-current-map', (req, res) => {
    const match = store.get('matches', req.params.id);
    const mapName = live.last?.map.name;
    if (!match || !mapName) return res.status(404).json({ error: 'No running match/map' });
    const vetos = match.vetos.map((v) => (mapName.endsWith(v.mapName) ? { ...v, reverseSide: !v.reverseSide } : v));
    res.json(store.update('matches', match.id, { vetos }));
  });
  api.get('/matches/:id/matchzy.json', (req, res) => {
    const match = store.get('matches', req.params.id);
    if (!match) return res.status(404).json({ error: 'not found' });
    res.attachment(`matchzy-${match.id.slice(0, 8)}.json`).json(matchzyConfig(store, match));
  });
  api.delete('/matches/:id', (req, res) => res.status(store.remove('matches', req.params.id) ? 204 : 404).end());

  // --- uploads -----------------------------------------------------------

  /** Disk upload limited to the given MIME types and size; errors become a 400 with `message`. */
  const uploader = (types: Record<string, string>, maxBytes: number, message: string) => {
    const handle = multer({
      storage: multer.diskStorage({
        destination: uploadsDir,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${types[file.mimetype] ?? ''}`),
      }),
      limits: { fileSize: maxBytes },
      fileFilter: (_req, file, cb) => cb(null, file.mimetype in types),
    }).single('file');
    return (req: Request, res: Response) =>
      handle(req, res, (error: unknown) => {
        if (error || !req.file) return res.status(400).json({ error: message });
        res.status(201).json({ file: req.file.filename, url: `/uploads/${req.file.filename}` });
      });
  };
  api.post('/uploads', uploader(IMAGE_TYPES, 8 * 1024 * 1024, 'Images only (png, jpg, webp, gif, svg), up to 8 MB'));
  // Background videos for scenes; large on purpose, they are only read locally by the HUD.
  api.post('/uploads/video', uploader(VIDEO_TYPES, 500 * 1024 * 1024, 'Videos only (mp4, webm), up to 500 MB'));
  api.delete('/uploads/:file', (req, res) => {
    const file = path.join(uploadsDir, path.basename(req.params.file));
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.status(204).end();
  });

  // --- HUD config / theme / scene ----------------------------------------

  api.get('/hud/config', (_req, res) => res.json(store.doc('hudConfig')));
  api.put(
    '/hud/config',
    h((req, res) => res.json(store.setDoc('hudConfig', hudConfigSchema.parse(req.body))))
  );
  api.post(
    '/hud/action',
    h((req, res) => {
      const action = hudActionSchema.parse(req.body);
      emitHudAction(io, action.type);
      res.json({ ok: true });
    })
  );
  api.post('/hud/refresh', (_req, res) => {
    emitRefresh(io);
    res.json({ ok: true });
  });

  captainVetoRoutes(api, store);

  // --- imported HUDs (LHM / JTs-Hud format) -------------------------------

  api.get('/huds', (_req, res) => res.json(listHuds(store.dataDir)));
  api.post('/huds/import', express.raw({ type: () => true, limit: '200mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file received' });
    try {
      res.status(201).json(importHudZip(store.dataDir, new Uint8Array(req.body)));
    } catch (error) {
      if (error instanceof HudImportError) return res.status(400).json({ error: error.message });
      throw error;
    }
  });
  const panelOf = (dir: string) => hudFile<PanelSection[]>(store.dataDir, dir, 'panel.json');
  api.get('/huds/:dir/panel', (req, res) => {
    if (!getHud(store.dataDir, req.params.dir)) return res.status(404).json({ error: 'not found' });
    res.json({
      panel: panelOf(req.params.dir) ?? [],
      keybinds: hudFile(store.dataDir, req.params.dir, 'keybinds.json') ?? [],
      values: store.doc('settings').hudPanels[req.params.dir] ?? {},
    });
  });
  api.put(
    '/huds/:dir/panel',
    h((req, res) => {
      const dir = req.params.dir;
      if (!getHud(store.dataDir, dir)) return res.status(404).json({ error: 'not found' });
      const values = z.record(z.record(z.union([z.string().max(2000), z.boolean(), z.number(), z.null()]))).parse(req.body);
      store.setDoc('settings', { ...store.doc('settings'), hudPanels: { ...store.doc('settings').hudPanels, [dir]: values } });
      emitHudConfig(io, dir, buildHudConfig(store, panelOf(dir), values));
      res.json(values);
    })
  );
  api.post(
    '/huds/:dir/action',
    h((req, res) => {
      if (!getHud(store.dataDir, req.params.dir)) return res.status(404).json({ error: 'not found' });
      const { action, data } = z.object({ action: z.string().min(1).max(100), data: z.string().max(200).optional() }).parse(req.body);
      emitHudPanelAction(io, req.params.dir, action, data);
      res.json({ ok: true });
    })
  );
  api.post(
    '/huds/:dir/keybind',
    h((req, res) => {
      if (!getHud(store.dataDir, req.params.dir)) return res.status(404).json({ error: 'not found' });
      const { action } = z.object({ action: z.string().min(1).max(100) }).parse(req.body);
      emitKeybindAction(io, req.params.dir, action);
      res.json({ ok: true });
    })
  );
  // Image inputs of a HUD panel, requested by the HUD itself (LHM path).
  api.get('/huds/:dir/:section/:input', (req, res) => {
    const values = (store.doc('settings').hudPanels[req.params.dir]?.[req.params.section] ?? {}) as Record<string, unknown>;
    const file = values[req.params.input];
    if (typeof file !== 'string' || !file) return res.status(404).end();
    const full = path.join(uploadsDir, path.basename(file));
    if (!fs.existsSync(full)) return res.status(404).end();
    res.sendFile(full);
  });
  api.delete('/huds/:dir', (req, res) => {
    if (!removeHud(store.dataDir, req.params.dir)) return res.status(404).json({ error: 'not found' });
    const { [req.params.dir]: _removed, ...rest } = store.doc('settings').hudPanels;
    store.setDoc('settings', { ...store.doc('settings'), hudPanels: rest });
    res.status(204).end();
  });

  // --- trigger URLs (Stream Deck / Companion) -----------------------------

  api.get('/actions', (_req, res) => res.json(actions.map(({ id, group, label, isActive }) => ({ id, group, label, hasState: !!isActive }))));
  // Button feedback for Companion: poll the whole state or one action ("1"/"0" as plain text with ?format=text).
  api.get('/trigger-status', (req, res) => {
    if (!validActionKey(store, req.query.key ?? req.headers['x-tacam-key'])) return res.status(403).json({ error: 'Invalid or missing key' });
    res.json(triggerStatus(store, actions));
  });
  api.get('/trigger-status/:id', (req, res) => {
    if (!validActionKey(store, req.query.key ?? req.headers['x-tacam-key'])) return res.status(403).json({ error: 'Invalid or missing key' });
    const action = actions.find((a) => a.id === req.params.id);
    if (!action?.isActive) return res.status(404).json({ error: `No state for action: ${req.params.id}` });
    const active = action.isActive();
    if (req.query.format === 'text') return res.type('text/plain').send(active ? '1' : '0');
    res.json({ id: action.id, active });
  });
  // GET as well: many button tools can only open a URL. The key is required even
  // for local requests, so a web page in the browser cannot trigger actions.
  api.all('/trigger/:id', (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
    if (!validActionKey(store, req.query.key ?? req.headers['x-tacam-key'])) {
      return res.status(403).json({ error: 'Invalid or missing key' });
    }
    const action = actions.find((a) => a.id === req.params.id);
    if (!action) return res.status(404).json({ error: `Unknown action: ${req.params.id}` });
    try {
      action.run();
    } catch (error) {
      const status = error instanceof TriggerError ? error.status : 500;
      return res.status(status).json({ error: (error as Error).message });
    }
    res.json({ ok: true, action: action.id });
  });

  api.get('/theme', (_req, res) => res.json(store.doc('theme')));
  api.put(
    '/theme',
    h((req, res) => res.json(store.setDoc('theme', themeSchema.parse(req.body))))
  );

  api.get('/scene', (_req, res) => res.json(store.doc('scene')));
  api.put(
    '/scene',
    h((req, res) => res.json(store.setDoc('scene', sceneSchema.parse(req.body))))
  );

  // --- live data / stats -------------------------------------------------

  api.get('/live', (_req, res) => res.json({ status: live.status, summary: live.summary() }));
  // Raw GSI payload of the last update, for debugging and recording test fixtures.
  api.get('/live/raw', (_req, res) => res.json(live.lastRaw));
  api.get('/stats', (_req, res) => res.json(live.tracker.snapshot()));
  api.post('/stats/reset', (_req, res) => {
    live.resetStats();
    res.json(live.tracker.snapshot());
  });
  api.get('/killfeed', (_req, res) => res.json(live.killfeed));

  // --- settings / GSI ----------------------------------------------------

  api.get('/settings', (_req, res) => {
    const settings = store.doc('settings');
    res.json({
      ...settings,
      gsiPort,
      cs2CfgDir: findCs2CfgDir(settings.steamPath),
      gsiInstalled: gsiConfigInstalled(settings.steamPath),
      // IPv4 addresses for "open on another device" links
      addresses: Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i!.address),
    });
  });
  api.put(
    '/settings',
    h((req, res) => {
      const body = settingsSchema.parse(req.body);
      if (body.lanAccess && !body.accessPin) {
        return res.status(400).json({ error: 'LAN access requires a PIN' });
      }
      res.json(store.setDoc('settings', { ...store.doc('settings'), ...body }));
    })
  );
  api.put(
    '/settings/keybinds',
    h((req, res) => {
      const ids = new Set(actions.map((a) => a.id));
      const keybinds = z
        .record(z.string().refine((id) => ids.has(id), 'Unknown action'), z.string().refine((v) => v === '' || isAccelerator(v), 'Invalid shortcut'))
        .parse(req.body);
      const used = new Map<string, string>();
      for (const [id, accelerator] of Object.entries(keybinds)) {
        if (!accelerator) continue;
        const key = accelerator.toLowerCase();
        if (used.has(key)) return res.status(400).json({ error: `${accelerator} is used twice` });
        used.set(key, id);
      }
      res.json(store.setDoc('settings', { ...store.doc('settings'), keybinds }).keybinds);
    })
  );
  api.get('/obs', (_req, res) => res.json(obs.status()));

  const signalRule = z.object({
    id: str.min(1).max(64),
    enabled: z.boolean(),
    event: z.enum(SIGNAL_EVENTS),
    filter: z.enum(['CT', 'T', 'left', 'right']).nullable(),
    output: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('http'), method: z.enum(['GET', 'POST']), url: z.string().url('Invalid URL').regex(/^https?:/, 'Only http(s) URLs') }),
      z.object({ kind: z.literal('action'), action: z.string().refine((id) => actions.some((a) => a.id === id), 'Unknown action') }),
      z.object({ kind: z.literal('obsScene'), scene: str.min(1) }),
      z.object({ kind: z.literal('obsReplay') }),
    ]),
    delay: z.number().min(0).max(60),
  });
  api.put(
    '/settings/signals',
    h((req, res) => res.json(store.setDoc('settings', { ...store.doc('settings'), signals: z.array(signalRule).max(100).parse(req.body) }).signals))
  );
  api.get('/signals/log', (_req, res) => res.json(signals.recent()));
  api.post(
    '/signals/test',
    h(async (req, res) => res.json(await signals.fire(signalRule.parse(req.body))))
  );
  api.put(
    '/settings/obs',
    h((req, res) => {
      const parsed = z
        .object({
          enabled: z.boolean(),
          url: z.string().regex(/^wss?:\/\/[^\s]+$/, 'URL must start with ws:// or wss://'),
          password: z.string().max(200),
          sceneMap: z.record(z.enum(SCENE_IDS), z.string().max(200)),
        })
        .parse(req.body);
      // Empty mappings are dropped instead of stored as "".
      const sceneMap = Object.fromEntries(Object.entries(parsed.sceneMap).filter(([, v]) => v));
      res.json(store.setDoc('settings', { ...store.doc('settings'), obs: { ...parsed, sceneMap } }).obs);
    })
  );
  api.post('/settings/action-key', (_req, res) => {
    // Invalidates all trigger URLs handed out so far.
    const settings = store.setDoc('settings', { ...store.doc('settings'), actionKey: randomUUID().replace(/-/g, '') });
    res.json({ actionKey: settings.actionKey });
  });
  api.post(
    '/settings/install-gsi',
    h((_req, res) => {
      const { steamPath, gsiToken } = store.doc('settings');
      try {
        res.json({ file: installGsiConfig(steamPath, gsiPort, gsiToken) });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    })
  );
  api.get('/settings/gsi-config', (_req, res) => {
    res.type('text/plain').attachment('gamestate_integration_tacam.cfg');
    res.send(gsiConfig(gsiPort, store.doc('settings').gsiToken));
  });

  // --- demo mode ---------------------------------------------------------

  api.get('/demo', (_req, res) => res.json({ running: demo.running }));
  api.post('/demo/start', (_req, res) => {
    demo.start();
    res.json({ running: true });
  });
  api.post('/demo/stop', (_req, res) => {
    demo.stop();
    res.json({ running: false });
  });
  api.post('/demo/seed', (_req, res) => res.json(seedDemoData(store)));

  api.use((_req, res) => res.status(404).json({ error: 'not found' }));
  return api;
}
