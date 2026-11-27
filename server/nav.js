// Grade de navegação para os bots (A* em células de 1 m).
import { PLAYER } from '../shared/constants.js';
import { floorHeightAt, overlapsAny } from '../shared/physics.js';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

class Heap {
  constructor() { this.a = []; }
  push(n, f) {
    const a = this.a; a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

export class NavGrid {
  constructor(map, cell = 1) {
    this.cell = cell;
    const b = map.bounds;
    this.x0 = b.minX; this.z0 = b.minZ;
    this.w = Math.round((b.maxX - b.minX) / cell);
    this.h = Math.round((b.maxZ - b.minZ) / cell);
    const n = this.w * this.h;
    this.floor = new Float32Array(n);
    this.walk = new Uint8Array(n);
    const solid = map.solid;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const k = j * this.w + i;
        const x = this.x0 + (i + 0.5) * cell, z = this.z0 + (j + 0.5) * cell;
        const fy = floorHeightAt(x, z, map.floorCap ? map.floorCap(x, z) + 0.2 : 3.2, solid, 0.05);
        if (!isFinite(fy)) continue;
        if (overlapsAny(x, fy + 0.03, z, PLAYER.radius + 0.06, PLAYER.height, solid)) continue;
        this.walk[k] = 1;
        this.floor[k] = fy;
      }
    }
    this.walkable = [];
    for (let k = 0; k < n; k++) if (this.walk[k]) this.walkable.push(k);
  }

  toCell(x, z) {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)];
  }
  center(k) {
    const i = k % this.w, j = (k / this.w) | 0;
    return [this.x0 + (i + 0.5) * this.cell, this.floor[k], this.z0 + (j + 0.5) * this.cell];
  }
  // célula caminhável mais próxima (com altura parecida)
  nearest(x, y, z, maxR = 4) {
    const [ci, cj] = this.toCell(x, z);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const k = j * this.w + i;
          if (!this.walk[k]) continue;
          const c = this.center(k);
          const d = (c[0] - x) ** 2 + (c[2] - z) ** 2 + ((c[1] - y) * 3) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }
  canStep(a, b) {
    const dh = this.floor[b] - this.floor[a];
    return dh <= 0.7 && dh >= -2.6;
  }
  findPath(from, to, maxNodes = Math.max(9000, this.w * this.h * 0.6)) {
    const s = this.nearest(from[0], from[1], from[2]);
    const g = this.nearest(to[0], to[1], to[2]);
    if (s < 0 || g < 0) return null;
    if (s === g) return [this.center(g)];
    const W = this.w;
    const gi = g % W, gj = (g / W) | 0;
    const cost = new Map(); const came = new Map();
    const open = new Heap();
    cost.set(s, 0); open.push(s, 0);
    let visited = 0;
    while (open.size) {
      const cur = open.pop();
      if (cur === g) break;
      if (++visited > maxNodes) return null;
      const ci = cur % W, cj = (cur / W) | 0;
      const cc = cost.get(cur);
      for (const [di, dj, dc] of DIRS) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= this.h) continue;
        const nk = j * W + i;
        if (!this.walk[nk] || !this.canStep(cur, nk)) continue;
        if (di && dj) {
          const a = cj * W + i, b = j * W + ci;
          if (!this.walk[a] || !this.walk[b] || !this.canStep(cur, a) || !this.canStep(cur, b)) continue;
        }
        const nc = cc + dc + Math.abs(this.floor[nk] - this.floor[cur]) * 0.5;
        if (nc < (cost.has(nk) ? cost.get(nk) : Infinity)) {
          cost.set(nk, nc); came.set(nk, cur);
          const hi = Math.abs(i - gi), hj = Math.abs(j - gj);
          const hcost = Math.max(hi, hj) + (Math.SQRT2 - 1) * Math.min(hi, hj);
          open.push(nk, nc + hcost);
        }
      }
    }
    if (!came.has(g)) return null;
    const cells = [g];
    let c = g;
    while (c !== s) { c = came.get(c); cells.push(c); }
    cells.reverse();
    return this.smooth(cells).map((k) => this.center(k));
  }
  // remove pontos intermediários quando há caminho reto livre
  clearLine(a, b) {
    const ca = this.center(a), cb = this.center(b);
    const dx = cb[0] - ca[0], dz = cb[2] - ca[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(len / (this.cell * 0.35));
    let prev = a;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ca[0] + dx * t, z = ca[2] + dz * t;
      for (const [ox, oz] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
        const [i, j] = this.toCell(x + ox, z + oz);
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) return false;
        const k = j * this.w + i;
        if (!this.walk[k]) return false;
        if (Math.abs(this.floor[k] - this.floor[prev]) > 0.7) return false;
      }
      const [i, j] = this.toCell(x, z);
      prev = j * this.w + i;
    }
    return true;
  }
  smooth(cells) {
    if (cells.length <= 2) return cells;
    const out = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = Math.min(cells.length - 1, i + 24);
      while (j > i + 1 && !this.clearLine(cells[i], cells[j])) j--;
      out.push(cells[j]);
      i = j;
    }
    return out;
  }
  randomPoint(rand) {
    const k = this.walkable[Math.floor(rand() * this.walkable.length)];
    return this.center(k);
  }
}
