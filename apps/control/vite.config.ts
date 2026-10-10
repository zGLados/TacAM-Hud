import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = process.env.TACAM_SERVER ?? 'http://127.0.0.1:1349';

export default defineConfig({
  base: '/control/',
  plugins: [react()],
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
