// Detalhes do ambiente gerados automaticamente a partir das caixas do mapa:
// placas e cartazes nas paredes, fios entre paredes, entulho/papéis no chão e tufos de grama.
// Tudo é mesclado em poucas malhas (placas e fios) ou instanciado (entulho e grama).
import * as THREE from '/lib/three.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function inside(p, boxes, pad = 0) {
  for (const b of boxes) {
    if (p[0] > b.min[0] - pad && p[0] < b.max[0] + pad && p[1] > b.min[1] - pad && p[1] < b.max[1] + pad && p[2] > b.min[2] - pad && p[2] < b.max[2] + pad) return b;
  }
  return null;
}

// ------------------------------------------------------------------ atlas de placas (4 × 2)
let atlasTex = null;
export function signAtlas() {
  if (atlasTex) return atlasTex;
  const S = 256, c = document.createElement('canvas');
  c.width = S * 4; c.height = S * 2;
  const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fn(); g.restore(); };
  const grime = () => {
    for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(40,30,20,${Math.random() * 0.08})`; g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 18, 1 + Math.random() * 6); }
    const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,40,20,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  };
  const text = (t, y, size, col, font = 'bold') => { g.fillStyle = col; g.font = `${font} ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, S / 2, y); };
  // 0: PERIGO alta tensão (amarelo)
  cell(0, () => {
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, S, S); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(10, 10, S - 20, S - 20);
    g.beginPath(); g.moveTo(S / 2, 40); g.lineTo(S / 2 + 62, 150); g.lineTo(S / 2 - 62, 150); g.closePath(); g.fillStyle = '#111'; g.fill();
    g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(S / 2 + 8, 70); g.lineTo(S / 2 - 14, 112); g.lineTo(S / 2 + 2, 112); g.lineTo(S / 2 - 8, 140); g.lineTo(S / 2 + 16, 100); g.lineTo(S / 2, 100); g.closePath(); g.fill();
    text('PERIGO', 190, 40, '#111'); text('ALTA TENSÃO', 225, 24, '#111'); grime();
  });
  // 1: ÁREA RESTRITA (vermelho)
  cell(1, () => { g.fillStyle = '#efe9dd'; g.fillRect(0, 0, S, S); g.fillStyle = '#b3261e'; g.fillRect(0, 0, S, 90); text('ÁREA', 46, 44, '#fff'); text('RESTRITA', 140, 44, '#b3261e'); text('Somente pessoal', 190, 22, '#333', ''); text('autorizado', 216, 22, '#333', ''); grime(); });
  // 2: SAÍDA (verde)
  cell(2, () => { g.fillStyle = '#1f7a3a'; g.fillRect(0, 60, S, 136); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(190, 128); g.lineTo(150, 92); g.lineTo(150, 112); g.lineTo(96, 112); g.lineTo(96, 144); g.lineTo(150, 144); g.lineTo(150, 164); g.closePath(); g.fill(); text('SAÍDA', 128, 56, '#fff'); g.clearRect(0, 0, S, 60); g.clearRect(0, 196, S, 60); g.fillStyle = '#1f7a3a'; g.fillRect(0, 60, S, 4); });
  // 3: listras de advertência
  cell(3, () => { g.fillStyle = '#e8b520'; g.fillRect(0, 0, S, S); g.fillStyle = '#1a1a1a'; for (let k = -S; k < S * 2; k += 56) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 28, 0); g.lineTo(k + 28 - S, S); g.lineTo(k - S, S); g.closePath(); g.fill(); } grime(); });
  // 4: número de setor
  cell(4, () => { g.fillStyle = '#2c4a6e'; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(14, 14, S - 28, S - 28); text('SETOR', 62, 34, '#fff'); text('7', 160, 130, '#fff'); grime(); });
  // 5: cartaz "procura-se" estilo cordel
  cell(5, () => { g.fillStyle = '#e4d3a8'; g.fillRect(0, 0, S, S); text('FORRÓ', 50, 46, '#7a2a12'); text('SÁBADO', 98, 34, '#2a2a2a'); g.fillStyle = '#7a2a12'; g.beginPath(); g.arc(S / 2, 165, 46, 0, Math.PI * 2); g.fill(); text('♪ ♫', 165, 46, '#e4d3a8'); text('entrada franca', 232, 20, '#2a2a2a', ''); grime(); });
  // 6: extintor
  cell(6, () => { g.fillStyle = '#c62828'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff'; g.fillRect(104, 60, 48, 120); g.fillRect(118, 40, 20, 24); g.fillRect(136, 46, 40, 10); text('EXTINTOR', 220, 30, '#fff'); grime(); });
  // 7: grafite
  cell(7, () => { g.clearRect(0, 0, S, S); g.save(); g.translate(S / 2, S / 2); g.rotate(-0.12); g.font = 'bold 74px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#141414'; g.strokeText('LAN', 0, -20); g.fillStyle = '#ff5ab0'; g.fillText('LAN', 0, -20); g.font = 'bold 40px sans-serif'; g.lineWidth = 8; g.strokeText('PARTY', 0, 44); g.fillStyle = '#4ad7ff'; g.fillText('PARTY', 0, 44); g.restore(); });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  return atlasTex;
}

// placas: em faces verticais de paredes altas, voltadas para áreas livres
export function addSigns(mb, map, seed, density = 1) {
  const r = rng(seed);
  const solid = map.solid;
  const walls = solid.filter((b) => !b.floor && !b.roof && !b.boundary && b.max[1] > 3 && b.min[1] < 0.5 && !b.trim && b.mat !== 'crate' && b.mat !== 'door');
  const placed = [];
  const want = Math.round((8 + walls.length * 0.12) * density);
  for (let tries = 0; tries < want * 12 && placed.length < want; tries++) {
    const b = walls[Math.floor(r() * walls.length)];
    if (!b) break;
    const ax = r() < 0.5 ? 0 : 2, sgn = r() < 0.5 ? -1 : 1;
    const o = ax === 0 ? 2 : 0;
    const len = b.max[o] - b.min[o];
    if (len < 1.6) continue;
    const w = 0.7 + r() * 0.5, h = w;
    const along = b.min[o] + 0.5 + r() * (len - 1.0 - w) + w / 2;
    const y = 1.5 + r() * 0.9;
    const plane = sgn > 0 ? b.max[ax] + 0.012 : b.min[ax] - 0.012;
    // espaço livre na frente e nada cobrindo a placa
    const front = [0, y, 0]; front[ax] = plane + sgn * 0.6; front[o] = along;
    if (inside(front, solid)) continue;
    let ok = true;
    for (const da of [-w / 2, w / 2]) for (const dy of [-h / 2, h / 2]) {
      const pt = [0, y + dy, 0]; pt[ax] = plane + sgn * 0.05; pt[o] = along + da;
      if (inside(pt, solid)) ok = false;
    }
    if (!ok || placed.some((p) => Math.hypot(p[0] - front[0], p[2] - front[2]) < 6)) continue;
    placed.push(front);
    const kind = Math.floor(r() * 8);
    const u0 = (kind % 4) / 4, v0 = 1 - (Math.floor(kind / 4) + 1) / 2;
    const uvs = [[u0, v0], [u0 + 0.25, v0], [u0 + 0.25, v0 + 0.5], [u0, v0 + 0.5]];
    // vértices na ordem BL, BR, TR, TL vistos de frente
    const n = [0, 0, 0]; n[ax] = sgn;
    const right = ax === 0 ? [0, 0, -sgn] : [sgn, 0, 0];
    const P = (a, bb) => { const p = [0, y + bb * h / 2, 0]; p[ax] = plane; p[o] = along; p[0] += right[0] * a * w / 2; p[2] += right[2] * a * w / 2; return p; };
    mb.quad([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], n, uvs, [[0.95, 0.95, 0.95]]);
  }
  return placed.length;
}

// fios elétricos com catenária entre topos de paredes
export function addCables(mb, map, seed, count = 10) {
  const r = rng(seed + 11);
  const solid = map.solid;
  const tops = solid.filter((b) => !b.floor && !b.roof && !b.trim && b.max[1] > 3.5 && b.min[1] < 0.5);
  let made = 0;
  const geoSeg = 10;
  for (let tries = 0; tries < count * 30 && made < count; tries++) {
    const a = tops[Math.floor(r() * tops.length)], b = tops[Math.floor(r() * tops.length)];
    if (!a || !b || a === b) continue;
    const pa = [a.min[0] + r() * (a.max[0] - a.min[0]), Math.min(a.max[1], 6) - 0.3, a.min[2] + r() * (a.max[2] - a.min[2])];
    const pb = [b.min[0] + r() * (b.max[0] - b.min[0]), Math.min(b.max[1], 6) - 0.3, b.min[2] + r() * (b.max[2] - b.min[2])];
    // desloca para a face voltada ao outro ponto
    const clampTo = (p, bx, q) => { for (const k of [0, 2]) { if (q[k] > bx.max[k]) p[k] = bx.max[k] + 0.03; else if (q[k] < bx.min[k]) p[k] = bx.min[k] - 0.03; } };
    clampTo(pa, a, pb); clampTo(pb, b, pa);
    const d = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
    if (d < 5 || d > 16) continue;
    const sag = 0.4 + d * 0.05;
    let clear = true;
    const pts = [];
    for (let i = 0; i <= geoSeg; i++) {
      const t = i / geoSeg;
      const p = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t - sag * 4 * t * (1 - t), pa[2] + (pb[2] - pa[2]) * t];
      if (i > 0 && i < geoSeg && inside(p, solid, 0.05)) { clear = false; break; }
      pts.push(new THREE.Vector3(...p));
    }
    if (!clear || pts.some((p) => p.y < 2.6)) continue;
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.018, 4, false);
    mb.geo(tube, new THREE.Matrix4(), [0.12, 0.12, 0.12]);
    tube.dispose();
    made++;
  }
  return made;
}

// ------------------------------------------------------------------ entulho e grama (instanciados)
function grassTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 10 + Math.random() * (S - 20), lean = (Math.random() - 0.5) * 40, hgt = S * (0.45 + Math.random() * 0.5);
    const gr = g.createLinearGradient(0, S, 0, S - hgt);
    const tone = 90 + Math.random() * 60;
    gr.addColorStop(0, `rgb(${tone * 0.55},${tone * 0.7},${tone * 0.3})`); gr.addColorStop(1, `rgb(${tone * 1.15},${tone * 1.2},${tone * 0.6})`);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - 3, S); g.quadraticCurveTo(x + lean * 0.3, S - hgt * 0.6, x + lean, S - hgt); g.quadraticCurveTo(x + lean * 0.3 + 2, S - hgt * 0.6, x + 3, S); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildScatter(map, theme, quality, lightAt, windU) {
  const group = new THREE.Group();
  if (!quality.decor) return group;
  const r = rng(map.id.length * 977 + 5);
  const B = map.bounds, solid = map.solid;
  const tmp = { sky: 1, lamp: [0, 0, 0] };
  const area = (B.maxX - B.minX) * (B.maxZ - B.minZ);
  const dense = quality.particles >= 1 ? 1 : 0.6;
  // grama: só em mapas de terra e em áreas abertas
  if ((theme.ground || 'ground') === 'ground') {
    const N = Math.round(area / 3.2 * dense);
    const geo = new THREE.PlaneGeometry(0.7, 0.42, 1, 1);
    geo.translate(0, 0.21, 0);
    const g2 = geo.clone(); g2.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const pos = [...geo.attributes.position.array, ...g2.attributes.position.array];
    const uv = [...geo.attributes.uv.array, ...g2.attributes.uv.array];
    const nrm = new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]);
    const sway = []; for (let i = 0; i < pos.length / 3; i++) sway.push(pos[i * 3 + 1] > 0.2 ? 1 : 0);
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    merged.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
    merged.setIndex([...geo.index.array, ...g2.index.array.map((i) => i + 4)]);
    const mat = new THREE.MeshLambertMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wq = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float ph = wq.x * 0.5 + wq.z * 0.37;
          transformed.x += sin(uTime * 2.1 + ph) * sway * 0.07;
          transformed.z += cos(uTime * 1.7 + ph) * sway * 0.05;`);
    };
    const im = new THREE.InstancedMesh(merged, mat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    for (let k = 0; k < N * 3 && n < N; k++) {
      const x = B.minX + 1 + r() * (B.maxX - B.minX - 2), z = B.minZ + 1 + r() * (B.maxZ - B.minZ - 2);
      if (inside([x, 0.2, z], solid, 0.25)) continue;
      lightAt(x, 1, z, tmp);
      if (tmp.sky < 0.5) continue; // sem grama em áreas cobertas
      // tufos mais densos junto às paredes (onde ninguém pisa)
      if (!inside([x, 0.2, z], solid, 1.4) && r() < 0.6) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      const sc = 0.6 + r() * 0.8;
      s.set(sc, sc * (0.7 + r() * 0.6), sc);
      m4.compose(p.set(x, 0, z), q, s);
      im.setMatrixAt(n, m4);
      const tint = theme.grassTint || [0.85, 0.8, 0.55];
      c.setRGB(tint[0] * (0.8 + r() * 0.3), tint[1] * (0.8 + r() * 0.3), tint[2] * (0.8 + r() * 0.3));
      im.setColorAt(n, c);
      n++;
    }
    im.count = n;
    im.receiveShadow = true;
    group.add(im);
  }
  // entulho: pedrinhas, pedaços de concreto e papéis junto às paredes
  {
    const N = Math.round(area / 5 * dense);
    const geo = new THREE.DodecahedronGeometry(0.07, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const im = new THREE.InstancedMesh(geo, mat, N);
    const paperGeo = new THREE.PlaneGeometry(0.21, 0.29); paperGeo.rotateX(-Math.PI / 2); paperGeo.translate(0, 0.006, 0);
    const pm = new THREE.InstancedMesh(paperGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), Math.ceil(N / 6));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let n = 0, np = 0;
    const stoneCol = theme.debris || [0.62, 0.58, 0.52];
    for (let k = 0; k < N * 4 && n < N; k++) {
      const x = B.minX + 0.6 + r() * (B.maxX - B.minX - 1.2), z = B.minZ + 0.6 + r() * (B.maxZ - B.minZ - 1.2);
      if (inside([x, 0.05, z], solid, 0.12)) continue;
      if (!inside([x, 0.3, z], solid, 0.9) && r() < 0.8) continue;
      lightAt(x, 1, z, tmp);
      const lit = 0.35 + 0.65 * tmp.sky + (tmp.lamp[0] + tmp.lamp[1] + tmp.lamp[2]) * 0.2;
      if (r() < 0.16 && np < pm.count) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
        m4.compose(p.set(x, 0, z), q, s.set(1, 1, 1));
        pm.setMatrixAt(np, m4);
        const w = 0.82 + r() * 0.15;
        pm.setColorAt(np, c.setRGB(w * lit, w * lit * 0.97, w * lit * 0.9));
        np++;
        continue;
      }
      q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      const sc = 0.4 + r() * 1.3;
      m4.compose(p.set(x, 0.02 * sc, z), q, s.set(sc, sc * (0.5 + r() * 0.5), sc));
      im.setMatrixAt(n, m4);
      const v = 0.75 + r() * 0.35;
      im.setColorAt(n, c.setRGB(stoneCol[0] * v * lit, stoneCol[1] * v * lit, stoneCol[2] * v * lit));
      n++;
    }
    im.count = n; pm.count = np;
    im.receiveShadow = true; pm.receiveShadow = true;
    group.add(im, pm);
  }
  return group;
}
