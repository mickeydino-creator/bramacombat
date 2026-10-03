import { RoomServer } from './rooms.js';

export const WS_PATH = '/ws';

/**
 * Attach the room server to an existing Node http(s) server (Vite's dev server, `vite preview`, or server/index.js).
 * Only upgrades for WS_PATH are handled, so Vite's own hot-reload socket keeps working.
 */
export function attachRoomServer(httpServer, options = {}) {
  const rooms = new RoomServer(options);
  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path === (options.path ?? WS_PATH)) rooms.handleUpgrade(req, socket, head);
  });
  httpServer.on('close', () => rooms.close());
  return rooms;
}

/** Server options from environment variables (documented in .env.example / README). */
export function optionsFromEnv(env = process.env) {
  return {
    path: env.WS_PATH || WS_PATH,
    maxRooms: Number(env.MAX_ROOMS) || 500,
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : null,
    log: env.NET_LOG ? (m) => console.log(`[rooms] ${m}`) : () => {},
  };
}
