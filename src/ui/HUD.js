/** Minimal HTML overlay: health bars, center messages, winner screen with restart. */
export class HUD {
  constructor(onRestart) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="bars">
        <div class="bar-wrap p1"><div class="name"></div><div class="bar"><div class="lag"></div><div class="fill"></div></div></div>
        <div class="bar-wrap p2"><div class="name"></div><div class="bar"><div class="lag"></div><div class="fill"></div></div></div>
      </div>
      <div class="abilities"></div>
      <div class="message"></div>
      <div class="overlay"><div class="winner"></div><button type="button">RESTART</button></div>
      <div class="help">A/D move &nbsp; W jump &nbsp; J punch &nbsp; K kick &nbsp; L strong &nbsp; I special &nbsp;|&nbsp; Pad: stick move, A jump, X punch, B kick, Y strong, RB special, Start restart &nbsp;|&nbsp; R restart &nbsp; H hitboxes</div>`;
    document.body.appendChild(el);
    this.el = el;
    this.bars = ['.p1', '.p2'].map((s) => ({
      name: el.querySelector(`${s} .name`),
      fill: el.querySelector(`${s} .fill`),
      lag: el.querySelector(`${s} .lag`),
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
   * Cooldown indicators for one fighter's special abilities.
   * `status` comes from SpecialAbilities.status(); `keys` maps action name -> button label.
   */
  setAbilities(status, keys = {}) {
    const box = this.el.querySelector('.abilities');
    if (!this.abilitySlots) {
      this.abilitySlots = status.map((s) => {
        const slot = document.createElement('div');
        slot.className = 'ability';
        slot.innerHTML = `<div class="ability-icon"><span class="ability-time"></span><span class="ability-key"></span></div><div class="ability-label"></div>`;
        slot.querySelector('.ability-key').textContent = keys[s.name] || '';
        slot.querySelector('.ability-label').textContent = s.label;
        box.appendChild(slot);
        return slot;
      });
    }
    status.forEach((s, i) => {
      const slot = this.abilitySlots[i];
      slot.classList.toggle('ready', s.ready);
      slot.style.setProperty('--progress', s.progress);
      slot.querySelector('.ability-time').textContent = s.ready ? '' : Math.ceil(s.secondsLeft);
    });
  }

  showMessage(text) { this.message.textContent = text; }
  showWinner(text) { this.winner.textContent = text; this.overlay.classList.add('show'); }
  hideWinner() { this.overlay.classList.remove('show'); }
}
