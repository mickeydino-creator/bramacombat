/** Minimal HTML overlay: health bars, center messages, winner screen with restart. */
export class HUD {
  constructor(onRestart) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="bars">
        <div class="bar-wrap p1"><div class="name"></div><div class="bar"><div class="lag"></div><div class="fill"></div></div><div class="meter"><div class="meter-lag"></div><div class="meter-fill"></div><div class="meter-cost"></div></div><div class="meter-label"><span class="meter-name"></span><span class="meter-key"></span></div></div>
        <div class="bar-wrap p2"><div class="name"></div><div class="bar"><div class="lag"></div><div class="fill"></div></div><div class="meter"><div class="meter-lag"></div><div class="meter-fill"></div><div class="meter-cost"></div></div><div class="meter-label"><span class="meter-name"></span><span class="meter-key"></span></div></div>
      </div>
      <div class="message"></div>
      <div class="overlay"><div class="winner"></div><button type="button">RESTART</button></div>
      <div class="help">A/D move &nbsp; W jump &nbsp; J punch &nbsp; K kick &nbsp; L strong &nbsp; I special &nbsp; Shift block &nbsp;|&nbsp; Pad: stick move, A jump, X punch, B kick, Y strong, RB special, RT block, Start restart &nbsp;|&nbsp; R restart &nbsp; H hitboxes</div>`;
    document.body.appendChild(el);
    this.el = el;
    this.bars = ['.p1', '.p2'].map((s) => ({
      name: el.querySelector(`${s} .name`),
      fill: el.querySelector(`${s} .fill`),
      lag: el.querySelector(`${s} .lag`),
      meter: el.querySelector(`${s} .meter`),
      meterFill: el.querySelector(`${s} .meter-fill`),
      meterLag: el.querySelector(`${s} .meter-lag`),
      meterCost: el.querySelector(`${s} .meter-cost`),
      meterLabel: el.querySelector(`${s} .meter-label`),
      meterName: el.querySelector(`${s} .meter-name`),
      meterKey: el.querySelector(`${s} .meter-key`),
    }));
    this.message = el.querySelector('.message');
    this.overlay = el.querySelector('.overlay');
    this.winner = el.querySelector('.winner');
    el.querySelector('button').addEventListener('click', (e) => { e.currentTarget.blur(); onRestart(); });
  }

  setNames(a, b) { this.bars[0].name.textContent = a; this.bars[1].name.textContent = b; }

  setHealth(i, value, max) {
    const pct = `${Math.max(0, (value / max) * 100)}%`;
    this.bars[i].fill.style.width = pct;
    this.bars[i].lag.style.width = pct;
  }

  /**
   * Stamina meter under fighter i's health bar.
   * `status` comes from SpecialAbilities.status(); `keyLabel` is the button hint (optional).
   * Glows when the (first) special ability is ready; a tick marks its cost if it's less than full.
   */
  setStamina(i, status, keyLabel = '', guardBroken = false) {
    const b = this.bars[i];
    const ability = status.abilities[0];
    // Always the real value from SpecialAbilities (no separate UI stamina).
    const pct = Math.max(0, Math.min(1, status.stamina / status.max)) * 100;
    b.meterFill.style.width = `${pct}%`;
    // White "spent" chunk: when stamina drops, it stays briefly then shrinks to the new value.
    if (b.lastPct !== undefined && pct < b.lastPct - 0.5) {
      b.meterLag.classList.remove('draining');
      b.meterLag.style.width = `${b.lastPct}%`;
      void b.meterLag.offsetWidth; // restart the transition
      b.meterLag.classList.add('draining');
      b.meterLag.style.width = `${pct}%`;
      b.meter.classList.remove('spent'); void b.meter.offsetWidth; b.meter.classList.add('spent');
    } else if (!b.meterLag.classList.contains('draining') || pct > parseFloat(b.meterLag.style.width || '0')) {
      b.meterLag.classList.remove('draining');
      b.meterLag.style.width = `${pct}%`;
    }
    b.lastPct = pct;
    const ready = !!ability?.ready;
    b.meter.classList.toggle('ready', ready);
    b.meterLabel.classList.toggle('ready', ready);
    b.meter.classList.toggle('broken', guardBroken); // ran out from blocking: can't block until it refills a bit
    if (ability && b.meterName.textContent !== ability.label) {
      b.meterName.textContent = ability.label;
      b.meterKey.textContent = keyLabel;
      const costPct = (ability.cost / status.max) * 100;
      b.meterCost.style.display = costPct > 0 && costPct < 100 ? 'block' : 'none';
      b.meterCost.style[i === 0 ? 'left' : 'right'] = `${costPct}%`;
    }
  }

  showMessage(text) { this.message.textContent = text; }
  showWinner(text) { this.winner.textContent = text; this.overlay.classList.add('show'); }
  hideWinner() { this.overlay.classList.remove('show'); }
}
