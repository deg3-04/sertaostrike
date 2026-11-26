// Teclado e mouse com captura do ponteiro (pointer lock).
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.edges = new Set();
    this.mouseButtons = 0;
    this.mousePressed = new Set();
    this.mouseReleased = new Set();
    this.dx = 0; this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.typing = false;
    this.onUnlock = null;
    this.onKey = null; // callback para teclas de interface
    this.lastMoveMag = 0;

    window.addEventListener('keydown', (e) => {
      if (this.typing) return;
      if (this.onKey && this.onKey(e)) { e.preventDefault(); return; }
      if (this.locked) {
        if (!(e.code === 'F11' || e.code === 'F12' || e.code === 'F5')) e.preventDefault();
      }
      if (e.repeat) return;
      this.down.add(e.code);
      this.edges.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouseButtons = 0; });
    canvas.addEventListener('mousedown', (e) => this.mouseDown(e));
    document.addEventListener('mousedown', (e) => { if (this.locked && e.target !== canvas) this.mouseDown(e); });
    window.addEventListener('mouseup', (e) => {
      this.mouseButtons &= ~(1 << e.button);
      this.mouseReleased.add(e.button);
      const code = this.mouseCode(e.button);
      if (code) this.down.delete(code);
    });
    window.addEventListener('contextmenu', (e) => { if (this.locked || e.target === canvas) e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      let mx = e.movementX || 0, my = e.movementY || 0;
      // proteção contra saltos espúrios do navegador
      if (Math.abs(mx) > 600 || Math.abs(my) > 600) return;
      this.dx += mx; this.dy += my;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) { this.down.clear(); this.mouseButtons = 0; if (this.onUnlock) this.onUnlock(); }
    });
  }
  mouseCode(b) { return b === 1 ? 'Mouse1' : b === 3 ? 'Mouse3' : b === 4 ? 'Mouse4' : null; }
  mouseDown(e) {
    if (!this.locked) return;
    e.preventDefault();
    this.mouseButtons |= 1 << e.button;
    this.mousePressed.add(e.button);
    const code = this.mouseCode(e.button);
    if (code) { this.down.add(code); this.edges.add(code); }
  }
  async lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock(this.settings.rawInput ? { unadjustedMovement: true } : undefined);
      if (p && p.catch) await p.catch(() => this.canvas.requestPointerLock());
    } catch {
      try { this.canvas.requestPointerLock(); } catch {}
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  held(action) { return this.down.has(this.settings.keys[action]); }
  pressed(action) { return this.edges.has(this.settings.keys[action]); }
  fire() { return (this.mouseButtons & 1) !== 0; }
  firePressed() { return this.mousePressed.has(0); }
  altPressed() { return this.mousePressed.has(2); }
  endFrame() {
    this.edges.clear(); this.mousePressed.clear(); this.mouseReleased.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
  clear() { this.down.clear(); this.mouseButtons = 0; this.endFrame(); }
}
