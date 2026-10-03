import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRoomServer, optionsFromEnv } from './attach.js';

/*
 * Production server: serves the built game (dist/) AND the realtime room server on the same port, so one deployment
 * (and one URL) is enough:   npm run build && npm start
 *
 * Environment variables:
 *   PORT             port to listen on (default 8787)
 *   HOST             interface to bind (default 0.0.0.0)
 *   ALLOWED_ORIGINS  comma separated origins allowed to open the WebSocket (default: any)
 *   MAX_ROOMS        maximum simultaneous rooms (default 500)
 *   NET_LOG          set to 1 to log room events
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

export function createServer(env = process.env) {
  let rooms;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...rooms.stats() }));
      return;
    }
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
      const hashed = /\/assets\//.test(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  });
  rooms = attachRoomServer(server, optionsFromEnv(env));
  return { server, rooms };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8787;
  const { server } = createServer();
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Doodle Brawl server on http://localhost:${port}  (ws path /ws)`));
}
