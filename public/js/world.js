// Construção visual do mapa: caixas com UV em escala de mundo, fachadas
// coloniais (janelas, portas, cornijas, telhados), decoração (palmeiras,
// mandacarus, bandeirinhas), céu, montanhas, luzes e neblina.
import * as THREE from '/lib/three.js';
import { getTextures } from './textures.js';
import { OccGrid, bakeGeometry, buildLightGrid, installBakedLighting } from './lighting.js';
import { signAtlas, addSigns, addCables, buildScatter } from './decor.js';

// ------------------------------------------------------------------ construtor de malhas
class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.sw = []; this.idx = []; this.count = 0; }
  quad(v, nrm, uvs, cols, sway) {
    const base = this.count;
    for (let i = 0; i < 4; i++) {
      this.p.push(v[i][0], v[i][1], v[i][2]);
      this.n.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      const c = cols[i] || cols[0];
      this.c.push(c[0], c[1], c[2]);
      this.sw.push(sway ? sway[i] : 0);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }
  tri(v, nrm, uvs, col, sway) {
    const base = this.count;
    for (let i = 0; i < 3; i++) {
      this.p.push(v[i][0], v[i][1], v[i][2]);
      const nn = Array.isArray(nrm[0]) ? nrm[i] : nrm;
      this.n.push(nn[0], nn[1], nn[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      const c = Array.isArray(col[0]) ? col[i] : col;
      this.c.push(c[0], c[1], c[2]);
      this.sw.push(sway ? sway[i] : 0);
    }
    this.idx.push(base, base + 1, base + 2);
    this.count += 3;
  }
  // adiciona uma geometria do three com matriz e cor
  geo(g, m, col, uvScale = 1) {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    gg.applyMatrix4(m);
    const pos = gg.attributes.position, nor = gg.attributes.normal, uv = gg.attributes.uv;
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      this.p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      this.uv.push(uv ? uv.getX(i) * uvScale : 0, uv ? uv.getY(i) * uvScale : 0);
      const c = typeof col === 'function' ? col(pos.getX(i), pos.getY(i), pos.getZ(i)) : col;
      this.c.push(c[0], c[1], c[2]);
      this.sw.push(0);
      this.idx.push(base + i);
    }
    this.count += pos.count;
    gg.dispose();
  }
  build() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.sw.some((s) => s)) g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sw, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const col3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const WHITE = [1, 1, 1];

// eixos das faces: [normal, eixo u, eixo v]
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function insideAny(p, boxes, self) {
  for (const b of boxes) {
    if (b === self || b.hidden) continue;
    if (p[0] > b.min[0] - 1e-3 && p[0] < b.max[0] + 1e-3 && p[1] > b.min[1] - 1e-3 && p[1] < b.max[1] + 1e-3 && p[2] > b.min[2] - 1e-3 && p[2] < b.max[2] + 1e-3) return true;
  }
  return false;
}

// adiciona uma caixa ao construtor
function addBox(mb, min, max, o = {}) {
  const su = o.su || 1, sv = o.sv || su;
  const color = o.color || WHITE;
  for (let fi = 0; fi < 6; fi++) {
    const F = FACES[fi];
    if (o.skip && o.skip(fi)) continue;
    const ax = F.n[0] ? 0 : F.n[1] ? 1 : 2;
    const plane = F.n[ax] > 0 ? max[ax] : min[ax];
    // limites da face nos outros eixos
    const vertical = ax !== 1;
    const segs = [];
    if (vertical && o.ao && min[1] < 0.01 && max[1] > 2.3) segs.push([min[1], 2.0], [2.0, max[1]]);
    else segs.push([min[1], max[1]]);
    if (!vertical) segs.length = 0, segs.push(null);
    for (const seg of segs) {
      const lo = [...min], hi = [...max];
      if (seg) { lo[1] = seg[0]; hi[1] = seg[1]; }
      lo[ax] = hi[ax] = plane;
      const corners = [];
      // monta os 4 cantos em ordem BL, BR, TR, TL usando u/v
      const cu = F.u, cv = F.v;
      const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      const hu = Math.abs(dot([hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], cu)) / 2;
      const hv = Math.abs(dot([hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], cv)) / 2;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corners.push([center[0] + cu[0] * hu * a + cv[0] * hv * b, center[1] + cu[1] * hu * a + cv[1] * hv * b, center[2] + cu[2] * hu * a + cv[2] * hv * b]);
      }
      let uvs;
      if (o.faceUV) {
        uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      } else if (vertical) {
        uvs = corners.map((c) => [dot(c, cu) / su, c[1] / sv]);
      } else {
        uvs = corners.map((c) => [c[0] / su, -c[2] / su]);
      }
      let cols = [color, color, color, color];
      if (o.ao && vertical && min[1] < 0.01) {
        cols = corners.map((c) => mulc(color, c[1] < 0.01 ? 0.7 : c[1] <= 2.001 ? 1 : 1));
      }
      if (o.topShade && !vertical && F.n[1] > 0) cols = cols.map((c) => mulc(c, o.topShade));
      // subdivide faces grandes para a iluminação pré-calculada ter resolução
      const nu = o.sub && !o.faceUV ? Math.min(24, Math.ceil(hu * 2 / o.sub)) : 1;
      const nv = o.sub && !o.faceUV ? Math.min(24, Math.ceil(hv * 2 / o.sub)) : 1;
      if (nu * nv <= 1) { mb.quad(corners, F.n, uvs, cols); continue; }
      const lerp2 = (A, a, b) => {
        // bilinear entre BL(0) BR(1) TR(2) TL(3)
        const out = [];
        for (let q = 0; q < A[0].length; q++) {
          const bot = A[0][q] + (A[1][q] - A[0][q]) * a, top = A[3][q] + (A[2][q] - A[3][q]) * a;
          out.push(bot + (top - bot) * b);
        }
        return out;
      };
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a0 = i / nu, a1 = (i + 1) / nu, b0 = j / nv, b1 = (j + 1) / nv;
        const P = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
        mb.quad(P.map(([a, b]) => lerp2(corners, a, b)), F.n, P.map(([a, b]) => lerp2(uvs, a, b)), P.map(([a, b]) => lerp2(cols, a, b)));
      }
    }
  }
}

// face totalmente coberta por caixas vizinhas?
function faceCovered(b, fi, boxes) {
  const F = FACES[fi];
  const ax = F.n[0] ? 0 : F.n[1] ? 1 : 2;
  const plane = F.n[ax] > 0 ? b.max[ax] : b.min[ax];
  const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
  const pts = [];
  for (const s of [0.04, 0.5, 0.96]) for (const t of [0.04, 0.5, 0.96]) {
    const p = [0, 0, 0];
    p[ax] = plane + F.n[ax] * 0.01;
    p[o1] = b.min[o1] + (b.max[o1] - b.min[o1]) * s;
    p[o2] = b.min[o2] + (b.max[o2] - b.min[o2]) * t;
    pts.push(p);
  }
  return pts.every((p) => insideAny(p, boxes, b));
}

// ------------------------------------------------------------------ materiais
function makeMaterials(tex) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const ns = (s) => new THREE.Vector2(s, s);
  return {
    ground: std({ map: tex.ground.map, normalMap: tex.ground.normalMap, normalScale: ns(0.7), vertexColors: true, roughness: 0.97 }),
    plaster: std({ map: tex.plaster.map, normalMap: tex.plaster.normalMap, normalScale: ns(0.45), vertexColors: true, roughness: 0.93 }),
    stone: std({ map: tex.stone.map, normalMap: tex.stone.normalMap, normalScale: ns(0.9), vertexColors: true }),
    wall: std({ map: tex.wall.map, normalMap: tex.wall.normalMap, normalScale: ns(1.0), vertexColors: true }),
    brick: std({ map: tex.brick.map, normalMap: tex.brick.normalMap, normalScale: ns(0.8), vertexColors: true }),
    concrete: std({ map: tex.concrete.map, normalMap: tex.concrete.normalMap, normalScale: ns(0.5), vertexColors: true }),
    wood: std({ map: tex.wood.map, normalMap: tex.wood.normalMap, normalScale: ns(0.6), vertexColors: true, roughness: 0.82 }),
    crate: std({ map: tex.crate.map, normalMap: tex.crate.normalMap, normalScale: ns(0.6), vertexColors: true, roughness: 0.8 }),
    door: std({ map: tex.door.map, normalMap: tex.door.normalMap, normalScale: ns(0.5), vertexColors: true, roughness: 0.7 }),
    metal: std({ map: tex.metal.map, vertexColors: true, metalness: 0.35, roughness: 0.55 }),
    barrel: std({ map: tex.barrel.map, vertexColors: true, metalness: 0.3, roughness: 0.55 }),
    trim: std({ map: tex.trim.map, vertexColors: true, roughness: 0.85 }),
    roof: std({ map: tex.roof.map, vertexColors: true, roughness: 0.8 }),
    plain: std({ vertexColors: true, roughness: 0.85 }),
    foliage: std({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    cloth: std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    glass: std({ vertexColors: true, roughness: 0.22, metalness: 0.05 }),
    signs: std({ map: signAtlas(), vertexColors: true, roughness: 0.7, alphaTest: 0.5 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
    bulbf: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
  };
}

// balanço com o vento (bandeirinhas e palmeiras)
function addWind(mat, uniforms, strength) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = modelMatrix * vec4(position, 1.0);
        float ph = wp0.x * 0.35 + wp0.z * 0.27;
        transformed.x += sin(uTime * 2.3 + ph) * sway * ${strength.toFixed(3)};
        transformed.z += cos(uTime * 1.9 + ph * 1.3) * sway * ${(strength * 0.6).toFixed(3)};
        transformed.y += sin(uTime * 3.1 + ph) * sway * ${(strength * 0.25).toFixed(3)};`);
  };
  mat.customProgramCacheKey = () => 'wind' + strength;
}

// ------------------------------------------------------------------ decoração
function buildPalm(mb, mbLeaf, p) {
  const r = rng(Math.floor(p.x * 100 + p.z * 7));
  const h = p.h || 7;
  const lean = 0.18 + r() * 0.12;
  const dir = p.rot || 0;
  const segs = 9;
  let prev = null;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const off = Math.pow(t, 1.6) * h * lean;
    pts.push(new THREE.Vector3(p.x + Math.sin(dir) * off, t * h, p.z + Math.cos(dir) * off));
  }
  const bark = col3(0x8a6a48), bark2 = col3(0x6e5236);
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    const rad0 = 0.2 - 0.08 * (i / segs), rad1 = 0.2 - 0.08 * ((i + 1) / segs);
    const g = new THREE.CylinderGeometry(rad1, rad0 * 1.08, len, 9, 1, true);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    mb.geo(g, m, i % 2 ? bark : bark2, 1);
  }
  const top = pts[segs];
  // folhas
  const fronds = 10;
  for (let f = 0; f < fronds; f++) {
    const ang = (f / fronds) * Math.PI * 2 + r() * 0.4;
    const len = 2.6 + r() * 1.2;
    const droop = 0.9 + r() * 0.6;
    const n = 10;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const side = [-dz, 0, dx];
    let last = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = top.x + dx * len * t, z = top.z + dz * len * t;
      const y = top.y + 0.25 + Math.sin(t * Math.PI * 0.55) * 0.9 - t * t * droop * 1.6;
      const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.5 + 0.04;
      const c = mulc(col3(t < 0.5 ? 0x3e7a32 : 0x5f9a3c), 0.85 + r() * 0.25);
      const cur = { l: [x + side[0] * w, y - w * 0.25, z + side[2] * w], c: [x, y + 0.05, z], r: [x - side[0] * w, y - w * 0.25, z - side[2] * w], col: c, s: t * 0.35 };
      if (last) {
        mbLeaf.quad([last.l, cur.l, cur.c, last.c], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [last.col, cur.col, cur.col, last.col], [last.s, cur.s, cur.s, last.s]);
        mbLeaf.quad([last.c, cur.c, cur.r, last.r], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [last.col, cur.col, cur.col, last.col], [last.s, cur.s, cur.s, last.s]);
      }
      last = cur;
    }
  }
  // cocos
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const m = new THREE.Matrix4().makeTranslation(top.x + Math.cos(a) * 0.22, top.y - 0.1, top.z + Math.sin(a) * 0.22);
    mb.geo(new THREE.SphereGeometry(0.13, 7, 5), m, col3(0x5a4020));
  }
}

function buildCactus(mb, p) {
  const r = rng(Math.floor(p.x * 31 + p.z * 17));
  const h = p.h || 2.5;
  const green = col3(0x4d7a3a), dark = col3(0x3a5f2c);
  const ribbed = (rad, len) => {
    const g = new THREE.CylinderGeometry(rad, rad * 1.05, len, 12, 3);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.cos(a * 6) * 0.12;
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const colFn = (x, y, z) => { const a = Math.atan2(z - p.z, x - p.x); return Math.cos(a * 6) > 0.3 ? green : dark; };
  mb.geo(ribbed(0.22, h), new THREE.Matrix4().makeTranslation(p.x, h / 2, p.z), colFn);
  mb.geo(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(p.x, h, p.z), green);
  const arms = 2 + Math.floor(r() * 2);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + r();
    const y0 = h * (0.35 + r() * 0.3);
    const out = 0.45 + r() * 0.2;
    const up = 0.5 + r() * 0.7;
    const dx = Math.cos(a), dz = Math.sin(a);
    const hm = new THREE.Matrix4().compose(new THREE.Vector3(p.x + dx * out / 2, y0, p.z + dz * out / 2),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz)), new THREE.Vector3(1, 1, 1));
    mb.geo(new THREE.CylinderGeometry(0.13, 0.13, out, 10), hm, green);
    mb.geo(ribbed(0.14, up), new THREE.Matrix4().makeTranslation(p.x + dx * out, y0 + up / 2, p.z + dz * out), colFn);
    mb.geo(new THREE.SphereGeometry(0.14, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(p.x + dx * out, y0 + up, p.z + dz * out), green);
    mb.geo(new THREE.SphereGeometry(0.135, 8, 6), new THREE.Matrix4().makeTranslation(p.x + dx * out, y0, p.z + dz * out), green);
  }
}

const FLAG_COLORS = [0xe63946, 0xffd166, 0x118ab2, 0x06d6a0, 0xf77f00, 0xef476f, 0x8338ec, 0xfefae0].map(col3);
function buildBunting(mbRope, mbFlags, p) {
  const a = p.a, b = p.b, sag = p.sag || 0.8;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(4, Math.round(len / 0.38));
  const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const r = rng(Math.floor(a[0] * 13 + a[2] * 7 + b[0]));
  for (let i = 0; i < n; i++) {
    const p0 = pt(i / n), p1 = pt((i + 1) / n);
    // corda
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const l = Math.hypot(dx, dy, dz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / l, dy / l, dz / l)), new THREE.Vector3(1, 1, 1));
    mbRope.geo(new THREE.CylinderGeometry(0.008, 0.008, l, 3, 1, true), m, col3(0x333333));
    // bandeirinha
    const q0 = pt((i + 0.12) / n), q1 = pt((i + 0.88) / n);
    const mid = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2 - 0.3, (q0[2] + q1[2]) / 2];
    const c = FLAG_COLORS[Math.floor(r() * FLAG_COLORS.length)];
    mbFlags.tri([q0, q1, mid], [0, 0, 1], [[0, 1], [1, 1], [0.5, 0]], c, [0, 0, 1]);
  }
}

function buildAwning(mbCloth, mbWood, p, tex) {
  const { x1, z1, x2, z2, y } = p;
  const cols = [[0xe63946, 0xf1faee], [0x2a9d8f, 0xe9f5db], [0xf4a261, 0x264653], [0x457b9d, 0xf1faee]][p.color % 4].map(col3);
  // tecido listrado inclinado (listras ao longo de z)
  const n = 10;
  for (let i = 0; i < n; i++) {
    const za = z1 + (z2 - z1) * i / n, zb = z1 + (z2 - z1) * (i + 1) / n;
    const c = cols[i % 2];
    mbCloth.quad([[x2, y - 0.45, za], [x2, y - 0.45, zb], [x1, y, zb], [x1, y, za]], [0.3, 0.95, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [c, c, c, c], [0.2, 0.2, 0, 0]);
    // babado
    mbCloth.quad([[x2, y - 0.75, za], [x2, y - 0.75, zb], [x2, y - 0.45, zb], [x2, y - 0.45, za]], [1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [c, c, c, c], [0.35, 0.35, 0.2, 0.2]);
  }
  for (const [x, z, h] of [[x1 + 0.08, z1 + 0.08, y], [x1 + 0.08, z2 - 0.08, y], [x2 - 0.08, z1 + 0.08, y - 0.45], [x2 - 0.08, z2 - 0.08, y - 0.45]]) {
    addBox(mbWood, [x - 0.05, 0, z - 0.05], [x + 0.05, h, z + 0.05], { su: 1, color: col3(0x7a5230) });
  }
}

function buildCart(mbWood, mbDark, p) {
  const { x, z, alongX } = p;
  const L = 2.5, W = 1.4;
  const hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
  const wood = col3(0xb08050);
  addBox(mbWood, [x - hx, 0.55, z - hz], [x + hx, 0.68, z + hz], { su: 2, color: wood });
  // laterais
  if (alongX) {
    addBox(mbWood, [x - hx, 0.68, z - hz], [x + hx, 1.25, z - hz + 0.08], { su: 2, color: wood });
    addBox(mbWood, [x - hx, 0.68, z + hz - 0.08], [x + hx, 1.25, z + hz], { su: 2, color: wood });
    addBox(mbWood, [x - hx, 0.68, z - hz], [x - hx + 0.08, 1.15, z + hz], { su: 2, color: wood });
    addBox(mbWood, [x + hx - 0.08, 0.68, z - hz], [x + hx, 1.15, z + hz], { su: 2, color: wood });
    addBox(mbWood, [x - hx - 1.3, 0.62, z - 0.5], [x - hx, 0.7, z - 0.42], { su: 2, color: wood });
    addBox(mbWood, [x - hx - 1.3, 0.62, z + 0.42], [x - hx, 0.7, z + 0.5], { su: 2, color: wood });
  } else {
    addBox(mbWood, [x - hx, 0.68, z - hz], [x - hx + 0.08, 1.25, z + hz], { su: 2, color: wood });
    addBox(mbWood, [x + hx - 0.08, 0.68, z - hz], [x + hx, 1.25, z + hz], { su: 2, color: wood });
    addBox(mbWood, [x - hx, 0.68, z - hz], [x + hx, 1.15, z - hz + 0.08], { su: 2, color: wood });
    addBox(mbWood, [x - hx, 0.68, z + hz - 0.08], [x + hx, 1.15, z + hz], { su: 2, color: wood });
    addBox(mbWood, [x - 0.5, 0.62, z - hz - 1.3], [x - 0.42, 0.7, z - hz], { su: 2, color: wood });
    addBox(mbWood, [x + 0.42, 0.62, z - hz - 1.3], [x + 0.5, 0.7, z - hz], { su: 2, color: wood });
  }
  // rodas
  for (const s of [-1, 1]) {
    const wx = alongX ? x : x + s * (hx + 0.06), wz = alongX ? z + s * (hz + 0.06) : z;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(wx, 0.55, wz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(alongX ? 1 : 0, 0, alongX ? 0 : 1), Math.PI / 2), new THREE.Vector3(1, 1, 1));
    mbDark.geo(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16), m, col3(0x5a3d22));
    mbDark.geo(new THREE.TorusGeometry(0.52, 0.04, 6, 18), new THREE.Matrix4().compose(new THREE.Vector3(wx, 0.55, wz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), alongX ? 0 : Math.PI / 2), new THREE.Vector3(1, 1, 1)), col3(0x2b2b2b));
  }
}

// ------------------------------------------------------------------ fachadas
const SHUTTERS = [0x2f6f4e, 0x2e5d8a, 0x7a4a2a, 0xa83a32, 0x3f8f8a, 0xc98a2a].map(col3);
const TRIMS = [0xf6f1e4, 0xffffff, 0xe9dcc0];

function buildFacades(map, mbTrim, mbGlass, mbRoof, mbPlaster, theme, wallColorOf) {
  const solid = map.solid;
  const B = map.bounds;
  for (const b of map.boxes) {
    if (!b.facade) continue;
    const r = rng(b.id * 977 + 13);
    const h = b.max[1];
    const wallCol = wallColorOf(b);
    const trimCol = col3(TRIMS[Math.floor(r() * TRIMS.length)]);
    const bandCol = mulc(col3(['#2e5d8a', '#7a4a2a', '#2f6f4e', '#a83a32', '#5b5b5b'][Math.floor(r() * 5)]), 1);
    const shutter = SHUTTERS[Math.floor(r() * SHUTTERS.length)];
    const isChurch = b.church && !b.mirrored;
    for (const fi of [0, 1, 4, 5]) {
      const F = FACES[fi];
      const ax = F.n[0] ? 0 : 2;
      const plane = F.n[ax] > 0 ? b.max[ax] : b.min[ax];
      if (Math.abs(plane) >= B.maxX - 0.01) continue; // encostado na muralha
      const along = ax === 0 ? 2 : 0;
      const a0 = b.min[along], a1 = b.max[along];
      // trechos expostos
      const spans = [];
      let cur = null;
      for (let s = a0 + 0.25; s <= a1 - 0.25 + 1e-6; s += 0.5) {
        const p = [0, 1.3, 0]; p[ax] = plane + F.n[ax] * 0.7; p[along] = s;
        const p2 = [...p]; p2[1] = 0.3;
        const free = !insideAny(p, solid, b) && !insideAny(p2, solid, b) && Math.abs(p[0]) < B.maxX && Math.abs(p[2]) < B.maxZ;
        if (free) { if (!cur) cur = [s - 0.25, s + 0.25]; else cur[1] = s + 0.25; }
        else if (cur) { spans.push(cur); cur = null; }
      }
      if (cur) spans.push(cur);
      if (!spans.length) continue;
      const out = (d) => plane + F.n[ax] * d;
      const mk = (s0, s1, y0, y1, d0, d1) => {
        const mn = [0, y0, 0], mx = [0, y1, 0];
        mn[along] = s0; mx[along] = s1;
        const o0 = out(d0), o1 = out(d1);
        mn[ax] = Math.min(o0, o1); mx[ax] = Math.max(o0, o1);
        return [mn, mx];
      };
      const skipBack = (fiBack) => (f) => f === fiBack || f === 3;
      const back = fi ^ 1;
      // cornija no topo (face inteira)
      {
        const [mn, mx] = mk(a0 - 0.12, a1 + 0.12, h - 0.32, h + 0.06, 0, 0.16);
        addBox(mbTrim, mn, mx, { su: 2, color: trimCol, skip: skipBack(back) });
      }
      for (const [s0, s1] of spans) {
        // barra pintada na base
        const [bm, bx] = mk(s0, s1, 0, 0.55, 0, 0.03);
        addBox(mbTrim, bm, bx, { su: 2, color: bandCol, skip: skipBack(back) });
        const len = s1 - s0;
        if (len < 1.6 || b.mat === 'brick' && r() < 0.3) continue;
        const nSlots = Math.max(1, Math.floor(len / 3.2));
        const step = len / nSlots;
        for (let k = 0; k < nSlots; k++) {
          const c = s0 + step * (k + 0.5);
          if (isChurch) continue;
          const door = r() < 0.32 && len > 2.5;
          if (door) {
            let [m1, x1] = mk(c - 0.72, c + 0.72, 0, 2.55, 0, 0.06);
            addBox(mbTrim, m1, x1, { su: 2, color: trimCol, skip: skipBack(back) });
            [m1, x1] = mk(c - 0.58, c + 0.58, 0, 2.38, 0, 0.09);
            addBox(mbTrim, m1, x1, { su: 1, color: mulc(shutter, 0.9), skip: skipBack(back) });
            [m1, x1] = mk(c - 0.02, c + 0.02, 0, 2.38, 0, 0.1);
            addBox(mbTrim, m1, x1, { su: 1, color: mulc(shutter, 0.5), skip: skipBack(back) });
          } else {
            addWindow(mbTrim, mbGlass, mk, c, 1.05, 2.25, trimCol, shutter, back);
          }
          if (h >= 5.4) addWindow(mbTrim, mbGlass, mk, c, 3.1, 4.3, trimCol, shutter, back);
        }
      }
      if (isChurch && fi === 4) buildChurchFront(mbTrim, mbGlass, mbPlaster, b, plane, wallCol, trimCol);
    }
    // telhado de telhas (casas menores) ou platibanda
    const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
    if (!isChurch && w * d < 170 && b.mat !== 'brick') buildRoof(mbRoof, mbPlaster, b, wallCol);
    else {
      // platibanda (mureta) no topo
      const t = 0.18, ph = 0.5;
      const cc = mulc(wallCol, 0.95);
      addBox(mbPlaster, [b.min[0], h, b.min[2]], [b.max[0], h + ph, b.min[2] + t], { su: 4, sv: 8, color: cc });
      addBox(mbPlaster, [b.min[0], h, b.max[2] - t], [b.max[0], h + ph, b.max[2]], { su: 4, sv: 8, color: cc });
      addBox(mbPlaster, [b.min[0], h, b.min[2]], [b.min[0] + t, h + ph, b.max[2]], { su: 4, sv: 8, color: cc });
      addBox(mbPlaster, [b.max[0] - t, h, b.min[2]], [b.max[0], h + ph, b.max[2]], { su: 4, sv: 8, color: cc });
    }
  }
}

function addWindow(mbTrim, mbGlass, mk, c, y0, y1, trimCol, shutter, back) {
  const skip = (f) => f === back || f === 3;
  let [m, x] = mk(c - 0.62, c + 0.62, y0 - 0.08, y1 + 0.08, 0, 0.06);
  addBox(mbTrim, m, x, { su: 2, color: trimCol, skip });
  [m, x] = mk(c - 0.5, c + 0.5, y0, y1, 0, 0.075);
  addBox(mbGlass, m, x, { su: 1, color: col3(0x3a4c5c), skip });
  [m, x] = mk(c - 0.02, c + 0.02, y0, y1, 0, 0.09);
  addBox(mbTrim, m, x, { su: 1, color: trimCol, skip });
  // venezianas abertas
  [m, x] = mk(c - 1.12, c - 0.64, y0, y1, 0, 0.05);
  addBox(mbTrim, m, x, { su: 1, color: shutter, skip });
  [m, x] = mk(c + 0.64, c + 1.12, y0, y1, 0, 0.05);
  addBox(mbTrim, m, x, { su: 1, color: shutter, skip });
  // peitoril
  [m, x] = mk(c - 0.72, c + 0.72, y0 - 0.18, y0 - 0.06, 0, 0.17);
  addBox(mbTrim, m, x, { su: 2, color: trimCol, skip });
}

function buildRoof(mbRoof, mbPlaster, b, wallCol) {
  const h = b.max[1];
  const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
  const alongX = w >= d;
  const ov = 0.35;
  const span = alongX ? d : w;
  const rise = Math.min(2.2, span * 0.28);
  const x0 = b.min[0] - ov, x1 = b.max[0] + ov, z0 = b.min[2] - ov, z1 = b.max[2] + ov;
  const roofC = col3(0xffffff);
  const su = 2;
  if (alongX) {
    const zm = (b.min[2] + b.max[2]) / 2;
    const A = [x0, h - 0.1, z0], Bp = [x1, h - 0.1, z0], C = [x1, h + rise, zm], D = [x0, h + rise, zm];
    const n1 = new THREE.Vector3(0, span / 2, -rise).normalize();
    mbRoof.quad([A, Bp, C, D], [n1.x, n1.y, n1.z], [[x0 / su, 0], [x1 / su, 0], [x1 / su, (span / 2 + ov) / su], [x0 / su, (span / 2 + ov) / su]], [roofC]);
    const E = [x1, h - 0.1, z1], F = [x0, h - 0.1, z1];
    mbRoof.quad([E, F, D, C], [n1.x, n1.y, -n1.z], [[x1 / su, 0], [x0 / su, 0], [x0 / su, (span / 2 + ov) / su], [x1 / su, (span / 2 + ov) / su]], [roofC]);
    // empenas
    const gc = mulc(wallCol, 0.92);
    mbPlaster.tri([[b.min[0], h, b.max[2]], [b.min[0], h, b.min[2]], [b.min[0], h + rise - 0.05, zm]], [-1, 0, 0], [[b.max[2] / 4, h / 8], [b.min[2] / 4, h / 8], [zm / 4, (h + rise) / 8]], gc);
    mbPlaster.tri([[b.max[0], h, b.min[2]], [b.max[0], h, b.max[2]], [b.max[0], h + rise - 0.05, zm]], [1, 0, 0], [[b.min[2] / 4, h / 8], [b.max[2] / 4, h / 8], [zm / 4, (h + rise) / 8]], gc);
    // parte de baixo dos beirais
    mbRoof.quad([Bp, A, [x0, h - 0.1, b.min[2]], [x1, h - 0.1, b.min[2]]], [0, -1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [mulc(roofC, 0.5)]);
    mbRoof.quad([F, E, [x1, h - 0.1, b.max[2]], [x0, h - 0.1, b.max[2]]], [0, -1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [mulc(roofC, 0.5)]);
  } else {
    const xm = (b.min[0] + b.max[0]) / 2;
    const A = [x1, h - 0.1, z0], Bp = [x1, h - 0.1, z1], C = [xm, h + rise, z1], D = [xm, h + rise, z0];
    const n1 = new THREE.Vector3(rise, span / 2, 0).normalize();
    mbRoof.quad([A, Bp, C, D], [n1.x, n1.y, n1.z], [[z0 / su, 0], [z1 / su, 0], [z1 / su, (span / 2 + ov) / su], [z0 / su, (span / 2 + ov) / su]], [roofC]);
    const E = [x0, h - 0.1, z1], F = [x0, h - 0.1, z0];
    mbRoof.quad([E, F, D, C], [-n1.x, n1.y, n1.z], [[z1 / su, 0], [z0 / su, 0], [z0 / su, (span / 2 + ov) / su], [z1 / su, (span / 2 + ov) / su]], [roofC]);
    const gc = mulc(wallCol, 0.92);
    mbPlaster.tri([[b.min[0], h, b.min[2]], [b.max[0], h, b.min[2]], [xm, h + rise - 0.05, b.min[2]]], [0, 0, -1], [[b.min[0] / 4, h / 8], [b.max[0] / 4, h / 8], [xm / 4, (h + rise) / 8]], gc);
    mbPlaster.tri([[b.max[0], h, b.max[2]], [b.min[0], h, b.max[2]], [xm, h + rise - 0.05, b.max[2]]], [0, 0, 1], [[b.max[0] / 4, h / 8], [b.min[0] / 4, h / 8], [xm / 4, (h + rise) / 8]], gc);
    mbRoof.quad([Bp, A, [b.max[0], h - 0.1, z0], [b.max[0], h - 0.1, z1]], [0, -1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [mulc(roofC, 0.5)]);
    mbRoof.quad([F, E, [b.min[0], h - 0.1, z1], [b.min[0], h - 0.1, z0]], [0, -1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [mulc(roofC, 0.5)]);
  }
}

function buildChurchFront(mbTrim, mbGlass, mbPlaster, b, plane, wallCol, trimCol) {
  const x0 = b.min[0], x1 = -9; // a torre ocupa o canto leste
  const cx = (x0 + x1) / 2;
  const h = b.max[1];
  const z = plane;
  const sk = (f) => f === 5 || f === 3;
  // portal
  addBox(mbTrim, [cx - 1.6, 0, z], [cx + 1.6, 3.9, z + 0.12], { su: 2, color: trimCol, skip: sk });
  addBox(mbTrim, [cx - 1.15, 0, z], [cx + 1.15, 3.4, z + 0.16], { su: 1, color: col3(0x5a3820), skip: sk });
  addBox(mbTrim, [cx - 0.03, 0, z], [cx + 0.03, 3.4, z + 0.18], { su: 1, color: col3(0x3a2414), skip: sk });
  // rosácea
  const ring = new THREE.Matrix4().compose(new THREE.Vector3(cx, 5.4, z + 0.08), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  mbTrim.geo(new THREE.TorusGeometry(0.85, 0.12, 6, 24), ring, trimCol);
  mbGlass.geo(new THREE.CircleGeometry(0.8, 20), new THREE.Matrix4().makeTranslation(cx, 5.4, z + 0.07), col3(0x2d4a7a));
  // pilastras
  for (const px of [x0 + 0.3, x1 - 0.3, cx - 2.6, cx + 2.6]) addBox(mbTrim, [px - 0.25, 0, z], [px + 0.25, h, z + 0.14], { su: 2, color: trimCol, skip: sk });
  // frontão triangular
  const rise = 2.6;
  const zz = z + 0.01;
  mbPlaster.tri([[x0, h, zz], [x1, h, zz], [cx, h + rise, zz]], [0, 0, 1], [[x0 / 4, h / 8], [x1 / 4, h / 8], [cx / 4, (h + rise) / 8]], wallCol);
  mbPlaster.tri([[x1, h, b.min[2]], [x0, h, b.min[2]], [cx, h + rise, b.min[2]]], [0, 0, -1], [[0, 0], [1, 0], [0.5, 1]], wallCol);
  const roofN = new THREE.Vector3(0, 1, 0);
  mbPlaster.quad([[x0, h, zz], [cx, h + rise, zz], [cx, h + rise, b.min[2]], [x0, h, b.min[2]]], [-0.6, 0.8, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [mulc(wallCol, 0.8)]);
  mbPlaster.quad([[cx, h + rise, zz], [x1, h, zz], [x1, h, b.min[2]], [cx, h + rise, b.min[2]]], [0.6, 0.8, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [mulc(wallCol, 0.8)]);
  addBox(mbTrim, [cx - 0.08, h + rise - 0.1, z - 0.1], [cx + 0.08, h + rise + 1.1, z + 0.06], { su: 1, color: trimCol });
  addBox(mbTrim, [cx - 0.4, h + rise + 0.55, z - 0.1], [cx + 0.4, h + rise + 0.71, z + 0.06], { su: 1, color: trimCol });
  void roofN;
}

function buildTower(mbTrim, mbGlass, mbRoof, b, p) {
  const { x, z } = p;
  const s = p.s / 2;
  const top = b.max[1];
  const trimCol = col3(0xffffff);
  // cornijas
  for (const y of [7.2, 10.6, top - 0.25]) addBox(mbTrim, [x - s - 0.15, y, z - s - 0.15], [x + s + 0.15, y + 0.35, z + s + 0.15], { su: 2, color: trimCol });
  // aberturas do campanário
  for (const fi of [0, 1, 4, 5]) {
    const F = FACES[fi];
    const ax = F.n[0] ? 0 : 2, along = ax === 0 ? 2 : 0;
    const plane = (ax === 0 ? x : z) + F.n[ax] * s;
    const c = ax === 0 ? z : x;
    const mn = [0, 11.4, 0], mx = [0, 14.0, 0];
    mn[along] = c - 0.8; mx[along] = c + 0.8;
    mn[ax] = Math.min(plane, plane + F.n[ax] * 0.05); mx[ax] = Math.max(plane, plane + F.n[ax] * 0.05);
    addBox(mbGlass, mn, mx, { su: 1, color: col3(0x15100c) });
    const m2 = [...mn], x2 = [...mx]; m2[along] = c - 1.0; x2[along] = c + 1.0; m2[1] = 11.2; x2[1] = 14.2;
    m2[ax] = Math.min(plane, plane + F.n[ax] * 0.03); x2[ax] = Math.max(plane, plane + F.n[ax] * 0.03);
    addBox(mbTrim, m2, x2, { su: 1, color: trimCol, skip: (f) => f === (fi ^ 1) });
  }
  // telhado piramidal + cruz
  const cone = new THREE.ConeGeometry(s * 1.5, 3.2, 4, 1);
  mbRoof.geo(cone, new THREE.Matrix4().compose(new THREE.Vector3(x, top + 1.6, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4), new THREE.Vector3(1, 1, 1)), [1, 1, 1], 4);
  addBox(mbTrim, [x - 0.07, top + 3.0, z - 0.07], [x + 0.07, top + 4.4, z + 0.07], { su: 1, color: col3(0xe8d8a0) });
  addBox(mbTrim, [x - 0.45, top + 3.85, z - 0.07], [x + 0.45, top + 4.0, z + 0.07], { su: 1, color: col3(0xe8d8a0) });
  // sino
  const bell = new THREE.LatheGeometry([new THREE.Vector2(0.02, 0.55), new THREE.Vector2(0.2, 0.5), new THREE.Vector2(0.26, 0.25), new THREE.Vector2(0.42, 0)], 14);
  mbGlass.geo(bell, new THREE.Matrix4().makeTranslation(x, 12.1, z), col3(0xb8862b));
}

// ------------------------------------------------------------------ céu e ambiente
function makeSky(theme) {
  const sunDir = new THREE.Vector3(...theme.sun.dir).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.sky.top) }, horizon: { value: new THREE.Color(theme.sky.horizon) },
      bottom: { value: new THREE.Color(theme.sky.bottom) }, sunDir: { value: sunDir },
      uTime: { value: 0 }, cover: { value: theme.clouds ?? 0.5 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vDir = normalize(wp.xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float uTime; uniform float cover; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      void main(){ vec3 d = normalize(vDir); float h = d.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.4), 0.55)) : mix(horizon, bottom, min(1.0, -h * 4.0));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
        if (h > 0.0) {
          // nuvens procedurais numa camada plana, mais finas perto do horizonte
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
          float n = fbm(uv);
          float cl = smoothstep(1.0 - cover, 1.0 - cover + 0.35, n) * smoothstep(0.0, 0.25, h);
          vec3 cc = mix(vec3(0.96, 0.95, 0.93), horizon * 0.9, 0.25) * (0.82 + 0.25 * fbm(uv * 2.0 + 3.0));
          cc += vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.5;
          c = mix(c, cc, cl * 0.85);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

function makeMountains() {
  const mb = new MeshBuilder();
  const segs = 140;
  const r = rng(4242);
  const heights = [];
  for (let i = 0; i < segs; i++) heights.push(r());
  const smooth = heights.map((_, i) => {
    let s = 0; for (let k = -3; k <= 3; k++) s += heights[(i + k + segs) % segs] * (4 - Math.abs(k));
    return s / 16;
  });
  const rings = [{ rad: 170, h: 0 }, { rad: 215, h: 1 }, { rad: 280, h: 0.4 }, { rad: 360, h: 0 }];
  const ring = (i, k) => {
    const a = (i / segs) * Math.PI * 2;
    const rr = rings[k];
    const hh = rr.h * (18 + smooth[i % segs] * 55 + Math.sin(a * 3) * 8);
    return [Math.cos(a) * rr.rad, hh - 2, Math.sin(a) * rr.rad];
  };
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < rings.length - 1; k++) {
      const a = ring(i, k), b = ring(i + 1, k), c = ring(i + 1, k + 1), d = ring(i, k + 1);
      const shade = 0.75 + smooth[i] * 0.3;
      const col = mulc(col3(k === 0 ? 0xb58a5a : 0x8f7a6a), shade);
      const v1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), v2 = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      const n = v2.clone().cross(v1).normalize();
      if (n.y < 0) n.negate();
      mb.quad([a, d, c, b], [n.x, n.y, n.z], [[0, 0], [0, 1], [1, 1], [1, 0]], [col]);
    }
  }
  const g = mb.build();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
  return m;
}

function makeClouds(tex) {
  const g = new THREE.Group();
  const r = rng(99);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.SpriteMaterial({ map: tex.smoke, color: 0xffffff, transparent: true, opacity: 0.55 + r() * 0.3, fog: false, depthWrite: false });
    const s = new THREE.Sprite(m);
    const a = r() * Math.PI * 2, d = 260 + r() * 200;
    s.position.set(Math.cos(a) * d, 90 + r() * 70, Math.sin(a) * d);
    s.scale.set(120 + r() * 120, 40 + r() * 30, 1);
    s.renderOrder = -9;
    g.add(s);
  }
  return g;
}

// ------------------------------------------------------------------ montagem principal
export function buildWorld(scene, map, qualityCfg) {
  const tex = getTextures();
  const mats = makeMaterials(tex);
  const theme = map.theme;
  const group = new THREE.Group();
  group.name = 'world';
  const windU = { uTime: { value: 0 } };
  addWind(mats.foliage, windU, 0.22);
  addWind(mats.cloth, windU, 0.12);

  const tints = theme.tints.map(col3);
  const wallColorOf = (b) => {
    if (b.mat !== 'plaster' && b.mat !== 'metal') return WHITE;
    const t = b.tint ?? 0;
    return tints[(b.mirrored ? t + 3 : t) % tints.length];
  };

  const MB = {};
  const mbOf = (k) => (MB[k] = MB[k] || new MeshBuilder());
  const solid = map.solid;

  const lamps = [];
  // ---------------- caixas do mapa
  const barrelBoxes = [];
  for (const b of map.boxes) {
    if (b.hidden || b.floor) continue;
    if (b.shape === 'barrel') { barrelBoxes.push(b); continue; }
    if (b.shape === 'cart') continue;
    if (b.tank) continue;
    let key = b.mat, o = { ao: true, sub: 1.6 };
    switch (b.mat) {
      case 'plaster': o = { ...o, su: 4, sv: 8, color: wallColorOf(b) }; break;
      case 'stone': o = { ...o, su: 2, sv: 2, color: WHITE }; break;
      case 'wall': o = { ...o, su: 3, sv: 3, color: WHITE }; break;
      case 'brick': o = { ...o, su: 2, sv: 2, color: WHITE }; break;
      case 'concrete': o = { ...o, su: 2, sv: 2, color: WHITE }; break;
      case 'wood': o = { ...o, su: 2, sv: 2, color: WHITE }; break;
      case 'crate': o = { faceUV: true, sub: 0, color: mulc(WHITE, 0.92 + ((b.id * 37) % 10) / 60) }; break;
      case 'door': o = { faceUV: true, color: col3(['#2e5d8a', '#2f6f4e', '#8a3a2e'][b.id % 3]) }; break;
      case 'metal': o = { su: 2, sv: 2, color: b.tint != null ? wallColorOf(b) : col3(0x9aa0a6) }; break;
      default: key = 'plain'; o = { su: 2, color: WHITE };
    }
    const covered = [];
    for (let fi = 0; fi < 6; fi++) covered[fi] = (fi === 3 && b.min[1] < 0.01) || faceCovered(b, fi, solid);
    o.skip = (fi) => covered[fi];
    addBox(mbOf(key), b.min, b.max, o);
  }

  // ---------------- chão (grade com variação e oclusão de contato)
  {
    const gkey = theme.ground || 'ground';
    const mb = mbOf(gkey === 'ground' ? 'ground' : 'floor_' + gkey);
    const B = map.bounds, N = 1;
    const x0 = B.minX - 3, x1 = B.maxX + 3, z0 = B.minZ - 3, z1 = B.maxZ + 3;
    const nx = Math.round((x1 - x0) / N), nz = Math.round((z1 - z0) / N);
    const blockers = solid.filter((b) => b.min[1] < 0.1 && b.max[1] > 0.5 && !b.floor);
    const vcol = [];
    const r = rng(7);
    const big = []; for (let i = 0; i < 64; i++) big.push(r());
    const lowNoise = (x, z) => {
      const fx = (x - x0) / (x1 - x0) * 7, fz = (z - z0) / (z1 - z0) * 7;
      const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const g = (i, j) => big[((i & 7) * 8 + (j & 7))];
      const a = g(ix, iz), b2 = g(ix + 1, iz), c = g(ix, iz + 1), d = g(ix + 1, iz + 1);
      const u = tx * tx * (3 - 2 * tx), v = tz * tz * (3 - 2 * tz);
      return a + (b2 - a) * u + (c - a) * v + (a - b2 - c + d) * u * v;
    };
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * N, z = z0 + j * N;
        let dmin = 9;
        for (const b of blockers) {
          const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
          const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
          const d = Math.sqrt(dx * dx + dz * dz) / Math.min(1, 0.4 + b.max[1] * 0.3);
          if (d < dmin) dmin = d;
        }
        const ao = 0.62 + 0.38 * Math.min(1, dmin / 1.4);
        const n = 0.88 + lowNoise(x, z) * 0.22;
        const gt = theme.groundTint || [1, 0.99, 0.97];
        vcol.push([ao * n * gt[0], ao * n * gt[1], ao * n * gt[2]]);
      }
    }
    const W = nx + 1;
    const su = gkey === 'ground' ? 6 : 4;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const xa = x0 + i * N, xb = xa + N, za = z0 + j * N, zb = za + N;
        const c00 = vcol[j * W + i], c10 = vcol[j * W + i + 1], c01 = vcol[(j + 1) * W + i], c11 = vcol[(j + 1) * W + i + 1];
        mb.quad([[xa, 0, zb], [xb, 0, zb], [xb, 0, za], [xa, 0, za]], [0, 1, 0],
          [[xa / su, -zb / su], [xb / su, -zb / su], [xb / su, -za / su], [xa / su, -za / su]], [c01, c11, c10, c00]);
      }
    }
  }

  // ---------------- barris (cilindros)
  const BARREL_COLS = [0x2e6fa8, 0xa83a32, 0x3f7f3a, 0xd9a521, 0x6b6b6b].map(col3);
  for (const b of barrelBoxes) {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, h = b.max[1] - b.min[1];
    const c = BARREL_COLS[(b.id * 7) % BARREL_COLS.length];
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, b.min[1] + h / 2, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.id), new THREE.Vector3(1, 1, 1));
    mbOf('barrel').geo(new THREE.CylinderGeometry(0.31, 0.31, h, 16), m, c);
  }

  // ---------------- caixa d'água
  for (const b of map.boxes.filter((x) => x.tank)) {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const rad = (b.max[0] - b.min[0]) / 2, h = b.max[1] - b.min[1];
    const c = wallColorOf(b);
    mbOf('metal').geo(new THREE.CylinderGeometry(rad, rad, h, 24), new THREE.Matrix4().makeTranslation(cx, b.min[1] + h / 2, cz), c);
    mbOf('metal').geo(new THREE.ConeGeometry(rad * 1.05, 1.0, 24), new THREE.Matrix4().makeTranslation(cx, b.max[1] + 0.5, cz), mulc(c, 0.8));
    addBox(mbOf('metal'), [b.min[0] - 0.2, b.min[1] - 0.15, b.min[2] - 0.2], [b.max[0] + 0.2, b.min[1], b.max[2] + 0.2], { su: 2, color: col3(0x777777) });
  }

  // ---------------- fachadas, telhados e torre
  if (qualityCfg.decor !== false || true) {
    buildFacades(map, mbOf('trim'), mbOf('glass'), mbOf('roof'), mbOf('plaster'), theme, wallColorOf);
  }

  // ---------------- decoração
  for (const p of map.props) {
    switch (p.type) {
      case 'palm': buildPalm(mbOf('plain'), mbOf('foliage'), p); break;
      case 'cactus': buildCactus(mbOf('plain'), p); break;
      case 'bunting': buildBunting(mbOf('plain'), mbOf('cloth'), p); break;
      case 'awning': buildAwning(mbOf('cloth'), mbOf('wood'), p, tex); break;
      case 'cart': buildCart(mbOf('wood'), mbOf('plain'), p); break;
      case 'tower': {
        const tb = map.boxes.find((b) => b.tower);
        if (tb) buildTower(mbOf('trim'), mbOf('glass'), mbOf('roof'), tb, p);
        break;
      }
      case 'pot': {
        const s = p.s || 1;
        const lathe = new THREE.LatheGeometry([0, 0.2, 0.32, 0.36, 0.3, 0.22, 0.24].map((r2, i) => new THREE.Vector2(r2 * s, i * 0.11 * s)), 14);
        mbOf('plain').geo(lathe, new THREE.Matrix4().makeTranslation(p.x, 0, p.z), col3(0xb5653a));
        break;
      }
      case 'lamp': {
        const dx = Math.sin(p.rot || 0), dz = Math.cos(p.rot || 0);
        addBox(mbOf('plain'), [p.x - 0.04, p.y, p.z - 0.04], [p.x + 0.04, p.y + 0.6, p.z + 0.04], { color: col3(0x222222) });
        const lx = p.x + dx * 0.45, lz = p.z + dz * 0.45;
        addBox(mbOf('plain'), [Math.min(p.x, lx) - 0.03, p.y + 0.55, Math.min(p.z, lz) - 0.03], [Math.max(p.x, lx) + 0.03, p.y + 0.6, Math.max(p.z, lz) + 0.03], { color: col3(0x222222) });
        addBox(mbOf(p.flicker ? 'bulbf' : 'bulb'), [lx - 0.13, p.y + 0.1, lz - 0.13], [lx + 0.13, p.y + 0.5, lz + 0.13], { color: WHITE });
        lamps.push({ x: lx + dx * 0.25, y: p.y + 0.3, z: lz + dz * 0.25, r: 9, i: 1.1, c: [1.0, 0.82, 0.55], flicker: !!p.flicker });
        break;
      }
      case 'clamp': {
        // lâmpada pendurada no teto: fio, cúpula metálica e lâmpada
        const y0 = p.y, hy = y0 - (p.drop || 0.7);
        addBox(mbOf('plain'), [p.x - 0.015, hy, p.z - 0.015], [p.x + 0.015, y0, p.z + 0.015], { color: col3(0x1a1a1a) });
        const cone = new THREE.CylinderGeometry(0.1, 0.32, 0.2, 12, 1, true);
        mbOf('metal').geo(cone, new THREE.Matrix4().makeTranslation(p.x, hy - 0.08, p.z), col3(p.shade || 0x3d5a46));
        mbOf('metal').geo(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), new THREE.Matrix4().makeTranslation(p.x, hy + 0.02, p.z), col3(p.shade || 0x3d5a46));
        mbOf(p.flicker ? 'bulbf' : 'bulb').geo(new THREE.SphereGeometry(0.075, 10, 8), new THREE.Matrix4().makeTranslation(p.x, hy - 0.15, p.z), WHITE);
        lamps.push({ x: p.x, y: hy - 0.25, z: p.z, r: p.r || 11, i: p.i || 1.5, c: [1.0, 0.86, 0.62], flicker: !!p.flicker });
        break;
      }
      default: break;
    }
  }

  // ---------------- placas nas paredes e fios
  const seed = [...map.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  addSigns(mbOf('signs'), map, seed, qualityCfg.decor ? 1 : 0.5);
  if (map.id !== 'sertao') addCables(mbOf('plain'), map, seed, qualityCfg.decor ? 12 : 5);

  // ---------------- cria as malhas (com iluminação pré-calculada)
  const meshes = [];
  const bakeT0 = performance.now();
  const occ = new OccGrid(map.boxes, map.bounds);
  const bakeCache = new Map();
  const lightU = { uFlick: { value: 1 }, uNoShadowSky: { value: qualityCfg.shadows ? 0 : 1 } };
  const baked = new Set();
  for (const [k, mb] of Object.entries(MB)) {
    const g = mb.build();
    if (!g) continue;
    if (k !== 'bulb' && k !== 'bulbf') {
      const { sky, lc } = bakeGeometry(g, occ, lamps, bakeCache);
      g.setAttribute('skyv', new THREE.Float32BufferAttribute(sky, 1));
      g.setAttribute('lampc', new THREE.Float32BufferAttribute(lc, 4));
    }
    const mat = k.startsWith('floor_') ? mats[k.slice(6)] : (mats[k] || mats.plain);
    if (k !== 'bulb' && k !== 'bulbf' && !baked.has(mat)) { installBakedLighting(mat, lightU); baked.add(mat); }
    const m = new THREE.Mesh(g, mat);
    m.castShadow = k !== 'ground' && k !== 'cloth' && !k.startsWith('floor_');
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    meshes.push(m);
  }
  // luz emissiva das lanternas
  mats.glass.emissive = new THREE.Color(0x000000);
  const lightGrid = buildLightGrid(occ, lamps, map.bounds);
  console.log(`iluminação pré-calculada em ${(performance.now() - bakeT0).toFixed(0)} ms (${lamps.length} lâmpadas, ${bakeCache.size} pontos)`);
  // entulho, papéis e grama (instanciados; só qualidade média ou maior)
  const scatter = buildScatter(map, theme, qualityCfg, (x, y, z, o) => lightGrid.sample(x, y, z, o), windU);
  group.add(scatter);
  // halo das lâmpadas
  const haloMat = new THREE.SpriteMaterial({ map: tex.soft, color: 0xffcf8a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloMatF = haloMat.clone();
  for (const L of lamps) {
    const h = new THREE.Sprite(L.flicker ? haloMatF : haloMat);
    h.position.set(L.x, L.y + 0.1, L.z);
    h.scale.setScalar(1.1);
    group.add(h);
  }

  // água do chafariz
  for (const p of map.props.filter((q) => q.type === 'water')) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(p.s, p.s), new THREE.MeshStandardMaterial({ color: 0x3f8fb0, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.85 }));
    w.rotation.x = -Math.PI / 2;
    w.position.set(p.x, p.y, p.z);
    group.add(w);
  }

  // ---------------- céu, montanhas, nuvens
  const sky = makeSky(theme);
  group.add(sky);
  group.add(makeMountains());
  void makeClouds;

  // ---------------- luzes
  const hemi = new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  const sd = new THREE.Vector3(...theme.sun.dir).normalize();
  sun.position.copy(sd.clone().multiplyScalar(120));
  sun.target.position.set(0, 0, 0);
  sun.castShadow = !!qualityCfg.shadows;
  sun.shadow.mapSize.set(qualityCfg.shadowSize || 2048, qualityCfg.shadowSize || 2048);
  const sc = sun.shadow.camera;
  sc.left = -66; sc.right = 66; sc.top = 66; sc.bottom = -66; sc.near = 20; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  group.add(sun, sun.target);
  const amb = new THREE.AmbientLight(0xffffff, 0.12);
  group.add(amb);

  scene.add(group);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
  scene.background = new THREE.Color(theme.fog.color);

  // mapa de ambiente (reflexos do céu para metais)
  const makeEnvironment = (renderer) => {
    const envScene = new THREE.Scene();
    const sky2 = makeSky(theme);
    sky2.scale.setScalar(50 / 600);
    envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(45, 32), new THREE.MeshBasicMaterial({ color: 0xc9a46c }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -3;
    envScene.add(ground);
    const wallsMat = new THREE.MeshBasicMaterial({ color: 0xd9c9a8, side: THREE.BackSide });
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 8, 24, 1, true), wallsMat);
    walls.position.y = 1;
    envScene.add(walls);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    pmrem.dispose();
    return rt.texture;
  };

  const dispose = () => {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(mats)) m.dispose();
  };
  return {
    group, sun, sky, meshes, makeEnvironment, dispose,
    update(t, camPos) {
      windU.uTime.value = t;
      sky.material.uniforms.uTime.value = t;
      sky.position.copy(camPos);
      // lâmpadas que piscam: ruído com quedas curtas
      const n = Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.7) + Math.sin(t * 29.7) * 0.3;
      const drop = (Math.sin(t * 0.9) > 0.82 && Math.sin(t * 23) > 0) || (Math.sin(t * 0.37 + 2) > 0.95);
      const f = drop ? 0.08 : 0.82 + n * 0.12;
      lightU.uFlick.value = f;
      mats.bulbf.color.setRGB(1 * f + 0.05, 0.89 * f + 0.04, 0.66 * f + 0.03);
      haloMatF.opacity = 0.55 * f;
    },
    lightAt(x, y, z, out) { return lightGrid.sample(x, y, z, out); },
    lamps,
    setShadows(cfg) {
      lightU.uNoShadowSky.value = cfg.shadows ? 0 : 1;
      sun.castShadow = !!cfg.shadows;
      if (cfg.shadows && sun.shadow.mapSize.x !== cfg.shadowSize) {
        sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
    },
  };
}
