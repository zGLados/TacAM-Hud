import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

const server = process.env.TACAM_SERVER ?? 'http://127.0.0.1:1349';

export default defineConfig({
  base: '/hud/',
  plugins: [react(), svgr()],
  server: {
    port: 3500,
    proxy: {
      '/api': server,
      '/uploads': server,
      '/socket.io': { target: server, ws: true },
    },
  },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
