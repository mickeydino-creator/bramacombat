/** In-fight HTML overlay: health / stamina / special bars, messages, pause button, winner screen. */
export class HUD {
  constructor({ onRestart, onMainMenu, onPause, showOpponentMeters = false }) {
    const el = document.createElement('div');
    el.className = showOpponentMeters ? 'hud' : 'hud hide-opponent';
    el.innerHTML = `
      <div class="bars">
        <div class="bar-wrap p1"><div class="name"></div><div class="row hp"><span class="ico">&#9829;</span><div class="bar"><div class="lag"></div><div class="fill"></div></div></div><div class="row st"><span class="ico">&#9889;&#xFE0E;</span><div class="meter stamina"><div class="meter-lag"></div><div class="meter-fill"></div></div></div><div class="row sp"><span class="ico">&#9733;</span><div class="meter special"><div class="meter-fill"></div></div></div></div>
        <div class="bar-wrap p2"><div class="name"></div><div class="row hp"><span class="ico">&#9829;</span><div class="bar"><div class="lag"></div><div class="fill"></div></div></div><div class="row st"><span class="ico">&#9889;&#xFE0E;</span><div class="meter stamina"><div class="meter-lag"></div><div class="meter-fill"></div></div></div><div class="row sp"><span class="ico">&#9733;</span><div class="meter special"><div class="meter-fill"></div></div></div></div>
      </div>
      <div class="message"></div>
      <button type="button" class="pause-btn" aria-label="Pause">II</button>
      <div class="overlay"><div class="brand">DOODLE BRAWL</div><div class="winner"></div><div class="overlay-buttons"><button type="button" data-act="restart" class="primary">RESTART</button><button type="button" data-act="menu">MAIN MENU</button></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.bars = ['.p1', '.p2'].map((s) => ({
      name: el.querySelector(`${s} .name`),
      fill: el.querySelector(`${s} .fill`),
      lag: el.querySelector(`${s} .lag`),
      meter: el.querySelector(`${s} .meter.stamina`),
      meterFill: el.querySelector(`${s} .meter.stamina .meter-fill`),
      meterLag: el.querySelector(`${s} .meter.stamina .meter-lag`),
      special: el.querySelector(`${s} .meter.special`),
      specialFill: el.querySelector(`${s} .meter.special .meter-fill`),
    }));
    this.message = el.querySelector('.message');
    this.overlay = el.querySelector('.overlay');
    this.winner = el.querySelector('.winner');
    el.querySelector('[data-act=restart]').addEventListener('click', (e) => { e.currentTarget.blur(); onRestart(); });
    el.querySelector('[data-act=menu]').addEventListener('click', (e) => { e.currentTarget.blur(); onMainMenu(); });
    el.querySelector('.pause-btn').addEventListener('click', (e) => { e.currentTarget.blur(); onPause(); });
  }

  setNames(a, b) { this.bars[0].name.textContent = a; this.bars[1].name.textContent = b; }

  setHealth(i, value, max) {
    const pct = `${Math.max(0, (value / max) * 100)}%`;
    this.bars[i].fill.style.width = pct;
    this.bars[i].lag.style.width = pct;
  }

  /**
   * Stamina bar (blocking resource) under fighter i's health bar.
   * `stamina` is the fighter's Stamina object - the bar always shows its real value.
   */
  setStamina(i, stamina, guardBroken = false) {
    const b = this.bars[i];
    const pct = Math.max(0, Math.min(1, stamina.value / stamina.max)) * 100;
    b.meterFill.style.width = `${pct}%`;
    // White "spent" chunk: when stamina drops, it stays briefly then shrinks to the new value.
    if (b.lastPct !== undefined && pct < b.lastPct - 0.5) {
      b.meterLag.classList.remove('draining');
      b.meterLag.style.width = `${b.lastPct}%`;
      void b.meterLag.offsetWidth; // restart the transition
      b.meterLag.classList.add('draining');
      b.meterLag.style.width = `${pct}%`;
    } else if (!b.meterLag.classList.contains('draining') || pct > parseFloat(b.meterLag.style.width || '0')) {
      b.meterLag.classList.remove('draining');
      b.meterLag.style.width = `${pct}%`;
    }
    b.lastPct = pct;
    b.meter.classList.toggle('broken', guardBroken); // ran out from blocking: can't block until it refills a bit
  }

  /**
   * Special ability meter (separate from stamina). `status` comes from SpecialAbilities.status()
   * and is read every frame, so the bar fills smoothly while recharging and empties instantly on use.
   */
  setSpecial(i, status, keyLabel = '', hasStamina = true) {
    const b = this.bars[i];
    const pct = Math.max(0, Math.min(1, status.meter / status.capacity)) * 100;
    b.specialFill.style.width = `${pct}%`;
    if (b.lastSpecialPct !== undefined && pct < b.lastSpecialPct - 1) {
      b.special.classList.remove('used'); void b.special.offsetWidth; b.special.classList.add('used'); // flash on use
    }
    b.lastSpecialPct = pct;
    // No text labels: the meter itself shows the state (glows when usable, red outline = not enough stamina).
    const usable = status.full && hasStamina;
    b.special.classList.toggle('ready', usable);
    b.special.classList.toggle('nostamina', status.full && !hasStamina);
  }

  showMessage(text) {
    if (this.message.textContent === text) return;
    this.message.textContent = text;
    this.message.classList.remove('pop'); void this.message.offsetWidth; if (text) this.message.classList.add('pop');
  }

  /** Notebook page-turn transition (menu <-> fight). */
  pageTurn() {
    if (!this.pageEl) { this.pageEl = document.createElement('div'); this.pageEl.className = 'page-turn'; document.body.appendChild(this.pageEl); }
    const el = this.pageEl;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    clearTimeout(this.pageTimer); this.pageTimer = setTimeout(() => el.classList.remove('go'), 700);
  }
  /** Hidden while a menu covers the game. */
  setVisible(v) { this.el.classList.toggle('hidden', !v); }

  showWinner(text) { this.winner.textContent = text; this.overlay.classList.add('show'); }
  hideWinner() { this.overlay.classList.remove('show'); }
}
