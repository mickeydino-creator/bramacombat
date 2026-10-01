/*
 * Merges several input sources (keyboard, gamepads, ...) into one player input,
 * so they all drive the same fighter actions. Add more sources to the array.
 */
export class CombinedController {
  constructor(sources) {
    this.sources = sources;
  }

  getInput(self, opponent) {
    const out = { move: 0, jump: false, block: false, actions: [], restart: false };
    for (const src of this.sources) {
      const i = src.getInput(self, opponent);
      out.move += i.move;
      out.jump ||= i.jump;
      out.block ||= !!i.block;
      out.restart ||= !!i.restart;
      out.actions.push(...i.actions);
    }
    out.move = Math.max(-1, Math.min(1, out.move));
    return out;
  }
}
