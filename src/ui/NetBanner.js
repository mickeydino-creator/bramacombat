/*
 * One small notebook-style banner at the top of the screen for connection problems and network messages
 * ("Reconnecting...", "Host connection lost", "Room closed"). Several reasons can be active at once; the most
 * important one is shown. Messages with a duration disappear by themselves.
 */
export class NetBanner {
  constructor() {
    const el = document.createElement('div');
    el.className = 'net-banner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    this.el = el;
    this.reasons = new Map(); // key -> { text, priority, until }
    setInterval(() => this.render(), 500);
  }

  /** text = null removes the reason. seconds = auto-hide. */
  set(key, text, { priority = 1, seconds = 0, tone = 'warn' } = {}) {
    if (!text) this.reasons.delete(key);
    else this.reasons.set(key, { text, priority, tone, until: seconds ? performance.now() + seconds * 1000 : 0 });
    this.render();
  }

  render() {
    const now = performance.now();
    for (const [k, r] of this.reasons) if (r.until && r.until < now) this.reasons.delete(k);
    const top = [...this.reasons.values()].sort((a, b) => b.priority - a.priority)[0];
    this.el.classList.toggle('show', !!top);
    this.el.dataset.tone = top?.tone ?? 'warn';
    if (top && this.el.textContent !== top.text) this.el.textContent = top.text;
  }
}
