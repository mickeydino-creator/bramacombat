/*
 * Player settings (volumes, graphics quality), saved in localStorage when available.
 * Other systems subscribe with onChange() and apply the values themselves.
 */
const KEY = 'bramacombat.settings';
const DEFAULTS = { master: 0.8, sfx: 0.9, music: 0.5, quality: 'high', voice: true };
export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try { Object.assign(this.values, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode etc. */ }
    if (!QUALITY_LEVELS.includes(this.values.quality)) this.values.quality = DEFAULTS.quality;
    this.listeners = [];
  }

  get(k) { return this.values[k]; }

  set(k, v) {
    this.values[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
    this.listeners.forEach((fn) => fn(this.values, k));
  }

  /** fn(values) is called now and on every change. */
  onChange(fn) { this.listeners.push(fn); fn(this.values); }
}
