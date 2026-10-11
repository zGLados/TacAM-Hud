import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = process.env.TACAM_SERVER ?? 'http://127.0.0.1:1349';
// One version for the whole app (root package.json, set with `npm run version:set`).
const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;

export default defineConfig({
  base: '/control/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 3600,
    proxy: {
      '/api': server,
      '/uploads': server,
      '/hud': server,
      '/socket.io': { target: server, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    // veto.html: page for the team captains (captain veto links), no login.
    rollupOptions: { input: { main: 'index.html', veto: 'veto.html' } },
  },
});
