import path from 'node:path';
import { createTacamServer } from './app.js';
import { appsDir, defaultDataDir } from './paths.js';

const server = createTacamServer({
  dataDir: defaultDataDir(),
  port: Number(process.env.HUD_PORT ?? 1349),
  gsiPort: Number(process.env.GSI_PORT ?? 23415),
  hudDir: path.join(appsDir(), 'hud', 'dist'),
  controlDir: path.join(appsDir(), 'control', 'dist'),
});

server
  .start()
  .then(() => {
    console.log(`TacAM HUD server:   http://localhost:${server.port}/control/`);
    console.log(`HUD (OBS source):   http://localhost:${server.port}/hud/`);
    console.log(`GSI receiver:       http://127.0.0.1:${server.gsiPort}/`);
    console.log(`Data:               ${server.store.dataDir}`);
  })
  .catch((error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE' ? `Port already in use: ${error.message}` : error);
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.stop().finally(() => process.exit(0));
  });
}
