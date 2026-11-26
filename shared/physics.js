// Física compartilhada: colisão AABB, movimento estilo Source/CS,
// raycast contra o mapa, hitboxes dos jogadores e simulação determinística
// das granadas (mesmo resultado no servidor e no cliente).
import { PLAYER, MOVE, GRENADE } from './constants.js';

const EPS = 1e-4;

// ---------------------------------------------------------------------------
// Raycast contra caixas alinhadas aos eixos (método das "slabs")
// Retorna { t, tExit, axis, sign } ou null. axis/sign = normal da face de entrada.
// ---------------------------------------------------------------------------
export function rayBox(ox, oy, oz, dx, dy, dz, min, max, maxT) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  // eixo X
  if (dx > -1e-12 && dx < 1e-12) {
    if (ox < min[0] || ox > max[0]) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (min[0] - ox) * inv, t2 = (max[0] - ox) * inv, s = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // eixo Y
  if (dy > -1e-12 && dy < 1e-12) {
    if (oy < min[1] || oy > max[1]) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (min[1] - oy) * inv, t2 = (max[1] - oy) * inv, s = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // eixo Z
  if (dz > -1e-12 && dz < 1e-12) {
    if (oz < min[2] || oz > max[2]) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (min[2] - oz) * inv, t2 = (max[2] - oz) * inv, s = -1;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || tmin > maxT) return null;
  return { t: tmin, tExit: tmax, axis, sign };
}

// Primeiro impacto no mapa (ignora caixas que contêm a origem).
export function raycastWorld(o, d, maxDist, boxes, filter) {
  let best = null;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (filter && !filter(b)) continue;
    const h = rayBox(o[0], o[1], o[2], d[0], d[1], d[2], b.min, b.max, best ? best.t : maxDist);
    if (h && h.t >= 0 && (!best || h.t < best.t)) { h.box = b; best = h; }
  }
  return best;
}

// Todos os impactos ao longo do raio, ordenados (para penetração de paredes).
export function raycastWorldAll(o, d, maxDist, boxes) {
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const h = rayBox(o[0], o[1], o[2], d[0], d[1], d[2], b.min, b.max, maxDist);
    if (h && h.t >= 0) { h.box = b; hits.push(h); }
  }
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

// Linha de visão livre entre dois pontos?
export function lineOfSight(a, b, boxes) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const d = [dx / len, dy / len, dz / len];
  return !raycastWorld(a, d, len - 0.01, boxes);
}

export function normalFromHit(h) {
  const n = [0, 0, 0];
  if (h && h.axis >= 0) n[h.axis] = h.sign;
  return n;
}

// ---------------------------------------------------------------------------
// Hitboxes dos jogadores (cilindros verticais + esfera na cabeça)
// ---------------------------------------------------------------------------
const HB_STAND = {
  head: { y: 1.645, r: 0.15 },
  chest: { y1: 1.07, y2: 1.50, r: 0.27 },
  stomach: { y1: 0.84, y2: 1.07, r: 0.22 },
  legs: { y1: 0.0, y2: 0.84, r: 0.21 },
};
const HB_CROUCH = {
  head: { y: 1.19, r: 0.15 },
  chest: { y1: 0.70, y2: 1.05, r: 0.28 },
  stomach: { y1: 0.50, y2: 0.70, r: 0.24 },
  legs: { y1: 0.0, y2: 0.50, r: 0.27 },
};

export function hitboxSet(crouch) { return crouch ? HB_CROUCH : HB_STAND; }

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const fx = ox - cx, fy = oy - cy, fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz;
  const c = fx * fx + fy * fy + fz * fz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0) return null;
  return t;
}

function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y1, y2) {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz;
  let t0, t1;
  if (a < 1e-12) {
    if (fx * fx + fz * fz > r * r) return null;
    t0 = -Infinity; t1 = Infinity;
  } else {
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    t0 = (-b - sq) / (2 * a); t1 = (-b + sq) / (2 * a);
  }
  let ty0, ty1;
  if (dy > -1e-12 && dy < 1e-12) {
    if (oy < y1 || oy > y2) return null;
    ty0 = -Infinity; ty1 = Infinity;
  } else {
    ty0 = (y1 - oy) / dy; ty1 = (y2 - oy) / dy;
    if (ty0 > ty1) { const k = ty0; ty0 = ty1; ty1 = k; }
  }
  const tin = Math.max(t0, ty0), tout = Math.min(t1, ty1);
  if (tin > tout || tout < 0) return null;
  return Math.max(tin, 0);
}

// Testa um raio contra o corpo de um jogador posicionado em (x,y,z) (pés).
// Retorna { t, zone } da parte mais próxima atingida, ou null.
export function rayHitPlayer(o, d, maxT, x, y, z, crouch) {
  const hb = crouch ? HB_CROUCH : HB_STAND;
  // teste rápido: cilindro envolvente
  const top = y + hb.head.y + hb.head.r + 0.02;
  if (rayCylinder(o[0], o[1], o[2], d[0], d[1], d[2], x, z, 0.42, y, top) === null) return null;
  let best = null;
  const th = raySphere(o[0], o[1], o[2], d[0], d[1], d[2], x, y + hb.head.y, z, hb.head.r);
  if (th !== null && th <= maxT) best = { t: th, zone: 'head' };
  for (const zone of ['chest', 'stomach', 'legs']) {
    const c = hb[zone];
    const t = rayCylinder(o[0], o[1], o[2], d[0], d[1], d[2], x, z, c.r, y + c.y1, y + c.y2);
    if (t !== null && t <= maxT && (!best || t < best.t)) best = { t, zone };
  }
  return best;
}

export function eyeHeight(crouch) { return crouch ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight; }
export function playerCenter(x, y, z, crouch) { return [x, y + (crouch ? 0.8 : 1.05), z]; }
export function playerHead(x, y, z, crouch) { return [x, y + (crouch ? HB_CROUCH : HB_STAND).head.y, z]; }

// ---------------------------------------------------------------------------
// Colisão do jogador
// ---------------------------------------------------------------------------
export function overlapsAny(x, y, z, r, h, boxes) {
  const minx = x - r, maxx = x + r, miny = y, maxy = y + h, minz = z - r, maxz = z + r;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (minx < b.max[0] && maxx > b.min[0] && miny < b.max[1] && maxy > b.min[1] && minz < b.max[2] && maxz > b.min[2]) return b;
  }
  return null;
}

function moveAxis(p, axis, delta, boxes, h) {
  if (delta === 0) return false;
  p[axis] += delta;
  const r = PLAYER.radius;
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (p[0] - r < b.max[0] && p[0] + r > b.min[0] && p[1] < b.max[1] && p[1] + h > b.min[1] && p[2] - r < b.max[2] && p[2] + r > b.min[2]) {
      hit = true;
      if (axis === 1) {
        if (delta > 0) p[1] = b.min[1] - h - EPS; else p[1] = b.max[1] + EPS;
      } else if (delta > 0) p[axis] = b.min[axis] - r - EPS;
      else p[axis] = b.max[axis] + r + EPS;
    }
  }
  return hit;
}

export function createMoveState(pos) {
  return {
    pos: [pos[0], pos[1], pos[2]],
    vel: [0, 0, 0],
    onGround: false,
    ducked: false,
    eyeOffset: PLAYER.eyeHeight,  // altura do olho suavizada (relativa aos pés)
    landSpeed: 0,                 // velocidade vertical no último pouso (som)
    justLanded: false,
    justJumped: false,
    tagTime: 0,
  };
}

export function moveHeight(s) { return s.ducked ? PLAYER.crouchHeight : PLAYER.height; }

function handleDuck(s, wantDuck, boxes) {
  const diff = PLAYER.height - PLAYER.crouchHeight;
  const r = PLAYER.radius;
  if (wantDuck && !s.ducked) {
    if (s.onGround) {
      s.ducked = true;
    } else {
      // agachar no ar levanta as pernas (crouch-jump)
      s.pos[1] += diff;
      s.eyeOffset -= diff;
      s.ducked = true;
    }
  } else if (!wantDuck && s.ducked) {
    if (s.onGround) {
      if (!overlapsAny(s.pos[0], s.pos[1] + EPS, s.pos[2], r, PLAYER.height, boxes)) s.ducked = false;
    } else if (!overlapsAny(s.pos[0], s.pos[1] - diff, s.pos[2], r, PLAYER.height, boxes)) {
      s.pos[1] -= diff;
      s.eyeOffset += diff;
      s.ducked = false;
    } else if (!overlapsAny(s.pos[0], s.pos[1], s.pos[2], r, PLAYER.height, boxes)) {
      s.ducked = false;
    }
  }
}

function friction(s, dt) {
  const v = s.vel;
  const speed = Math.sqrt(v[0] * v[0] + v[2] * v[2]);
  if (speed < 0.005) { v[0] = 0; v[2] = 0; return; }
  const control = speed < MOVE.stopSpeed ? MOVE.stopSpeed : speed;
  let ns = speed - control * MOVE.friction * dt;
  if (ns < 0) ns = 0;
  ns /= speed;
  v[0] *= ns; v[2] *= ns;
}

function accelerate(s, wx, wz, wishSpeed, dt) {
  const v = s.vel;
  const cur = v[0] * wx + v[2] * wz;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  let acc = MOVE.accelerate * dt * wishSpeed;
  if (acc > add) acc = add;
  v[0] += acc * wx; v[2] += acc * wz;
}

function airAccelerate(s, wx, wz, wishSpeed, dt) {
  const v = s.vel;
  const capped = Math.min(wishSpeed, MOVE.airSpeedCap);
  const cur = v[0] * wx + v[2] * wz;
  const add = capped - cur;
  if (add <= 0) return;
  let acc = MOVE.airAccelerate * wishSpeed * dt;
  if (acc > add) acc = add;
  v[0] += acc * wx; v[2] += acc * wz;
}

function dist2(a, b) { const dx = a[0] - b[0], dz = a[2] - b[2]; return dx * dx + dz * dz; }

function slideMove(s, dx, dz, boxes, h) {
  const p = s.pos;
  const start = [p[0], p[1], p[2]];
  let hitX = moveAxis(p, 0, dx, boxes, h);
  let hitZ = moveAxis(p, 2, dz, boxes, h);
  if ((hitX || hitZ) && s.onGround) {
    const normalEnd = [p[0], p[1], p[2]];
    const normalHitX = hitX, normalHitZ = hitZ;
    p[0] = start[0]; p[1] = start[1]; p[2] = start[2];
    moveAxis(p, 1, PLAYER.stepHeight, boxes, h);
    const up = p[1] - start[1];
    hitX = moveAxis(p, 0, dx, boxes, h);
    hitZ = moveAxis(p, 2, dz, boxes, h);
    const landed = moveAxis(p, 1, -up - 0.002, boxes, h);
    if (landed && dist2(start, p) > dist2(start, normalEnd) + 1e-7 && p[1] - start[1] > -EPS) {
      // subiu o degrau
    } else {
      p[0] = normalEnd[0]; p[1] = normalEnd[1]; p[2] = normalEnd[2];
      hitX = normalHitX; hitZ = normalHitZ;
    }
  }
  if (hitX) s.vel[0] = 0;
  if (hitZ) s.vel[2] = 0;
}

// Um passo de simulação do movimento.
// input = { fwd, side (-1..1), yaw, jump (borda de pressionamento), crouch, walk }
export function stepMove(s, input, dt, boxes, maxSpeed) {
  s.justLanded = false;
  s.justJumped = false;
  handleDuck(s, input.crouch, boxes);
  const h = moveHeight(s);

  const sinY = Math.sin(input.yaw), cosY = Math.cos(input.yaw);
  let wx = -sinY * input.fwd + cosY * input.side;
  let wz = -cosY * input.fwd - sinY * input.side;
  const wl = Math.sqrt(wx * wx + wz * wz);
  let wishSpeed = 0;
  if (wl > 1e-6) {
    wx /= wl; wz /= wl;
    wishSpeed = maxSpeed * MOVE.speedMult * Math.min(1, wl);
    if (s.ducked && s.onGround) wishSpeed *= MOVE.crouchMult;
    else if (input.walk) wishSpeed *= MOVE.walkMult;
    if (s.tagTime > 0) wishSpeed *= MOVE.tagMult;
  }
  if (s.tagTime > 0) s.tagTime -= dt;

  if (input.jump && s.onGround) {
    s.vel[1] = MOVE.jumpSpeed;
    s.onGround = false;
    s.justJumped = true;
  }

  if (s.onGround) {
    friction(s, dt);
    accelerate(s, wx, wz, wishSpeed, dt);
  } else {
    airAccelerate(s, wx, wz, wishSpeed, dt);
    s.vel[1] -= MOVE.gravity * dt;
    if (s.vel[1] < -MOVE.maxFallSpeed) s.vel[1] = -MOVE.maxFallSpeed;
  }

  const hs = Math.sqrt(s.vel[0] * s.vel[0] + s.vel[2] * s.vel[2]);
  if (hs > MOVE.maxHorizontalSpeed) {
    const k = MOVE.maxHorizontalSpeed / hs;
    s.vel[0] *= k; s.vel[2] *= k;
  }

  slideMove(s, s.vel[0] * dt, s.vel[2] * dt, boxes, h);

  const wasGround = s.onGround;
  if (!s.onGround) {
    const vy = s.vel[1];
    const hitY = moveAxis(s.pos, 1, vy * dt, boxes, h);
    if (hitY) {
      if (vy < 0) {
        s.onGround = true;
        s.landSpeed = -vy;
        s.justLanded = true;
      }
      s.vel[1] = 0;
    }
  } else {
    // continua no chão? (desce degraus "grudando" no piso)
    const p = s.pos;
    const y0 = p[1];
    const hitDown = moveAxis(p, 1, -(PLAYER.stepHeight + 0.01), boxes, h);
    if (!hitDown) {
      p[1] = y0;
      s.onGround = false;
      s.vel[1] = 0;
    }
  }
  if (wasGround && !s.onGround && !s.justJumped) s.vel[1] = Math.min(s.vel[1], 0);

  // suaviza a altura dos olhos (agachar e degraus)
  const target = s.ducked ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
  const k = Math.min(1, dt * 14);
  s.eyeOffset += (target - s.eyeOffset) * k;
}

// Velocidade horizontal atual
export function horizSpeed(s) { return Math.sqrt(s.vel[0] * s.vel[0] + s.vel[2] * s.vel[2]); }

// Altura do piso em (x,z) abaixo de yMax (para spawns e bots)
export function floorHeightAt(x, z, yMax, boxes, r = 0) {
  let best = -Infinity;
  for (const b of boxes) {
    if (x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2] && b.max[1] <= yMax + 1e-6) {
      if (b.max[1] > best) best = b.max[1];
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Granadas (simulação determinística a 64 passos/s)
// ---------------------------------------------------------------------------
export function createGrenadeSim(o, v) {
  return { p: [o[0], o[1], o[2]], v: [v[0], v[1], v[2]], onGround: false, rest: false, steps: 0, bounces: 0, lastBounceStep: -99 };
}

function rayExpanded(o, d, maxT, boxes, r) {
  let best = null;
  const mn = [0, 0, 0], mx = [0, 0, 0];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    mn[0] = b.min[0] - r; mn[1] = b.min[1] - r; mn[2] = b.min[2] - r;
    mx[0] = b.max[0] + r; mx[1] = b.max[1] + r; mx[2] = b.max[2] + r;
    const h = rayBox(o[0], o[1], o[2], d[0], d[1], d[2], mn, mx, best ? best.t : maxT);
    if (h && h.tExit > 0 && (!best || h.t < best.t)) {
      if (h.t < 0) {
        // começou dentro (erro numérico): só considera se estiver indo para dentro
        const n = h.axis;
        if (n < 0 || d[n] * h.sign >= 0) continue;
        h.t = 0;
      }
      best = h;
    }
  }
  return best;
}

export function stepGrenade(g, boxes) {
  const dt = GRENADE.dt;
  g.steps++;
  if (g.rest) return;
  const r = GRENADE.radius;
  if (g.onGround) {
    const probe = rayExpanded(g.p, [0, -1, 0], 0.03, boxes, r);
    if (!probe) g.onGround = false;
  }
  if (!g.onGround) g.v[1] -= MOVE.gravity * GRENADE.gravityMult * dt;

  let remaining = 1;
  for (let it = 0; it < 4 && remaining > 1e-6; it++) {
    const mx = g.v[0] * dt * remaining, my = g.v[1] * dt * remaining, mz = g.v[2] * dt * remaining;
    const dist = Math.sqrt(mx * mx + my * my + mz * mz);
    if (dist < 1e-9) break;
    const d = [mx / dist, my / dist, mz / dist];
    const hit = rayExpanded(g.p, d, dist, boxes, r);
    if (!hit) { g.p[0] += mx; g.p[1] += my; g.p[2] += mz; break; }
    const t = Math.max(0, hit.t - 1e-4);
    g.p[0] += d[0] * t; g.p[1] += d[1] * t; g.p[2] += d[2] * t;
    remaining *= (1 - t / dist);
    const a = hit.axis;
    if (a < 0) break;
    const vn = g.v[a];
    g.v[a] = -vn * GRENADE.restitution;
    if (Math.abs(vn) > 1.2) { g.bounces++; g.lastBounceStep = g.steps; }
    if (a === 1 && hit.sign > 0) {
      g.v[0] *= 0.72; g.v[2] *= 0.72;
      if (Math.abs(g.v[1]) < 1.0) { g.v[1] = 0; g.onGround = true; }
    } else {
      // batida em parede: perde um pouco de velocidade tangencial
      const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
      g.v[o1] *= 0.85; g.v[o2] *= 0.85;
    }
  }
  if (g.onGround) {
    const sp = Math.sqrt(g.v[0] * g.v[0] + g.v[2] * g.v[2]);
    const ns = sp - 4.5 * dt;
    if (ns <= 0.12) { g.v[0] = 0; g.v[2] = 0; g.v[1] = 0; g.rest = true; }
    else { g.v[0] *= ns / sp; g.v[2] *= ns / sp; }
  }
}

// Calcula a velocidade inicial do arremesso (padrão CS: inclina 10° pra cima)
export function grenadeThrow(eye, yaw, pitch, strong, playerVel) {
  // pitch: positivo = olhando para cima (radianos)
  let p = pitch + (10 * Math.PI / 180) * (1 - Math.abs(pitch) / (Math.PI / 2));
  const speed = strong ? GRENADE.throwSpeedStrong : GRENADE.throwSpeedWeak;
  const cp = Math.cos(p);
  const dir = [-Math.sin(yaw) * cp, Math.sin(p), -Math.cos(yaw) * cp];
  const v = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
  if (playerVel) { v[0] += playerVel[0] * 1.0; v[1] += playerVel[1] * 0.5; v[2] += playerVel[2] * 1.0; }
  const o = [eye[0] + dir[0] * 0.3, eye[1] - 0.12, eye[2] + dir[2] * 0.3];
  return { o, v };
}

// Direção de visão a partir de yaw/pitch (radianos)
export function viewDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

// PRNG determinístico (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
