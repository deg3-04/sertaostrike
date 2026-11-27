// Modelos 3D procedurais: armas (primeira e terceira pessoa) e personagens
// com animação simples (andar, agachar, mirar, morrer).
import * as THREE from '/lib/three.js';
import { installDynamicLighting } from './lighting.js';
import { mergeGeometries } from '/lib/three.js';
import { WEAPONS } from '/shared/weapons.js';

// ------------------------------------------------------------------ materiais das armas
const MAT_DEF = {
  metal:  { color: 0x34373d, metalness: 0.75, roughness: 0.42 },
  black:  { color: 0x1d1e21, metalness: 0.15, roughness: 0.62 },
  wood:   { color: 0xa65a2a, metalness: 0.0, roughness: 0.55 },
  tan:    { color: 0xb59a6a, metalness: 0.05, roughness: 0.7 },
  olive:  { color: 0x4f5e36, metalness: 0.05, roughness: 0.7 },
  aug:    { color: 0x5d6b4c, metalness: 0.05, roughness: 0.6 },
  gray:   { color: 0x4b4f57, metalness: 0.3, roughness: 0.5 },
  silver: { color: 0xc4c7cc, metalness: 0.9, roughness: 0.22 },
  lens:   { color: 0x2b6fd6, metalness: 0.9, roughness: 0.05, emissive: 0x0a1a40 },
  brass:  { color: 0xc9a13b, metalness: 0.85, roughness: 0.3 },
  orange: { color: 0x8a4a1c, metalness: 0.05, roughness: 0.55 },
  grip:   { color: 0x262626, metalness: 0.0, roughness: 0.9 },
  nade:   { color: 0x4d5a34, metalness: 0.2, roughness: 0.6 },
  nadeg:  { color: 0x8b9097, metalness: 0.5, roughness: 0.45 },
  smoke:  { color: 0x4b5446, metalness: 0.2, roughness: 0.6 },
  white:  { color: 0xe8e8e8, metalness: 0.1, roughness: 0.6 },
  red:    { color: 0xa0221c, metalness: 0.1, roughness: 0.6 },
};
let FP_MATS = null;
export function weaponMaterials() {
  if (FP_MATS) return FP_MATS;
  FP_MATS = {};
  const tex = makeGunTextures();
  for (const [k, d] of Object.entries(MAT_DEF)) {
    const extra = k === 'wood' ? { map: tex.wood, roughnessMap: tex.rough }
      : k === 'lens' ? {} : { map: tex.color, roughnessMap: tex.rough };
    FP_MATS[k] = new THREE.MeshStandardMaterial({ ...d, ...extra, emissive: d.emissive || 0x000000 });
  }
  return FP_MATS;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Texturas pequenas geradas na hora (veio da madeira, desgaste do metal e do
// plástico). Uma de cada, compartilhadas por todas as armas.
function makeGunTextures() {
  const mk = (w, h, draw, srgb) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  let seed = 9173;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // desgaste: manchas suaves + pontinhos (cor e rugosidade)
  const grime = (ctx, w, h, lo, hi) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (Math.sin(x * 0.45 + Math.sin(y * 0.3) * 2) + Math.sin(y * 0.38 + x * 0.11)) * 0.25 + 0.5;
      const v = lo + (hi - lo) * (n * 0.35 + rnd() * 0.65);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  const color = mk(64, 64, (ctx, w, h) => grime(ctx, w, h, 228, 255), true);
  const rough = mk(64, 64, (ctx, w, h) => grime(ctx, w, h, 185, 255), false);
  // madeira: veios ao longo do eixo u (comprimento da arma)
  const wood = mk(128, 128, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const ring = Math.sin(y * 1.3 + Math.sin(y * 0.11) * 4);
      for (let x = 0; x < w; x++) {
        const wav = Math.sin((y + Math.sin(x * 0.035) * 5) * 1.6);
        const v = 205 + wav * 11 + ring * 6 + (rnd() - 0.5) * 14;
        const i = (y * w + x) * 4;
        img.data[i] = Math.min(255, v + 18); img.data[i + 1] = v; img.data[i + 2] = Math.max(0, v - 22); img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, true);
  return { color, rough, wood };
}

class Parts {
  constructor() { this.list = []; this.groups = {}; }
  add(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, group = 'main') {
    const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1));
    this.list.push({ geo, mat, m, group });
    return this;
  }
  // caixa com cantos chanfrados (peças muito finas ficam retas)
  box(mat, w, h, d, x, y, z, rx, ry, rz, group) {
    const c = Math.min(w, h, d) * 0.16;
    const geo = c < 0.0016 || d - 2 * c <= 0.002 ? new THREE.BoxGeometry(w, h, d) : chamferBox(w, h, d, Math.min(c, 0.005));
    return this.add(geo, mat, x, y, z, rx, ry, rz, group);
  }
  sharp(mat, w, h, d, x, y, z, rx, ry, rz, group) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz, group); }
  // cilindro ao longo de z (padrão), x ou y
  cyl(mat, r1, r2, len, x, y, z, axis = 'z', segs = 12, group) {
    const g = new THREE.CylinderGeometry(r1, r2, len, segs);
    if (axis === 'z') g.rotateX(-Math.PI / 2);
    else if (axis === 'x') g.rotateZ(Math.PI / 2);
    return this.add(g, mat, x, y, z, 0, 0, 0, group);
  }
  // perfil lateral: pontos [z, y] (vista de lado) engrossados ao longo de x;
  // holes: lista de furos no mesmo formato (buraco do polegar, guarda-mato)
  prof(mat, pts, thick, x = 0, group = 'main', holes = null, bevel) {
    const b = bevel ?? Math.min(0.003, thick * 0.18);
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
    if (holes) for (const hp of holes) sh.holes.push(new THREE.Path(hp.map(([z, y]) => new THREE.Vector2(-z, y))));
    const depth = Math.max(0.001, thick - 2 * b);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.7, bevelSegments: 1, curveSegments: 3 });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    return this.add(g, mat, x, 0, 0, 0, 0, 0, group);
  }
  // trilho picatinny: base + dentes
  rail(mat, y, z0, z1, w = 0.026) {
    this.sharp(mat, w, 0.008, z1 - z0, 0, y, (z0 + z1) / 2);
    for (let z = z0 + 0.006; z < z1 - 0.004; z += 0.016) this.sharp(mat, w + 0.006, 0.006, 0.007, 0, y + 0.006, z);
    return this;
  }
  // guarda-mato em "U" e gatilho, à frente da empunhadura
  guard(mat, y, zFront, zBack, depth = 0.032, w = 0.012) {
    this.sharp(mat, w, 0.006, zBack - zFront, 0, y - depth, (zFront + zBack) / 2);
    this.sharp(mat, w, depth, 0.006, 0, y - depth / 2, zFront);
    this.box('black', 0.006, depth * 0.65, 0.008, 0, y - depth * 0.35, zFront + (zBack - zFront) * 0.45, 0.25);
    return this;
  }
  // serrilhado do ferrolho (dos dois lados)
  serr(mat, xHalf, y, z0, n, h, step = 0.0055) {
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) this.sharp(mat, 0.002, h, 0.0022, s * xHalf, y, z0 + i * step);
    return this;
  }
}

function chamferBox(w, h, d, c) {
  const a = w / 2 - c, b = h / 2 - c, k = Math.max(0.0004, Math.min(c * 0.9, a * 0.9, b * 0.9));
  const sh = new THREE.Shape([V2(-a + k, -b), V2(a - k, -b), V2(a, -b + k), V2(a, b - k), V2(a - k, b), V2(-a + k, b), V2(-a, b - k), V2(-a, -b + k)]);
  const depth = d - 2 * c;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function V2(x, y) { return new THREE.Vector2(x, y); }

// coordenadas de textura por projeção (mesma densidade em todas as peças;
// nas laterais o "u" corre ao longo do cano, para o veio da madeira)
function boxUV(g, S = 7) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax >= ay && ax >= az) { uv[i * 2] = z * S; uv[i * 2 + 1] = y * S; }
    else if (ay >= az) { uv[i * 2] = z * S; uv[i * 2 + 1] = x * S; }
    else { uv[i * 2] = x * S; uv[i * 2 + 1] = y * S; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------------ definições das armas
// Coordenadas: x = direita, y = cima, cano para -z. Medidas em metros.
function pistol(p, o) {
  // ferrolho (anda no tiro), serrilhado, miras
  const L = o.slideLen, z0 = o.slideFront, y0 = o.slideY, H = o.slideH, Wd = o.slideW;
  p.prof(o.slideMat, [[z0, y0], [z0, y0 + H - 0.006], [z0 + 0.006, y0 + H], [z0 + L, y0 + H], [z0 + L, y0]], Wd, 0, 'bolt');
  p.serr(o.serrMat || 'black', Wd / 2 + 0.0008, y0 + H * 0.5, z0 + L - 0.032, 6, H * 0.7);
  p.box('black', 0.005, 0.008, 0.007, 0, y0 + H + 0.004, z0 + 0.01, 0, 0, 0, 'bolt');
  p.box('black', 0.016, 0.008, 0.006, 0, y0 + H + 0.004, z0 + L - 0.012, 0, 0, 0, 'bolt');
  p.sharp('lens', 0.002, 0.002, 0.001, 0, y0 + H + 0.006, z0 + 0.0065, 0, 0, 0, 'bolt');
  // armação com guarda-mato e empunhadura inclinada
  const f = o.frameFront, gz = o.gripZ, gb = o.gripBottom;
  p.prof(o.frameMat, [
    [f, y0], [z0 + L - 0.004, y0], [z0 + L + 0.002, y0 - 0.02],
    [gz + 0.03, gb + 0.012], [gz + 0.022, gb], [gz - 0.018, gb], [gz - 0.024, -0.03],
    [gz - 0.07, -0.03], [gz - 0.082, y0 - 0.018], [f, y0 - 0.012],
  ], o.frameW, 0, 'main', [[[gz - 0.068, y0 - 0.02], [gz - 0.03, y0 - 0.02], [gz - 0.032, -0.024], [gz - 0.065, -0.024]]]);
  // gatilho
  p.box('black', 0.005, 0.016, 0.006, 0, -0.006, gz - 0.046, 0.3);
  // base do carregador
  p.box('black', o.frameW + 0.002, 0.01, 0.044, 0, gb - 0.004, gz + 0.006, -0.25, 0, 0, 'mag');
}

function defWeapon(id) {
  const p = new Parts();
  const info = { muzzle: V(0, 0.04, -0.6), eject: V(0.03, 0.05, -0.04), gripR: V(0, -0.03, 0.03), gripL: V(0, -0.01, -0.3), kind: 'rifle' };
  switch (id) {
    case 'ak47': {
      // caixa da culatra e tampa com nervuras
      p.prof('metal', [[-0.21, 0.0], [-0.21, 0.07], [0.09, 0.07], [0.095, 0.035], [0.06, 0.0]], 0.05);
      p.prof('metal', [[-0.205, 0.068], [-0.205, 0.082], [-0.02, 0.094], [0.085, 0.09], [0.095, 0.068]], 0.046);
      for (const z of [-0.12, -0.06, 0.0]) p.sharp('black', 0.047, 0.004, 0.006, 0, 0.09, z);
      p.box('metal', 0.03, 0.026, 0.06, 0, 0.088, -0.235);                        // alça de mira
      p.sharp('black', 0.024, 0.006, 0.02, 0, 0.102, -0.225);
      // guarda-mão de madeira (inferior com ranhuras e superior sobre o tubo de gás)
      p.prof('wood', [[-0.21, 0.066], [-0.21, 0.004], [-0.235, -0.006], [-0.405, 0.008], [-0.425, 0.028], [-0.425, 0.066]], 0.06);
      for (const s of [-1, 1]) for (const y of [0.025, 0.045]) p.sharp('black', 0.002, 0.005, 0.15, s * 0.0305, y, -0.32);
      p.cyl('metal', 0.011, 0.011, 0.25, 0, 0.088, -0.36);                          // tubo de gás
      p.box('wood', 0.04, 0.03, 0.16, 0, 0.09, -0.32);
      // cano, bloco de gás, massa de mira com orelhas e freio de boca inclinado
      p.cyl('metal', 0.0115, 0.0115, 0.54, 0, 0.045, -0.48);
      p.box('metal', 0.028, 0.05, 0.035, 0, 0.068, -0.48);
      p.box('metal', 0.026, 0.022, 0.028, 0, 0.055, -0.665).box('metal', 0.006, 0.03, 0.012, -0.009, 0.078, -0.665).box('metal', 0.006, 0.03, 0.012, 0.009, 0.078, -0.665);
      p.sharp('metal', 0.003, 0.02, 0.004, 0, 0.076, -0.665);
      p.cyl('metal', 0.017, 0.015, 0.06, 0, 0.045, -0.765, 'z', 10).sharp('black', 0.034, 0.012, 0.03, 0, 0.06, -0.78, 0.5);
      // empunhadura, guarda-mato, gatilho, seletor
      p.prof('wood', [[0.012, 0.002], [0.058, 0.002], [0.09, -0.098], [0.062, -0.112], [0.028, -0.02]], 0.036);
      p.guard('metal', 0.0, -0.04, 0.016, 0.032);
      p.box('metal', 0.004, 0.012, 0.11, 0.028, 0.04, -0.06, 0.12);
      // coronha com chapa
      p.prof('wood', [[0.09, 0.062], [0.09, 0.0], [0.4, -0.078], [0.4, 0.045], [0.15, 0.066]], 0.044);
      p.box('black', 0.048, 0.13, 0.016, 0, -0.016, 0.405, 0.24);
      // carregador curvo ("banana") com nervuras
      p.prof('orange', [[-0.152, 0.004], [-0.166, -0.08], [-0.2, -0.15], [-0.238, -0.2], [-0.19, -0.226], [-0.142, -0.162], [-0.11, -0.082], [-0.096, 0.004]], 0.036, 0, 'mag');
      for (const t of [0.3, 0.55, 0.8]) p.sharp('black', 0.038, 0.004, 0.035, 0, -0.03 - t * 0.17, -0.125 - t * 0.075, 0.3 + t * 0.4, 0, 0, 'mag');
      p.box('metal', 0.035, 0.012, 0.016, 0.035, 0.06, -0.02, 0, 0, 0, 'bolt');      // alavanca de manejo
      Object.assign(info, { muzzle: V(0, 0.045, -0.8), gripL: V(0, -0.005, -0.32), eject: V(0.03, 0.065, -0.06) });
      break;
    }
    case 'm4a1': {
      // receptor superior com trilho, inferior com alojamento do carregador
      p.prof('black', [[-0.18, 0.015], [-0.18, 0.078], [0.06, 0.078], [0.062, 0.03], [0.04, 0.015]], 0.05);
      p.rail('black', 0.084, -0.18, 0.06);
      p.prof('black', [[-0.135, 0.017], [-0.135, -0.01], [-0.12, -0.032], [-0.04, -0.032], [0.0, -0.012], [0.055, -0.008], [0.062, 0.017]], 0.046);
      p.box('black', 0.05, 0.03, 0.07, 0, -0.012, -0.085);
      p.sharp('gray', 0.002, 0.03, 0.06, 0.0256, 0.05, -0.04);                     // janela de ejeção
      p.cyl('black', 0.009, 0.009, 0.035, 0.029, 0.062, 0.02);                     // assistente de fechamento
      // guarda-mão com aberturas, bloco/massa de mira em "A"
      p.cyl('black', 0.031, 0.031, 0.26, 0, 0.045, -0.31, 'z', 8);
      for (let i = 0; i < 6; i++) p.cyl('gray', 0.0316, 0.0316, 0.008, 0, 0.045, -0.21 - i * 0.04, 'z', 8);
      p.rail('black', 0.08, -0.43, -0.19);
      p.cyl('metal', 0.0095, 0.0095, 0.24, 0, 0.045, -0.56);
      p.prof('black', [[-0.465, 0.036], [-0.425, 0.036], [-0.44, 0.13], [-0.452, 0.13]], 0.018);
      p.box('black', 0.024, 0.024, 0.03, 0, 0.045, -0.445);
      // quebra-chamas com fendas
      p.cyl('metal', 0.0125, 0.0125, 0.065, 0, 0.045, -0.67, 'z', 10);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; p.sharp('black', 0.004, 0.004, 0.035, Math.cos(a) * 0.012, 0.045 + Math.sin(a) * 0.012, -0.675); }
      // alça de mira rebatível, empunhadura, guarda-mato
      p.box('black', 0.022, 0.03, 0.025, 0, 0.1, 0.035);
      p.prof('black', [[0.02, -0.006], [0.05, -0.006], [0.082, -0.1], [0.056, -0.112], [0.03, -0.028]], 0.032);
      p.guard('black', -0.008, -0.03, 0.02, 0.026);
      // tubo do amortecedor e coronha retrátil com nervuras
      p.cyl('black', 0.016, 0.016, 0.2, 0, 0.045, 0.16);
      p.prof('black', [[0.14, 0.072], [0.14, -0.006], [0.27, -0.05], [0.275, 0.074]], 0.042);
      for (let i = 0; i < 3; i++) p.sharp('gray', 0.044, 0.003, 0.03, 0, 0.0 + i * 0.022, 0.21);
      // carregador levemente curvo e alavanca de manejo
      p.prof('gray', [[-0.102, 0.012], [-0.106, -0.08], [-0.118, -0.152], [-0.066, -0.158], [-0.056, -0.08], [-0.052, 0.012]], 0.03, 0, 'mag');
      p.box('black', 0.04, 0.01, 0.015, 0, 0.074, 0.075, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.045, -0.71), gripL: V(0, 0.005, -0.3) });
      break;
    }
    case 'aug': {
      // corpo bullpup verde, guarda-mato grande que envolve as mãos
      p.prof('aug', [[-0.17, 0.062], [0.27, 0.062], [0.29, 0.035], [0.29, -0.07], [0.09, -0.07], [0.03, -0.04], [-0.17, -0.028]], 0.062);
      p.box('black', 0.066, 0.02, 0.06, 0, -0.02, 0.27);
      p.prof('aug', [[-0.205, -0.02], [-0.205, -0.135], [0.035, -0.135], [0.04, -0.05], [0.02, -0.035]], 0.032, 0, 'main', [[[-0.185, -0.035], [-0.185, -0.118], [0.015, -0.118], [0.015, -0.055], [0.0, -0.04]]]);
      p.prof('aug', [[-0.04, -0.03], [-0.005, -0.03], [0.012, -0.11], [-0.022, -0.115], [-0.045, -0.04]], 0.034);   // empunhadura
      p.prof('aug', [[-0.175, -0.025], [-0.145, -0.025], [-0.14, -0.105], [-0.175, -0.108]], 0.03);                 // empunhadura frontal
      // luneta integrada 1,5×
      p.box('black', 0.03, 0.045, 0.12, 0, 0.082, -0.05);
      p.cyl('black', 0.023, 0.023, 0.25, 0, 0.115, -0.05).cyl('black', 0.029, 0.023, 0.045, 0, 0.115, -0.19).cyl('lens', 0.024, 0.024, 0.004, 0, 0.115, -0.214);
      p.cyl('black', 0.026, 0.023, 0.03, 0, 0.115, 0.09).cyl('lens', 0.02, 0.02, 0.003, 0, 0.115, 0.106);
      // cano com quebra-chamas
      p.cyl('metal', 0.012, 0.012, 0.3, 0, 0.04, -0.32).cyl('metal', 0.016, 0.016, 0.06, 0, 0.04, -0.5, 'z', 10);
      p.cyl('black', 0.02, 0.02, 0.05, 0, 0.04, -0.18, 'z', 10);
      p.box('black', 0.032, 0.13, 0.05, 0, -0.075, 0.115, 0.1, 0, 0, 'mag');
      p.box('metal', 0.04, 0.012, 0.012, 0.035, 0.05, 0.02, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.04, -0.53), gripR: V(0, -0.03, 0.0), gripL: V(0, -0.075, -0.16) });
      break;
    }
    case 'awp': {
      // chassi verde com buraco do polegar, apoio de rosto e soleira
      p.prof('olive', [[-0.57, 0.04], [0.2, 0.04], [0.28, 0.076], [0.49, 0.076], [0.49, -0.13], [0.4, -0.13], [0.3, -0.058], [0.205, -0.058], [0.175, -0.13], [0.105, -0.13], [0.062, -0.04], [-0.57, -0.022]],
        0.062, 0, 'main', [[[0.195, -0.044], [0.285, -0.044], [0.26, 0.016], [0.205, 0.016]]]);
      p.box('black', 0.066, 0.215, 0.022, 0, -0.027, 0.5);
      p.box('olive', 0.05, 0.02, 0.15, 0, 0.088, 0.38);
      // receptor, ferrolho e alavanca, carregador, guarda-mato
      p.box('metal', 0.048, 0.04, 0.25, 0, 0.06, -0.05);
      p.box('black', 0.042, 0.05, 0.085, 0, -0.045, -0.08, 0, 0, 0, 'mag');
      p.guard('black', -0.022, -0.005, 0.07, 0.03);
      p.cyl('metal', 0.008, 0.008, 0.06, 0.04, 0.055, 0.03, 'x', 8, 'bolt').add(new THREE.SphereGeometry(0.014, 8, 6), 'metal', 0.075, 0.055, 0.03, 0, 0, 0, 'bolt');
      // cano estriado e freio de boca com janelas
      p.cyl('metal', 0.015, 0.011, 0.62, 0, 0.045, -0.62, 'z', 10);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; p.sharp('black', 0.003, 0.003, 0.36, Math.cos(a) * 0.0128, 0.045 + Math.sin(a) * 0.0128, -0.6); }
      p.cyl('metal', 0.021, 0.021, 0.075, 0, 0.045, -0.96, 'z', 10);
      for (const s of [-1, 1]) for (const z of [-0.945, -0.97]) p.sharp('black', 0.004, 0.022, 0.012, s * 0.02, 0.045, z);
      // luneta com anéis, torres e lente
      p.cyl('black', 0.022, 0.022, 0.24, 0, 0.128, -0.08).cyl('black', 0.034, 0.023, 0.08, 0, 0.128, -0.24).cyl('black', 0.027, 0.022, 0.06, 0, 0.128, 0.07);
      p.cyl('lens', 0.03, 0.03, 0.004, 0, 0.128, -0.282).cyl('lens', 0.022, 0.022, 0.003, 0, 0.128, 0.101);
      p.cyl('black', 0.011, 0.011, 0.03, 0, 0.158, -0.08, 'y', 10).cyl('black', 0.011, 0.011, 0.03, 0.03, 0.128, -0.08, 'x', 10);
      for (const z of [-0.15, -0.01]) p.box('black', 0.03, 0.035, 0.02, 0, 0.098, z).cyl('black', 0.026, 0.026, 0.018, 0, 0.128, z, 'z', 10);
      Object.assign(info, { muzzle: V(0, 0.045, -1.0), gripR: V(0, -0.04, 0.12), gripL: V(0, -0.025, -0.4), eject: V(0.03, 0.06, -0.02), kind: 'sniper' });
      break;
    }
    case 'ssg08': {
      p.prof('gray', [[-0.51, 0.026], [0.17, 0.026], [0.22, 0.052], [0.43, 0.052], [0.43, -0.1], [0.36, -0.1], [0.2, -0.036], [0.06, -0.032], [-0.51, -0.02]], 0.05);
      p.box('black', 0.054, 0.155, 0.018, 0, -0.024, 0.44);
      p.prof('black', [[0.08, -0.024], [0.118, -0.024], [0.148, -0.112], [0.112, -0.122], [0.082, -0.042]], 0.032);
      p.guard('black', -0.026, 0.01, 0.075, 0.026);
      p.box('metal', 0.04, 0.034, 0.22, 0, 0.044, -0.05);
      p.box('black', 0.036, 0.04, 0.07, 0, -0.045, -0.07, 0, 0, 0, 'mag');
      p.cyl('metal', 0.012, 0.009, 0.6, 0, 0.038, -0.6, 'z', 10);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; p.sharp('black', 0.0025, 0.0025, 0.32, Math.cos(a) * 0.0103, 0.038 + Math.sin(a) * 0.0103, -0.6); }
      p.cyl('metal', 0.016, 0.016, 0.05, 0, 0.038, -0.91, 'z', 10);
      p.cyl('black', 0.019, 0.019, 0.22, 0, 0.108, -0.07).cyl('black', 0.028, 0.019, 0.07, 0, 0.108, -0.21).cyl('black', 0.023, 0.019, 0.05, 0, 0.108, 0.06);
      p.cyl('lens', 0.025, 0.025, 0.004, 0, 0.108, -0.247).cyl('black', 0.009, 0.009, 0.026, 0, 0.133, -0.07, 'y', 10).cyl('black', 0.009, 0.009, 0.026, 0.026, 0.108, -0.07, 'x', 10);
      for (const z of [-0.13, -0.01]) p.box('black', 0.026, 0.035, 0.018, 0, 0.08, z);
      p.cyl('metal', 0.007, 0.007, 0.05, 0.035, 0.048, 0.03, 'x', 8, 'bolt').add(new THREE.SphereGeometry(0.012, 8, 6), 'black', 0.065, 0.048, 0.03, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.038, -0.94), gripR: V(0, -0.035, 0.1), gripL: V(0, -0.025, -0.36), kind: 'sniper' });
      break;
    }
    case 'p90': {
      // corpo bullpup com o buraco da empunhadura e detalhes em areia
      p.prof('black', [[-0.255, 0.05], [0.2, 0.05], [0.245, 0.01], [0.245, -0.09], [0.16, -0.09], [0.12, -0.035], [0.04, -0.035], [0.02, -0.125], [-0.06, -0.13], [-0.1, -0.045], [-0.2, -0.04], [-0.255, -0.03]],
        0.066, 0, 'main', [[[-0.015, -0.045], [0.07, -0.045], [0.05, -0.1], [0.005, -0.1]]]);
      p.prof('tan', [[0.12, 0.03], [0.24, 0.03], [0.24, -0.08], [0.17, -0.08]], 0.068);
      p.prof('tan', [[-0.1, -0.05], [-0.06, -0.12], [-0.04, -0.12], [-0.08, -0.045]], 0.068);
      p.box('gray', 0.056, 0.03, 0.3, 0, 0.065, -0.02, 0, 0, 0, 'mag');
      p.box('black', 0.03, 0.04, 0.1, 0, 0.1, -0.09).cyl('lens', 0.01, 0.01, 0.003, 0, 0.11, -0.141);
      p.cyl('metal', 0.009, 0.009, 0.06, 0, 0.02, -0.29);
      p.box('metal', 0.03, 0.01, 0.012, 0.035, 0.03, -0.12, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.02, -0.33), gripR: V(0, -0.075, -0.02), gripL: V(0, -0.07, -0.13), eject: V(0, -0.06, 0.05) });
      break;
    }
    case 'mp5sd': {
      p.prof('black', [[-0.2, 0.0], [-0.2, 0.068], [0.1, 0.068], [0.1, 0.0]], 0.046);
      p.cyl('black', 0.012, 0.012, 0.3, 0, 0.078, -0.05);                           // tubo do ferrolho
      p.cyl('black', 0.026, 0.026, 0.3, 0, 0.035, -0.35, 'z', 14).cyl('gray', 0.0262, 0.0262, 0.01, 0, 0.035, -0.5, 'z', 14);
      p.prof('black', [[-0.28, 0.005], [-0.17, 0.005], [-0.165, -0.02], [-0.28, -0.012]], 0.052);   // guarda-mão
      for (let i = 0; i < 4; i++) p.sharp('gray', 0.054, 0.003, 0.012, 0, -0.004, -0.19 - i * 0.025);
      p.cyl('black', 0.016, 0.016, 0.034, 0, 0.088, 0.065, 'x', 12);                // tambor da alça de mira
      p.box('black', 0.024, 0.03, 0.012, 0, 0.09, -0.19).sharp('black', 0.004, 0.02, 0.008, 0, 0.1, -0.19);
      p.prof('black', [[0.02, 0.0], [0.055, 0.0], [0.085, -0.095], [0.058, -0.106], [0.03, -0.022]], 0.032);
      p.guard('black', 0.0, -0.035, 0.02, 0.028);
      p.cyl('metal', 0.006, 0.006, 0.2, 0.015, 0.03, 0.2).cyl('metal', 0.006, 0.006, 0.2, -0.015, 0.03, 0.2);
      p.box('black', 0.046, 0.08, 0.02, 0, 0.02, 0.3);
      p.prof('metal', [[-0.1, 0.004], [-0.108, -0.06], [-0.128, -0.13], [-0.09, -0.14], [-0.068, -0.068], [-0.062, 0.004]], 0.03, 0, 'mag');
      p.box('black', 0.04, 0.01, 0.012, -0.03, 0.078, -0.2, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.035, -0.51), gripL: V(0, -0.02, -0.22) });
      break;
    }
    case 'ump45': {
      p.prof('black', [[-0.25, 0.05], [0.13, 0.05], [0.13, -0.01], [0.07, -0.05], [-0.06, -0.05], [-0.25, -0.02]], 0.056);
      p.rail('black', 0.056, -0.24, 0.12);
      p.prof('black', [[0.0, -0.04], [0.04, -0.04], [0.068, -0.13], [0.04, -0.14], [0.018, -0.06]], 0.034);
      p.guard('black', -0.04, -0.045, 0.01, 0.03);
      p.cyl('metal', 0.011, 0.011, 0.08, 0, 0.02, -0.29).cyl('black', 0.014, 0.014, 0.03, 0, 0.02, -0.33, 'z', 10);
      // coronha dobrável vazada
      p.prof('black', [[0.13, 0.04], [0.33, 0.03], [0.34, -0.06], [0.3, -0.06], [0.3, 0.0], [0.13, 0.005]], 0.03, 0, 'main', [[[0.17, 0.03], [0.28, 0.023], [0.28, 0.012], [0.17, 0.015]]]);
      p.box('black', 0.03, 0.15, 0.052, 0, -0.11, -0.08, 0.05, 0, 0, 'mag');
      p.box('black', 0.04, 0.012, 0.014, 0, 0.04, -0.2, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.02, -0.35), gripL: V(0, -0.04, -0.2) });
      break;
    }
    case 'xm1014': {
      p.prof('black', [[-0.17, 0.0], [-0.17, 0.07], [0.07, 0.07], [0.075, 0.03], [0.05, 0.0]], 0.05);
      p.rail('black', 0.075, -0.15, 0.06);
      p.cyl('metal', 0.015, 0.015, 0.5, 0, 0.056, -0.42).cyl('black', 0.016, 0.016, 0.42, 0, 0.018, -0.38);
      p.box('black', 0.056, 0.05, 0.18, 0, 0.024, -0.28);
      p.box('black', 0.02, 0.03, 0.02, 0, 0.09, 0.04).cyl('black', 0.008, 0.008, 0.016, 0, 0.1, 0.04, 'z', 10);   // alça "ghost ring"
      p.box('metal', 0.016, 0.022, 0.016, 0, 0.078, -0.62);
      p.prof('black', [[0.03, -0.004], [0.06, -0.004], [0.09, -0.1], [0.062, -0.112], [0.04, -0.026]], 0.032);
      p.guard('black', -0.004, -0.03, 0.025, 0.028);
      p.cyl('black', 0.016, 0.016, 0.18, 0, 0.04, 0.16);
      p.prof('black', [[0.14, 0.07], [0.14, -0.01], [0.3, -0.06], [0.305, 0.075]], 0.044);
      p.box('black', 0.05, 0.14, 0.016, 0, 0.007, 0.305, 0.18);
      p.box('brass', 0.02, 0.02, 0.05, 0, -0.008, -0.05, 0, 0, 0, 'mag');
      p.box('metal', 0.03, 0.012, 0.016, 0.03, 0.05, -0.04, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.056, -0.68), gripL: V(0, 0.0, -0.28), eject: V(0.03, 0.04, -0.06) });
      break;
    }
    case 'glock':
      pistol(p, { slideMat: 'black', frameMat: 'grip', slideLen: 0.19, slideFront: -0.162, slideY: 0.022, slideH: 0.032, slideW: 0.028, frameFront: -0.15, frameW: 0.03, gripZ: 0.022, gripBottom: -0.125 });
      Object.assign(info, { muzzle: V(0, 0.04, -0.165), gripR: V(0, -0.04, 0.02), gripL: V(-0.01, -0.05, 0.01), eject: V(0.02, 0.05, -0.05), kind: 'pistol' });
      break;
    case 'usps':
      pistol(p, { slideMat: 'gray', frameMat: 'grip', slideLen: 0.2, slideFront: -0.172, slideY: 0.022, slideH: 0.034, slideW: 0.029, frameFront: -0.158, frameW: 0.031, gripZ: 0.022, gripBottom: -0.125 });
      p.cyl('black', 0.016, 0.016, 0.17, 0, 0.037, -0.255, 'z', 14).cyl('gray', 0.0163, 0.0163, 0.01, 0, 0.037, -0.335, 'z', 14);
      p.box('black', 0.008, 0.016, 0.01, 0, 0.05, 0.034);                            // cão
      Object.assign(info, { muzzle: V(0, 0.037, -0.34), gripR: V(0, -0.04, 0.02), gripL: V(-0.01, -0.05, 0.01), kind: 'pistol' });
      break;
    case 'deagle':
      pistol(p, { slideMat: 'silver', frameMat: 'metal', serrMat: 'metal', gripTex: 'grip', slideLen: 0.26, slideFront: -0.222, slideY: 0.026, slideH: 0.042, slideW: 0.034, frameFront: -0.21, frameW: 0.034, gripZ: 0.026, gripBottom: -0.135 });
      p.box('silver', 0.016, 0.01, 0.22, 0, 0.073, -0.11, 0, 0, 0, 'bolt');          // nervura superior
      p.prof('grip', [[0.0, -0.03], [0.05, -0.02], [0.062, -0.126], [0.004, -0.13]], 0.037);
      p.box('metal', 0.01, 0.018, 0.012, 0, 0.06, 0.044);                            // cão
      Object.assign(info, { muzzle: V(0, 0.047, -0.225), gripR: V(0, -0.04, 0.025), gripL: V(-0.01, -0.055, 0.015), kind: 'pistol' });
      break;
    case 'fiveseven':
      pistol(p, { slideMat: 'gray', frameMat: 'black', slideLen: 0.2, slideFront: -0.172, slideY: 0.022, slideH: 0.031, slideW: 0.026, frameFront: -0.16, frameW: 0.029, gripZ: 0.022, gripBottom: -0.135 });
      Object.assign(info, { muzzle: V(0, 0.038, -0.175), gripR: V(0, -0.045, 0.02), gripL: V(-0.01, -0.055, 0.01), kind: 'pistol' });
      break;
    case 'p250':
      pistol(p, { slideMat: 'black', frameMat: 'black', slideLen: 0.19, slideFront: -0.165, slideY: 0.022, slideH: 0.033, slideW: 0.028, frameFront: -0.152, frameW: 0.03, gripZ: 0.022, gripBottom: -0.128 });
      p.sharp('black', 0.02, 0.006, 0.045, 0, 0.008, -0.125);                          // trilho sob o cano
      Object.assign(info, { muzzle: V(0, 0.04, -0.168), gripR: V(0, -0.04, 0.02), gripL: V(-0.01, -0.05, 0.01), eject: V(0.02, 0.05, -0.05), kind: 'pistol' });
      break;
    case 'rev38': {
      // armação com ponte superior, cano com nervura e capa do extrator
      p.prof('metal', [[-0.06, 0.05], [0.035, 0.05], [0.05, 0.035], [0.05, 0.0], [0.03, -0.02], [-0.04, -0.02], [-0.06, 0.005]], 0.026);
      p.cyl('metal', 0.0085, 0.0085, 0.11, 0, 0.034, -0.115);
      p.box('metal', 0.008, 0.012, 0.11, 0, 0.046, -0.115);
      p.box('metal', 0.014, 0.012, 0.09, 0, 0.02, -0.105);
      p.box('black', 0.004, 0.012, 0.008, 0, 0.056, -0.165);
      p.sharp('black', 0.012, 0.004, 0.008, 0, 0.053, 0.03);                            // alça de mira (entalhe)
      // tambor de 6 tiros com caneluras (abre na recarga)
      p.cyl('metal', 0.019, 0.019, 0.042, 0, 0.026, -0.03, 'z', 12, 'mag');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.52; p.sharp('black', 0.004, 0.004, 0.03, Math.cos(a) * 0.0185, 0.026 + Math.sin(a) * 0.0185, -0.03, 0, 0, 0, 'mag'); }
      // cão (arma a cada tiro), guarda-mato e cabo de madeira
      p.box('black', 0.008, 0.022, 0.012, 0, 0.056, 0.046, -0.5, 0, 0, 'bolt');
      p.guard('metal', -0.02, -0.02, 0.026, 0.026, 0.01);
      p.prof('wood', [[0.02, -0.016], [0.05, 0.0], [0.075, -0.1], [0.06, -0.115], [0.03, -0.11], [0.018, -0.05]], 0.032);
      Object.assign(info, { muzzle: V(0, 0.034, -0.172), gripR: V(0, -0.045, 0.04), gripL: V(-0.01, -0.06, 0.035), eject: V(0.02, 0.03, -0.03), kind: 'pistol' });
      break;
    }
    case 'galil': {
      // caixa da culatra (família AK) em preto, trilho superior
      p.prof('black', [[-0.2, 0.0], [-0.2, 0.068], [0.09, 0.068], [0.095, 0.035], [0.06, 0.0]], 0.05);
      p.prof('black', [[-0.195, 0.066], [-0.195, 0.08], [0.085, 0.086], [0.095, 0.066]], 0.046);
      p.rail('black', 0.088, -0.15, 0.07);
      // guarda-mão de polímero com aberturas e trilho
      p.prof('gray', [[-0.2, 0.07], [-0.2, 0.002], [-0.22, -0.008], [-0.41, 0.004], [-0.425, 0.025], [-0.425, 0.07]], 0.058);
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) p.sharp('black', 0.002, 0.012, 0.018, s * 0.0295, 0.035, -0.24 - i * 0.035);
      p.rail('black', 0.074, -0.42, -0.21);
      // cano, massa de mira e quebra-chamas
      p.cyl('metal', 0.011, 0.011, 0.5, 0, 0.045, -0.47);
      p.box('black', 0.026, 0.05, 0.03, 0, 0.068, -0.45).box('black', 0.02, 0.03, 0.016, 0, 0.098, -0.45);
      p.sharp('metal', 0.003, 0.016, 0.004, 0, 0.118, -0.45);
      p.cyl('black', 0.015, 0.015, 0.06, 0, 0.045, -0.73, 'z', 10);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; p.sharp('metal', 0.004, 0.004, 0.03, Math.cos(a) * 0.0145, 0.045 + Math.sin(a) * 0.0145, -0.74); }
      // empunhadura, guarda-mato, coronha esqueletada dobrável
      p.prof('black', [[0.012, 0.002], [0.056, 0.002], [0.088, -0.098], [0.06, -0.11], [0.028, -0.02]], 0.034);
      p.guard('black', 0.0, -0.04, 0.016, 0.03);
      p.prof('black', [[0.09, 0.066], [0.09, 0.0], [0.13, -0.01], [0.37, -0.06], [0.385, -0.06], [0.385, 0.07], [0.13, 0.07]], 0.04, 0, 'main', [[[0.14, 0.055], [0.34, 0.055], [0.34, -0.035], [0.14, 0.0]]]);
      p.box('grip', 0.046, 0.14, 0.016, 0, 0.004, 0.392);
      // carregador curvo de polímero (35)
      p.prof('gray', [[-0.15, 0.004], [-0.16, -0.08], [-0.19, -0.15], [-0.225, -0.2], [-0.18, -0.222], [-0.14, -0.16], [-0.11, -0.08], [-0.098, 0.004]], 0.034, 0, 'mag');
      p.box('metal', 0.035, 0.012, 0.016, 0.035, 0.06, -0.02, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.045, -0.77), gripL: V(0, -0.005, -0.32), eject: V(0.03, 0.065, -0.06) });
      break;
    }
    case 'famas': {
      // corpo bullpup, alça de transporte comprida e bipé dobrado
      p.prof('black', [[-0.2, 0.055], [0.25, 0.055], [0.27, 0.03], [0.27, -0.07], [0.1, -0.07], [0.05, -0.035], [-0.2, -0.025]], 0.06);
      p.box('grip', 0.064, 0.02, 0.05, 0, -0.02, 0.268);
      p.prof('black', [[-0.17, 0.05], [-0.15, 0.112], [0.14, 0.112], [0.16, 0.05], [0.13, 0.05], [0.12, 0.092], [-0.13, 0.092], [-0.14, 0.05]], 0.024);
      p.box('black', 0.022, 0.02, 0.025, 0, 0.122, 0.12).box('black', 0.016, 0.02, 0.014, 0, 0.122, -0.15);
      p.box('metal', 0.012, 0.012, 0.03, 0, 0.076, -0.05, 0, 0, 0, 'bolt');            // alavanca de manejo
      // empunhadura e guarda-mão que protege a mão inteira
      p.prof('black', [[-0.045, -0.03], [-0.008, -0.03], [0.012, -0.115], [-0.022, -0.12], [-0.048, -0.04]], 0.034);
      p.prof('black', [[-0.13, -0.022], [-0.13, -0.125], [-0.05, -0.128], [-0.05, -0.108], [-0.11, -0.105], [-0.11, -0.022]], 0.02);
      p.box('black', 0.006, 0.016, 0.006, 0, -0.045, -0.06, 0.3);
      // cano, quebra-chamas e pernas do bipé
      p.cyl('metal', 0.011, 0.011, 0.25, 0, 0.03, -0.32);
      p.cyl('black', 0.022, 0.022, 0.04, 0, 0.03, -0.215, 'z', 10);
      p.cyl('black', 0.014, 0.014, 0.05, 0, 0.03, -0.455, 'z', 10);
      for (const s of [-1, 1]) p.cyl('metal', 0.004, 0.004, 0.2, s * 0.016, 0.012, -0.32, 'z', 6);
      // carregador atrás da empunhadura
      p.box('gray', 0.03, 0.1, 0.05, 0, -0.085, 0.13, 0.12, 0, 0, 'mag');
      Object.assign(info, { muzzle: V(0, 0.03, -0.48), gripR: V(0, -0.03, -0.01), gripL: V(0, -0.03, -0.17) });
      break;
    }
    case 'mac10': {
      // caixa retangular, alça de manejo em cima, cano rosqueado curto
      p.box('black', 0.05, 0.07, 0.26, 0, 0.03, -0.06);
      p.sharp('gray', 0.002, 0.03, 0.06, 0.0256, 0.04, -0.06);
      p.box('black', 0.012, 0.012, 0.03, 0, 0.072, -0.12, 0, 0, 0, 'bolt');
      p.box('black', 0.016, 0.018, 0.012, 0, 0.073, 0.05).box('black', 0.01, 0.016, 0.01, 0, 0.072, -0.17);
      p.cyl('metal', 0.012, 0.012, 0.06, 0, 0.045, -0.215);
      for (let i = 0; i < 5; i++) p.cyl('gray', 0.0125, 0.0125, 0.003, 0, 0.045, -0.195 - i * 0.009);
      // empunhadura com o carregador dentro, guarda-mato e alça frontal (correia)
      p.box('black', 0.036, 0.11, 0.05, 0, -0.06, -0.03, 0.08);
      p.box('gray', 0.03, 0.06, 0.04, 0, -0.14, -0.037, 0.08, 0, 0, 'mag');
      p.guard('black', -0.005, -0.11, -0.06, 0.03);
      p.box('black', 0.008, 0.035, 0.02, 0, -0.012, -0.172);
      // coronha de arame recolhida
      for (const s of [-1, 1]) p.cyl('metal', 0.004, 0.004, 0.2, s * 0.02, 0.02, 0.15, 'z', 6);
      p.box('black', 0.05, 0.05, 0.008, 0, 0.0, 0.25);
      Object.assign(info, { muzzle: V(0, 0.045, -0.25), gripR: V(0, -0.04, -0.03), gripL: V(0, -0.02, -0.17), eject: V(0.03, 0.045, -0.06) });
      break;
    }
    case 'nova': {
      // receptor, empunhadura integrada à coronha de polímero
      p.prof('black', [[-0.16, 0.0], [-0.16, 0.065], [0.06, 0.065], [0.07, 0.03], [0.06, 0.0]], 0.05);
      p.prof('black', [[0.06, 0.062], [0.06, -0.005], [0.09, -0.1], [0.122, -0.1], [0.11, -0.04], [0.33, -0.07], [0.34, 0.06], [0.12, 0.062]], 0.044);
      for (let i = 0; i < 3; i++) p.sharp('gray', 0.046, 0.003, 0.012, 0, -0.03 - i * 0.02, 0.085 + i * 0.006);
      p.box('grip', 0.048, 0.135, 0.018, 0, -0.005, 0.345, 0.12);
      // cano, tubo do depósito e massa de mira
      p.cyl('metal', 0.014, 0.014, 0.5, 0, 0.05, -0.41);
      p.cyl('black', 0.015, 0.015, 0.4, 0, 0.018, -0.36);
      p.box('metal', 0.008, 0.01, 0.01, 0, 0.068, -0.65);
      p.guard('black', 0.0, -0.03, 0.03, 0.028);
      // telha (bomba) com ranhuras: anda para trás a cada tiro
      p.prof('black', [[-0.2, 0.042], [-0.2, -0.01], [-0.36, -0.01], [-0.37, 0.042]], 0.056, 0, 'bolt');
      for (let i = 0; i < 6; i++) p.sharp('gray', 0.058, 0.004, 0.008, 0, -0.006, -0.22 - i * 0.025, 0, 0, 0, 'bolt');
      p.box('brass', 0.02, 0.02, 0.05, 0, -0.008, -0.05, 0, 0, 0, 'mag');
      Object.assign(info, { muzzle: V(0, 0.05, -0.66), gripL: V(0, -0.01, -0.28), eject: V(0.03, 0.045, -0.06) });
      break;
    }
    case 'm249': {
      // caixa da culatra, tampa de alimentação com trilho
      p.prof('black', [[-0.2, 0.0], [-0.2, 0.075], [0.08, 0.075], [0.09, 0.04], [0.07, 0.0]], 0.056);
      p.prof('gray', [[-0.12, 0.074], [-0.12, 0.09], [0.06, 0.095], [0.07, 0.074]], 0.054);
      p.rail('black', 0.1, -0.1, 0.05);
      // cano com protetor térmico, alça de transporte, quebra-chamas
      p.cyl('metal', 0.013, 0.013, 0.56, 0, 0.045, -0.48);
      p.box('gray', 0.03, 0.016, 0.2, 0, 0.066, -0.3);
      p.prof('black', [[-0.32, 0.06], [-0.305, 0.125], [-0.205, 0.125], [-0.19, 0.06], [-0.205, 0.06], [-0.215, 0.11], [-0.295, 0.11], [-0.305, 0.06]], 0.016);
      p.cyl('black', 0.017, 0.017, 0.07, 0, 0.045, -0.79, 'z', 10);
      p.box('black', 0.02, 0.05, 0.016, 0, 0.07, -0.72);
      // tubo de gás, guarda-mão e bipé dobrado
      p.cyl('black', 0.01, 0.01, 0.3, 0, 0.018, -0.36);
      p.prof('black', [[-0.2, 0.03], [-0.2, -0.012], [-0.36, -0.006], [-0.37, 0.03]], 0.06);
      for (const s of [-1, 1]) p.cyl('metal', 0.005, 0.005, 0.26, s * 0.018, 0.01, -0.58, 'z', 6);
      p.box('black', 0.05, 0.02, 0.025, 0, 0.022, -0.7);
      // empunhadura, guarda-mato, coronha esqueletada
      p.prof('black', [[0.02, 0.0], [0.058, 0.0], [0.09, -0.1], [0.062, -0.112], [0.03, -0.022]], 0.034);
      p.guard('black', 0.0, -0.04, 0.018, 0.03);
      p.prof('black', [[0.08, 0.07], [0.08, 0.005], [0.36, -0.05], [0.37, 0.07]], 0.046, 0, 'main', [[[0.13, 0.055], [0.32, 0.055], [0.32, -0.025], [0.13, 0.002]]]);
      p.box('grip', 0.05, 0.13, 0.016, 0, 0.01, 0.375);
      // caixa de munição (bolsa de lona) com a fita entrando na arma
      p.box('olive', 0.07, 0.11, 0.1, -0.02, -0.06, -0.1, 0, 0, 0, 'mag');
      p.box('olive', 0.072, 0.012, 0.102, -0.02, -0.002, -0.1, 0, 0, 0, 'mag');
      for (let i = 0; i < 4; i++) p.box('brass', 0.012, 0.03, 0.008, -0.04 - i * 0.002, 0.03 - i * 0.012, -0.07 - i * 0.012, 0, 0, 0.6, 'mag');
      p.box('metal', 0.03, 0.012, 0.016, 0.035, 0.05, -0.04, 0, 0, 0, 'bolt');
      Object.assign(info, { muzzle: V(0, 0.045, -0.83), gripL: V(0, -0.01, -0.3), eject: V(0.03, 0.02, -0.04) });
      break;
    }
    case 'knife': {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.013); sh.lineTo(0.11, 0.015); sh.quadraticCurveTo(0.16, 0.012, 0.185, 0.0);
      sh.quadraticCurveTo(0.15, -0.012, 0.12, -0.019); sh.lineTo(0, -0.016); sh.lineTo(0, 0.013);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 1 });
      g.translate(0, 0, -0.0025);
      g.rotateY(Math.PI / 2);
      p.add(g, 'silver', 0, 0.002, -0.035);
      p.box('metal', 0.016, 0.042, 0.012, 0, 0.0, -0.03).box('grip', 0.024, 0.032, 0.11, 0, -0.003, 0.03)
        .box('metal', 0.026, 0.034, 0.012, 0, -0.003, 0.09);
      for (let i = 0; i < 4; i++) p.box('black', 0.026, 0.006, 0.006, 0, -0.019, 0.0 + i * 0.022);
      Object.assign(info, { muzzle: V(0, 0, -0.2), gripR: V(0, -0.005, 0.03), gripL: null, kind: 'knife' });
      break;
    }
    case 'he': {
      const g = new THREE.SphereGeometry(0.033, 14, 10); g.scale(1, 1.18, 1);
      p.add(g, 'nade', 0, 0, 0).cyl('metal', 0.012, 0.014, 0.025, 0, 0.045, 0, 'y')
        .box('metal', 0.01, 0.06, 0.012, 0.018, 0.02, 0, 0, 0, -0.2).add(new THREE.TorusGeometry(0.011, 0.002, 6, 14), 'metal', -0.014, 0.05, 0, 0, Math.PI / 2, 0);
      Object.assign(info, { muzzle: V(0, 0, 0), gripR: V(0.005, -0.05, 0.02), gripL: null, kind: 'grenade' });
      break;
    }
    case 'flash':
      p.cyl('nadeg', 0.024, 0.024, 0.095, 0, 0, 0, 'y', 14).cyl('black', 0.0245, 0.0245, 0.012, 0, 0.02, 0, 'y', 14)
        .cyl('metal', 0.011, 0.013, 0.022, 0, 0.058, 0, 'y').box('metal', 0.009, 0.06, 0.011, 0.018, 0.03, 0, 0, 0, -0.15)
        .add(new THREE.TorusGeometry(0.011, 0.002, 6, 14), 'metal', -0.014, 0.065, 0, 0, Math.PI / 2, 0);
      Object.assign(info, { muzzle: V(0, 0, 0), gripR: V(0.005, -0.05, 0.02), gripL: null, kind: 'grenade' });
      break;
    case 'smoke':
      p.cyl('smoke', 0.028, 0.028, 0.1, 0, 0, 0, 'y', 14).cyl('white', 0.0285, 0.0285, 0.014, 0, 0.022, 0, 'y', 14)
        .cyl('metal', 0.011, 0.013, 0.022, 0, 0.062, 0, 'y').box('metal', 0.009, 0.06, 0.011, 0.021, 0.035, 0, 0, 0, -0.15)
        .add(new THREE.TorusGeometry(0.011, 0.002, 6, 14), 'metal', -0.014, 0.07, 0, 0, Math.PI / 2, 0);
      Object.assign(info, { muzzle: V(0, 0, 0), gripR: V(0.005, -0.05, 0.02), gripL: null, kind: 'grenade' });
      break;
    case 'mine':
      // mina antipessoal: corpo cilíndrico verde-oliva, placa de pressão, pinos e LED
      p.cyl('nade', 0.072, 0.078, 0.045, 0, 0, 0, 'y', 18)
        .cyl('black', 0.079, 0.079, 0.008, 0, -0.012, 0, 'y', 18)
        .cyl('olive', 0.04, 0.044, 0.014, 0, 0.029, 0, 'y', 14)
        .cyl('metal', 0.012, 0.012, 0.012, 0, 0.042, 0, 'y', 8);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        p.cyl('metal', 0.0025, 0.0025, 0.03, Math.cos(a) * 0.006, 0.058, Math.sin(a) * 0.006, 'y', 5);
      }
      p.box('red', 0.012, 0.008, 0.012, 0.055, 0.024, 0).box('brass', 0.03, 0.006, 0.01, -0.05, 0.024, 0);
      Object.assign(info, { muzzle: V(0, 0, 0), gripR: V(0.005, -0.05, 0.02), gripL: null, kind: 'grenade' });
      break;
    default:
      p.box('black', 0.05, 0.08, 0.5, 0, 0, -0.2);
  }
  return { parts: p, info };
}

const DEF_CACHE = {};
function getDef(id) { return (DEF_CACHE[id] = DEF_CACHE[id] || defWeapon(id)); }

// Arma para a primeira pessoa: malhas separadas por material + grupos móveis
export function buildWeaponFP(id) {
  const { parts, info } = getDef(id);
  const mats = weaponMaterials();
  const root = new THREE.Group();
  const groups = { main: root, mag: new THREE.Group(), bolt: new THREE.Group() };
  root.add(groups.mag, groups.bolt);
  const byKey = {};
  for (const pt of parts.list) {
    const k = pt.group + '|' + pt.mat;
    const g0 = pt.geo.clone().applyMatrix4(pt.m);
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    (byKey[k] = byKey[k] || []).push(boxUV(g));
  }
  for (const [k, list] of Object.entries(byKey)) {
    const [grp, mat] = k.split('|');
    const merged = mergeGeometries(list, false);
    const mesh = new THREE.Mesh(merged, mats[mat]);
    mesh.castShadow = false;
    groups[grp].add(mesh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(info.muzzle); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.copy(info.eject); root.add(eject);
  return { root, mag: groups.mag, bolt: groups.bolt, muzzle, eject, info };
}

// Arma em terceira pessoa: uma única malha com cores por vértice
const TP_CACHE = {};
export function weaponGeometryTP(id) {
  if (TP_CACHE[id]) return TP_CACHE[id];
  const { parts } = getDef(id);
  const list = [];
  for (const pt of parts.list) {
    const g0 = pt.geo.clone().applyMatrix4(pt.m);
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    const c = new THREE.Color(MAT_DEF[pt.mat].color);
    const lift = MAT_DEF[pt.mat].metalness > 0.6 ? 1.25 : 1.0;
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r * lift; cols[i + 1] = c.g * lift; cols[i + 2] = c.b * lift; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    list.push(g);
  }
  TP_CACHE[id] = mergeGeometries(list, false);
  return TP_CACHE[id];
}
export function weaponInfo(id) { return getDef(id).info; }

// ------------------------------------------------------------------ personagens
export const CHAR_STYLE = {
  sombra:     { top: 0x2d3036, pants: 0x26282c, vest: 0x1b1d20, skin: 0xc68c6a, gear: 0x1f2124, gloves: 0x141414, boots: 0x161616, head: 'helmet', face: 'visor', swatch: ['#2d3036', '#1b1d20', '#3a6fd6'] },
  cangaceiro: { top: 0x7a5232, pants: 0x9c8a62, vest: 0x5c3a1e, skin: 0xa86e4a, gear: 0x6b4423, gloves: 0x5c3a1e, boots: 0x3a2414, head: 'cangaceiro', face: 'plain', scarf: 0xb3202a, belts: 0xc9a13b, swatch: ['#7a5232', '#b3202a', '#c9a13b'] },
  coiote:     { top: 0xb09a6e, pants: 0xa38c62, vest: 0x8c7650, skin: 0xd1a07a, gear: 0x9c8660, gloves: 0x6b6b4a, boots: 0x5a4632, head: 'helmet', face: 'goggles', swatch: ['#b09a6e', '#8c7650', '#6b6b4a'] },
  guerrilha:  { top: 0x4a5a32, pants: 0x3c4a2a, vest: 0x2a2a22, skin: 0x7a4e32, gear: 0xa8222a, gloves: 0x2a2a22, boots: 0x22201a, head: 'bandana', face: 'beard', swatch: ['#4a5a32', '#2a2a22', '#a8222a'] },
  artico:     { top: 0xdfe4e8, pants: 0xcfd6dc, vest: 0xb8c0c8, skin: 0xe8c0a0, gear: 0xe8ecef, gloves: 0x8a949e, boots: 0x5a636c, head: 'balaclava', face: 'goggles', swatch: ['#dfe4e8', '#b8c0c8', '#5a636c'] },
  // chimpanzé: pelo no corpo todo, cara clara (face2), mãos e pés escuros
  joao:       { top: 0x2b1d14, pants: 0x2b1d14, vest: 0x24180f, skin: 0x2b1d14, face2: 0xc9a07c, gear: 0x2b1d14, gloves: 0x3a2a20, boots: 0x3a2a20, head: 'chimp', face: 'none', plain: true, swatch: ['#2b1d14', '#c9a07c', '#3a2a20'] },
  // padre: batina preta comprida, colarinho branco, cruz e tonsura (gear = cabelo)
  padre:      { top: 0x15151a, pants: 0x15151a, vest: 0x1c1c22, skin: 0xd9a888, gear: 0x6b5a48, gloves: 0xd9a888, boots: 0x111111, head: 'tonsure', face: 'plain', plain: true, robe: true, collar: true, cross: 0xd4af37, swatch: ['#15151a', '#ffffff', '#d4af37'] },
  // professor: pele clara, cabelo com entradas, óculos, camisa, jeans e colete
  professor:  { top: 0xa9c4e0, pants: 0x34465e, vest: 0x3d3f42, skin: 0xf2cdb0, gear: 0x3b2a1e, gloves: 0xf2cdb0, boots: 0x4a3626, head: 'receding', face: 'glasses', swatch: ['#a9c4e0', '#34465e', '#3b2a1e'] },
  // Ceissa: loira de olhos verdes, cabelo preso num pitó para cima, regata justa e calça camuflada
  ceissa:     { top: 0x2f3b2c, pants: 0x5a6446, vest: 0x2a3326, skin: 0xf1c9aa, gear: 0xf0cf6e, gloves: 0x3a2e24, boots: 0x2b221a, head: 'pito', face: 'greeneyes', plain: true, bust: true, swatch: ['#f0cf6e', '#3fae5a', '#2f3b2c'] },
  // Uriel: babuíno albino — pelo branco, cara rosada, focinho comprido, juba e rabo
  uriel:      { top: 0xeee8dc, pants: 0xeee8dc, vest: 0xeee8dc, skin: 0xeee8dc, face2: 0xeeaaa4, gear: 0xf6f2ea, gloves: 0xe8b4ac, boots: 0xe8b4ac, head: 'baboon', face: 'none', plain: true, mane: true, tail: true, rump: 0xe8828e, swatch: ['#eee8dc', '#eeaaa4', '#c0303a'] },
  mercenario: { top: 0x5c6066, pants: 0x3e4247, vest: 0x8a7a55, skin: 0xb07a55, gear: 0x1c1c1c, gloves: 0x2a2a2a, boots: 0x2a2620, head: 'cap', face: 'shades', band: 0xb3202a, swatch: ['#5c6066', '#8a7a55', '#b3202a'] },
};

function colored(geo, hex, m) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
  const c = new THREE.Color(hex);
  const P = g.attributes.position;
  const cols = new Float32Array(P.count * 3);
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, hgt = g.boundingBox.max.y - y0;
  for (let i = 0, j = 0; i < P.count; i++, j += 3) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    // embaixo de cada peça fica um pouco mais escuro (falsa oclusão de ambiente)
    const grad = hgt > 0.06 ? 0.84 + 0.16 * Math.min(1, (y - y0) / hgt) : 1;
    // variação suave tipo sujeira/tecido
    const nse = Math.sin(x * 91.7 + y * 47.3 + z * 63.1) * Math.sin(x * 23.9 - z * 31.7 + y * 17.3);
    const k = grad * (1 + nse * 0.05);
    cols[j] = c.r * k; cols[j + 1] = c.g * k; cols[j + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
const T = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(s, s, s));
// caixa com quinas arredondadas: a malha 3x3 por face tem o anel interno
// recuado até o início da curva e as normais apontam para fora da quina,
// o que dá um volume mais "orgânico" com poucos vértices. Peças minúsculas
// (olhos, botões) continuam caixas simples.
const boxCache = new Map();
function rbox(w, h, d) {
  const m = Math.min(w, h, d);
  if (m < 0.03) return new THREE.BoxGeometry(w, h, d);
  const key = w.toFixed(4) + ',' + h.toFixed(4) + ',' + d.toFixed(4);
  const hit = boxCache.get(key);
  if (hit) return hit;
  const r = m * 0.28;
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const P = g.attributes.position, N = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2];
  const p = [0, 0, 0], inner = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    p[0] = P.getX(i); p[1] = P.getY(i); p[2] = P.getZ(i);
    for (let k = 0; k < 3; k++) {
      // vértices do meio da face vão para o começo da curva
      if (Math.abs(Math.abs(p[k]) - half[k] / 3) < 1e-6) p[k] = Math.sign(p[k]) * (half[k] - r);
      inner[k] = Math.max(-(half[k] - r), Math.min(half[k] - r, p[k]));
    }
    let nx = p[0] - inner[0], ny = p[1] - inner[1], nz = p[2] - inner[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    P.setXYZ(i, inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r);
    N.setXYZ(i, nx, ny, nz);
  }
  boxCache.set(key, g);
  return g;
}
function meshOf(list, mat) {
  const m = new THREE.Mesh(mergeGeometries(list, false), mat);
  m.castShadow = true;
  return m;
}

// IK de dois ossos: posição do cotovelo
function elbowPos(S, H, l1, l2, pole) {
  const d = H.clone().sub(S);
  const len = Math.min(d.length(), l1 + l2 - 1e-4);
  const dir = d.clone().normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return S.clone().add(dir.multiplyScalar(a)).add(p.multiplyScalar(h));
}
function limb(list, A, B, rA, rB, hex) {
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(rB, rA, len, 12);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, 1, 1));
  list.push(colored(g, hex, m));
  list.push(colored(new THREE.SphereGeometry(rA, 12, 8), hex, T(A.x, A.y, A.z)));
}

export class Character {
  constructor(charId) {
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
    this.weaponMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 });
    // nível de luz do lugar onde o personagem está (salas escuras, lâmpadas)
    this.lightU = { uSkyL: { value: 1 }, uLampL: { value: new THREE.Color(0, 0, 0) } };
    installDynamicLighting(this.mat, this.lightU);
    installDynamicLighting(this.weaponMat, this.lightU);
    // contorno colorido (identificação de aliados/inimigos)
    this.rimU = { uRim: { value: new THREE.Vector4(0, 0, 0, 0) } };
    installRim(this.mat, this.rimU);
    this.bandMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bandColor = null;
    this.root = new THREE.Group();
    this.phase = 0;
    this.crouchT = 0;
    this.deadT = -1;
    this.weaponId = null;
    this.kick = 0;
    this.legYaw = 0; this.backT = 1; this.land = 0; this.airT = 0; this.wasGround = true;
    this.reloadT = 0; this.swapT = 0; this.fall = null;
    this.setChar(charId);
  }

  setChar(charId) {
    if (this.charId === charId && this.body) return;
    this.charId = charId;
    const st = CHAR_STYLE[charId] || CHAR_STYLE.sombra;
    this.style = st;
    if (this.body) { this.root.remove(this.body); this.body.traverse((o) => o.geometry && o.geometry.dispose()); }
    const body = new THREE.Group();
    const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
    // pelve
    hips.add(meshOf([colored(rbox(0.34, 0.2, 0.22), st.pants, T(0, 0, 0)), colored(rbox(0.36, 0.06, 0.24), st.vest, T(0, 0.07, 0))], this.mat));
    if (st.robe) {
      // batina até perto do tornozelo (as pernas andam por dentro)
      hips.add(meshOf([colored(new THREE.CylinderGeometry(0.2, 0.28, 0.8, 14), st.pants, T(0, -0.4, 0)),
        colored(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 14), 0x0c0c0e, T(0, 0.02, 0))], this.mat));
    }
    if (st.rump) {
      // glúteos rosados (calosidades do babuíno), atrás do quadril
      const rump = [];
      for (const s of [-1, 1]) {
        const g = new THREE.SphereGeometry(0.085, 14, 10); g.scale(0.9, 1.1, 0.55);
        rump.push(colored(g, st.rump, T(s * 0.075, -0.06, 0.105)));
      }
      hips.add(meshOf(rump, this.mat));
    }
    if (st.tail) {
      // rabo de babuíno: sobe um pouco e cai em arco
      const tail = [], pts = [V(0, 0.02, 0.12), V(0, 0.12, 0.26), V(0, 0.08, 0.4), V(0, -0.08, 0.5), V(0, -0.26, 0.52)];
      for (let i = 0; i < pts.length - 1; i++) limb(tail, pts[i], pts[i + 1], 0.04 - i * 0.006, 0.034 - i * 0.006, st.top);
      tail.push(colored(new THREE.SphereGeometry(0.03, 8, 6), st.gear, T(0, -0.27, 0.52)));
      hips.add(meshOf(tail, this.mat));
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.1 * s, -0.04, 0); hips.add(hip);
      hip.add(meshOf([colored(rbox(0.15, 0.46, 0.17), st.pants, T(0, -0.23, 0)), colored(rbox(0.16, 0.12, 0.18), st.vest, T(0, -0.08, 0))], this.mat));
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
      knee.add(meshOf([colored(rbox(0.13, 0.4, 0.15), st.pants, T(0, -0.2, 0)), colored(rbox(0.15, 0.13, 0.27), st.boots, T(0, -0.4, -0.04)),
        colored(rbox(0.14, 0.12, 0.16), st.vest, T(0, -0.02, -0.03))], this.mat));
      legs.push({ hip, knee });
    }
    // tronco
    const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso);
    const tl = [
      colored(rbox(0.42, 0.5, 0.25), st.top, T(0, 0.27, 0)),
      colored(rbox(st.bust ? 0.4 : 0.46, 0.36, 0.3), st.bust ? st.top : st.vest, T(0, 0.3, 0)),
      colored(rbox(0.44, 0.06, 0.27), st.plain ? st.vest : st.boots, T(0, 0.04, 0)),
      colored(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), st.skin, T(0, 0.55, 0)),
    ];
    if (!st.plain) {
      tl.push(colored(rbox(0.12, 0.09, 0.04), st.vest, T(-0.1, 0.24, -0.165)),
        colored(rbox(0.12, 0.09, 0.04), st.vest, T(0.1, 0.24, -0.165)),
        colored(rbox(0.12, 0.09, 0.04), st.vest, T(0.0, 0.14, -0.165)),
        colored(rbox(0.3, 0.32, 0.12), st.vest, T(0, 0.3, 0.19)));
    }
    if (st.head === 'chimp') {
      // ombros largos e peito mais claro
      tl.push(colored(rbox(0.52, 0.16, 0.3), st.top, T(0, 0.44, 0)), colored(rbox(0.26, 0.24, 0.02), 0x3a2a1e, T(0, 0.3, -0.152)));
    }
    if (st.bust) {
      // busto grande sob a regata
      for (const s of [-1, 1]) {
        const b = new THREE.SphereGeometry(0.105, 16, 12); b.scale(1, 0.95, 0.95);
        tl.push(colored(b, st.top, T(s * 0.08, 0.33, -0.165)));
      }
      tl.push(colored(rbox(0.012, 0.07, 0.02), 0x1c241a, T(0, 0.35, -0.232)));
      // decote e alças da regata
      tl.push(colored(rbox(0.12, 0.07, 0.01), st.skin, T(0, 0.43, -0.152)));
      for (const s of [-1, 1]) tl.push(colored(rbox(0.05, 0.1, 0.27), st.top, T(s * 0.13, 0.5, 0)));
      // cintura mais fina com cinto
      tl.push(colored(rbox(0.44, 0.05, 0.27), 0x3a2e24, T(0, 0.04, 0)), colored(rbox(0.06, 0.04, 0.01), 0xc9a13b, T(0, 0.04, -0.14)));
    }
    if (st.mane) {
      // juba de babuíno sobre os ombros e as costas, peito mais claro
      const mane = new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); mane.scale(1.05, 0.75, 0.9);
      tl.push(colored(mane, st.gear, T(0, 0.4, 0.03)));
      tl.push(colored(rbox(0.52, 0.16, 0.3), st.top, T(0, 0.44, 0)), colored(rbox(0.24, 0.22, 0.02), 0xf0d6cc, T(0, 0.28, -0.152)));
    }
    if (st.collar) {
      // colarinho clerical: gola preta com a lingueta branca na frente
      tl.push(colored(new THREE.CylinderGeometry(0.085, 0.09, 0.05, 12), st.top, T(0, 0.535, 0)),
        colored(rbox(0.04, 0.035, 0.012), 0xffffff, T(0, 0.535, -0.087)));
      // botões da batina
      for (let i = 0; i < 5; i++) tl.push(colored(rbox(0.014, 0.014, 0.01), 0x2a2a30, T(0, 0.46 - i * 0.075, -0.153)));
    }
    if (st.cross) {
      tl.push(colored(rbox(0.016, 0.075, 0.01), st.cross, T(0, 0.32, -0.158)), colored(rbox(0.05, 0.016, 0.01), st.cross, T(0, 0.335, -0.158)));
      tl.push(colored(rbox(0.006, 0.17, 0.006), st.cross, T(-0.04, 0.42, -0.156, 0, 0, -0.45)), colored(rbox(0.006, 0.17, 0.006), st.cross, T(0.04, 0.42, -0.156, 0, 0, 0.45)));
    }
    if (st.belts) {
      tl.push(colored(rbox(0.08, 0.62, 0.32), st.belts, T(0, 0.3, 0, 0, 0, 0.75)));
      tl.push(colored(rbox(0.08, 0.62, 0.32), st.belts, T(0, 0.3, 0, 0, 0, -0.75)));
    }
    if (st.band) tl.push(colored(rbox(0.13, 0.07, 0.15), st.band, T(-0.27, 0.36, 0)));
    torso.add(meshOf(tl, this.mat));
    // cabeça
    const head = new THREE.Group(); head.position.y = 0.6; torso.add(head);
    const animal = st.head === 'chimp' || st.head === 'baboon';
    const skull = new THREE.SphereGeometry(0.125, 20, 14); if (!animal) skull.scale(0.92, 1.05, 1.0);
    const hl = [colored(skull, st.skin, T(0, 0.045, 0, 0, 0, 0, 1))];
    if (!animal) {
      // nariz
      const nose = new THREE.ConeGeometry(0.022, 0.05, 4); nose.rotateY(Math.PI / 4); nose.scale(0.9, 1, 1.1);
      hl.push(colored(nose, st.skin, T(0, 0.035, -0.12, -0.25, 0, 0)));
      // orelhas (menos onde a cabeça é coberta)
      if (st.head !== 'balaclava') for (const s of [-1, 1]) {
        const ear = new THREE.SphereGeometry(0.028, 8, 6); ear.scale(0.45, 1.1, 0.8);
        hl.push(colored(ear, st.skin, T(s * 0.115, 0.04, 0.005)));
      }
    }
    const brow = new THREE.Color(st.gear).multiplyScalar(0.55).getHex();
    const eyes = () => {
      for (const s of [-1, 1]) {
        hl.push(colored(rbox(0.034, 0.016, 0.012), 0xe8e4dc, T(s * 0.042, 0.068, -0.112)));
        hl.push(colored(rbox(0.014, 0.015, 0.012), 0x3a2a1c, T(s * 0.042, 0.068, -0.117)));
        hl.push(colored(rbox(0.006, 0.007, 0.01), 0x050505, T(s * 0.042, 0.068, -0.121)));
        hl.push(colored(rbox(0.04, 0.009, 0.014), brow, T(s * 0.043, 0.085, -0.112, 0, 0, s * -0.1)));
      }
      hl.push(colored(rbox(0.04, 0.008, 0.01), 0x7a4a3a, T(0, -0.012, -0.118)));
    };
    switch (st.head) {
      case 'helmet':
        hl.push(colored(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), st.gear, T(0, 0.075, 0.01)));
        hl.push(colored(rbox(0.31, 0.03, 0.3), st.gear, T(0, 0.07, 0.01)));
        break;
      case 'cangaceiro': {
        // chapéu de couro em meia-lua (aba dobrada na frente e atrás) com estrela
        hl.push(colored(new THREE.CylinderGeometry(0.12, 0.135, 0.09, 14), st.gear, T(0, 0.165, 0)));
        const half = new THREE.Shape();
        half.moveTo(-0.24, 0); half.absellipse(0, 0, 0.24, 0.17, Math.PI, 0, true); half.lineTo(-0.24, 0);
        const brim = new THREE.ExtrudeGeometry(half, { depth: 0.02, bevelEnabled: false });
        brim.translate(0, 0, -0.01);
        hl.push(colored(brim, st.gear, T(0, 0.13, -0.075, -0.22, 0, 0)));
        hl.push(colored(brim, st.gear, T(0, 0.13, 0.075, 0.22, 0, 0)));
        hl.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 5), st.belts, T(0, 0.21, -0.1, -0.22 - Math.PI / 2, 0, 0)));
        hl.push(colored(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12), st.scarf, T(0, -0.06, 0)));
        eyes();
        break;
      }
      case 'bandana':
        hl.push(colored(new THREE.SphereGeometry(0.132, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), st.gear, T(0, 0.055, 0)));
        hl.push(colored(rbox(0.04, 0.12, 0.03), st.gear, T(0.04, 0.03, 0.13, 0.4, 0, 0.3)));
        eyes();
        break;
      case 'balaclava':
        hl.push(colored(new THREE.SphereGeometry(0.132, 14, 10), st.gear, T(0, 0.045, 0)));
        hl.push(colored(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), st.gear, T(0, 0.08, 0.01)));
        break;
      case 'cap':
        hl.push(colored(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), st.gear, T(0, 0.06, 0)));
        hl.push(colored(rbox(0.16, 0.015, 0.12), st.gear, T(0, 0.1, 0.17)));
        break;
      case 'chimp': {
        // chimpanzé: cara clara, focinho saliente, sobrancelha grossa, orelhas grandes
        const F = st.face2;
        const face = new THREE.SphereGeometry(0.1, 14, 10); face.scale(1, 0.95, 0.55);
        hl.push(colored(face, F, T(0, 0.045, -0.07)));
        const muzzle = new THREE.SphereGeometry(0.075, 14, 10); muzzle.scale(1.15, 0.85, 0.95);
        hl.push(colored(muzzle, F, T(0, -0.012, -0.11)));
        hl.push(colored(rbox(0.19, 0.022, 0.05), 0x9a7252, T(0, 0.094, -0.115)));            // arco da sobrancelha
        hl.push(colored(rbox(0.03, 0.02, 0.01), 0x111111, T(-0.017, 0.012, -0.183)), colored(rbox(0.03, 0.02, 0.01), 0x111111, T(0.017, 0.012, -0.183))); // narinas
        hl.push(colored(rbox(0.1, 0.012, 0.01), 0x4a2a20, T(0, -0.04, -0.176)));             // boca
        hl.push(colored(rbox(0.03, 0.022, 0.02), 0x0b0805, T(-0.042, 0.066, -0.143)), colored(rbox(0.03, 0.022, 0.02), 0x0b0805, T(0.042, 0.066, -0.143)));
        hl.push(colored(rbox(0.008, 0.008, 0.005), 0xffffff, T(-0.036, 0.07, -0.154)), colored(rbox(0.008, 0.008, 0.005), 0xffffff, T(0.048, 0.07, -0.154))); // brilho nos olhos
        for (const s of [-1, 1]) {
          const ear = new THREE.CylinderGeometry(0.048, 0.048, 0.018, 12); ear.rotateZ(Math.PI / 2);
          hl.push(colored(ear, F, T(s * 0.13, 0.05, 0.005)), colored(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateZ(Math.PI / 2), 0x9a7454, T(s * 0.135, 0.05, 0.005)));
        }
        hl.push(colored(new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), st.gear, T(0, 0.055, 0.012))); // pelo do topo
        break;
      }
      case 'pito': {
        // cabelo loiro preso num pitó para cima: touca de cabelo, franja lateral,
        // elástico e o tufo apontando para o alto
        const H = st.gear;
        hl.push(colored(new THREE.SphereGeometry(0.136, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), H, T(0, 0.047, 0.006)));
        hl.push(colored(new THREE.SphereGeometry(0.137, 16, 10, Math.PI * 1.5 - 0.9, 1.8, Math.PI * 0.2, Math.PI * 0.14), H, T(0, 0.047, 0.004)));
        hl.push(colored(rbox(0.1, 0.035, 0.03), H, T(0.03, 0.12, -0.1, 0.3, 0, -0.35)));
        hl.push(colored(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), 0xd23a6a, T(0, 0.19, 0.02)));
        hl.push(colored(new THREE.CylinderGeometry(0.03, 0.045, 0.1, 12), H, T(0, 0.25, 0.025, 0.15, 0, 0)));
        const tuft = new THREE.SphereGeometry(0.06, 14, 10); tuft.scale(1, 1.25, 1);
        hl.push(colored(tuft, H, T(0, 0.34, 0.04)));
        hl.push(colored(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 10), H, T(0, 0.42, 0.04)));
        for (const [x, rz] of [[-0.035, 0.5], [0.035, -0.5], [0, 0]]) hl.push(colored(new THREE.ConeGeometry(0.025, 0.09, 8), H, T(x, 0.48, 0.04, 0, 0, rz)));
        break;
      }
      case 'baboon': {
        // babuíno albino: cara rosada, focinho comprido de cão inclinado para baixo,
        // testa saliente, olhos vermelhos, costeletas de pelo branco
        const F = st.face2;
        const face = new THREE.SphereGeometry(0.085, 14, 10); face.scale(1, 1.05, 0.5);
        hl.push(colored(face, F, T(0, 0.06, -0.085)));
        const muzzle = new THREE.SphereGeometry(0.06, 14, 10); muzzle.scale(0.72, 0.62, 2.1);
        hl.push(colored(muzzle, F, T(0, -0.005, -0.19, 0.28, 0, 0)));
        hl.push(colored(rbox(0.055, 0.035, 0.03), 0xd2807a, T(0, -0.04, -0.302, 0.28, 0, 0)));                  // ponta do nariz
        hl.push(colored(rbox(0.014, 0.012, 0.01), 0x4a1e1e, T(-0.013, -0.036, -0.319)), colored(rbox(0.014, 0.012, 0.01), 0x4a1e1e, T(0.013, -0.036, -0.319))); // narinas
        hl.push(colored(rbox(0.05, 0.012, 0.13), 0xb8605c, T(0, -0.07, -0.22, 0.28, 0, 0)));                     // boca
        hl.push(colored(rbox(0.17, 0.028, 0.05), 0xf2c4bc, T(0, 0.105, -0.105)));                                 // testa
        hl.push(colored(rbox(0.028, 0.02, 0.02), 0xc0303a, T(-0.04, 0.075, -0.13)), colored(rbox(0.028, 0.02, 0.02), 0xc0303a, T(0.04, 0.075, -0.13)));
        hl.push(colored(rbox(0.008, 0.008, 0.005), 0xffffff, T(-0.034, 0.079, -0.141)), colored(rbox(0.008, 0.008, 0.005), 0xffffff, T(0.046, 0.079, -0.141)));
        for (const s of [-1, 1]) {
          hl.push(colored(new THREE.SphereGeometry(0.026, 8, 6), F, T(s * 0.128, 0.075, 0.0)));                  // orelhinhas
          const cheek = new THREE.SphereGeometry(0.065, 10, 8); cheek.scale(0.75, 1.25, 1.1);
          hl.push(colored(cheek, st.gear, T(s * 0.115, -0.01, -0.03)));                                           // costeletas
        }
        hl.push(colored(new THREE.SphereGeometry(0.134, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), st.gear, T(0, 0.058, 0.02)));
        break;
      }
      case 'tonsure':
        // tonsura: topo careca (a pele da cabeça aparece) com um anel de cabelo em volta
        {
          const front = Math.PI * 1.5, gap = 1.15;
          // laterais e nuca descem até a altura das orelhas; na frente só uma franja curta
          hl.push(colored(new THREE.SphereGeometry(0.134, 18, 12, front + gap, Math.PI * 2 - gap * 2, Math.PI * 0.26, Math.PI * 0.36), st.gear, T(0, 0.045, 0.004)));
          hl.push(colored(new THREE.SphereGeometry(0.134, 12, 12, front - gap, gap * 2, Math.PI * 0.26, Math.PI * 0.09), st.gear, T(0, 0.045, 0.004)));
        }
        break;
      case 'receding': {
        // cabelo com duas entradas: falta cabelo nos dois cantos da testa,
        // com um tufo no meio e a coroa coberta
        const R = 0.134, front = Math.PI * 1.5, gapA = 0.2, gapB = 0.95;
        hl.push(colored(new THREE.SphereGeometry(R, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.2), st.gear, T(0, 0.045, 0.004)));          // coroa
        hl.push(colored(new THREE.SphereGeometry(R, 20, 12, front + gapB, Math.PI * 2 - gapB * 2, 0, Math.PI * 0.52), st.gear, T(0, 0.045, 0.004))); // laterais e nuca
        hl.push(colored(new THREE.SphereGeometry(R, 8, 12, front - gapA, gapA * 2, 0, Math.PI * 0.36), st.gear, T(0, 0.045, 0.004)));  // tufo do meio
        break;
      }
      default: break;
    }
    switch (st.face) {
      case 'visor': hl.push(colored(rbox(0.22, 0.06, 0.04), 0x0f1a2e, T(0, 0.075, -0.12))); break;
      case 'goggles': hl.push(colored(rbox(0.22, 0.055, 0.04), 0x2a3440, T(0, 0.075, -0.12)), colored(rbox(0.25, 0.02, 0.24), 0x222222, T(0, 0.075, -0.01))); break;
      case 'shades': hl.push(colored(rbox(0.2, 0.035, 0.03), 0x0a0a0a, T(0, 0.07, -0.118))); break;
      case 'beard': hl.push(colored(rbox(0.2, 0.08, 0.1), 0x2a1a10, T(0, -0.02, -0.07))); eyes(); break;
      case 'none': break;
      case 'greeneyes': {
        // olhos verdes com branco, cílios, sobrancelhas loiras e batom
        for (const s of [-1, 1]) {
          hl.push(colored(rbox(0.042, 0.024, 0.012), 0xf6f6f2, T(s * 0.045, 0.07, -0.118)));
          hl.push(colored(rbox(0.02, 0.022, 0.012), 0x2fae4e, T(s * 0.045, 0.07, -0.123)));
          hl.push(colored(rbox(0.01, 0.012, 0.01), 0x0a0a0a, T(s * 0.045, 0.07, -0.128)));
          hl.push(colored(rbox(0.048, 0.008, 0.012), 0x1a1210, T(s * 0.045, 0.085, -0.12, 0, 0, s * -0.12)));
          hl.push(colored(rbox(0.045, 0.01, 0.01), 0xc9a24e, T(s * 0.045, 0.1, -0.115, 0, 0, s * -0.15)));
        }
        hl.push(colored(rbox(0.05, 0.016, 0.012), 0xc8455a, T(0, -0.01, -0.118)));
        break;
      }
      case 'glasses': {
        // óculos de armação escura: dois aros, ponte e hastes
        eyes();
        const rim = (x) => { const g = new THREE.TorusGeometry(0.028, 0.005, 6, 16); g.scale(1, 0.8, 1); return colored(g, 0x1a1a1a, T(x, 0.07, -0.128)); };
        hl.push(rim(-0.046), rim(0.046), colored(rbox(0.03, 0.006, 0.006), 0x1a1a1a, T(0, 0.074, -0.129)));
        hl.push(colored(rbox(0.006, 0.006, 0.12), 0x1a1a1a, T(-0.108, 0.072, -0.07)), colored(rbox(0.006, 0.006, 0.12), 0x1a1a1a, T(0.108, 0.072, -0.07)));
        const lens = new THREE.CircleGeometry(0.026, 14); lens.scale(1, 0.8, 1);
        hl.push(colored(lens, 0x9fc6d8, T(-0.046, 0.07, -0.13, 0, Math.PI, 0)), colored(lens, 0x9fc6d8, T(0.046, 0.07, -0.13, 0, Math.PI, 0)));
        break;
      }
      default: if (st.head !== 'cangaceiro' && st.head !== 'bandana') eyes();
    }
    head.add(meshOf(hl, this.mat));
    // grupo de mira (braços + arma), gira com o pitch
    const aim = new THREE.Group(); aim.position.set(0, 0.45, 0); torso.add(aim);
    // faixas da equipe (ombros, peito e costas): só aparecem com setTeamLook
    const bands = meshOf([
      colored(rbox(0.07, 0.1, 0.22), 0xffffff, T(-0.255, 0.4, 0)),
      colored(rbox(0.07, 0.1, 0.22), 0xffffff, T(0.255, 0.4, 0)),
      colored(rbox(0.3, 0.035, 0.012), 0xffffff, T(0, 0.42, -0.158)),
      colored(rbox(0.22, 0.13, 0.012), 0xffffff, T(0, 0.36, 0.256)),
    ], this.bandMat);
    bands.visible = !!this.bandColor;
    torso.add(bands);
    this.bands = bands;
    this.body = body;
    this.parts = { hips, legs, torso, head, aim };
    this.armMesh = null;
    this.weaponMesh = null;
    this.root.add(body);
    const w = this.weaponId; this.weaponId = null;
    if (w) this.setWeapon(w);
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    if (this.weaponId) this.swapT = 1;
    this.weaponId = id;
    const { aim } = this.parts;
    if (this.weaponMesh) aim.remove(this.weaponMesh);
    if (this.armMesh) { aim.remove(this.armMesh); this.armMesh.geometry.dispose(); }
    const info = weaponInfo(id);
    const kind = info.kind;
    const gun = new THREE.Mesh(weaponGeometryTP(id), this.weaponMat);
    gun.castShadow = true;
    // posição da arma relativa ao ponto de mira (ombro)
    if (kind === 'pistol') gun.position.set(0.02, -0.05, -0.45);
    else if (kind === 'knife') gun.position.set(0.2, -0.22, -0.3);
    else if (kind === 'grenade') gun.position.set(0.2, -0.15, -0.28);
    else gun.position.set(0.1, -0.08, -0.2);
    if (kind === 'knife') gun.rotation.x = -0.6;
    aim.add(gun);
    this.weaponMesh = gun;
    this.muzzleLocal = info.muzzle.clone();
    // braços até as empunhaduras
    const st = this.style;
    const list = [];
    const shoulderR = V(0.23, 0.0, 0), shoulderL = V(-0.23, 0.0, 0);
    const handR = info.gripR.clone().add(gun.position);
    const handL = info.gripL ? info.gripL.clone().add(gun.position) : (kind === 'knife' || kind === 'grenade' ? V(-0.16, -0.32, -0.12) : handR.clone().add(V(-0.04, -0.01, 0.02)));
    for (const [S, H, side] of [[shoulderR, handR, 1], [shoulderL, handL, -1]]) {
      const E = elbowPos(S, H, 0.29, 0.29, V(side * 0.8, -1, 0.3));
      limb(list, S, E, 0.06, 0.055, st.top);
      limb(list, E, H, 0.052, 0.045, st.top);
      list.push(colored(rbox(0.07, 0.07, 0.09), st.gloves, T(H.x, H.y, H.z)));
    }
    list.push(colored(rbox(0.12, 0.1, 0.12), st.vest, T(0.23, 0.0, 0)), colored(rbox(0.12, 0.1, 0.12), st.vest, T(-0.23, 0.0, 0)));
    this.armMesh = meshOf(list, this.mat);
    aim.add(this.armMesh);
  }

  // estado: { speed, crouch(bool), pitch, onGround, dt, fwdSpeed, sideSpeed, vy, reload }
  animate(s) {
    const { hips, legs, torso, head, aim } = this.parts;
    const dt = Math.min(0.05, s.dt);
    if (this.deadT >= 0) { this.animateDeath(dt); return; }
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    // agachar suave (com leve "afundada" no meio do movimento)
    const ct = s.crouch ? 1 : 0;
    this.crouchT += (ct - this.crouchT) * Math.min(1, dt * 11);
    const c = this.crouchT;
    const onG = s.onGround;
    const speed = onG ? s.speed : 0;
    const amp = Math.min(1, speed / 5.2);
    // fase pela distância percorrida: os pés não "patinam"
    const stride = 0.82 - c * 0.3;
    if (speed > 0.25) this.phase += speed * dt * Math.PI / stride;
    else this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 8); // volta à pose parada
    // direção das pernas: o quadril gira para onde o jogador anda (como no CS), o tronco compensa
    let back = 1, legYaw = 0;
    if (speed > 0.5) {
      const ang = Math.atan2(s.sideSpeed || 0, s.fwdSpeed || 0);
      if (Math.abs(ang) > Math.PI * 0.6) { back = -1; legYaw = ang - Math.sign(ang) * Math.PI; } else legYaw = ang;
      legYaw = Math.max(-1.05, Math.min(1.05, legYaw));
    }
    this.legYaw += (legYaw - this.legYaw) * Math.min(1, dt * 10);
    this.backT += (back - this.backT) * Math.min(1, dt * 12);
    const ph = this.phase * (this.backT >= 0 ? 1 : -1);
    // pulo / queda / aterrissagem
    if (onG && !this.wasGround && this.airT > 0.12) this.land = Math.min(1, this.airT * 1.4);
    this.airT = onG ? 0 : this.airT + dt;
    this.wasGround = onG;
    this.land *= Math.exp(-dt * 9);
    const air = onG ? 0 : Math.min(1, this.airT * 6);
    const rising = (s.vy || 0) > 1 ? 1 : 0;
    // pernas
    const swingA = 0.62 * amp * (1 - c * 0.45);
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      const p2 = ph + (i ? Math.PI : 0);
      const sw = Math.sin(p2) * swingA;
      const kneeBend = Math.max(0, -Math.sin(p2 + 0.65)) * 1.0 * amp;
      const tuck = air * (rising ? 0.7 : 0.4) * (i ? 0.75 : 1.1);
      legs[i].hip.rotation.x = sw + c * 1.25 + tuck + this.land * 0.45;
      legs[i].knee.rotation.x = -kneeBend - c * 2.05 - tuck * 1.6 - this.land * 0.8;
      legs[i].hip.rotation.z = (0.03 + c * 0.08) * sgn;
    }
    hips.rotation.y = this.legYaw;
    hips.position.y = 0.92 - c * 0.43 + Math.abs(Math.cos(ph)) * 0.035 * amp - air * 0.05 - this.land * 0.14;
    // tronco: compensa o giro do quadril, inclina ao correr e ao andar de lado
    const strafeLean = Math.max(-1, Math.min(1, (s.sideSpeed || 0) / 5)) * 0.08;
    torso.rotation.y = -this.legYaw + Math.sin(ph) * 0.07 * amp;
    torso.rotation.x = s.pitch * 0.25 - c * 0.16 - 0.06 * amp * (this.backT >= 0 ? 1 : -0.4) + this.land * 0.12;
    torso.rotation.z = strafeLean + Math.cos(ph) * 0.03 * amp;
    head.rotation.x = s.pitch * 0.5;
    head.rotation.y = 0;
    // recarga e troca de arma visíveis
    this.reloadT += ((s.reload ? 1 : 0) - this.reloadT) * Math.min(1, dt * 9);
    this.swapT = Math.max(0, this.swapT - dt * 3.2);
    const r = this.reloadT, sw2 = Math.sin(Math.min(1, this.swapT) * Math.PI);
    const rw = r * (0.85 + Math.sin(performance.now() / 160) * 0.15);
    this.kick *= Math.exp(-dt * 18);
    aim.rotation.x = s.pitch * 0.75 + c * 0.18 + this.kick * 0.15 - rw * 0.38 - sw2 * 0.9 + Math.sin(ph * 2) * 0.025 * amp;
    aim.rotation.z = rw * 0.42;
    aim.rotation.y = -rw * 0.12;
    aim.position.z = this.kick * 0.04;
    aim.position.y = 0.45 - rw * 0.06;
  }

  // queda "ragdoll" leve: o corpo tomba com velocidade angular, quica no chão e os membros balançam com molas
  die(opts) {
    if (typeof opts === 'number') opts = { dir: opts };
    const o = opts || {};
    this.deadT = 0;
    const dir = o.dir >= 0 ? 1 : -1;
    const side = Math.max(-1, Math.min(1, o.side || 0));
    this.fall = {
      th: 0, w: 1.2 + (o.strength || 1) * (o.hs ? 2.6 : 1.6),
      ax: dir * Math.cos(side * 0.9), az: Math.sin(side * 0.9) + (Math.random() - 0.5) * 0.35,
      rest: false, bounced: 0,
    };
    const R = (a, b) => a + Math.random() * (b - a);
    const L = (x, target, k = 60, d = 5) => ({ x, v: 0, t: target, k, d });
    const { legs, head, aim, torso } = this.parts;
    this.limbs = {
      h0: L(legs[0].hip.rotation.x, R(-0.3, 0.6)), h1: L(legs[1].hip.rotation.x, R(-0.4, 0.4)),
      k0: L(legs[0].knee.rotation.x, R(-0.9, -0.1)), k1: L(legs[1].knee.rotation.x, R(-1.2, -0.2)),
      hd: L(head.rotation.x, (o.hs ? 0.9 : 0.5) * dir, 40, 3.5), hy: L(head.rotation.y, R(-0.8, 0.8), 30, 3),
      am: L(aim.rotation.x, R(-1.4, -0.6), 35, 3.2), az: L(aim.rotation.z, R(-0.6, 0.6), 30, 3),
      tx: L(torso.rotation.x, R(-0.25, 0.25) * dir, 50, 4), tz: L(torso.rotation.z, R(-0.3, 0.3), 50, 4),
    };
    // impulso inicial nos membros (o tiro "empurra")
    this.limbs.hd.v = (o.hs ? 9 : 4) * dir;
    this.limbs.am.v = -6;
  }

  animateDeath(dt) {
    this.deadT += dt;
    const f = this.fall;
    if (!f) return;
    if (!f.rest) {
      // torque da gravidade cresce com o ângulo (como um bastão tombando)
      f.w += (2.5 + 14 * Math.sin(f.th)) * dt;
      f.th += f.w * dt;
      const lim = Math.PI / 2;
      if (f.th >= lim) {
        f.th = lim;
        if (f.bounced < 2 && f.w > 1.5) {
          f.w = -f.w * 0.28; f.bounced++;
          for (const l of Object.values(this.limbs)) l.v += (Math.random() - 0.5) * 10; // membros chacoalham no impacto
        } else { f.rest = true; f.w = 0; }
      }
    }
    const len = Math.hypot(f.ax, f.az) || 1;
    this.body.rotation.x = f.th * f.ax / len;
    this.body.rotation.z = -f.th * f.az / len;
    this.body.position.y = Math.sin(f.th) * 0.1;
    // molas dos membros
    for (const l of Object.values(this.limbs)) {
      l.v += ((l.t - l.x) * l.k - l.v * l.d) * dt;
      l.x += l.v * dt;
    }
    const { legs, head, aim, torso, hips } = this.parts;
    const L = this.limbs;
    legs[0].hip.rotation.x = L.h0.x; legs[1].hip.rotation.x = L.h1.x;
    legs[0].knee.rotation.x = Math.min(0, L.k0.x); legs[1].knee.rotation.x = Math.min(0, L.k1.x);
    head.rotation.x = Math.max(-1, Math.min(1.1, L.hd.x)); head.rotation.y = L.hy.x;
    aim.rotation.x = L.am.x; aim.rotation.z = L.az.x;
    torso.rotation.x = L.tx.x; torso.rotation.z = L.tz.x;
    hips.position.y += (0.92 - hips.position.y) * Math.min(1, dt * 6) * 0.3;
  }

  revive() { this.deadT = -1; this.fall = null; this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); this.legYaw = 0; this.backT = 1; this.land = 0; }
  fireKick() { this.kick = 1; }
  setLight(sky, lamp, dt) {
    const k = Math.min(1, (dt || 1) * 6);
    const u = this.lightU;
    u.uSkyL.value += (sky - u.uSkyL.value) * k;
    u.uLampL.value.r += (lamp[0] - u.uLampL.value.r) * k;
    u.uLampL.value.g += (lamp[1] - u.uLampL.value.g) * k;
    u.uLampL.value.b += (lamp[2] - u.uLampL.value.b) * k;
  }

  muzzleWorld(out) {
    if (!this.weaponMesh) return out.copy(this.root.position);
    return this.weaponMesh.localToWorld(out.copy(this.muzzleLocal));
  }
  // color: cor da equipe/inimigo (null = sem destaque); rim: força do contorno;
  // bands: mostra as faixas coloridas no uniforme
  setTeamLook(color, rim = 0, bands = false) {
    const u = this.rimU.uRim.value;
    if (color) { const c = new THREE.Color(color); u.set(c.r, c.g, c.b, rim); } else u.set(0, 0, 0, 0);
    this.bandColor = color && bands ? color : null;
    if (this.bandColor) this.bandMat.color.set(this.bandColor);
    if (this.bands) this.bands.visible = !!this.bandColor;
  }
  setProtected(on, t) {
    const v = on ? 0.25 + Math.sin(t * 10) * 0.2 : 0;
    this.mat.emissive.setRGB(v * 0.3, v * 0.8, v);
  }
  dispose() {
    this.root.traverse((o) => { if (o.geometry && o !== this.weaponMesh) o.geometry.dispose(); });
    this.mat.dispose(); this.weaponMat.dispose(); this.bandMat.dispose();
  }
}

// Contorno (fresnel) somado à cor final: realça a silhueta do personagem,
// inclusive em lugares escuros. Não atravessa paredes (usa o teste de
// profundidade normal).
function installRim(mat, uni) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uRim = uni.uRim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uRim;')
      .replace('#include <opaque_fragment>', `float rimF = 1.0 - abs(dot(normalize(vViewPosition), normal));
        outgoingLight += uRim.rgb * uRim.a * (0.04 + 1.25 * pow(rimF, 3.0));
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'dynlight-rim';
  mat.needsUpdate = true;
}

// ------------------------------------------------------------------ ícones (silhuetas)
export function renderWeaponIcons(ids) {
  const W = 256, H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const dl = new THREE.DirectionalLight(0xffffff, 2.5); dl.position.set(1, 2, 2); scene.add(dl);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  cam.position.set(1, 0, 0); cam.lookAt(0, 0, 0);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shaded = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4 });
  const out = {};
  for (const id of ids) {
    const geo = weaponGeometryTP(id);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = V(0, 0, 0); bb.getSize(size);
    const center = V(0, 0, 0); bb.getCenter(center);
    const res = {};
    for (const [key, mat] of [['white', white], ['color', shaded]]) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(center).negate();
      const holder = new THREE.Group(); holder.add(mesh);
      if (WEAPONS[id].type === 'grenade') holder.rotation.x = 0.0;
      scene.add(holder);
      const aspect = W / H;
      const span = Math.max(size.z / 2 / aspect, size.y / 2) * 1.12;
      cam.left = -span * aspect; cam.right = span * aspect; cam.top = span; cam.bottom = -span;
      cam.updateProjectionMatrix();
      renderer.render(scene, cam);
      res[key] = canvas.toDataURL('image/png');
      scene.remove(holder);
    }
    out[id] = res;
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
