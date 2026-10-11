import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { normalizeMapName, TRANSFER_SECTIONS, type CameraPath, type CameraShot, type HudBootstrap } from '@tacam/shared';
import type { Store } from './store.js';
import type { LiveHub } from './live.js';
import type { HudServer } from './io.js';
import { DemoMatch, seedDemoData } from './demo.js';
import { findCs2CfgDir, gsiConfig, gsiConfigInstalled, installGsiConfig } from './gsiInstall.js';
import { loginHandler, statusHandler } from './auth.js';
import { triggerStatus, TriggerError, validActionKey, type TriggerAction } from './actions.js';
import { captainVetoRoutes } from './captainVeto.js';
import { diagnoseConsole, GameLaunchError, launchCs2, withNetconPort, type GameConsole } from './game.js';
import { HlaeError, installHlae, installedHlae, latestHlae } from './hlae.js';
import { CameraError, hlaeActive, pathViews, readView, type CameraControl } from './camera.js';
import { matchzyConfig } from './matchzy.js';
import { buildHudConfig, emitHudAction, emitHudConfig, emitHudPanelAction, emitKeybindAction, emitRefresh, type PanelSection } from './lhm.js';
import { getHud, hudFile, HudImportError, importHudZip, listHuds, removeHud } from './huds.js';
import type { ObsBridge } from './obs.js';
import type { SignalEngine } from './signals.js';
import { exportFileName, SettingsTransfer, TransferError } from './transfer.js';
import { commandText, hudConfigSchema, keybindsSchema, matchSchema, nullableStr, obsSchema, pathSchema, playerSchema, sceneSchema, signalRuleSchema, str, teamSchema, themeSchema } from './schemas.js';

const settingsSchema = z.object({
  steamPath: nullableStr,
  lanAccess: z.boolean(),
  accessPin: z.string().regex(/^(\d{4,12})?$/, 'PIN must have 4–12 digits'),
  telnet: z.object({ host: str.min(1), port: z.number().int().min(1).max(65535) }),
  launchOptions: z.string().max(500).regex(/^[^\r\n]*$/, 'Launch options must be one line'),
  launchMode: z.enum(['normal', 'tools', 'hlae']),
  hlaePath: z.string().max(500),
  launchBorderless: z.boolean(),
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
  gameConsole: GameConsole;
  cameraControl: CameraControl;
  uploadsDir: string;
  gsiPort: number;
  demo: DemoMatch;
}

export function createApi({ store, live, io, actions, obs, signals, gameConsole, cameraControl, uploadsDir, gsiPort, demo }: ApiOptions) {
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
        camera: cameraControl.state,
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

  // --- CS2: start with launch options, console over -netconport -----------

  api.post(
    '/game/launch',
    h(async (_req, res) => {
      const { steamPath, launchOptions, launchMode, hlaePath, launchBorderless, telnet } = store.doc('settings');
      try {
        const args = await launchCs2({ steamPath, options: withNetconPort(launchOptions, telnet.port), mode: launchMode, hlaePath, borderless: launchBorderless });
        res.json({ ok: true, args });
      } catch (error) {
        if (error instanceof GameLaunchError) return res.status(400).json({ error: error.message });
        throw error;
      }
    })
  );
  api.get('/game/console', async (req, res) => {
    // ?connect=1 tries to connect, so the status shows whether CS2 listens.
    if (req.query.connect) await gameConsole.send('echo TacAM HUD connected', 200).catch(() => {});
    res.json(gameConsole.status());
  });
  // --- camera (HLAE) -------------------------------------------------------

  const shots = () => store.doc('settings').cameraShots;
  const saveShots = (cameraShots: CameraShot[]) => store.setDoc('settings', { ...store.doc('settings'), cameraShots }).cameraShots;
  /** Turns console/camera failures into a 409 with a readable message. */
  const camera = (fn: Handler) =>
    h(async (req, res) => {
      try {
        await fn(req, res);
      } catch (error) {
        if (error instanceof CameraError || (error as Error).message?.includes('listens')) return res.status(409).json({ error: (error as Error).message });
        throw error;
      }
    });
  const cameraOptions = () => {
    const { freeCameraOnMapLoad, mapLoadCommands, menuCommands } = store.doc('settings');
    return { freeCameraOnMapLoad, mapLoadCommands, menuCommands };
  };
  api.get('/camera-control', (_req, res) => {
    const status = gameConsole.status();
    res.json({ connected: status.connected, error: status.error, map: live.last ? normalizeMapName(live.last.map.name) : null, shots: shots(), paths: store.doc('settings').cameraPaths, ...cameraOptions(), camera: cameraControl.state });
  });
  api.put(
    '/camera-control/options',
    h((req, res) => {
      const options = z.object({ freeCameraOnMapLoad: z.boolean(), mapLoadCommands: commandText, menuCommands: commandText }).partial().parse(req.body);
      const settings = store.setDoc('settings', { ...store.doc('settings'), ...options });
      res.json({ freeCameraOnMapLoad: settings.freeCameraOnMapLoad, mapLoadCommands: settings.mapLoadCommands, menuCommands: settings.menuCommands });
    })
  );
  api.post(
    '/camera-control/check',
    camera(async (_req, res) => res.json({ hlae: await hlaeActive(gameConsole) }))
  );
  api.post(
    '/camera-control/shots',
    camera(async (req, res) => {
      const { name, map } = z.object({ name: str.min(1).max(60), map: str.max(64).optional() }).parse(req.body);
      const view = await readView(gameConsole);
      const shot: CameraShot = { id: randomUUID(), name, map: map || (live.last ? normalizeMapName(live.last.map.name) : 'unknown'), ...view };
      saveShots([...shots(), shot]);
      res.status(201).json(shot);
    })
  );
  api.put(
    '/camera-control/shots',
    h((req, res) => {
      // Rename / reorder: only known ids, values stay as recorded.
      const body = z.array(z.object({ id: str, name: str.min(1).max(60) })).parse(req.body);
      const byId = new Map(shots().map((s) => [s.id, s]));
      res.json(saveShots(body.filter((s) => byId.has(s.id)).map((s) => ({ ...byId.get(s.id)!, name: s.name }))));
    })
  );
  api.delete('/camera-control/shots/:id', (req, res) => {
    saveShots(shots().filter((s) => s.id !== req.params.id));
    res.status(204).end();
  });
  api.post(
    '/camera-control/shots/:id/go',
    camera(async (req, res) => {
      const shot = shots().find((s) => s.id === req.params.id);
      if (!shot) return res.status(404).json({ error: 'not found' });
      await cameraControl.goTo(shot);
      res.json({ ok: true });
    })
  );
  api.post(
    '/camera-control/path',
    camera(async (req, res) => {
      const { shotIds, duration, hold } = z.object({ shotIds: z.array(str).min(2).max(20), duration: z.number().min(0.5).max(120), hold: z.boolean() }).parse(req.body);
      const views = shotIds.map((id) => shots().find((s) => s.id === id)).filter((s): s is CameraShot => !!s);
      if (views.length < 2) return res.status(400).json({ error: 'Select at least two views' });
      await cameraControl.playPath(views, duration, hold);
      res.json({ ok: true });
    })
  );
  const paths = () => store.doc('settings').cameraPaths;
  const savePaths = (cameraPaths: CameraPath[]) => store.setDoc('settings', { ...store.doc('settings'), cameraPaths }).cameraPaths;
  api.post(
    '/camera-control/paths',
    h((req, res) => {
      const body = pathSchema.parse(req.body);
      const first = shots().find((s) => s.id === body.shotIds[0]);
      if (!body.shotIds.every((id) => shots().some((s) => s.id === id))) return res.status(400).json({ error: 'Unknown view in the path' });
      const saved: CameraPath = { id: randomUUID(), map: first!.map, ...body };
      savePaths([...paths(), saved]);
      res.status(201).json(saved);
    })
  );
  api.put(
    '/camera-control/paths/:id',
    h((req, res) => {
      const patch = pathSchema.partial().parse(req.body);
      const existing = paths().find((p) => p.id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'not found' });
      const updated = { ...existing, ...patch };
      savePaths(paths().map((p) => (p.id === existing.id ? updated : p)));
      res.json(updated);
    })
  );
  api.delete('/camera-control/paths/:id', (req, res) => {
    savePaths(paths().filter((p) => p.id !== req.params.id));
    res.status(204).end();
  });
  api.post(
    '/camera-control/paths/:id/play',
    camera(async (req, res) => {
      const saved = paths().find((p) => p.id === req.params.id);
      if (!saved) return res.status(404).json({ error: 'not found' });
      await cameraControl.playPath(pathViews(saved, shots()), saved.duration, saved.hold);
      res.json({ ok: true });
    })
  );
  api.post(
    '/camera-control/spectate',
    camera(async (req, res) => {
      const { steamid } = z.object({ steamid: str.min(1) }).parse(req.body);
      const player = live.summary()?.players.find((p) => p.steamid === steamid);
      if (!player) return res.status(404).json({ error: 'Player not in the running game' });
      await cameraControl.spectate(player.name);
      res.json({ ok: true });
    })
  );
  api.post(
    '/camera-control/free',
    camera(async (_req, res) => {
      await cameraControl.free();
      res.json({ ok: true });
    })
  );
  api.post(
    '/camera-control/step',
    camera(async (req, res) => {
      const { direction } = z.object({ direction: z.enum(['next', 'prev']) }).parse(req.body);
      await cameraControl.step(direction);
      res.json({ ok: true });
    })
  );
  api.post(
    '/camera-control/release',
    camera(async (_req, res) => {
      await cameraControl.release();
      res.json({ ok: true });
    })
  );
  api.post(
    '/camera-control/auto-director',
    camera(async (req, res) => {
      const { on } = z.object({ on: z.boolean() }).parse(req.body);
      await cameraControl.autoDirector(on);
      res.json(cameraControl.state);
    })
  );

  // HLAE managed by TacAM (download from the advancedfx GitHub releases).
  api.get('/hlae', async (req, res) => {
    const installed = installedHlae(store.dataDir);
    let latest: { version: string } | null = null;
    let error: string | null = null;
    if (req.query.check) {
      try {
        latest = { version: (await latestHlae()).version };
      } catch (e) {
        error = (e as Error).message;
      }
    }
    res.json({ installed, latest, error, supported: process.platform === 'win32' });
  });
  api.post(
    '/hlae/install',
    h(async (_req, res) => {
      try {
        const installed = await installHlae(store.dataDir, await latestHlae());
        // Use the managed HLAE right away.
        store.setDoc('settings', { ...store.doc('settings'), hlaePath: installed.path, launchMode: 'hlae' });
        res.json(installed);
      } catch (error) {
        if (error instanceof HlaeError) return res.status(400).json({ error: error.message });
        throw error;
      }
    })
  );
  api.get('/game/console/diagnose', async (_req, res) => res.json(await diagnoseConsole(store.doc('settings').telnet.port)));
  api.post(
    '/game/console',
    h(async (req, res) => {
      const { command } = z.object({ command: z.string().trim().min(1).max(500).regex(/^[^\r\n]*$/, 'One command per line') }).parse(req.body);
      try {
        res.json({ lines: await gameConsole.send(command) });
      } catch (error) {
        res.status(409).json({ error: (error as Error).message });
      }
    })
  );

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
    '/settings/updates',
    h((req, res) => {
      const { betaUpdates } = z.object({ betaUpdates: z.boolean() }).parse(req.body);
      res.json({ betaUpdates: store.setDoc('settings', { ...store.doc('settings'), betaUpdates }).betaUpdates });
    })
  );
  api.put(
    '/settings/keybinds',
    h((req, res) => {
      const keybinds = keybindsSchema(actions).parse(req.body);
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

  const signalRule = signalRuleSchema(actions);
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
      const parsed = obsSchema.parse(req.body);
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

  // --- export / import of settings (transfer.ts) ---------------------------

  const transfer = new SettingsTransfer({ store, uploadsDir, actions });
  const sectionList = z.array(z.enum(TRANSFER_SECTIONS)).min(1, 'Choose at least one area');
  const transferErrors = (fn: Handler) =>
    h(async (req, res) => {
      try {
        await fn(req, res);
      } catch (error) {
        if (error instanceof TransferError) return res.status(400).json({ error: error.message });
        throw error;
      }
    });
  api.get(
    '/transfer/export',
    h((req, res) => {
      const query = z
        .object({
          sections: z.string().transform((v) => v.split(',')).pipe(sectionList),
          videos: z.enum(['0', '1']).default('0'),
          app: z.string().regex(/^\d+\.\d+\.\d+[\w.-]*$/).optional(),
        })
        .parse(req.query);
      const zip = transfer.export(query.sections, { appVersion: query.app ?? null, videos: query.videos === '1' });
      res.attachment(exportFileName(query.sections)).type('application/zip').send(Buffer.from(zip));
    })
  );
  // Up to 1 GB: background videos and imported HUDs make exports large.
  api.post(
    '/transfer/preview',
    express.raw({ type: () => true, limit: '1gb' }),
    transferErrors((req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file received' });
      res.json(transfer.preview(new Uint8Array(req.body)));
    })
  );
  const importBody = z.object({ id: str.min(1), sections: sectionList, mode: z.enum(['merge', 'replace']) });
  api.post(
    '/transfer/check',
    transferErrors((req, res) => {
      const body = importBody.parse(req.body);
      res.json(transfer.check(body.id, body.sections, body.mode));
    })
  );
  api.post(
    '/transfer/import',
    transferErrors((req, res) => {
      const body = importBody.parse(req.body);
      res.json(transfer.apply(body.id, body.sections, body.mode));
    })
  );

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
