// Texturas procedurais (geradas em canvas na inicialização: nenhum arquivo externo).
import * as THREE from '/lib/three.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ruído de valor periódico (tileable)
function makeNoise(seed, period) {
  const r = rng(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
// fbm tileable em [0,1]² com frequência base 'f' (inteiro)
function fbm(seed, f, oct = 4) {
  const ns = [];
  for (let o = 0; o < oct; o++) ns.push(makeNoise(seed + o * 101, f << o));
  return (u, v) => {
    let s = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) { const fr = f << o; s += ns[o](u * fr, v * fr) * amp; tot += amp; amp *= 0.5; }
    return s / tot;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
}

function toTexture(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// normal map a partir de um mapa de altura (Float32Array w*h)
function normalFromHeight(hgt, w, h, strength = 2, wrapY = true) {
  const { c, ctx } = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w;
      const yu = wrapY ? (y - 1 + h) % h : Math.max(0, y - 1), yd = wrapY ? (y + 1) % h : Math.min(h - 1, y + 1);
      const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * strength;
      const dy = (hgt[yd * w + x] - hgt[yu * w + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

function hex(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ------------------------------------------------------------------ chão de terra
function groundTex(S) {
  const W = S, H = S;
  const { c, ctx } = canvas(W, H);
  const img = ctx.createImageData(W, H), d = img.data;
  const n1 = fbm(11, 4, 5), n2 = fbm(23, 16, 3), n3 = fbm(37, 2, 3);
  const hgt = new Float32Array(W * H);
  const c1 = hex(0xd2ae78), c2 = hex(0xb48a58), c3 = hex(0xe3c48f), c4 = hex(0x9a7448);
  const r = rng(5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const a = n1(u, v), b = n2(u, v), e = n3(u, v);
    let col = mix(c1, c2, Math.min(1, Math.max(0, (a - 0.35) * 2.2)));
    col = mix(col, c3, Math.max(0, (e - 0.55) * 1.8));
    col = mix(col, c4, Math.max(0, (0.32 - b) * 1.5));
    const k = 0.9 + b * 0.2;
    const i = (y * W + x) * 4;
    d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
    hgt[y * W + x] = a * 0.6 + b * 0.4;
  }
  ctx.putImageData(img, 0, 0);
  // pedrinhas
  for (let i = 0; i < S * 0.5; i++) {
    const x = r() * W, y = r() * H, s = 0.8 + r() * 2.2;
    const l = 120 + r() * 70;
    ctx.fillStyle = `rgba(${l + 40},${l + 25},${l},${0.18 + r() * 0.25})`;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(60,40,20,0.12)';
    ctx.beginPath(); ctx.ellipse(x + 0.8, y + 1, s, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  return { map: toTexture(c, { aniso: 8 }), normalMap: normalFromHeight(hgt, W, H, 3.5) };
}

// ------------------------------------------------------------------ reboco (tingido por vértice)
function plasterTex() {
  const W = 512, H = 1024; // 4 m × 8 m
  const { c, ctx } = canvas(W, H);
  const img = ctx.createImageData(W, H), d = img.data;
  const n1 = fbm(71, 4, 5), n2 = fbm(83, 24, 2), n3 = fbm(97, 2, 3);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const a = n1(u, v), b = n2(u, v), e = n3(u, v * 0.5);
    let l = 236 + (a - 0.5) * 22 + (b - 0.5) * 10;
    // manchas grandes
    l -= Math.max(0, e - 0.6) * 60;
    // sujeira perto do chão (parte de baixo da textura = y alto)
    const fromBottom = (H - y) / H * 8; // metros
    const grime = Math.max(0, 1 - fromBottom / 0.9);
    l -= grime * grime * 70 + Math.max(0, 1 - fromBottom / 0.25) * 25;
    const i = (y * W + x) * 4;
    d[i] = l * 1.0; d[i + 1] = l * 0.975 - grime * 6; d[i + 2] = l * 0.93 - grime * 14; d[i + 3] = 255;
    hgt[y * W + x] = a * 0.7 + b * 0.3;
  }
  ctx.putImageData(img, 0, 0);
  // escorridos de chuva a partir do topo
  const r = rng(9);
  for (let i = 0; i < 26; i++) {
    const x = r() * W, len = 80 + r() * 260;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(90,75,55,0.22)'); g.addColorStop(1, 'rgba(90,75,55,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 2 + r() * 6, len);
  }
  // rachaduras
  ctx.strokeStyle = 'rgba(70,60,45,0.45)'; ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = r() * W, y = r() * H;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 12; k++) { x += (r() - 0.5) * 22; y += (r() - 0.3) * 18; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // reboco descascado mostrando tijolo
  for (let i = 0; i < 3; i++) {
    const x = r() * W, y = H * (0.55 + r() * 0.35), w = 26 + r() * 40, h = 16 + r() * 22;
    ctx.fillStyle = 'rgba(176,110,80,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, r(), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(230,220,200,0.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 2 + k * h / 4); ctx.lineTo(x + w / 2, y - h / 2 + k * h / 4); ctx.stroke(); }
  }
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, W, H, 1.6) };
}

// ------------------------------------------------------------------ blocos de pedra / tijolos
function blocksTex({ seed, W = 512, rows, cols, mortar, colors, mortarColor, bevel = 3, jitter = 0.1, strength = 4 }) {
  const H = W;
  const { c, ctx } = canvas(W, H);
  const img = ctx.createImageData(W, H), d = img.data;
  const n1 = fbm(seed, 8, 4), n2 = fbm(seed + 7, 32, 2);
  const hgt = new Float32Array(W * H);
  const r = rng(seed);
  const rowH = H / rows, colW = W / cols;
  const shade = [];
  for (let i = 0; i < rows * (cols + 1); i++) shade.push({ c: colors[Math.floor(r() * colors.length)], k: 1 - jitter + r() * jitter * 2 });
  const mc = hex(mortarColor);
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / rowH);
    const off = (row % 2) * colW * 0.5;
    const ly = y - row * rowH;
    for (let x = 0; x < W; x++) {
      const xx = (x + off) % W;
      const col = Math.floor(xx / colW);
      const lx = xx - col * colW;
      const edge = Math.min(lx, colW - lx, ly, rowH - ly);
      const i = (y * W + x) * 4;
      const nn = n1(x / W, y / H), fine = n2(x / W, y / H);
      let h, rgb;
      if (edge < mortar) {
        rgb = mc.map((v) => v * (0.85 + fine * 0.3));
        h = 0;
      } else {
        const s = shade[row * (cols + 1) + col];
        const base = hex(s.c);
        const k = s.k * (0.88 + nn * 0.22 + (fine - 0.5) * 0.12);
        const b = Math.min(1, (edge - mortar) / bevel);
        rgb = base.map((v) => v * k * (0.82 + 0.18 * b));
        h = 0.5 + 0.5 * b + (nn - 0.5) * 0.3;
      }
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      hgt[y * W + x] = h;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, W, H, strength) };
}

// ------------------------------------------------------------------ concreto / reboco liso
function concreteTex(seed = 3, base = 0xcfcac0) {
  const W = 256, H = 256;
  const { c, ctx } = canvas(W, H);
  const img = ctx.createImageData(W, H), d = img.data;
  const n1 = fbm(seed, 4, 5), n2 = fbm(seed + 9, 32, 2);
  const b = hex(base);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const k = 0.86 + n1(u, v) * 0.2 + (n2(u, v) - 0.5) * 0.08;
    const i = (y * W + x) * 4;
    d[i] = b[0] * k; d[i + 1] = b[1] * k; d[i + 2] = b[2] * k; d[i + 3] = 255;
    hgt[y * W + x] = n2(u, v);
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, W, H, 1.2) };
}

// ------------------------------------------------------------------ madeira em tábuas
function planksTex({ seed = 41, W = 512, H = 512, count = 8, base = 0x9a6a3c, vertical = true, light = false }) {
  const { c, ctx } = canvas(W, H);
  const img = ctx.createImageData(W, H), d = img.data;
  const n1 = fbm(seed, 4, 4), grain = makeNoise(seed + 3, 64);
  const r = rng(seed);
  const tones = []; for (let i = 0; i < count; i++) tones.push(0.82 + r() * 0.3);
  const b = hex(base);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const along = vertical ? y / H : x / W, across = vertical ? x / W : y / H;
    const plank = Math.floor(across * count);
    const lp = across * count - plank;
    const seam = lp < 0.025 || lp > 0.975;
    const g = grain(across * 64 * 0.5 + plank * 7, along * 6) * 0.5 + Math.sin((along * 40 + grain(plank * 3, along * 10) * 6) + plank) * 0.25;
    let k = tones[plank] * (0.86 + g * 0.18 + (n1(x / W, y / H) - 0.5) * 0.15);
    if (light) k = 0.75 + k * 0.3;
    if (seam) k *= 0.45;
    const i = (y * W + x) * 4;
    d[i] = b[0] * k; d[i + 1] = b[1] * k; d[i + 2] = b[2] * k; d[i + 3] = 255;
    hgt[y * W + x] = seam ? 0 : 0.6 + g * 0.3;
  }
  ctx.putImageData(img, 0, 0);
  // pregos
  ctx.fillStyle = 'rgba(40,40,40,0.8)';
  for (let p = 0; p < count; p++) {
    const a = (p + 0.5) / count;
    for (const t of [0.06, 0.94]) {
      const x = vertical ? a * W : t * W, y = vertical ? t * H : a * H;
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, W, H, 3) };
}

// ------------------------------------------------------------------ caixote
function crateTex() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const wood = planksTex({ seed: 55, W: S, H: S, count: 5, base: 0xb07d43, vertical: false });
  ctx.drawImage(wood.map.image, 0, 0);
  const fr = 26;
  ctx.fillStyle = 'rgba(120,78,36,1)';
  const frame = (x, y, w, h) => {
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,220,160,0.12)'; ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h - 3, w, 3);
  };
  frame(0, 0, S, fr); frame(0, S - fr, S, fr); frame(0, 0, fr, S); frame(S - fr, 0, fr, S);
  ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-Math.PI / 4);
  frame(-S * 0.66, -fr / 2, S * 1.32, fr);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2);
  ctx.fillStyle = 'rgba(30,30,30,0.85)';
  for (const [x, y] of [[13, 13], [S - 13, 13], [13, S - 13], [S - 13, S - 13]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = 'rgba(40,20,5,0.35)'; ctx.textAlign = 'center';
  ctx.fillText('FRÁGIL', S / 2 + 40, S / 2 + 60);
  return { map: toTexture(c, { repeat: false }), normalMap: wood.normalMap };
}

// ------------------------------------------------------------------ porta / metal / barril
function doorTex() {
  const W = 256, H = 512;
  const { c, ctx } = canvas(W, H);
  const p = planksTex({ seed: 61, W, H, count: 5, base: 0xe8e8e8, vertical: true, light: true });
  ctx.drawImage(p.map.image, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, H * 0.18, W, 18); ctx.fillRect(0, H * 0.78, W, 18);
  ctx.fillStyle = 'rgba(50,50,50,0.9)';
  ctx.fillRect(8, H * 0.18 + 2, 46, 14); ctx.fillRect(8, H * 0.78 + 2, 46, 14);
  ctx.beginPath(); ctx.arc(W - 30, H * 0.5, 8, 0, 7); ctx.fill();
  return { map: toTexture(c, { repeat: false }), normalMap: p.normalMap };
}

function metalTex(seed = 81) {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const img = ctx.createImageData(S, S), d = img.data;
  const n1 = fbm(seed, 4, 4), n2 = fbm(seed + 5, 16, 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const a = n1(u, v), b = n2(u, v);
    const rust = Math.max(0, (b - 0.62) * 3.5) * (0.5 + a);
    let col = mix([225, 225, 225], [150, 80, 40], Math.min(1, rust));
    const k = 0.9 + a * 0.15;
    const i = (y * S + x) * 4;
    d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // costuras horizontais (barril)
  return toTexture(c);
}

function barrelTex() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  ctx.drawImage(metalTex(91).image, 0, 0);
  for (const y of [0.12, 0.5, 0.88]) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y * S - 5, S, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, y * S - 5, S, 2);
  }
  return toTexture(c);
}

function roofTex() {
  const W = 256, H = 256;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#a2492b'; ctx.fillRect(0, 0, W, H);
  const r = rng(13);
  const rows = 8, cols = 6;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * W / cols + (j % 2) * W / cols / 2, y = j * H / rows;
    const g = ctx.createLinearGradient(x, 0, x + W / cols, 0);
    const k = 0.85 + r() * 0.3;
    g.addColorStop(0, `rgb(${120 * k},${45 * k},${25 * k})`);
    g.addColorStop(0.5, `rgb(${205 * k},${95 * k},${55 * k})`);
    g.addColorStop(1, `rgb(${120 * k},${45 * k},${25 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, W / cols - 2, H / rows - 3);
    ctx.fillRect(x - W, y, W / cols - 2, H / rows - 3);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y + H / rows - 4, W / cols, 3); ctx.fillRect(x - W, y + H / rows - 4, W / cols, 3);
  }
  return toTexture(c);
}

function trimTex() {
  return concreteTex(17, 0xf2efe8);
}

// ------------------------------------------------------------------ efeitos
function softDot(S = 64, hard = 0) {
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = toTexture(c, { srgb: false, repeat: false });
  return t;
}

function smokePuff() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const img = ctx.createImageData(S, S), d = img.data;
  const n = fbm(131, 4, 5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.sqrt(dx * dx + dy * dy);
    const nn = n(x / S, y / S);
    let a = Math.max(0, 1 - r) ** 1.4 * (0.55 + nn * 0.9);
    a = Math.min(1, a * 1.25);
    const i = (y * S + x) * 4;
    const l = 200 + nn * 55;
    d[i] = l; d[i + 1] = l; d[i + 2] = l; d[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false });
}

function bulletHole() {
  const S = 64;
  const { c, ctx } = canvas(S, S);
  const r = rng(77);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.18, 'rgba(15,10,5,0.95)');
  g.addColorStop(0.32, 'rgba(60,45,30,0.75)'); g.addColorStop(0.6, 'rgba(80,65,45,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(20,15,10,0.6)'; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, l = 8 + r() * 14;
    ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * 5, S / 2 + Math.sin(a) * 5);
    ctx.lineTo(S / 2 + Math.cos(a + (r() - 0.5) * 0.4) * l, S / 2 + Math.sin(a + (r() - 0.5) * 0.4) * l); ctx.stroke();
  }
  return toTexture(c, { repeat: false });
}

// Atlas de marcas de bala (4 quadros de 128 px): 0 alvenaria/concreto,
// 1 madeira, 2 metal, 3 terra. Cores neutras: o tom da superfície vem da
// cor da instância. O furo fica no centro; marcas oblíquas são esticadas
// ao longo da trajetória na hora de colocar.
function bulletHoleAtlas() {
  const S = 128, W = S * 4;
  const { c, ctx } = canvas(W, S);
  const r = rng(913);
  const cx = S / 2, cy = S / 2;
  const blob = (ox, rad, rough, fill) => {
    ctx.beginPath();
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (1 - rough / 2 + r() * rough);
      const x = ox + cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  // 0: alvenaria — poeira clara, cratera lascada, furo escuro, rachaduras
  {
    const ox = 0;
    const g = ctx.createRadialGradient(ox + cx, cy, 4, ox + cx, cy, 56);
    g.addColorStop(0, 'rgba(235,230,220,0.55)'); g.addColorStop(0.5, 'rgba(220,214,200,0.25)'); g.addColorStop(1, 'rgba(220,214,200,0)');
    ctx.fillStyle = g; ctx.fillRect(ox, 0, S, S);
    blob(ox, 34, 0.5, 'rgba(150,140,124,0.55)');
    blob(ox, 24, 0.55, 'rgba(92,84,72,0.92)');
    blob(ox, 15, 0.45, 'rgba(45,40,34,1)');
    blob(ox, 9, 0.3, 'rgba(8,6,4,1)');
    ctx.strokeStyle = 'rgba(40,36,30,0.55)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      let a = r() * Math.PI * 2, x = ox + cx + Math.cos(a) * 14, y = cy + Math.sin(a) * 14;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * (6 + r() * 7); y += Math.sin(a) * (6 + r() * 7); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  // 1: madeira — furo com lascas claras puxadas ao longo do veio
  {
    const ox = S;
    for (let i = 0; i < 14; i++) {
      const s = r() < 0.5 ? -1 : 1, len = 14 + r() * 34, w = 2 + r() * 4, y = cy + (r() - 0.5) * 18;
      ctx.fillStyle = `rgba(${215 + r() * 30},${185 + r() * 30},${140 + r() * 30},${0.55 + r() * 0.35})`;
      ctx.beginPath(); ctx.moveTo(ox + cx, y - w); ctx.lineTo(ox + cx + s * len, y + (r() - 0.5) * 4); ctx.lineTo(ox + cx, y + w); ctx.fill();
    }
    blob(ox, 17, 0.6, 'rgba(80,52,30,0.92)');
    blob(ox, 10, 0.4, 'rgba(12,7,4,1)');
  }
  // 2: metal — amassado brilhante com anel e furo pequeno
  {
    const ox = S * 2;
    const g = ctx.createRadialGradient(ox + cx, cy, 2, ox + cx, cy, 30);
    g.addColorStop(0, 'rgba(20,20,22,1)'); g.addColorStop(0.22, 'rgba(60,60,64,0.95)'); g.addColorStop(0.4, 'rgba(225,228,232,0.9)');
    g.addColorStop(0.62, 'rgba(150,152,158,0.55)'); g.addColorStop(1, 'rgba(120,120,125,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + cx, cy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2; ctx.beginPath(); ctx.moveTo(ox + cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); ctx.lineTo(ox + cx + Math.cos(a) * (16 + r() * 10), cy + Math.sin(a) * (16 + r() * 10)); ctx.stroke(); }
  }
  // 3: terra — buraco fofo, sem rachaduras
  {
    const ox = S * 3;
    const g = ctx.createRadialGradient(ox + cx, cy, 2, ox + cx, cy, 40);
    g.addColorStop(0, 'rgba(25,18,10,1)'); g.addColorStop(0.3, 'rgba(70,52,32,0.85)'); g.addColorStop(0.7, 'rgba(110,86,56,0.3)'); g.addColorStop(1, 'rgba(110,86,56,0)');
    ctx.fillStyle = g; ctx.fillRect(ox, 0, S, S);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(60,45,28,${0.3 + r() * 0.5})`; const a = r() * Math.PI * 2, d = 12 + r() * 26; ctx.fillRect(ox + cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + r() * 2.5, 1 + r() * 2.5); }
  }
  return toTexture(c, { repeat: false });
}

// Raspão (bala que pega de lado na parede): sulco que começa fino no
// ponto de entrada (esquerda) e termina largo, com lascas (direita).
function bulletScuff() {
  const W = 256, H = 64;
  const { c, ctx } = canvas(W, H);
  const r = rng(517);
  const cy = H / 2;
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(30,26,22,0)'); g.addColorStop(0.15, 'rgba(30,26,22,0.6)'); g.addColorStop(0.75, 'rgba(25,22,18,0.95)'); g.addColorStop(1, 'rgba(25,22,18,0)');
  // halo de poeira
  ctx.fillStyle = 'rgba(235,228,215,0.45)';
  ctx.beginPath(); ctx.moveTo(8, cy); ctx.quadraticCurveTo(W * 0.6, cy - 30, W - 4, cy); ctx.quadraticCurveTo(W * 0.6, cy + 30, 8, cy); ctx.fill();
  // sulco (lasca arrancada): estreito na entrada, largo no fim
  ctx.fillStyle = 'rgba(110,100,88,0.85)';
  ctx.beginPath(); ctx.moveTo(6, cy);
  ctx.quadraticCurveTo(W * 0.5, cy - 18, W - 22, cy - 15); ctx.quadraticCurveTo(W - 2, cy, W - 22, cy + 15);
  ctx.quadraticCurveTo(W * 0.5, cy + 18, 6, cy); ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(10, cy);
  ctx.quadraticCurveTo(W * 0.55, cy - 10, W - 26, cy - 8); ctx.quadraticCurveTo(W - 10, cy, W - 26, cy + 8);
  ctx.quadraticCurveTo(W * 0.55, cy + 10, 10, cy); ctx.fill();
  // fundo mais escuro no meio do sulco
  ctx.strokeStyle = 'rgba(8,6,4,0.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(30, cy); ctx.lineTo(W - 30, cy + (r() - 0.5) * 2); ctx.stroke();
  // lascas no fim
  for (let i = 0; i < 18; i++) {
    const x = W * (0.65 + r() * 0.3), y = cy + (r() - 0.5) * 26;
    ctx.fillStyle = `rgba(40,34,28,${0.35 + r() * 0.5})`;
    ctx.fillRect(x, y, 1.5 + r() * 3, 1.5 + r() * 3);
  }
  return toTexture(c, { repeat: false });
}

function scorch() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const img = ctx.createImageData(S, S), d = img.data;
  const n = fbm(141, 4, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - r * (0.8 + n(x / S, y / S) * 0.5)) ** 0.8;
    const i = (y * S + x) * 4;
    d[i] = 15; d[i + 1] = 12; d[i + 2] = 10; d[i + 3] = Math.min(255, a * 240);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false });
}

function muzzleStar() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  ctx.translate(S / 2, S / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(S / 2, 0); ctx.lineTo(0, 5); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, S * 0.22, 0, 7); ctx.fill();
  return toTexture(c, { srgb: false, repeat: false });
}

function stripes(c1, c2) {
  const { c, ctx } = canvas(64, 64);
  ctx.fillStyle = c1; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = c2;
  for (let i = 0; i < 4; i++) ctx.fillRect(i * 16, 0, 8, 64);
  return toTexture(c);
}

// ------------------------------------------------------------------ neve
function snowTex(S) {
  const W = S, H = S;
  const { c, ctx } = canvas(W, H);
  const img = ctx.createImageData(W, H), d = img.data;
  const n1 = fbm(131, 4, 5), n2 = fbm(149, 18, 3), n3 = fbm(163, 2, 3);
  const hgt = new Float32Array(W * H);
  const c1 = hex(0xf3f6f9), c2 = hex(0xdfe7ef), c3 = hex(0xffffff), c4 = hex(0xc9d4df);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const a = n1(u, v), b = n2(u, v), e = n3(u, v);
    let col = mix(c1, c2, Math.min(1, Math.max(0, (a - 0.45) * 2.0)));
    col = mix(col, c3, Math.max(0, (e - 0.5) * 1.6));
    col = mix(col, c4, Math.max(0, (0.3 - b) * 1.2));
    const i = (y * W + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    hgt[y * W + x] = a * 0.7 + b * 0.3;
  }
  ctx.putImageData(img, 0, 0);
  // brilhos e pegadas apagadas
  const r = rng(77);
  for (let i = 0; i < S * 1.2; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + r() * 0.5) + ')'; ctx.fillRect(r() * W, r() * H, 1, 1); }
  for (let i = 0; i < S * 0.08; i++) {
    const x = r() * W, y = r() * H;
    ctx.fillStyle = 'rgba(150,170,195,0.10)';
    ctx.beginPath(); ctx.ellipse(x, y, 3 + r() * 4, 2 + r() * 2, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  return { map: toTexture(c, { aniso: 8 }), normalMap: normalFromHeight(hgt, W, H, 2.0) };
}
let snowCache = null;
export function getSnowTexture() { return snowCache || (snowCache = snowTex(512)); }

let cache = null;
export function getTextures() {
  if (cache) return cache;
  const t0 = performance.now();
  cache = {
    ground: groundTex(512),
    plaster: plasterTex(),
    stone: blocksTex({ seed: 201, rows: 4, cols: 3, mortar: 3, colors: [0xcdb48c, 0xc4a87d, 0xd8c29a, 0xb99c72], mortarColor: 0x8f7f68, bevel: 6, jitter: 0.08 }),
    wall: blocksTex({ seed: 211, rows: 5, cols: 4, mortar: 4, colors: [0xb8a588, 0xa8977c, 0xc4b296, 0x9f8d73], mortarColor: 0x6f6454, bevel: 7, jitter: 0.1 }),
    brick: blocksTex({ seed: 221, rows: 26, cols: 8, mortar: 2, colors: [0xa4482c, 0x983e26, 0xb3583a, 0x8b3a24, 0xa85032], mortarColor: 0xcfc4b0, bevel: 2, jitter: 0.12, strength: 2.5 }),
    concrete: concreteTex(),
    wood: planksTex({ seed: 41, base: 0x9a6a3c }),
    crate: crateTex(),
    door: doorTex(),
    metal: { map: metalTex() },
    barrel: { map: barrelTex() },
    roof: { map: roofTex() },
    trim: trimTex(),
    soft: softDot(64, 0.05),
    spark: softDot(32, 0.35),
    smoke: smokePuff(),
    hole: bulletHole(),
    holeAtlas: bulletHoleAtlas(),
    scuff: bulletScuff(),
    scorch: scorch(),
    muzzle: muzzleStar(),
    awnings: [stripes('#e63946', '#f1faee'), stripes('#2a9d8f', '#e9f5db'), stripes('#f4a261', '#264653'), stripes('#457b9d', '#f1faee')],
  };
  console.log(`texturas geradas em ${(performance.now() - t0).toFixed(0)} ms`);
  return cache;
}
