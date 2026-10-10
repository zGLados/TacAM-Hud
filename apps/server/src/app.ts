import fs from 'node:fs';
import path from 'node:path';
import { createServer, type Server as HttpServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import type { CSGORaw } from 'csgogsi';
import { Store } from './store.js';
import { LiveHub } from './live.js';
import { createApi } from './api.js';
import { DemoMatch } from './demo.js';
import { authMiddleware, isAuthorized } from './auth.js';
import type { HudServer } from './io.js';

export interface TacamServerOptions {
  /** Where db.json and uploads are stored. */
  dataDir: string;
  /** HUD/control/API port (default 1349). */
  port?: number;
  /** Port CS2 posts GSI data to (default 23415). */
  gsiPort?: number;
  /** Built HUD (apps/hud/dist). Served at /hud. */
  hudDir?: string;
  /** Built control panel (apps/control/dist). Served at /control. */
  controlDir?: string;
}

export interface TacamServer {
  store: Store;
  live: LiveHub;
  io: HudServer;
  port: number;
  gsiPort: number;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createTacamServer(options: TacamServerOptions): TacamServer {
  const port = options.port ?? 1349;
  const gsiPort = options.gsiPort ?? 23415;
  const uploadsDir = path.join(options.dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const store = new Store(options.dataDir);
  const app = express();
  app.disable('x-powered-by');
  const http = createServer(app);
  const io: HudServer = new Server(http, { maxHttpBufferSize: 1e6 });
  const live = new LiveHub(store, io);
  const demo = new DemoMatch((raw) => live.ingest(raw, true));

  // --- realtime ----------------------------------------------------------

  io.use((socket, next) => {
    if (isAuthorized(store, socket.request, socket.handshake.auth?.token)) next();
    else next(new Error('unauthorized'));
  });
  io.on('connection', (socket) => {
    socket.on('hello', (role) => {
      if (role === 'control' || role === 'hud') socket.join(role);
      // A reloaded HUD shows the game right away instead of waiting for the next GSI tick.
      if (role === 'hud' && live.lastPayload) socket.emit('update', live.lastPayload);
      if (role === 'control') {
        socket.emit('gsiStatus', live.status);
        socket.emit('live', live.summary());
      }
    });
  });

  // Push database changes to every connected HUD/control client.
  store.on('change', (name: string) => {
    switch (name) {
      case 'players':
        io.emit('players', live.playerExtensions());
        break;
      case 'teams':
        io.emit('teams', store.list('teams'));
        break;
      case 'matches':
        io.emit('match', live.currentMatch());
        break;
      case 'hudConfig':
        io.emit('config', store.doc('hudConfig'));
        break;
      case 'theme':
        io.emit('theme', store.doc('theme'));
        break;
      case 'scene':
        io.emit('scene', store.doc('scene'));
        break;
    }
  });

  // --- HTTP --------------------------------------------------------------

  app.use(authMiddleware(store));
  app.use('/api', createApi({ store, live, io, uploadsDir, gsiPort, demo }));
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      setHeaders: (res) => {
        // Uploaded SVGs must never run scripts in our origin.
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:");
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );
  const spa = (mount: string, dir: string | undefined) => {
    if (!dir || !fs.existsSync(dir)) return;
    app.use(mount, express.static(dir));
    app.get(`${mount}/*`, (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  };
  spa('/hud', options.hudDir);
  spa('/control', options.controlDir);
  app.get('/', (_req, res) => res.redirect('/control/'));

  // --- GSI receiver (separate port, local only) -------------------------

  const gsiApp = express();
  gsiApp.use(express.json({ limit: '2mb' }));
  gsiApp.post('/', (req, res) => {
    const raw = req.body as CSGORaw;
    if (raw?.auth?.token !== store.doc('settings').gsiToken) return res.status(401).end();
    if (demo.running) demo.stop();
    live.ingest(raw);
    res.status(200).end();
  });
  const gsiHttp = createServer(gsiApp);

  const listen = (server: HttpServer, p: number, host: string) =>
    new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(p, host, () => {
        server.off('error', reject);
        resolve();
      });
    });

  return {
    store,
    live,
    io,
    port,
    gsiPort,
    async start() {
      const host = store.doc('settings').lanAccess ? '0.0.0.0' : '127.0.0.1';
      await listen(http, port, host);
      await listen(gsiHttp, gsiPort, '127.0.0.1');
    },
    async stop() {
      demo.stop();
      store.flush();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => gsiHttp.close(() => resolve()));
    },
  };
}
