import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { attachRoomServer, optionsFromEnv } from './server/attach.js';

// The realtime room server runs inside Vite's own server during `npm run dev` / `npm run preview`
// (path /ws, same port), so VS FRIENDS works with a single command. In production use `npm start` (server/index.js).
const roomServer = () => ({
  name: 'doodle-brawl-room-server',
  configureServer(server) { if (server.httpServer) attachRoomServer(server.httpServer, optionsFromEnv()); },
  configurePreviewServer(server) { attachRoomServer(server.httpServer, optionsFromEnv()); },
});

export default defineConfig({
  plugins: [roomServer()],
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), controller: resolve(__dirname, 'controller.html') },
    },
  },
});
