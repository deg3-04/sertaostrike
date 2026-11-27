// Prévia do mapa vista de cima (canvas 2D, sem WebGL). Desenhada uma vez por
// mapa e guardada em cache: trocar a seleção depois disso é instantâneo.
import { getMap, MAP_LIST } from '/shared/maps.js';

const cache = new Map();
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function mapInfo(id) { return MAP_LIST.find((m) => m.id === id) || MAP_LIST[0]; }

// devolve { url, w, h } (metros) do mapa
export function mapPreview(id, size = 260) {
  const key = id + '|' + size;
  if (cache.has(key)) return cache.get(key);
  const map = getMap(id), B = map.bounds, th = map.theme || {};
  const W = B.maxX - B.minX, H = B.maxZ - B.minZ;
  const pad = 6, s = (size - pad * 2) / Math.max(W, H);
  const cw = Math.round(W * s + pad * 2), ch = Math.round(H * s + pad * 2);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  // canvas na CPU: gerar a imagem não espera a placa de vídeo (que está desenhando o jogo)
  const g = c.getContext('2d', { willReadFrequently: true });
  const X = (x) => pad + (x - B.minX) * s, Z = (z) => pad + (z - B.minZ) * s;
  // chão: cor do tema (terra/grama ou concreto)
  const gt = th.groundTint || th.grassTint || [0.75, 0.68, 0.5];
  const base = th.ground === 'snow' ? [0.93, 0.95, 0.97] : th.ground === 'concrete' ? [0.62 * gt[0] + 0.25, 0.62 * gt[1] + 0.25, 0.62 * gt[2] + 0.25] : [gt[0] * 0.95, gt[1] * 0.85, gt[2] * 0.7];
  g.fillStyle = `rgb(${base.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
  g.fillRect(0, 0, cw, ch);
  const tints = th.tints || [];
  // relevo: mais claro = mais alto
  for (const b of map.boxes) {
    if (!b.terrain) continue;
    g.fillStyle = `rgba(${th.ground === 'snow' ? '120,140,165' : '255,255,255'},${Math.min(0.55, 0.05 * (b.max[1] / 0.4))})`;
    g.fillRect(X(b.min[0]), Z(b.min[2]), Math.max(1, (b.max[0] - b.min[0]) * s), Math.max(1, (b.max[2] - b.min[2]) * s));
  }
  const boxes = map.boxes.filter((b) => !b.floor && !b.hidden && !b.trim && !b.terrain && b.min[1] - (b.base || 0) < 2.5).sort((a, b) => a.max[1] - b.max[1]);
  for (const b of boxes) {
    const x = X(b.min[0]), y = Z(b.min[2]), w = Math.max(1, (b.max[0] - b.min[0]) * s), h = Math.max(1, (b.max[2] - b.min[2]) * s);
    const top = b.max[1] - (b.base || 0);
    let col;
    if (b.boundary) col = '#2b2f36';
    else if (top > 2.9) col = b.tint != null && tints[b.tint] ? shade(tints[b.tint], 0.55) : b.mat === 'brick' ? '#6e3a2c' : '#3d424b';
    else if (b.mat === 'metal') col = b.tint != null && tints[b.tint] ? shade(tints[b.tint], 0.8) : '#5a6470';  // contêiner
    else if (b.mat === 'ice') col = '#bfe0f0';
    else if (b.stair) col = '#9a958c';
    else if (top > 1.2) col = b.mat === 'crate' || b.mat === 'wood' || b.mat === 'door' ? '#8a6a3a' : '#8c8a84';
    else col = b.mat === 'stone' ? '#a49c8c' : '#9a7a4a';
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  }
  // áreas cobertas (telhado) em leve sombreado
  g.fillStyle = 'rgba(20,24,30,0.28)';
  for (const b of map.boxes) if (b.roof) g.fillRect(X(b.min[0]), Z(b.min[2]), (b.max[0] - b.min[0]) * s, (b.max[2] - b.min[2]) * s);
  // água / decoração marcante
  for (const p of map.props) if (p.type === 'water') { g.fillStyle = '#4a8ac0'; g.beginPath(); g.arc(X(p.x), Z(p.z), (p.s / 2) * s, 0, Math.PI * 2); g.fill(); }
  // bases: CT (norte, azul) e TR (sul, laranja)
  const zone = (side, color, label) => {
    const pts = map.spawns.filter((q) => q.side === side);
    if (!pts.length) return;
    g.fillStyle = color;
    for (const q of pts) { g.beginPath(); g.arc(X(q.x), Z(q.z), Math.max(2, s * 0.7), 0, Math.PI * 2); g.fill(); }
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length, cz = pts.reduce((a, q) => a + q.z, 0) / pts.length;
    g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.strokeText(label, X(cx), Z(cz));
    g.fillStyle = '#fff'; g.fillText(label, X(cx), Z(cz));
  };
  zone('north', '#5aa9ff', 'CT');
  zone('south', '#ffb347', 'TR');
  const out = { url: c.toDataURL('image/png'), w: Math.round(W), h: Math.round(H), sky: hex(th.sky ? th.sky.horizon : 0xcccccc) };
  cache.set(key, out);
  return out;
}

function shade(css, k) {
  const n = parseInt(css.slice(1), 16);
  const r = ((n >> 16) & 255) * k, gg = ((n >> 8) & 255) * k, b = (n & 255) * k;
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

// bloco HTML pronto (imagem + nome + tamanho + descrição)
export function mapCard(id, size = 260) {
  const p = mapPreview(id, size), info = mapInfo(id);
  return `<div class="mapcard"><img src="${p.url}" alt="Prévia de ${info.name}"><div><b>${info.name}</b><span class="mapsz">${p.w} × ${p.h} m</span><p>${info.desc || ''}</p></div></div>`;
}
