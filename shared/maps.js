// Mapas do jogo. Cada mapa é formado por caixas (colisão + visual), pontos
// de renascimento e decoração. O mapa "Vila Sertão" é simétrico por rotação
// de 180° (as duas bases são equivalentes): tudo que é definido na metade
// norte é copiado automaticamente para a metade sul.
import { PLAYER } from './constants.js';
import { floorHeightAt, overlapsAny } from './physics.js';

// ---------------------------------------------------------------- utilitários
function box(x1, y1, z1, x2, y2, z2, mat, o = {}) {
  return {
    min: [Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)],
    max: [Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)],
    mat, ...o,
  };
}
// prédio com fachada (janelas/portas geradas no cliente)
function bld(x1, z1, x2, z2, h, tint, o = {}) {
  return box(x1, 0, z1, x2, h, z2, o.mat || 'plaster', { tint, facade: true, ...o });
}
function crate(x, z, s, y = 0, o = {}) {
  return box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, 'crate', { pen: true, ...o });
}
function barrel(x, z, y = 0) {
  return box(x - 0.32, y, z - 0.32, x + 0.32, y + 0.95, z + 0.32, 'barrel', { pen: true, shape: 'barrel' });
}
// escada maciça: degraus sem sobreposição subindo na direção 'dir'
function stairs(out, x1, z1, x2, z2, y0, y1, dir, n, mat = 'concrete') {
  const step = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const top = y0 + step * (i + 1);
    let a1 = x1, a2 = x2, b1 = z1, b2 = z2;
    if (dir === '+x') { const run = (x2 - x1) / n; a1 = x1 + run * i; a2 = x1 + run * (i + 1); }
    if (dir === '-x') { const run = (x2 - x1) / n; a2 = x2 - run * i; a1 = x2 - run * (i + 1); }
    if (dir === '+z') { const run = (z2 - z1) / n; b1 = z1 + run * i; b2 = z1 + run * (i + 1); }
    if (dir === '-z') { const run = (z2 - z1) / n; b2 = z2 - run * i; b1 = z2 - run * (i + 1); }
    out.push(box(a1, y0, b1, a2, top, b2, mat, { stair: true }));
  }
}
function cart(out, props, x, z, alongX) {
  const hw = alongX ? 1.35 : 0.75, hd = alongX ? 0.75 : 1.35;
  out.push(box(x - hw, 0, z - hd, x + hw, 1.25, z + hd, 'wood', { pen: true, shape: 'cart', alongX }));
  props.push({ type: 'cart', x, z, alongX });
}

function rotBox(b) {
  return { ...b, min: [-b.max[0], b.min[1], -b.max[2]], max: [-b.min[0], b.max[1], -b.min[2]], mirrored: true };
}
function rotPoint(p) { return [-p[0], p[1], -p[2]]; }
function rotProp(p) {
  const q = { ...p, mirrored: true };
  if ('x' in p) q.x = -p.x;
  if ('z' in p) q.z = -p.z;
  if (p.a) q.a = rotPoint(p.a);
  if (p.b) q.b = rotPoint(p.b);
  if ('x1' in p) { q.x1 = -p.x2; q.x2 = -p.x1; q.z1 = -p.z2; q.z2 = -p.z1; }
  if ('rot' in p) q.rot = p.rot + Math.PI;
  if (p.side) q.side = p.side === 'north' ? 'south' : p.side === 'south' ? 'north' : p.side;
  return q;
}

// --------------------------------------------------------------- Vila Sertão
function buildSertao() {
  const S = [];      // metade norte (será espelhada)
  const C = [];      // peças centrais/únicas (não espelhadas)
  const P = [];      // decoração espelhada
  const PC = [];     // decoração única
  const SP = [];     // spawns (metade norte, espelhados)

  // ---- piso e muralhas externas
  C.push(box(-47, -1, -47, 47, 0, 47, 'ground', { floor: true }));
  C.push(box(-47, 0, -47, -44, 9, 47, 'wall', { boundary: true }));
  C.push(box(44, 0, -47, 47, 9, 47, 'wall', { boundary: true }));
  C.push(box(-44, 0, -47, 44, 9, -44, 'wall', { boundary: true }));
  C.push(box(-44, 0, 44, 44, 9, 47, 'wall', { boundary: true }));

  // ================= CORREDOR OESTE (Rua do Comércio / Praça A / Armazém)
  S.push(bld(-44, -44, -22, -38, 7, 3, { name: 'Casa Azul' }));
  S.push(bld(-44, -38, -36, -30, 6.5, 1));
  S.push(bld(-44, -30, -36, -22, 5.5, 5));
  S.push(bld(-44, -22, -36, -14, 7, 0));
  // barracas da feira (balcões de madeira)
  S.push(box(-31, 0, -29.6, -27, 1.05, -28.4, 'wood', { pen: true, name: 'Barraca' }));
  S.push(crate(-30.3, -30.2, 0.8));
  P.push({ type: 'awning', x1: -31.4, z1: -30.8, x2: -26.6, z2: -27.6, y: 2.6, color: 0 });
  S.push(box(-31, 0, -20.6, -27, 1.05, -19.4, 'wood', { pen: true, name: 'Barraca' }));
  S.push(crate(-27.7, -21.2, 0.8));
  P.push({ type: 'awning', x1: -31.4, z1: -21.8, x2: -26.6, z2: -18.6, y: 2.6, color: 1 });
  S.push(barrel(-35.2, -33.4), barrel(-35.25, -32.6), barrel(-35.3, -21));
  P.push({ type: 'pot', x: -35.4, z: -25.2 }, { type: 'pot', x: -35.3, z: -24.4, s: 0.8 });

  // Praça A: plataforma (coreto de pedra) com escadas e parapeitos
  S.push(box(-44, 0, -8, -32, 1.6, 8, 'stone', { name: 'Plataforma A' }));
  stairs(S, -32, -2, -28, 2, 0, 1.6, '-x', 5);
  stairs(S, -40, -12, -37, -8, 0, 1.6, '+z', 5);
  S.push(box(-32.6, 1.6, -8, -32, 2.6, -2, 'stone'));
  S.push(box(-32.6, 1.6, 2, -32, 2.6, 8, 'stone'));
  S.push(box(-44, 1.6, 7.4, -32.6, 2.5, 8, 'stone'));
  S.push(box(-44, 1.6, -8, -40, 2.5, -7.4, 'stone'));
  S.push(box(-37, 1.6, -8, -32.6, 2.5, -7.4, 'stone'));
  S.push(crate(-38, 3, 1.2, 1.6), crate(-41.2, -3.2, 1.0, 1.6));
  S.push(crate(-25.5, -9.5, 1.6), crate(-27.2, -9.75, 0.9), crate(-26, 4.6, 1.2), barrel(-23.4, 10.6));
  P.push({ type: 'palm', x: -42.6, z: 11.2, h: 7.5, rot: 0.6 }, { type: 'cactus', x: -42.8, z: -12.6, h: 2.6 });
  S.push(box(-42.8, 0, 11.0, -42.4, 2.2, 11.4, 'trunk', { hidden: true }));

  // Armazém (tijolos) com corredores dos dois lados
  S.push(bld(-36, 18, -28, 30, 6, 2, { mat: 'brick', name: 'Armazém' }));
  S.push(crate(-40.2, 23, 1.6), crate(-38.6, 23.4, 0.9), crate(-24, 21, 1.2), barrel(-23.1, 26.2));
  cart(S, P, -40.6, 33.2, false);
  S.push(crate(-30, 34, 1.6), crate(-31.65, 34.25, 0.9));
  S.push(bld(-44, 38, -22, 44, 6, 6));
  P.push({ type: 'cactus', x: -23, z: 36.5, h: 2.2 });

  // ================= BASE NORTE
  for (const [lx, lz] of [[13.5, -42.5], [16.5, -42.5], [13.5, -39.5], [16.5, -39.5]]) {
    S.push(box(lx - 0.18, 0, lz - 0.18, lx + 0.18, 6, lz + 0.18, 'metal', { pen: true }));
  }
  S.push(box(12.9, 6, -43.1, 17.1, 9, -38.9, 'metal', { tint: 7, name: "Caixa d'água", tank: true }));
  S.push(crate(-11, -35, 1.6), crate(-9.4, -35, 1.6), crate(-10.2, -35, 1.6, 1.6), crate(-12.7, -35.3, 0.9));
  S.push(crate(8.5, -35, 1.2), crate(9.8, -35.25, 1.2));
  cart(S, P, 2, -40.5, true);
  P.push({ type: 'palm', x: -20.5, z: -42.3, h: 8, rot: 2.1 }, { type: 'cactus', x: 20.8, z: -42.8, h: 2.8 });
  S.push(box(-20.7, 0, -42.5, -20.3, 2.2, -42.1, 'trunk', { hidden: true }));
  SP.push([-17, -41], [-9, -41.5], [-3, -37.5], [5, -36], [10, -41], [19, -41.5], [-18, -33], [18, -33]);

  // ================= QUARTEIRÃO NOROESTE (igreja + beco norte)
  S.push(bld(-22, -30, -4, -21, 6, 7));
  S.push(bld(-22, -16, -4, -6, 7, 0, { church: true, name: 'Igreja' }));
  C.push(box(-9, 0, -11, -4, 15, -6, 'plaster', { tint: 0, tower: true, name: 'Torre da igreja' }));
  PC.push({ type: 'tower', x: -6.5, z: -8.5, y: 15, s: 5 });
  S.push(box(-13.5, 3.8, -21, -12.5, 4.8, -16, 'stone', { arch: true }));
  S.push(crate(-14, -18.6, 1.2), barrel(-7.5, -20.2));

  // ================= QUARTEIRÃO NORDESTE (beco leste + pátio)
  S.push(bld(4, -30, 12, -12, 6, 4));
  S.push(bld(16, -30, 22, -6, 7.5, 2));
  S.push(box(12, 3.9, -30.5, 16, 4.8, -29.5, 'stone', { arch: true }));
  S.push(crate(13.1, -21, 1.2), barrel(15.3, -27));
  S.push(crate(8, -10, 1.6), crate(9.7, -10.4, 0.9));

  // ================= MEIO (portas do meio)
  S.push(box(-4, 0, -14.15, -1.15, 3.0, -13.85, 'door', { pen: true, name: 'Porta do meio' }));
  S.push(box(1.15, 0, -14.15, 4, 3.0, -13.85, 'door', { pen: true, name: 'Porta do meio' }));
  S.push(box(-4, 3.0, -14.3, 4, 3.7, -13.7, 'stone', { arch: true }));
  S.push(crate(-2.6, -25.5, 1.2), crate(2.95, -9.2, 0.9));

  // ================= PRAÇA CENTRAL (chafariz)
  C.push(box(-1.8, 0, -1.8, 1.8, 0.85, 1.8, 'stone', { name: 'Chafariz' }));
  C.push(box(-0.35, 0.85, -0.35, 0.35, 2.3, 0.35, 'stone'));
  C.push(box(-0.9, 2.3, -0.9, 0.9, 2.5, 0.9, 'stone'));
  PC.push({ type: 'water', x: 0, z: 0, s: 3.3, y: 0.78 });
  S.push(crate(-15, -3.8, 1.6), crate(-13.4, -4.1, 0.9), barrel(-19.5, -5.3));

  // ---- bandeirinhas (festa junina) e decoração
  P.push({ type: 'bunting', a: [-36, 5.0, -26], b: [-22, 5.0, -26], sag: 0.9 });
  P.push({ type: 'bunting', a: [-36, 5.0, -33], b: [-22, 5.6, -33], sag: 1.0 });
  P.push({ type: 'bunting', a: [-4, 5.2, -25], b: [4, 5.2, -25], sag: 0.6 });
  P.push({ type: 'bunting', a: [-4, 5.2, -19], b: [4, 5.2, -19], sag: 0.6 });
  P.push({ type: 'bunting', a: [12, 5.2, -24], b: [16, 5.4, -24], sag: 0.4 });
  P.push({ type: 'bunting', a: [0, 2.55, 0], b: [-12, 6.0, -6], sag: 0.8 });
  P.push({ type: 'bunting', a: [0, 2.55, 0], b: [-18, 5.5, 6], sag: 1.0 });
  P.push({ type: 'bunting', a: [-22, 6.0, -5.95], b: [-30.5, 5.0, -14], sag: 1.0 });
  P.push({ type: 'lamp', x: -4.05, z: -27, y: 3.4, rot: Math.PI / 2 });
  P.push({ type: 'lamp', x: -21.95, z: -40.5, y: 3.4, rot: Math.PI / 2 });

  // spawns neutros (modo "qualquer lugar")
  const neutral = [[-30, -36], [-26, -24], [-39, 0], [-25, 16], [8, -8], [-14, -17], [14, -14], [-18, 2]];

  // ---- montagem final com espelhamento
  const boxes = [...C];
  for (const b of S) { boxes.push(b); boxes.push(rotBox(b)); }
  const props = [...PC];
  for (const p of P) { props.push(p); props.push(rotProp(p)); }

  const spawns = [];
  for (const [x, z] of SP) {
    spawns.push({ x, z, yaw: Math.PI, side: 'north' });
    spawns.push({ x: -x, z: -z, yaw: 0, side: 'south' });
  }
  for (const [x, z] of neutral) {
    const yaw = Math.atan2(x, z); // olhando para o centro
    spawns.push({ x, z, yaw, side: 'any' });
    spawns.push({ x: -x, z: -z, yaw: yaw + Math.PI, side: 'any' });
  }

  return {
    id: 'sertao', name: 'Vila Sertão',
    boxes, props, spawns,
    bounds: { minX: -44, maxX: 44, minZ: -44, maxZ: 44 },
    theme: {
      sky: { top: 0x3b7fd1, horizon: 0xf3d6a8, bottom: 0xe8c79a },
      sun: { dir: [-0.45, 0.78, 0.43], color: 0xfff1d6, intensity: 3.1 },
      hemi: { sky: 0xbcd7ff, ground: 0xc7a06a, intensity: 1.15 },
      fog: { color: 0xf0d9b5, near: 70, far: 260 },
      exposure: 1.0,
      clouds: 0.32, grassTint: [0.78, 0.74, 0.42],
      tints: ['#efe6d2', '#e7b85a', '#d4704f', '#7fb4d6', '#9cbf8e', '#e8a0a6', '#b9a2d4', '#f0a04b'],
    },
    nav: { cell: 1.0 },
  };
}


// --------------------------------------------------------------- Porto Delta
// Porto industrial com contêineres, no layout clássico de CS: base CT (norte)
// e base TR (sul), bombsite A (leste, com "long" e passarela elevada) e
// bombsite B (oeste, com túneis cobertos), meio com portas de madeira.
// Desenhado numa grade de 2 m; paredes iguais são mescladas em caixas grandes.
function buildPorto() {
  const N = 36, CELL = 2, X0 = -36, Z0 = -36;
  const g = [];
  for (let r = 0; r < N; r++) g.push(new Array(N).fill('#'));
  const carve = (c0, r0, c1, r1, ch = '.') => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch; };
  const put = (c, r, ch) => { g[r][c] = ch; };

  // ---- áreas abertas
  carve(1, 1, 10, 10);            // bombsite B
  carve(13, 1, 22, 5);            // base CT
  carve(11, 3, 12, 4);            // CT -> B
  carve(23, 3, 24, 4);            // CT -> A
  carve(25, 1, 34, 10);           // bombsite A
  carve(16, 6, 18, 29);           // meio
  carve(11, 8, 15, 9);            // meio -> B (janela do CT)
  carve(2, 11, 5, 13);            // entrada dos túneis B
  carve(2, 14, 5, 25, 'R');       // túneis B (cobertos)
  carve(6, 18, 15, 19, 'R');      // túnel inferior (meio -> B)
  carve(2, 26, 11, 31);           // saída dos túneis / lado TR
  carve(12, 30, 23, 34);          // base TR
  carve(24, 30, 33, 33);          // TR -> long
  carve(30, 11, 33, 29);          // long A
  carve(19, 24, 29, 25);          // meio -> long ("curva")
  // ---- portas de madeira (meio e long)
  put(16, 11, 'W'); put(18, 11, 'W');
  put(30, 21, 'W'); put(33, 21, 'W');
  // ---- passarela elevada (short A) e plataformas dos bombsites
  carve(20, 11, 28, 12, 'P'); carve(19, 11, 19, 12, '>');
  carve(30, 1, 34, 4, 'P'); carve(29, 2, 29, 3, '>'); carve(31, 5, 32, 5, '^');
  carve(1, 1, 4, 3, 'P'); carve(5, 1, 5, 2, '<');
  // ---- coberturas: contêineres (K), caixotes (c, C), sacos de areia (s)
  carve(26, 6, 26, 8, 'K'); carve(32, 7, 33, 7, 'K'); carve(25, 2, 26, 2, 'K');
  carve(7, 4, 7, 6, 'K'); carve(2, 7, 4, 7, 'K');
  carve(14, 32, 15, 32, 'K'); carve(21, 31, 21, 32, 'K');
  for (const [c, r, ch] of [[17, 15, 'c'], [16, 22, 'c'], [31, 15, 'C'], [33, 26, 'c'], [4, 22, 'c'], [6, 28, 'c'], [7, 28, 'C'],
    [15, 3, 'c'], [9, 9, 'c'], [9, 2, 'C'], [28, 9, 'c'], [34, 9, 'C'], [11, 27, 'c'], [27, 32, 'c'], [3, 12, 'c'], [24, 24, 'c']]) put(c, r, ch);
  carve(30, 18, 31, 18, 's'); carve(13, 8, 13, 8, 's'); carve(8, 26, 9, 26, 's'); carve(17, 27, 17, 27, 's');

  const boxes = [], props = [], spawns = [];
  const cx = (c) => X0 + c * CELL, cz = (r) => Z0 + r * CELL;
  // mescla gulosa de células iguais
  const used = g.map((row) => row.map(() => false));
  const merge = (pred, make) => {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (used[r][c] || !pred(g[r][c])) continue;
      const ch = g[r][c];
      let c1 = c; while (c1 + 1 < N && !used[r][c1 + 1] && g[r][c1 + 1] === ch) c1++;
      let r1 = r;
      outer: while (r1 + 1 < N) { for (let k = c; k <= c1; k++) if (used[r1 + 1][k] || g[r1 + 1][k] !== ch) break outer; r1++; }
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      make(ch, cx(c), cz(r), cx(c1 + 1), cz(r1 + 1), c, r);
    }
  };
  const WALL_MATS = ['concrete', 'brick', 'plaster', 'concrete', 'wall'];
  merge((ch) => ch === '#', (ch, x1, z1, x2, z2, c, r) => {
    const border = c === 0 || r === 0 || x2 >= X0 + N * CELL - 0.01 || z2 >= Z0 + N * CELL - 0.01;
    const mat = border ? 'wall' : WALL_MATS[(c * 7 + r * 3) % WALL_MATS.length];
    const h = border ? 8 : 5 + ((c + r) % 3) * 1.2;
    boxes.push(box(x1, 0, z1, x2, h, z2, mat, { tint: mat === 'plaster' ? 6 : undefined, boundary: border }));
    if (!border) {
      // acabamento: rodapé de concreto, faixa de sinalização e capa no topo
      boxes.push(box(x1 - 0.05, 0, z1 - 0.05, x2 + 0.05, 0.6, z2 + 0.05, 'concrete', { trim: true }));
      boxes.push(box(x1 - 0.06, 0.6, z1 - 0.06, x2 + 0.06, 0.75, z2 + 0.06, 'metal', { tint: 7, trim: true }));
      boxes.push(box(x1 - 0.12, h, z1 - 0.12, x2 + 0.12, h + 0.3, z2 + 0.12, 'concrete', { trim: true }));
    }
  });
  merge((ch) => ch === 'P', (ch, x1, z1, x2, z2) => boxes.push(box(x1, 0, z1, x2, 1.6, z2, 'concrete', { name: 'Plataforma' })));
  merge((ch) => ch === 's', (ch, x1, z1, x2, z2) => boxes.push(box(x1 + 0.3, 0, z1 + 0.5, x2 - 0.3, 1.0, z2 - 0.5, 'stone', { name: 'Sacos de areia' })));
  merge((ch) => ch === 'K', (ch, x1, z1, x2, z2, c, r) => {
    const alongX = x2 - x1 > z2 - z1;
    const inset = 0.15;
    boxes.push(box(x1 + (alongX ? 0 : inset), 0, z1 + (alongX ? inset : 0), x2 - (alongX ? 0 : inset), 2.6, z2 - (alongX ? inset : 0), 'metal',
      { tint: 1 + ((c * 5 + r * 3) % 6), pen: false, name: 'Contêiner' }));
  });
  merge((ch) => ch === 'R', (ch, x1, z1, x2, z2) => boxes.push(box(x1, 3.3, z1, x2, 4.2, z2, 'concrete', { roof: true })));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const ch = g[r][c], x = cx(c) + 1, z = cz(r) + 1;
    if (ch === 'c') boxes.push(crate(x, z, 1.5));
    if (ch === 'C') { boxes.push(crate(x, z, 1.5)); boxes.push(crate(x + 0.1, z - 0.1, 1.1, 1.5)); }
    if (ch === 'W') boxes.push(box(cx(c), 0, z - 0.15, cx(c + 1), 3.0, z + 0.15, 'door', { pen: true, name: 'Porta de madeira' }));
    if ('<>^v'.includes(ch)) {
      const dir = { '>': '+x', '<': '-x', '^': '-z', 'v': '+z' }[ch];
      stairs(boxes, cx(c), cz(r), cx(c + 1), cz(r + 1), 0, 1.6, dir, 5);
    }
  }
  // vigas sobre as portas
  boxes.push(box(cx(16), 3.0, cz(11) + 0.7, cx(19), 3.6, cz(11) + 1.3, 'metal', { tint: 7 }));
  boxes.push(box(cx(30), 3.0, cz(21) + 0.7, cx(34), 3.6, cz(21) + 1.3, 'metal', { tint: 7 }));
  boxes.push(box(-40, -1, -40, 40, 0, 40, 'ground', { floor: true }));

  // ---- renascimentos: CT (norte), TR (sul) e neutros
  const cell = (c, r) => [cx(c) + 1, cz(r) + 1];
  for (const [c, r] of [[14, 1], [17, 2], [20, 1], [22, 4], [13, 4], [18, 4], [16, 1], [21, 2]]) { const [x, z] = cell(c, r); spawns.push({ x, z, yaw: Math.PI, side: 'north' }); }
  for (const [c, r] of [[13, 34], [16, 33], [19, 34], [22, 33], [18, 31], [12, 31], [23, 31], [20, 34]]) { const [x, z] = cell(c, r); spawns.push({ x, z, yaw: 0, side: 'south' }); }
  for (const [c, r] of [[8, 8], [29, 8], [17, 8], [3, 18], [17, 20], [31, 13], [27, 25], [9, 29], [32, 31], [12, 19]]) {
    const [x, z] = cell(c, r); spawns.push({ x, z, yaw: Math.atan2(x, z), side: 'any' });
  }
  // ---- decoração
  props.push({ type: 'lamp', x: cx(16) + 0.05, z: cz(20), y: 3.0, rot: Math.PI / 2 });
  props.push({ type: 'lamp', x: cx(19) - 0.05, z: cz(9), y: 3.2, rot: -Math.PI / 2 });
  props.push({ type: 'lamp', x: cx(30) + 0.05, z: cz(16), y: 3.2, rot: Math.PI / 2 });
  props.push({ type: 'lamp', x: cx(2) + 0.05, z: cz(28), y: 3.0, rot: Math.PI / 2 });
  // lâmpadas nos túneis cobertos
  for (const [c, r, f] of [[3, 15, 0], [4, 20, 1], [3, 24, 0], [8, 18, 0], [13, 19, 1]]) props.push({ type: 'clamp', x: cx(c) + 1, z: cz(r) + 1, y: 3.3, drop: 0.45, flicker: !!f, i: 1.3 });

  return {
    id: 'porto', name: 'Porto Delta',
    boxes, props, spawns,
    bounds: { minX: X0, maxX: X0 + N * CELL, minZ: Z0, maxZ: Z0 + N * CELL },
    theme: {
      sky: { top: 0x4f6f9a, horizon: 0xe2c9a6, bottom: 0x9a8a78 },
      sun: { dir: [0.55, 0.55, -0.62], color: 0xffd9a8, intensity: 2.9 },
      hemi: { sky: 0xb7c6dd, ground: 0x8a7f72, intensity: 1.05 },
      fog: { color: 0xc9bca8, near: 55, far: 210 },
      exposure: 1.0,
      ground: 'concrete',
      groundTint: [0.62, 0.58, 0.52],
      clouds: 0.45,
      tints: ['#b5b0a8', '#9c3b2c', '#2f5f8a', '#3f6e45', '#c47a28', '#7c8c94', '#bdb7a8', '#d6a12a'],
    },
    nav: { cell: 1.0 },
  };
}


// --------------------------------------------------------------- mapas compactos (grade ASCII)
// Legenda da grade: '#' parede, '.' piso descoberto, ',' piso coberto (com teto), 'l' janela (parapeito + verga).
// Objetos vêm numa lista à parte ([coluna, linha, tipo]) para não "furar" o teto:
// K contêiner, c/C caixote(s), s sacos de areia, b barril, W/H meia-porta de madeira (W ao longo de X, H ao longo de Z),
// P plataforma (1,6 m), < > ^ v escada até a plataforma, p pilar.
function buildGrid(def) {
  const rows = def.grid, N = rows.length, M = rows[0].length, CELL = 2;
  const X0 = -M, Z0 = -N;
  rows.forEach((r, i) => { if (r.length !== M) throw new Error(`${def.id}: linha ${i} com ${r.length} colunas`); });
  const g = rows.map((r) => r.split(''));
  const obj = rows.map((r) => r.split('').map(() => null));
  for (const [c, r, ch] of def.objects) obj[r][c] = ch;
  const boxes = [], props = [], spawns = [];
  const cx = (c) => X0 + c * CELL, cz = (r) => Z0 + r * CELL;
  const merge = (grid, pred, make) => {
    const used = grid.map((row) => row.map(() => false));
    for (let r = 0; r < N; r++) for (let c = 0; c < M; c++) {
      if (used[r][c] || !pred(grid[r][c])) continue;
      const ch = grid[r][c];
      let c1 = c; while (c1 + 1 < M && !used[r][c1 + 1] && grid[r][c1 + 1] === ch) c1++;
      let r1 = r;
      outer: while (r1 + 1 < N) { for (let k = c; k <= c1; k++) if (used[r1 + 1][k] || grid[r1 + 1][k] !== ch) break outer; r1++; }
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      make(ch, cx(c), cz(r), cx(c1 + 1), cz(r1 + 1), c, r);
    }
  };
  const WH = def.wallHeight || 5, RY = def.roofY || 3.8;
  const mats = def.wallMats || ['concrete', 'brick', 'plaster', 'concrete'];
  merge(g, (ch) => ch === '#', (ch, x1, z1, x2, z2, c, r) => {
    const border = c === 0 || r === 0 || x2 >= X0 + M * CELL - 0.01 || z2 >= Z0 + N * CELL - 0.01;
    const mat = border ? 'wall' : mats[(c * 7 + r * 3) % mats.length];
    const h = border ? 8 : WH + ((c + r) % 2) * 0.6;
    boxes.push(box(x1, 0, z1, x2, h, z2, mat, { tint: mat === 'plaster' ? 6 : undefined, boundary: border }));
    if (!border) {
      boxes.push(box(x1 - 0.05, 0, z1 - 0.05, x2 + 0.05, 0.5, z2 + 0.05, 'concrete', { trim: true }));
      boxes.push(box(x1 - 0.1, h, z1 - 0.1, x2 + 0.1, h + 0.25, z2 + 0.1, 'concrete', { trim: true }));
    }
  });
  // janelas: parapeito baixo (dá para atirar por cima) e verga até o topo da parede
  merge(g, (ch) => ch === 'l', (ch, x1, z1, x2, z2) => {
    boxes.push(box(x1, 0, z1, x2, 1.05, z2, 'concrete', { name: 'Janela' }));
    boxes.push(box(x1, 2.3, z1, x2, WH, z2, mats[0], { tint: mats[0] === 'plaster' ? 6 : undefined }));
    boxes.push(box(x1 - 0.06, 1.0, z1 - 0.06, x2 + 0.06, 1.12, z2 + 0.06, 'metal', { tint: 7, trim: true }));
  });
  // teto das áreas cobertas
  merge(g, (ch) => ch === ',', (ch, x1, z1, x2, z2) => boxes.push(box(x1, RY, z1, x2, RY + 0.4, z2, 'concrete', { roof: true })));
  merge(obj, (ch) => ch === 'P', (ch, x1, z1, x2, z2) => boxes.push(box(x1, 0, z1, x2, 1.6, z2, 'concrete', { name: 'Plataforma' })));
  merge(obj, (ch) => ch === 's', (ch, x1, z1, x2, z2) => {
    const alongX = x2 - x1 >= z2 - z1;
    boxes.push(box(x1 + (alongX ? 0.1 : 0.5), 0, z1 + (alongX ? 0.5 : 0.1), x2 - (alongX ? 0.1 : 0.5), 1.0, z2 - (alongX ? 0.5 : 0.1), 'stone', { name: 'Sacos de areia' }));
  });
  merge(obj, (ch) => ch === 'K', (ch, x1, z1, x2, z2, c, r) => {
    const alongX = x2 - x1 > z2 - z1, inset = 0.15;
    boxes.push(box(x1 + (alongX ? 0 : inset), 0, z1 + (alongX ? inset : 0), x2 - (alongX ? 0 : inset), 2.6, z2 - (alongX ? inset : 0), 'metal',
      { tint: 1 + ((c * 5 + r * 3) % 6), pen: false, name: 'Contêiner' }));
  });
  for (let r = 0; r < N; r++) for (let c = 0; c < M; c++) {
    const ch = obj[r][c]; if (!ch) continue;
    const x = cx(c) + 1, z = cz(r) + 1;
    if (ch === 'c') boxes.push(crate(x, z, 1.4));
    else if (ch === 'C') { boxes.push(crate(x, z, 1.5)); boxes.push(crate(x + 0.1, z - 0.1, 1.1, 1.5)); }
    else if (ch === 'b') boxes.push(barrel(x, z));
    else if (ch === 'p') boxes.push(box(x - 0.35, 0, z - 0.35, x + 0.35, RY, z + 0.35, 'concrete', { name: 'Pilar' }));
    else if (ch === 'W') boxes.push(box(cx(c), 0, z - 0.15, cx(c + 1), 2.6, z + 0.15, 'door', { pen: true, name: 'Porta de madeira' }));
    else if (ch === 'H') boxes.push(box(x - 0.15, 0, cz(r), x + 0.15, 2.6, cz(r + 1), 'door', { pen: true, name: 'Porta de madeira' }));
    else if ('<>^v'.includes(ch)) {
      const dir = { '>': '+x', '<': '-x', '^': '-z', 'v': '+z' }[ch];
      stairs(boxes, cx(c), cz(r), cx(c + 1), cz(r + 1), 0, 1.6, dir, 5);
    }
  }
  boxes.push(box(X0 - 4, -1, Z0 - 4, X0 + M * CELL + 4, 0, Z0 + N * CELL + 4, 'ground', { floor: true }));
  const cell = (c, r) => [cx(c) + 1, cz(r) + 1];
  for (const [c, r, side] of def.spawns) {
    const [x, z] = cell(c, r);
    const yaw = side === 'north' ? Math.PI : side === 'south' ? 0 : Math.atan2(x, z);
    spawns.push({ x, z, yaw, side });
  }
  for (const l of def.lamps || []) props.push({ type: 'lamp', x: cx(l[0]) + (l[2] || 0), z: cz(l[1]) + (l[3] || 0), y: l[4] || 3.0, rot: l[5] || 0, flicker: !!l[6] });
  // lâmpadas penduradas no teto das áreas cobertas: [coluna, linha, pisca?, intensidade]
  for (const l of def.clamps || []) props.push({ type: 'clamp', x: cx(l[0]) + 1, z: cz(l[1]) + 1, y: RY, drop: 0.6, flicker: !!l[2], i: l[3] || 1.5, shade: def.lampShade });
  return {
    id: def.id, name: def.name, boxes, props, spawns,
    bounds: { minX: X0, maxX: X0 + M * CELL, minZ: Z0, maxZ: Z0 + N * CELL },
    theme: def.theme, nav: { cell: 1.0 },
  };
}

// espelha uma lista de objetos/spawns pela linha central (norte <-> sul)
function mirrorRows(list, N, flip = {}) {
  const out = [...list];
  for (const [c, r, ch] of list) out.push([c, N - 1 - r, flip[ch] || (ch === 'north' ? 'south' : ch === 'south' ? 'north' : ch)]);
  return out;
}
// gira 180° (ponto central)
function rotate180(list, N, M, flip = {}) {
  const out = [...list];
  for (const [c, r, ch] of list) out.push([M - 1 - c, N - 1 - r, flip[ch] || (ch === 'north' ? 'south' : ch === 'south' ? 'north' : ch)]);
  return out;
}

function buildGalpao() {
  // 24 × 24 células (48 m): pátios nos extremos, galpão coberto no centro, doca aberta a oeste e escritórios a leste
  const top = [
    '########################',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#....#####....#####,####',
    '#....#,,,,,,,,,,,,#,#,,#',
    '#....#,,,,,,,,,,,,,,,,,#',
    '#.....,,,,,,,,,,,,#,#,,#',
    '#.....,,,,,,,,,,,,#,#,,#',
    '#....#,,,,,,,,,,,,#,####',
    '#....#,,,,,,,,,,,,l,,,,#',
  ];
  const grid = [...top, ...[...top].reverse()];
  const objects = mirrorRows([
    // pátio: contêiner bloqueando a vista direta da porta do galpão, caixotes e sacos de areia
    [11, 2, 'K'], [12, 2, 'K'], [4, 3, 'c'], [19, 2, 'C'], [7, 1, 'c'], [16, 4, 's'], [17, 4, 's'], [2, 2, 'b'], [21, 3, 'b'],
    // doca: plataforma elevada com escada
    [1, 9, 'P'], [2, 9, 'P'], [1, 10, 'P'], [2, 10, 'P'], [1, 11, 'P'], [2, 11, 'P'], [3, 9, '<'], [4, 6, 'c'],
    // galpão: contêineres, caixotes e pilares
    [8, 8, 'K'], [8, 9, 'K'], [8, 10, 'K'], [14, 11, 'K'], [15, 11, 'K'], [11, 8, 'C'], [16, 7, 'c'], [6, 6, 'c'], [12, 10, 'p'],
    // escritórios
    [22, 6, 'c'], [21, 11, 'c'],
  ], 24);
  const spawns = mirrorRows([
    [3, 1, 'north'], [7, 2, 'north'], [10, 1, 'north'], [14, 1, 'north'], [17, 2, 'north'], [21, 1, 'north'], [9, 4, 'north'], [15, 3, 'north'],
    [3, 7, 'any'], [10, 7, 'any'], [16, 9, 'any'], [19, 8, 'any'], [22, 8, 'any'], [2, 10, 'any'],
  ], 24);
  return buildGrid({
    id: 'galpao', name: 'Galpão 7', grid, objects, spawns,
    wallMats: ['concrete', 'brick', 'concrete', 'metal'], wallHeight: 5, roofY: 4.0,
    lamps: [[6, 9, 0.05, 1, 3.3, Math.PI / 2], [18, 14, -0.05, 1, 3.3, -Math.PI / 2]],
    clamps: [[9, 9], [14, 9], [9, 14, 1], [14, 14], [19, 7], [19, 12, 1], [19, 16], [21, 7, 0, 1.2], [21, 11, 0, 1.2], [21, 16, 1, 1.2]],
    lampShade: 0x445a6a,
    theme: {
      sky: { top: 0x55657a, horizon: 0xc9ccd0, bottom: 0x8d8f92 },
      sun: { dir: [-0.45, 0.62, 0.5], color: 0xfff0dc, intensity: 2.4 },
      hemi: { sky: 0xc4ccd8, ground: 0x7d7a74, intensity: 1.25 },
      fog: { color: 0xbcc1c6, near: 40, far: 150 },
      exposure: 1.05,
      ground: 'concrete',
      groundTint: [0.55, 0.55, 0.56],
      clouds: 0.62, debris: [0.55, 0.55, 0.55],
      tints: ['#a9aaa8', '#a23a2a', '#2c5a85', '#3c6b43', '#c98a2a', '#6f7f88', '#b9b4a6', '#e0b52a'],
    },
  });
}

function buildBunker() {
  // 22 × 22 células (44 m): bases cobertas ao norte/sul, corredores estreitos de concreto,
  // pátio central aberto e trincheiras a céu aberto nas laterais. Simetria por rotação de 180°.
  const grid = [
    '######################',
    '#,,,,#,,,,,,,,,,#,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,#,,,,,,,,,,#,,,,#',
    '#,,,,#,,,,,,,,,,#,,,,#',
    '#..###,###..###,###..#',
    '#....#,#......#,#....#',
    '#....#,#......#,#....#',
    '#....,,#......#,,....#',
    '#....#,l......,,#....#',
    '#....#,l......#,#....#',
    '#....#,#......l,#....#',
    '#....#,,......l,#....#',
    '#....,,#......#,,....#',
    '#....#,#......#,#....#',
    '#....#,#......#,#....#',
    '#..###,###..###,###..#',
    '#,,,,#,,,,,,,,,,#,,,,#',
    '#,,,,#,,,,,,,,,,#,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,#,,,,,,,,,,#,,,,#',
    '######################',
  ];
  const objects = rotate180([
    // base: pilares e caixotes
    [8, 3, 'p'], [13, 3, 'p'], [10, 1, 'c'], [2, 4, 'C'], [19, 1, 'b'],
    // trincheiras: sacos de areia escalonados
    [1, 7, 's'], [2, 7, 's'], [3, 10, 's'], [4, 10, 's'], [2, 13, 'b'], [4, 6, 'c'],
    // pátio central: bloco de concreto, caixotes e sacos de areia
    [10, 9, 'K'], [11, 9, 'K'], [8, 7, 'c'], [13, 6, 's'], [12, 7, 's'], [9, 11, 'C'],
    // corredor: meia-porta
    [6, 7, 'W'],
  ], 22, 22);
  const spawns = rotate180([
    [7, 1, 'north'], [9, 2, 'north'], [12, 2, 'north'], [14, 1, 'north'], [11, 4, 'north'], [2, 1, 'north'], [19, 3, 'north'], [7, 4, 'north'],
    [2, 9, 'any'], [9, 8, 'any'], [6, 10, 'any'], [12, 12, 'any'], [18, 7, 'any'],
  ], 22, 22);
  return buildGrid({
    id: 'bunker', name: 'Bunker 13', grid, objects, spawns,
    wallMats: ['concrete', 'concrete', 'stone', 'wall'], wallHeight: 4.8, roofY: 3.4,
    lamps: [[10, 1, 1, 0.05, 2.7, Math.PI], [11, 21, 1, -0.05, 2.7, 0]],
    clamps: [[6, 7, 0, 1.1], [6, 12, 1, 1.1], [15, 9, 0, 1.1], [15, 14, 1, 1.1], [10, 3], [13, 1], [11, 18], [8, 20], [2, 2, 0, 1.2], [19, 19, 0, 1.2], [19, 2, 1, 1.2], [2, 19, 1, 1.2]],
    lampShade: 0x3d5a46,
    theme: {
      sky: { top: 0x3c5a7c, horizon: 0xe8b98a, bottom: 0x7f7464 },
      sun: { dir: [0.6, 0.42, 0.55], color: 0xffc58f, intensity: 2.7 },
      hemi: { sky: 0xb0bfd2, ground: 0x7a6e5c, intensity: 1.15 },
      fog: { color: 0xc8b49a, near: 40, far: 140 },
      exposure: 1.02,
      ground: 'ground',
      groundTint: [0.78, 0.74, 0.62],
      clouds: 0.4, grassTint: [0.8, 0.72, 0.45], debris: [0.6, 0.55, 0.48],
      tints: ['#9d9a90', '#8a3a2a', '#3a5878', '#4d6440', '#b57a32', '#6f7a74', '#aca796', '#c9a23a'],
    },
  });
}

// metade de cima da grade girada 180° (as duas bases ficam equivalentes)
function rotGrid(top) { return [...top, ...[...top].reverse().map((r) => [...r].reverse().join(''))]; }

function buildEstacao() {
  // 26 × 24 células (52 × 48 m): bases nas pontas, saguões da estação, plataformas
  // cobertas com pilares e o pátio de trilhos no meio, cheio de vagões.
  const top = [
    '##########################',
    '#........................#',
    '#........................#',
    '#........................#',
    '#..####,,####..####,,###.#',
    '#..#,,,,,,,,#..#,,,,,,,#.#',
    '#..#,,,,,,,,l..l,,,,,,,#.#',
    '#..###,,###,#..#,,####,#.#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#........................#',
    '#........................#',
  ];
  const grid = rotGrid(top);
  const objects = rotate180([
    // base: caixotes e um contêiner de carga
    [5, 2, 'c'], [12, 2, 'K'], [13, 2, 'K'], [20, 2, 'C'], [23, 3, 'b'], [1, 3, 'b'],
    // saguões: bancos (caixotes) e barris
    [6, 5, 'c'], [19, 6, 'c'], [9, 6, 'b'], [17, 5, 'C'],
    // plataforma: pilares e bancos
    [5, 8, 'p'], [10, 9, 'p'], [15, 8, 'p'], [20, 9, 'p'], [7, 9, 'c'], [18, 8, 'c'],
    // pátio: vagões (contêineres compridos), caixotes e sacos de areia
    [2, 10, 'K'], [3, 10, 'K'], [4, 10, 'K'], [5, 10, 'K'], [6, 10, 'K'],
    [15, 11, 'K'], [16, 11, 'K'], [17, 11, 'K'], [18, 11, 'K'], [19, 11, 'K'],
    [11, 10, 'C'], [23, 11, 'c'], [9, 11, 's'], [10, 11, 's'],
  ], 24, 26);
  const spawns = rotate180([
    [2, 1, 'north'], [6, 1, 'north'], [10, 1, 'north'], [14, 1, 'north'], [18, 1, 'north'], [22, 1, 'north'], [4, 3, 'north'], [17, 3, 'north'],
    [8, 5, 'any'], [21, 5, 'any'], [3, 9, 'any'], [13, 10, 'any'], [24, 6, 'any'], [1, 6, 'any'],
  ], 24, 26);
  return buildGrid({
    id: 'estacao', name: 'Estação Ferroviária', grid, objects, spawns,
    wallMats: ['brick', 'plaster', 'brick', 'concrete'], wallHeight: 5.2, roofY: 3.9,
    clamps: [[6, 6], [10, 5, 1], [18, 6], [21, 5], [4, 8, 0, 1.2], [12, 9, 0, 1.2], [21, 8, 1, 1.2], [19, 17], [15, 18, 1], [7, 17], [4, 18], [21, 15, 0, 1.2], [13, 14, 0, 1.2], [4, 15, 1, 1.2]],
    lampShade: 0x5a4632,
    theme: {
      sky: { top: 0x46598a, horizon: 0xf2b27a, bottom: 0x9c7c64 },
      sun: { dir: [0.7, 0.36, 0.35], color: 0xffb877, intensity: 2.6 },
      hemi: { sky: 0xc0bcd8, ground: 0x8a6e58, intensity: 1.1 },
      fog: { color: 0xd8b494, near: 45, far: 170 },
      exposure: 1.02,
      ground: 'ground',
      groundTint: [0.62, 0.56, 0.5],
      clouds: 0.38, debris: [0.45, 0.42, 0.4],
      tints: ['#c9b9a0', '#8e2f24', '#355f86', '#3d6a3a', '#b8742a', '#6f7a80', '#c2b49c', '#d29a2a'],
    },
  });
}

function buildFazenda() {
  // 28 × 28 células (56 m): aberto, com casa-sede e celeiro (com jirau) de cada lado,
  // currais de sacos de areia, fardos de feno e carretas no meio. Bom para fuzis.
  const top = [
    '############################',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#....####,####.............#',
    '#....#,,,,,,,#.............#',
    '#....l,,,,,,,l....########.#',
    '#....#,,,,,,,#....#,,,,,,#.#',
    '#....###,,###.....,,,,,,,,.#',
    '#.................,,,,,,,,.#',
    '#.................#,,,,,,#.#',
    '#.................####,,##.#',
    '#..........................#',
    '#..........................#',
  ];
  const grid = rotGrid(top);
  const objects = rotate180([
    // pátio da base
    [3, 2, 'C'], [9, 2, 'c'], [15, 3, 'K'], [16, 3, 'K'], [17, 3, 'K'], [23, 2, 'b'], [24, 2, 'b'],
    // casa-sede
    [8, 6, 'c'], [11, 7, 'b'],
    // celeiro: jirau (plataforma) com escada e fardos
    [22, 7, '>'], [23, 7, 'P'], [24, 7, 'P'], [23, 8, 'P'], [24, 8, 'P'], [20, 10, 'C'], [21, 9, 'c'],
    // campo: currais, fardos, barris
    [8, 12, 's'], [9, 12, 's'], [10, 12, 's'], [18, 13, 's'], [19, 13, 's'],
    [4, 12, 'c'], [14, 12, 'C'], [24, 13, 'c'], [13, 9, 'b'], [2, 9, 'b'], [6, 10, 'c'],
  ], 28, 28, { '>': '<' });
  const spawns = rotate180([
    [2, 1, 'north'], [6, 1, 'north'], [10, 1, 'north'], [14, 1, 'north'], [18, 1, 'north'], [22, 1, 'north'], [25, 1, 'north'], [12, 3, 'north'],
    [8, 7, 'any'], [21, 10, 'any'], [5, 10, 'any'], [15, 10, 'any'], [26, 8, 'any'], [12, 12, 'any'],
  ], 28, 28);
  return buildGrid({
    id: 'fazenda', name: 'Fazenda Mandacaru', grid, objects, spawns,
    wallMats: ['plaster', 'wood', 'plaster', 'brick'], wallHeight: 4.6, roofY: 3.8,
    clamps: [[7, 6], [11, 7], [21, 8, 1], [21, 10], [24, 10], [20, 21], [16, 20], [6, 19, 1], [6, 17], [3, 17]],
    lampShade: 0x6a4a2a,
    theme: {
      sky: { top: 0x2f78d0, horizon: 0xf6dcae, bottom: 0xe2c08a },
      sun: { dir: [-0.35, 0.82, -0.45], color: 0xfff3dc, intensity: 3.2 },
      hemi: { sky: 0xbcd7ff, ground: 0xc29a62, intensity: 1.2 },
      fog: { color: 0xf0dcb8, near: 70, far: 240 },
      exposure: 1.0,
      clouds: 0.25, grassTint: [0.8, 0.74, 0.4], debris: [0.62, 0.52, 0.38],
      tints: ['#efe3cc', '#c8553a', '#6f9fc4', '#8fb07a', '#e3a85a', '#d7d0c0', '#f2e6d0', '#e8b44a'],
    },
  });
}

function buildMercado() {
  // 22 × 26 células (44 × 52 m), compacto: mercado coberto no centro com bancas,
  // casinhas com janela nos cantos e ruas em volta.
  const top = [
    '######################',
    '#....................#',
    '#....................#',
    '#..##l##......##l##..#',
    '#..#,,,#......#,,,#..#',
    '#..#,,,,......,,,,#..#',
    '#..##,,#......#,,##..#',
    '#....................#',
    '#....................#',
    '#...######,,######...#',
    '#...,,,,,,,,,,,,,,...#',
    '#...,,,,,,,,,,,,,,...#',
    '#...#,,,,,,,,,,,,#...#',
  ];
  const grid = rotGrid(top);
  const objects = rotate180([
    // bancas do mercado
    [7, 10, 'c'], [7, 12, 'C'], [10, 11, 'p'], [13, 10, 'c'], [14, 12, 'b'], [12, 12, 'W'], [9, 12, 'W'],
    // ruas: caminhonete (contêiner), caixotes, barris
    [10, 3, 'K'], [11, 3, 'K'], [2, 7, 'c'], [19, 2, 'C'], [5, 1, 'b'], [20, 7, 'b'], [5, 4, 'c'], [17, 7, 's'], [18, 7, 's'],
  ], 26, 22);
  const spawns = rotate180([
    [3, 1, 'north'], [7, 1, 'north'], [11, 1, 'north'], [15, 1, 'north'], [19, 1, 'north'], [6, 2, 'north'], [13, 2, 'north'], [18, 2, 'north'],
    [16, 5, 'any'], [11, 11, 'any'], [2, 11, 'any'], [19, 10, 'any'], [12, 7, 'any'],
  ], 26, 22);
  return buildGrid({
    id: 'mercado', name: 'Mercado Central', grid, objects, spawns,
    wallMats: ['plaster', 'brick', 'plaster', 'concrete'], wallHeight: 4.8, roofY: 3.7,
    clamps: [[6, 10], [11, 10, 1], [15, 11], [8, 12], [15, 15], [10, 15], [6, 14, 1], [13, 13], [5, 4, 0, 1.1], [16, 5, 1, 1.1], [16, 21, 0, 1.1], [5, 20, 1, 1.1]],
    lampShade: 0x7a3a2a,
    theme: {
      sky: { top: 0x3f7ccc, horizon: 0xf4d2a4, bottom: 0xd9b48a },
      sun: { dir: [0.4, 0.72, 0.55], color: 0xfff0d6, intensity: 3.0 },
      hemi: { sky: 0xc2d6f2, ground: 0xb08a62, intensity: 1.2 },
      fog: { color: 0xeed6b2, near: 45, far: 160 },
      exposure: 1.0,
      ground: 'concrete',
      groundTint: [0.74, 0.68, 0.6],
      clouds: 0.3, debris: [0.6, 0.5, 0.4],
      tints: ['#f0e2c8', '#d0664a', '#5f93c6', '#7cab6c', '#eab04e', '#e6a0a8', '#b9a2d4', '#f0a04b'],
    },
  });
}

// --------------------------------------------------------------- registro
// --------------------------------------------------------------- Vale Gelado
// Mapa grande (128 × 128 m) de neve, com relevo: cada base fica num platô alto
// (4 m), as encostas descem até um vale com um riacho congelado no meio, há uma
// crista alta num dos flancos de cada lado (boa para fuzil de precisão) e dois
// morrinhos no vale. O relevo é feito de camadas de 0,4 m (sobe-se andando,
// como degraus suaves). Simétrico por rotação de 180°.
const VG_STEP = 0.4, VG_CELL = 2, VG_HALF = 64;
function vgSmooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// altura contínua do lado norte (o sul é a rotação de 180°)
function vgNorth(x, z) {
  // platô da base (4 m) descendo em encosta suave até o vale
  let h = 4.0 * vgSmooth(10, 44, -z + 3 * Math.sin(x / 11));
  // morrinho no vale
  h = Math.max(h, 2.4 * (1 - vgSmooth(2, 11, Math.hypot(x - 22, z + 4))));
  return h;
}
const VG_RIDGE = 13; // crista: 5,2 m
function vgRidge(x, z) { return x < -47 + 2 * Math.sin(z / 7) && z < 16; }
function buildVale() {
  const N = (VG_HALF * 2) / VG_CELL; // 64 células
  const X0 = -VG_HALF, Z0 = -VG_HALF;
  const cc = (i) => X0 + (i + 0.5) * VG_CELL;
  const lv = [];
  for (let j = 0; j < N; j++) { lv.push([]); for (let i = 0; i < N; i++) { const x = cc(i), z = cc(j); const h = Math.max(vgNorth(x, z), vgNorth(-x, -z)); lv[j].push(h < 0.15 ? 0 : Math.round(h / VG_STEP)); } }
  // suaviza: vizinhos diferem no máximo 1 nível (0,4 m) para dar para subir andando
  for (let it = 0; it < 30; it++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let m = lv[j][i];
    if (i > 0) m = Math.min(m, lv[j][i - 1] + 1); if (i < N - 1) m = Math.min(m, lv[j][i + 1] + 1);
    if (j > 0) m = Math.min(m, lv[j - 1][i] + 1); if (j < N - 1) m = Math.min(m, lv[j + 1][i] + 1);
    lv[j][i] = m;
  }
  // cristas nos flancos (paredões de pedra; sobe-se pelas escadas)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = cc(i), z = cc(j); if (vgRidge(x, z) || vgRidge(-x, -z)) lv[j][i] = VG_RIDGE; }
  // garante simetria exata (rotação 180°)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = lv[j][i], b = lv[N - 1 - j][N - 1 - i]; lv[j][i] = lv[N - 1 - j][N - 1 - i] = Math.max(a, b); }
  const boxes = [], props = [], spawns = [];
  // camadas: para cada nível L, a região com altura >= L vira retângulos
  let maxL = 0; for (const r of lv) for (const v of r) maxL = Math.max(maxL, v);
  for (let L = 1; L <= maxL; L++) {
    const used = lv.map((r) => r.map(() => false));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (used[j][i] || lv[j][i] < L) continue;
      let i1 = i; while (i1 + 1 < N && !used[j][i1 + 1] && lv[j][i1 + 1] >= L) i1++;
      let j1 = j;
      outer: while (j1 + 1 < N) { for (let k = i; k <= i1; k++) if (used[j1 + 1][k] || lv[j1 + 1][k] < L) break outer; j1++; }
      for (let a = j; a <= j1; a++) for (let k = i; k <= i1; k++) used[a][k] = true;
      boxes.push(box(X0 + i * VG_CELL, (L - 1) * VG_STEP, Z0 + j * VG_CELL, X0 + (i1 + 1) * VG_CELL, L * VG_STEP, Z0 + (j1 + 1) * VG_CELL, 'snow', { terrain: true, name: 'Neve' }));
    }
  }
  const ground = (x, z) => {
    const i = Math.floor((x - X0) / VG_CELL), j = Math.floor((z - Z0) / VG_CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    return lv[j][i] * VG_STEP;
  };
  // pega a altura mais alta sob um retângulo (objetos não ficam "flutuando" dentro do morro)
  const groundRect = (x1, z1, x2, z2) => {
    let h = 0;
    for (let x = x1; x <= x2 + 1e-6; x += 0.5) for (let z = z1; z <= z2 + 1e-6; z += 0.5) h = Math.max(h, ground(Math.min(x, x2 - 0.01), Math.min(z, z2 - 0.01)));
    return h;
  };
  const S = [], P = []; // metade norte (espelhada no fim)
  // escadas de pedra para subir na crista (encostadas no paredão, subindo para oeste)
  const ridgeStairs = (zc) => {
    const j = Math.floor((zc - Z0) / VG_CELL);
    let i = 0; while (i < N && lv[j][i] >= VG_RIDGE) i++;
    const ex = X0 + i * VG_CELL, top = VG_RIDGE * VG_STEP;
    const foot = ground(ex + 0.5, zc);
    const n = Math.round((top - foot) / VG_STEP);
    if (n < 1) return;
    stairs(S, ex, zc - 1.5, ex + n, zc + 1.5, foot, top, '-x', n, 'stone');
  };
  ridgeStairs(-45); ridgeStairs(-15); ridgeStairs(9);
  const on = (x1, z1, x2, z2, h, mat, o = {}) => { const y = groundRect(x1, z1, x2, z2); const b = box(x1, y - 0.4, z1, x2, y + h, z2, mat, { base: y, ...o }); S.push(b); return y; };
  const rock = (x, z, w, d, h) => on(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, 'concrete', { name: 'Rocha', rock: true });
  const pine = (x, z, h = 7) => { const y = groundRect(x - 0.3, z - 0.3, x + 0.3, z + 0.3); S.push(box(x - 0.28, y - 0.4, z - 0.28, x + 0.28, y + h * 0.75, z + 0.28, 'wood', { name: 'Pinheiro', hidden: true, pen: true })); P.push({ type: 'pine', x, z, y, h }); };
  // cabana de madeira: paredes com porta e janela, telhado (não dá para subir)
  const cabin = (x1, z1, x2, z2, door) => {
    const y = groundRect(x1, z1, x2, z2), t = 0.3, H = 3.0;
    const wall = (a1, b1, a2, b2) => S.push(box(a1, y - 0.4, b1, a2, y + H, b2, 'wood', { base: y, name: 'Cabana' }));
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    // norte / sul (com porta no lado indicado)
    for (const [zz, isDoor] of [[z1, door === 'n'], [z2 - t, door === 's']]) {
      if (isDoor) { wall(x1, zz, mx - 0.7, zz + t); wall(mx + 0.7, zz, x2, zz + t); S.push(box(mx - 0.7, y + 2.2, zz, mx + 0.7, y + H, zz + t, 'wood', { base: y })); }
      else { wall(x1, zz, mx - 1.0, zz + t); wall(mx + 1.0, zz, x2, zz + t); S.push(box(mx - 1.0, y - 0.4, zz, mx + 1.0, y + 1.0, zz + t, 'wood', { base: y, name: 'Janela' })); S.push(box(mx - 1.0, y + 2.1, zz, mx + 1.0, y + H, zz + t, 'wood', { base: y })); }
    }
    for (const [xx, isDoor] of [[x1, door === 'w'], [x2 - t, door === 'e']]) {
      if (isDoor) { wall(xx, z1 + t, xx + t, mz - 0.7); wall(xx, mz + 0.7, xx + t, z2 - t); S.push(box(xx, y + 2.2, mz - 0.7, xx + t, y + H, mz + 0.7, 'wood', { base: y })); }
      else { wall(xx, z1 + t, xx + t, mz - 1.0); wall(xx, mz + 1.0, xx + t, z2 - t); S.push(box(xx, y - 0.4, mz - 1.0, xx + t, y + 1.0, mz + 1.0, 'wood', { base: y, name: 'Janela' })); S.push(box(xx, y + 2.1, mz - 1.0, xx + t, y + H, mz + 1.0, 'wood', { base: y })); }
    }
    S.push(box(x1 - 0.4, y + H, z1 - 0.4, x2 + 0.4, y + H + 0.35, z2 + 0.4, 'snow', { base: y, roof: true, name: 'Telhado' }));
    return y;
  };
  // torre de vigia: plataforma com parapeito e escada
  const tower = (x, z, dir) => {
    const y = groundRect(x - 2, z - 2, x + 2, z + 2), top = y + 3.2;
    for (const [px, pz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) S.push(box(x + px - 0.15, y - 0.4, z + pz - 0.15, x + px + 0.15, top, z + pz + 0.15, 'wood', { base: y, name: 'Torre' }));
    S.push(box(x - 2, top - 0.3, z - 2, x + 2, top, z + 2, 'wood', { base: y, name: 'Torre' }));
    // parapeito (lado do vale aberto para atirar por cima)
    S.push(box(x - 2, top, z + 1.85, x + 2, top + 1.0, z + 2, 'wood', { base: y }), box(x - 2, top, z - 2, x - 1.85, top + 1.0, z + 2, 'wood', { base: y }), box(x + 1.85, top, z - 2, x + 2, top + 1.0, z + 2, 'wood', { base: y }));
    S.push(box(x - 2.1, top + 2.4, z - 2.1, x + 2.1, top + 2.65, z + 2.1, 'snow', { base: y, roof: true }));
    for (const [px, pz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) S.push(box(x + px - 0.08, top, z + pz - 0.08, x + px + 0.08, top + 2.4, z + pz + 0.08, 'wood', { base: y }));
    // escada pelo lado de trás (norte)
    stairs(S, x - 0.8, z - 2 - 4.8, x + 0.8, z - 2, y, top - 0.3, '+z', 9, 'wood');
    void dir;
  };

  // ---- base norte (platô a 4 m): duas cabanas, sacos de areia, caixotes
  cabin(-20, -60, -10, -52, 's');
  cabin(8, -59, 17, -51, 'w');
  on(-4, -47, 4, -46, 1.0, 'stone', { name: 'Sacos de areia' });
  for (const [x, z] of [[-26, -48], [24, -46], [0, -56]]) { const y = groundRect(x - 0.8, z - 0.8, x + 0.8, z + 0.8); S.push(crate(x, z, 1.5, y)); S.push(crate(x + 0.15, z - 0.1, 1.0, y + 1.5)); }
  for (const [x, z] of [[-6, -58], [30, -54], [-32, -56]]) { const y = groundRect(x - 0.5, z - 0.5, x + 0.5, z + 0.5); S.push(barrel(x, z, y)); }
  tower(34, -40);
  // ---- encosta: rochas e pinheiros como cobertura
  rock(-14, -38, 3.5, 2.2, 1.8); rock(6, -34, 2.6, 2.0, 1.3); rock(-28, -30, 3.0, 3.2, 2.2); rock(20, -28, 4.0, 2.0, 1.5);
  rock(-6, -24, 2.2, 1.6, 1.1); rock(36, -22, 3.0, 2.5, 2.0); rock(-36, -20, 2.0, 2.0, 1.2);
  for (const [x, z, h] of [[-40, -58, 8], [-46, -48, 7], [42, -60, 8], [50, -50, 9], [56, -38, 7], [-22, -42, 6.5], [12, -42, 7], [28, -34, 6], [-10, -30, 6], [46, -26, 7.5], [-52, -24, 8], [54, -12, 6.5], [2, -20, 5.5]]) pine(x, z, h);
  // ---- crista oeste: muretas de pedra no alto (cobertura para quem está em cima)
  rock(-52, -30, 1.4, 4.0, 1.0); rock(-52, -12, 1.4, 4.0, 1.0); rock(-54, 4, 1.4, 4.0, 1.0); rock(-58, -40, 3.0, 3.0, 2.4);
  // ---- vale: morrinho com rochas, carcaça de caminhão (caixas), sacos de areia
  rock(22, -3, 2.4, 2.4, 1.4); rock(14, -8, 2.0, 1.6, 1.0);
  on(-8, -7, -2, -4.6, 1.4, 'metal', { tint: 3, name: 'Caminhão abandonado' });
  on(-7.6, -7, -6, -4.6, 2.4, 'metal', { tint: 3, name: 'Caminhão abandonado' });
  on(-30, -6, -26, -5, 1.0, 'stone', { name: 'Sacos de areia' }); on(32, -14, 33, -10, 1.0, 'stone', { name: 'Sacos de areia' });
  { const y = groundRect(-40, -10, -39, -9); S.push(crate(-40, -9, 1.4, y)); }
  // riacho congelado (só visual: gelo liso e escorregadio só na aparência)
  for (let x = -62; x < 62; x += 2) {
    const zc = 3.2 * Math.sin(x / 13), w = 1.6 + 0.5 * Math.sin(x / 7);
    if (zc > 0) continue; // a outra metade vem do espelhamento
    S.push(box(x, 0, zc - w, x + 2, 0.02, zc + w, 'ice', { noCollide: true, name: 'Gelo' }));
  }
  // lampiões nas bases
  P.push({ type: 'lamp', x: -15, z: -51.7, y: ground(-15, -51) + 2.6, rot: 0 });
  P.push({ type: 'lamp', x: 7.7, z: -55, y: ground(7, -55) + 2.6, rot: -Math.PI / 2 });

  // ---- montagem com espelhamento
  for (const b of S) { boxes.push(b); boxes.push(rotBox(b)); }
  for (const p of P) { props.push(p); props.push(rotProp(p)); }
  // borda: paredões de rocha
  const H = 14;
  boxes.push(box(X0 - 2, -1, Z0 - 2, -X0 + 2, H, Z0, 'snow', { boundary: true, name: 'Paredão' }));
  boxes.push(box(X0 - 2, -1, -Z0, -X0 + 2, H, -Z0 + 2, 'snow', { boundary: true, name: 'Paredão' }));
  boxes.push(box(X0 - 2, -1, Z0, X0, H, -Z0, 'snow', { boundary: true, name: 'Paredão' }));
  boxes.push(box(-X0, -1, Z0, -X0 + 2, H, -Z0, 'snow', { boundary: true, name: 'Paredão' }));
  boxes.push(box(X0 - 4, -1, Z0 - 4, -X0 + 4, 0, -Z0 + 4, 'ground', { floor: true }));
  const stairBoxes = boxes.filter((b) => b.stair);

  // ---- renascimento
  const SP = [[-24, -56], [-14, -48], [-4, -60], [4, -52], [12, -48], [22, -56], [30, -48], [-30, -52], [0, -44], [-8, -54]];
  for (const [x, z] of SP) { spawns.push({ x, z, yaw: Math.PI, side: 'north' }); spawns.push({ x: -x, z: -z, yaw: 0, side: 'south' }); }
  const neutral = [[-50, -36], [-54, -6], [22, -10], [40, -30], [-18, -26], [8, -14], [40, -6], [-34, -14], [0, -32], [-44, -50]];
  for (const [x, z] of neutral) { const yaw = Math.atan2(x, z); spawns.push({ x, z, yaw, side: 'any' }); spawns.push({ x: -x, z: -z, yaw: yaw + Math.PI, side: 'any' }); }

  return {
    id: 'vale', name: 'Vale Gelado',
    boxes, props, spawns,
    bounds: { minX: X0, maxX: -X0, minZ: Z0, maxZ: -Z0 },
    // altura máxima do piso procurada em (x,z): terreno + 3 m (para não "achar" o telhado das cabanas)
    floorCap: (x, z) => {
      for (const b of stairBoxes) if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2]) return b.max[1] + 0.3;
      return ground(x, z) + 3.0;
    },
    terrainAt: ground,
    theme: {
      sky: { top: 0x7f9cbc, horizon: 0xdfe7ee, bottom: 0xe8edf2 },
      sun: { dir: [0.4, 0.55, -0.6], color: 0xfff4e6, intensity: 2.4 },
      hemi: { sky: 0xdfe9f5, ground: 0xb9c3cf, intensity: 1.35 },
      fog: { color: 0xdde4eb, near: 55, far: 210 },
      exposure: 0.95,
      clouds: 0.75, ground: 'snow', groundTint: [1, 1, 1], grassTint: [0.86, 0.9, 0.95], debris: [0.34, 0.35, 0.38],
      snowfall: true, stoneTint: 0xa9b3c0,
      tints: ['#e8e4dc', '#8c3b2e', '#4f6f8c', '#5d7a52', '#c9a25a', '#d7d0c0', '#efe6d6', '#b8b2a6'],
    },
    nav: { cell: 1.0 },
  };
}

const BUILDERS = { vale: buildVale, sertao: buildSertao, porto: buildPorto, galpao: buildGalpao, bunker: buildBunker, estacao: buildEstacao, fazenda: buildFazenda, mercado: buildMercado };
export const MAP_LIST = [
  { id: 'vale', name: 'Vale Gelado (grande)', desc: 'Vale de neve com platôs altos nas bases, cristas de pedra nos flancos e um riacho congelado no meio. Bom para fuzis.' },
  { id: 'sertao', name: 'Vila Sertão', desc: 'Vila grande com praça, igreja e feira. Ruas longas e becos.' },
  { id: 'porto', name: 'Porto Delta', desc: 'Porto de contêineres com passarela elevada e túneis cobertos.' },
  { id: 'galpao', name: 'Galpão 7 (compacto)', desc: 'Pátios abertos e um galpão coberto no meio. Rápido e intenso.' },
  { id: 'bunker', name: 'Bunker 13 (compacto)', desc: 'Corredores de concreto, trincheiras e pátio central.' },
  { id: 'estacao', name: 'Estação Ferroviária', desc: 'Saguões, plataformas cobertas e um pátio de trilhos cheio de vagões.' },
  { id: 'fazenda', name: 'Fazenda Mandacaru', desc: 'Campo aberto com casa-sede, celeiro com jirau e currais. Bom para fuzis.' },
  { id: 'mercado', name: 'Mercado Central (compacto)', desc: 'Mercado coberto com bancas no centro e ruas estreitas em volta.' },
];
export function mapName(id) { const m = MAP_LIST.find((x) => x.id === id); return m ? m.name : id; }

const cache = {};
export function getMap(id) {
  if (!BUILDERS[id]) id = 'sertao';
  if (cache[id]) return cache[id];
  const m = BUILDERS[id]();
  m.boxes.forEach((b, i) => { b.id = i; });
  m.solid = m.boxes.filter((b) => !b.noCollide);
  // altura do piso de cada spawn e validação
  for (const s of m.spawns) {
    s.y = floorHeightAt(s.x, s.z, m.floorCap ? m.floorCap(s.x, s.z) : 3.0, m.solid, PLAYER.radius);
    if (!isFinite(s.y)) s.y = 0;
    s.y += 0.001;
    s.blocked = !!overlapsAny(s.x, s.y + 0.01, s.z, PLAYER.radius, PLAYER.height, m.solid);
  }
  // base das bandeiras (Capture a Bandeira): o ponto de renascimento mais
  // central de cada lado
  m.flagBases = {};
  for (const side of ['north', 'south']) {
    const list = m.spawns.filter((s) => s.side === side && !s.blocked);
    if (!list.length) continue;
    const cx = list.reduce((a, s) => a + s.x, 0) / list.length, cz = list.reduce((a, s) => a + s.z, 0) / list.length;
    const b = list.reduce((best, s) => (Math.hypot(s.x - cx, s.z - cz) < Math.hypot(best.x - cx, best.z - cz) ? s : best), list[0]);
    m.flagBases[side] = { x: b.x, y: b.y, z: b.z };
  }
  cache[id] = m;
  return m;
}
