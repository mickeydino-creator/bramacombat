/*
 * Network configuration (build-time environment variables, see .env.example):
 *
 *   VITE_SERVER_URL   WebSocket URL of the realtime server, e.g. wss://brawl.example.com/ws
 *                     (default: the same host and port the page was loaded from, path /ws)
 *   VITE_PUBLIC_URL   address friends should open, used in QR codes and the share link, e.g. https://brawl.example.com
 *                     (default: the address of the current page)
 *   VITE_HOST_INPUT_DELAY  "auto" (default) or a number of frames: how much the HOST's own input is delayed to even out
 *                     the latency of remote players (see docs/MULTIPLAYER.md). 0 turns it off.
 */
const env = import.meta.env ?? {};

export function serverUrl() {
  if (env.VITE_SERVER_URL) return env.VITE_SERVER_URL;
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  return `${proto}${location.host}/ws`;
}

/** Base address used in QR codes / share links. Strips any path and query from the current page. */
export function publicBaseUrl() {
  const base = env.VITE_PUBLIC_URL || location.origin;
  return String(base).replace(/\/+$/, '');
}

export const joinUrl = (code) => `${publicBaseUrl()}/?join=${encodeURIComponent(code)}`;
export const controllerUrl = (code) => `${publicBaseUrl()}/controller.html?room=${encodeURIComponent(code)}`;

/** True when friends on other devices could not reach this page's address (localhost). */
export const isLocalAddress = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !env.VITE_PUBLIC_URL;

export const hostDelayMode = () => (env.VITE_HOST_INPUT_DELAY === undefined || env.VITE_HOST_INPUT_DELAY === '' ? 'auto' : Number(env.VITE_HOST_INPUT_DELAY));
