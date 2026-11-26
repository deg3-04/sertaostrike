// Iluminação pré-calculada (sem custo por quadro): visibilidade do céu por vértice
// (escurece salas, corredores e cantos) e luz das lâmpadas gravada nos vértices.
// Também fornece uma grade de luz para iluminar personagens e a arma em 1ª pessoa.

// ------------------------------------------------------------------ grade de ocultação (raios rápidos)
export class OccGrid {
  constructor(boxes, bounds) {
    this.boxes = boxes.filter((b) => !b.floor && !b.hidden && !b.noCollide && b.max[1] > 0.05);
    this.cell = 2;
    this.x0 = bounds.minX - 6; this.z0 = bounds.minZ - 6;
    this.nx = Math.ceil((bounds.maxX - bounds.minX + 12) / this.cell);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ + 12) / this.cell);
    this.cells = Array.from({ length: this.nx * this.nz }, () => []);
    this.maxTop = 0;
    this.stamp = new Uint32Array(this.boxes.length);
    this.stampN = 1;
    this.boxes.forEach((b, i) => {
      this.maxTop = Math.max(this.maxTop, b.max[1]);
      const c0 = Math.max(0, Math.floor((b.min[0] - this.x0) / this.cell)), c1 = Math.min(this.nx - 1, Math.floor((b.max[0] - this.x0) / this.cell));
      const r0 = Math.max(0, Math.floor((b.min[2] - this.z0) / this.cell)), r1 = Math.min(this.nz - 1, Math.floor((b.max[2] - this.z0) / this.cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.nx + c].push(i);
    });
  }

  // 0 = livre, 1 = bateu em algo, 2 = bateu no chão
  cast(ox, oy, oz, dx, dy, dz, maxD) {
    const cs = this.cell;
    if (++this.stampN > 4e9) { this.stamp.fill(0); this.stampN = 1; }
    const st = this.stampN;
    let cx = Math.floor((ox - this.x0) / cs), cz = Math.floor((oz - this.z0) / cs);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? cs / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? cs / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * cs + this.x0 - ox : ox - (cx * cs + this.x0)) / Math.abs(dx)) : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * cs + this.z0 - oz : oz - (cz * cs + this.z0)) / Math.abs(dz)) : Infinity;
    // limite: acima de todas as caixas o raio está livre; abaixo de y=0 bateu no chão
    let tEnd = maxD;
    if (dy > 1e-6) tEnd = Math.min(tEnd, (this.maxTop - oy) / dy);
    let floorT = Infinity;
    if (dy < -1e-6) { floorT = -oy / dy; tEnd = Math.min(tEnd, floorT); }
    let t = 0;
    const idx = 1 / (dx || 1e-12), idy = 1 / (dy || 1e-12), idz = 1 / (dz || 1e-12);
    while (t <= tEnd) {
      if (cx >= 0 && cz >= 0 && cx < this.nx && cz < this.nz) {
        const list = this.cells[cz * this.nx + cx];
        for (let k = 0; k < list.length; k++) {
          const bi = list[k];
          if (this.stamp[bi] === st) continue;
          this.stamp[bi] = st;
          const b = this.boxes[bi];
          let t1 = (b.min[0] - ox) * idx, t2 = (b.max[0] - ox) * idx;
          let tn = Math.min(t1, t2), tf = Math.max(t1, t2);
          t1 = (b.min[1] - oy) * idy; t2 = (b.max[1] - oy) * idy;
          tn = Math.max(tn, Math.min(t1, t2)); tf = Math.min(tf, Math.max(t1, t2));
          t1 = (b.min[2] - oz) * idz; t2 = (b.max[2] - oz) * idz;
          tn = Math.max(tn, Math.min(t1, t2)); tf = Math.min(tf, Math.max(t1, t2));
          if (tf >= Math.max(tn, 0) && tn < tEnd) return 1;
        }
      } else if (t > 0) break; // saiu da grade
      if (tmx < tmz) { t = tmx; tmx += tdx; cx += stepX; } else { t = tmz; tmz += tdz; cz += stepZ; }
    }
    return floorT <= maxD && tEnd === floorT ? 2 : 0;
  }
}

// direções do hemisfério (distribuição cosseno, espiral áurea)
const HEMI = (() => {
  const out = [], N = 16, ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const r = Math.sqrt((i + 0.5) / N), a = i * ga;
    out.push([r * Math.cos(a), Math.sqrt(1 - r * r), r * Math.sin(a)]);
  }
  return out;
})();

function basis(n) {
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  const l = Math.hypot(...u); u = u.map((x) => x / l);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}

// fração do céu visível (só direções acima do horizonte contam)
export function skyVisibility(grid, p, n) {
  const [u, v] = basis(n);
  let open = 0, tot = 0;
  for (const h of HEMI) {
    const d = [u[0] * h[0] + n[0] * h[1] + v[0] * h[2], u[1] * h[0] + n[1] * h[1] + v[1] * h[2], u[2] * h[0] + n[2] * h[1] + v[2] * h[2]];
    if (d[1] < 0.02) continue;
    tot++;
    if (grid.cast(p[0], p[1], p[2], d[0], d[1], d[2], 22) === 0) open++;
  }
  if (tot < 3) return 0.12; // face virada para baixo (teto): só luz refletida do chão
  return open / tot;
}

// luz das lâmpadas num ponto (normal n opcional)
export function lampLight(grid, lamps, p, n, out) {
  out[0] = out[1] = out[2] = 0; out[3] = 0;
  for (const L of lamps) {
    const dx = L.x - p[0], dy = L.y - p[1], dz = L.z - p[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > L.r * L.r) continue;
    const d = Math.sqrt(d2) || 1e-3;
    const lx = dx / d, ly = dy / d, lz = dz / d;
    const ndl = n ? lx * n[0] + ly * n[1] + lz * n[2] : 0.75;
    if (ndl <= 0) continue;
    if (grid.cast(p[0], p[1], p[2], lx, ly, lz, Math.max(0, d - 0.35)) === 1) continue;
    const fall = (1 - d / L.r); const k = Math.min(0.75, L.i * 1.5 * ndl * fall * fall / (1 + 0.08 * d2));
    if (L.flicker) out[3] += k; else { out[0] += k * L.c[0]; out[1] += k * L.c[1]; out[2] += k * L.c[2]; }
  }
  return out;
}

// calcula os atributos 'skyv' (float) e 'lampc' (vec4: rgb fixo + intensidade das que piscam) de uma geometria
export function bakeGeometry(geo, grid, lamps, cache) {
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
  const n = pos.length / 3;
  const sky = new Float32Array(n), lc = new Float32Array(n * 4);
  const tmp = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
    const p = [pos[i * 3] + nx * 0.06, pos[i * 3 + 1] + ny * 0.06 + 0.005, pos[i * 3 + 2] + nz * 0.06];
    const key = `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)},${Math.round(p[2] * 20)},${Math.round(nx * 4)},${Math.round(ny * 4)},${Math.round(nz * 4)}`;
    let r = cache.get(key);
    if (!r) {
      const s = skyVisibility(grid, p, [nx, ny, nz]);
      lampLight(grid, lamps, p, [nx, ny, nz], tmp);
      r = [s, tmp[0], tmp[1], tmp[2], tmp[3]];
      cache.set(key, r);
    }
    sky[i] = r[0];
    lc[i * 4] = r[1]; lc[i * 4 + 1] = r[2]; lc[i * 4 + 2] = r[3]; lc[i * 4 + 3] = r[4];
  }
  return { sky, lc };
}

// grade de luz para personagens: céu visível e luz de lâmpada a ~1,3 m do chão
export function buildLightGrid(grid, lamps, bounds) {
  const cs = 1.0;
  const x0 = bounds.minX, z0 = bounds.minZ;
  const nx = Math.ceil((bounds.maxX - bounds.minX) / cs) + 1, nz = Math.ceil((bounds.maxZ - bounds.minZ) / cs) + 1;
  const sky = new Float32Array(nx * nz * 2), lamp = new Float32Array(nx * nz * 2 * 3);
  const tmp = [0, 0, 0, 0];
  const LEVELS = [1.3, 3.0];
  for (let li = 0; li < 2; li++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const p = [x0 + i * cs, LEVELS[li], z0 + j * cs];
      const k = (li * nz + j) * nx + i;
      sky[k] = skyVisibility(grid, p, [0, 1, 0]);
      lampLight(grid, lamps, p, null, tmp);
      lamp[k * 3] = tmp[0] + tmp[3] * 0.8; lamp[k * 3 + 1] = tmp[1] + tmp[3] * 0.65; lamp[k * 3 + 2] = tmp[2] + tmp[3] * 0.4;
    }
  }
  return {
    // interpolação bilinear; out = { sky, lamp:[r,g,b] }
    sample(x, y, z, out) {
      const fx = Math.max(0, Math.min(nx - 1.001, (x - x0) / cs)), fz = Math.max(0, Math.min(nz - 1.001, (z - z0) / cs));
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      const lv = y > 2.2 ? 1 : 0;
      const at = (ii, jj) => (lv * nz + jj) * nx + ii;
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      const w = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
      out.sky = sky[a] * w[0] + sky[b] * w[1] + sky[c] * w[2] + sky[d] * w[3];
      for (let q = 0; q < 3; q++) out.lamp[q] = lamp[a * 3 + q] * w[0] + lamp[b * 3 + q] * w[1] + lamp[c * 3 + q] * w[2] + lamp[d * 3 + q] * w[3];
      return out;
    },
  };
}

// ------------------------------------------------------------------ shaders
// materiais do mapa: usam os atributos pré-calculados
export function installBakedLighting(mat, uni) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uFlick = uni.uFlick;
    sh.uniforms.uNoShadowSky = uni.uNoShadowSky;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skyv;\nattribute vec4 lampc;\nvarying float vSky;\nvarying vec4 vLamp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSky = skyv; vLamp = lampc;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSky;\nvarying vec4 vLamp;\nuniform float uFlick;\nuniform float uNoShadowSky;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float skyK = 0.22 + 0.78 * vSky;
        reflectedLight.indirectDiffuse *= skyK;
        reflectedLight.indirectSpecular *= skyK;
        reflectedLight.directDiffuse *= mix(1.0, smoothstep(0.05, 0.55, vSky), uNoShadowSky);
        reflectedLight.directSpecular *= mix(1.0, smoothstep(0.05, 0.55, vSky), uNoShadowSky);
        vec3 lampL = vLamp.rgb + vLamp.a * uFlick * vec3(1.0, 0.8, 0.52);
        reflectedLight.indirectDiffuse += lampL * diffuseColor.rgb;`);
  };
  mat.customProgramCacheKey = () => prevKey + '|baked';
  mat.needsUpdate = true;
}

// personagens e arma em 1ª pessoa: nível de luz vindo da grade (uniforms por material)
export function installDynamicLighting(mat, uni) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uSkyL = uni.uSkyL;
    sh.uniforms.uLampL = uni.uLampL;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSkyL;\nuniform vec3 uLampL;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float skyK = 0.24 + 0.76 * uSkyL;
        reflectedLight.indirectDiffuse *= skyK;
        reflectedLight.indirectSpecular *= skyK;
        reflectedLight.directDiffuse *= 0.25 + 0.75 * smoothstep(0.05, 0.6, uSkyL);
        reflectedLight.directSpecular *= 0.25 + 0.75 * smoothstep(0.05, 0.6, uSkyL);
        reflectedLight.indirectDiffuse += uLampL * diffuseColor.rgb;`);
  };
  mat.customProgramCacheKey = () => 'dynlight';
  mat.needsUpdate = true;
}
