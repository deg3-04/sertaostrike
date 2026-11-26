// Regras de combate compartilhadas: imprecisão, dispersão, dano por parte
// do corpo, colete/capacete e penetração de paredes finas.
import { HIT_ZONES, DAMAGE_SCALE } from './constants.js';
import { raycastWorldAll, rayHitPlayer } from './physics.js';

const DEG = Math.PI / 180;

// Imprecisão total (graus) no momento do disparo
export function inaccuracy(w, st) {
  if (!w.acc) return 0;
  const scoped = st.scoped && w.scope;
  let base = w.acc;
  let stand = base.stand, crouch = base.crouch, move = base.move, jump = base.jump;
  if (scoped && w.scopedAcc) {
    stand = w.scopedAcc.stand; crouch = w.scopedAcc.crouch; move = w.scopedAcc.move; jump = w.scopedAcc.jump;
  } else if (scoped && w.scope.accMult) {
    stand *= w.scope.accMult; crouch *= w.scope.accMult; move *= w.scope.accMult;
  }
  let inacc = st.crouch ? crouch : stand;
  const maxSpeed = scoped && w.scope ? w.scope.speed : w.speed;
  const frac = st.speed / Math.max(0.1, maxSpeed);
  const mf = Math.min(1, Math.max(0, (frac - 0.30) / 0.70));
  inacc += move * Math.pow(mf, 1.4);
  if (!st.onGround) inacc += jump;
  inacc += Math.min(base.max, st.penalty || 0);
  return inacc;
}

// Aplica um desvio aleatório dentro do cone (estilo CS: raio linear no aleatório)
export function spreadDir(dir, inaccDeg, spreadDeg, rand) {
  const r1 = rand() * inaccDeg * DEG;
  const a1 = rand() * Math.PI * 2;
  const r2 = rand() * spreadDeg * DEG;
  const a2 = rand() * Math.PI * 2;
  const ox = Math.cos(a1) * r1 + Math.cos(a2) * r2;
  const oy = Math.sin(a1) * r1 + Math.sin(a2) * r2;
  // base ortonormal em torno de dir
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dir[1]) > 0.95) { ux = 1; uy = 0; }
  // right = dir × up
  let rx = dir[1] * uz - dir[2] * uy, ry = dir[2] * ux - dir[0] * uz, rz = dir[0] * uy - dir[1] * ux;
  let rl = Math.sqrt(rx * rx + ry * ry + rz * rz); rx /= rl; ry /= rl; rz /= rl;
  // up2 = right × dir
  const upx = ry * dir[2] - rz * dir[1], upy = rz * dir[0] - rx * dir[2], upz = rx * dir[1] - ry * dir[0];
  const tx = Math.tan(ox), ty = Math.tan(oy);
  let x = dir[0] + rx * tx + upx * ty, y = dir[1] + ry * tx + upy * ty, z = dir[2] + rz * tx + upz * ty;
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}

// Dano bruto após distância e parte do corpo
export function rawDamage(w, zone, dist, penFactor = 1) {
  const falloff = Math.pow(w.rangeMod, dist / 12.7);
  return w.damage * DAMAGE_SCALE * falloff * HIT_ZONES[zone].mult * penFactor;
}

// Colete e capacete (fórmula do CS). Retorna { health, armorLoss }.
export function applyArmor(dmg, armorPen, armor, helmet, zone) {
  const z = HIT_ZONES[zone];
  const protectedZone = z && (z.armored === 'kevlar' || (z.armored === 'helmet' && helmet));
  if (!protectedZone || armor <= 0) return { health: dmg, armorLoss: 0 };
  let health = dmg * armorPen;
  let armorLoss = (dmg - health) * 0.5;
  if (armorLoss > armor) {
    armorLoss = armor;
    health = dmg - armor * 2;
  }
  return { health, armorLoss };
}

// Traça uma bala: atravessa no máximo uma superfície fina penetrável
// (madeira/metal) e para no primeiro jogador atingido.
// targets: [{ id, x, y, z, crouch }]
export function traceBullet(o, d, w, boxes, targets, ignoreId) {
  const maxRange = w.range || 200;
  const hits = raycastWorldAll(o, d, maxRange, boxes);
  let stopT = maxRange, stopHit = null;
  const pens = []; // { t, tExit, factor }
  let factor = 1, penCount = 0;
  for (const h of hits) {
    const b = h.box;
    const thick = h.tExit - h.t;
    if (b.pen && w.penetration && penCount < 1 && thick <= w.penetration) {
      const f = Math.max(0.15, 0.85 - 0.6 * (thick / w.penetration));
      factor *= f;
      pens.push({ t: h.t, tExit: h.tExit, factor });
      penCount++;
      continue;
    }
    stopT = h.t; stopHit = h;
    break;
  }
  let best = null;
  for (const tg of targets) {
    if (tg.id === ignoreId) continue;
    const r = rayHitPlayer(o, d, stopT, tg.x, tg.y, tg.z, tg.crouch);
    if (r && (!best || r.t < best.t)) best = { ...r, target: tg };
  }
  if (best) {
    let f = 1;
    for (const p of pens) if (p.tExit <= best.t) f = p.factor;
    const insidePen = pens.some((p) => p.t < best.t && p.tExit > best.t);
    if (insidePen) best = null; // dentro da parede: ignora
    else {
      const end = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
      return { kind: 'player', t: best.t, end, zone: best.zone, target: best.target, penFactor: f, pens };
    }
  }
  if (stopHit) {
    const end = [o[0] + d[0] * stopT, o[1] + d[1] * stopT, o[2] + d[2] * stopT];
    return { kind: 'wall', t: stopT, end, axis: stopHit.axis, sign: stopHit.sign, box: stopHit.box, pens };
  }
  return { kind: 'none', t: maxRange, end: [o[0] + d[0] * maxRange, o[1] + d[1] * maxRange, o[2] + d[2] * maxRange], pens };
}
