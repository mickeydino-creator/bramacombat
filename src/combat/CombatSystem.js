/*
 * Hit detection between fighters.
 * Each frame: for every attacker with an active hitbox, test it against the
 * opponent's hurtbox. An attack is marked `hasHit` on contact, so a single
 * attack can never hit more than once. Both directions are checked before
 * applying damage, so simultaneous hits trade.
 */
export const overlaps = (a, b) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

export function resolveHits(fighters) {
  const hits = [];
  for (const attacker of fighters) {
    const defender = fighters.find((f) => f !== attacker);
    const hitbox = attacker.getActiveHitbox();
    if (!hitbox || !defender.alive) continue;
    const hurtbox = defender.getHurtbox();
    if (!overlaps(hitbox, hurtbox)) continue;
    attacker.attack.hasHit = true;
    hits.push({
      attacker,
      defender,
      move: attacker.attack.move,
      // contact point used for effects
      point: {
        x: (Math.max(hitbox.minX, hurtbox.minX) + Math.min(hitbox.maxX, hurtbox.maxX)) / 2,
        y: (Math.max(hitbox.minY, hurtbox.minY) + Math.min(hitbox.maxY, hurtbox.maxY)) / 2,
      },
    });
  }
  for (const h of hits) h.damage = h.defender.takeHit(h.move, h.attacker);
  return hits;
}

/** Keeps fighters from walking through each other (they can still jump over). */
export function resolvePush(a, b, pushWidth, pushHeight, arenaHalfWidth) {
  const verticalOverlap = a.y < b.y + pushHeight && b.y < a.y + pushHeight;
  if (!verticalOverlap) return;
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if (dist >= pushWidth) return;
  const dir = dist > 0.001 ? Math.sign(dx) : a.facing;
  const push = (pushWidth - dist) / 2;
  a.x -= dir * push;
  b.x += dir * push;
  // If one is pinned to a wall, move the other one instead.
  const lim = arenaHalfWidth;
  for (const [f, o, s] of [[a, b, -dir], [b, a, dir]]) {
    if (Math.abs(f.x) > lim) {
      const over = Math.abs(f.x) - lim;
      f.x = Math.sign(f.x) * lim;
      o.x -= s * over;
    }
  }
}
