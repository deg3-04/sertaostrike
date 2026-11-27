// Inteligência artificial simples dos bots (rodam no servidor).
import { WEAPONS, cycleTime, recoilStep } from '../shared/weapons.js';
import { PLAYER, GRENADE, MOVE } from '../shared/constants.js';
import { createMoveState, stepMove, horizSpeed, viewDir, eyeHeight, lineOfSight, playerHead, playerCenter, makeRng } from '../shared/physics.js';
import { inaccuracy, spreadDir } from '../shared/combat.js';

export const BOT_NAMES = ['Calango', 'Carcará', 'Preá', 'Tatu-bola', 'Seriema', 'Mandacaru', 'Xique-xique', 'Juazeiro',
  'Rapadura', 'Cuscuz', 'Baião', 'Tapioca', 'Caju', 'Umbu', 'Sabiá', 'Jabá'];

const DIFF = {
  easy:   { reaction: 0.8, turn: 3.0, aimErr: 3.0, hsChance: 0.1, burst: [2, 4], pause: [0.5, 1.0], view: 40, fov: 100, comp: 0.25, strafe: 0.25, nade: 0.0 },
  normal: { reaction: 0.45, turn: 5.5, aimErr: 1.6, hsChance: 0.28, burst: [3, 6], pause: [0.3, 0.65], view: 60, fov: 120, comp: 0.55, strafe: 0.5, nade: 0.0015 },
  hard:   { reaction: 0.25, turn: 9.5, aimErr: 0.8, hsChance: 0.45, burst: [4, 9], pause: [0.2, 0.4], view: 85, fov: 140, comp: 0.85, strafe: 0.7, nade: 0.003 },
};

const DEG = Math.PI / 180;
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }

export class BotBrain {
  constructor(game, p, difficulty) {
    this.game = game;
    this.p = p;
    this.rand = makeRng(p.id * 7919 + 1013);
    this.setDifficulty(difficulty);
    this.reset();
  }
  setDifficulty(d) { this.d = DIFF[d] || DIFF.normal; }
  reset() {
    this.ms = null; this.path = null; this.pathIdx = 0; this.goal = null; this.repathAt = 0;
    this.target = null; this.reactAt = 0; this.lastSeen = null; this.lastSeenAt = -99; this.aimZone = 'chest';
    this.burstLeft = 0; this.pauseUntil = 0; this.penalty = 0; this.recoil = [0, 0]; this.shotIndex = 0; this.lastShotAt = -9;
    this.strafeDir = 1; this.strafeUntil = 0; this.crouchUntil = 0; this.crouch = false;
    this.stuckAt = 0; this.stuckPos = null; this.stuckCount = 0; this.jumpReq = false;
    this.errYaw = 0; this.errPitch = 0; this.errAt = 0;
    this.perceiveAt = 0; this.wantScope = false; this.lookAround = 0;
  }
  r(a, b) { return a + this.rand() * (b - a); }

  onSpawn() {
    this.reset();
    this.ms = createMoveState(this.p.pos);
    this.ms.onGround = true;
  }

  // ---------------------------------------------------------- percepção
  perceive(t) {
    const g = this.game, p = this.p, d = this.d;
    const eye = [p.pos[0], p.pos[1] + eyeHeight(p.crouch), p.pos[2]];
    const blind = t < (p.blindUntil || 0);
    let best = null, bestScore = Infinity;
    for (const q of g.players.values()) {
      if (q === p || !q.alive || g.sameTeam(p, q)) continue;
      const dx = q.pos[0] - p.pos[0], dz = q.pos[2] - p.pos[2], dy = q.pos[1] - p.pos[1];
      const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (dist > d.view) continue;
      const ang = Math.abs(wrapAngle(yawTo(dx, dz) - p.yaw));
      const heard = q.lastShotAt && t - q.lastShotAt < 1.5 && dist < 55;
      const inFov = ang < (d.fov * DEG) / 2 || dist < 3.5;
      // tiros ouvidos atrás de paredes: vai investigar o som (mais agressivo)
      if (heard && !this.target && (!this.heardAt || t - this.heardAt > 2.5)) {
        this.heardAt = t;
        if (!this.lastSeen || t - this.lastSeenAt > 2) { this.lastSeen = [q.pos[0], q.pos[1], q.pos[2]]; this.lastSeenAt = t; this.repathAt = 0; }
      }
      if (!inFov && !heard && q !== this.target) continue;
      if (blind && dist > 2.5) continue;
      const head = playerHead(q.pos[0], q.pos[1], q.pos[2], q.crouch);
      const chest = playerCenter(q.pos[0], q.pos[1], q.pos[2], q.crouch);
      let visible = lineOfSight(eye, head, g.map.solid) || lineOfSight(eye, chest, g.map.solid);
      if (visible && g.smokeBlocks(eye, chest)) visible = false;
      if (!visible) continue;
      if (!inFov && heard) {
        // ouviu: vira para lá, mas ainda não "viu"
        if (!this.target) { this.lastSeen = [q.pos[0], q.pos[1], q.pos[2]]; this.lastSeenAt = t; }
        continue;
      }
      const score = dist + (q === this.target ? -8 : 0);
      if (score < bestScore) { bestScore = score; best = q; }
    }
    if (best && best !== this.target) {
      this.target = best;
      this.reactAt = t + d.reaction * this.r(0.75, 1.35);
      this.aimZone = this.rand() < d.hsChance ? 'head' : 'chest';
      this.burstLeft = 0; this.pauseUntil = 0;
    }
    if (best) {
      this.lastSeen = [best.pos[0], best.pos[1], best.pos[2]];
      this.lastSeenAt = t;
      this.targetVisible = true;
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || t - this.lastSeenAt > 1.2)) this.target = null;
    }
  }

  // ---------------------------------------------------------- navegação
  pickGoal(t) {
    const g = this.game;
    // Capture a Bandeira: pegar, levar ou recuperar bandeiras
    const cg = g.ctfGoal && g.ctfGoal(this.p, this.rand);
    if (cg && (g.isCarrier(this.p) || !(this.lastSeen && t - this.lastSeenAt < 5))) return cg;
    if (this.lastSeen && t - this.lastSeenAt < 5) return this.lastSeen;
    // caça inimigos na maior parte do tempo; às vezes flanqueia (chega pelo lado)
    if (this.rand() < 0.72) {
      const others = g.enemiesOf(this.p);
      if (others.length) {
        // prefere o inimigo mais próximo
        others.sort((a, b) => Math.hypot(a.pos[0] - this.p.pos[0], a.pos[2] - this.p.pos[2]) - Math.hypot(b.pos[0] - this.p.pos[0], b.pos[2] - this.p.pos[2]));
        const q = others[this.rand() < 0.6 ? 0 : Math.floor(this.rand() * others.length)];
        if (this.rand() < 0.35) {
          const dx = q.pos[0] - this.p.pos[0], dz = q.pos[2] - this.p.pos[2];
          const l = Math.hypot(dx, dz) || 1, sgn = this.rand() < 0.5 ? -1 : 1;
          const off = Math.min(10, l * 0.5);
          return [q.pos[0] - dz / l * off * sgn, q.pos[1], q.pos[2] + dx / l * off * sgn];
        }
        return [q.pos[0] + this.r(-4, 4), q.pos[1], q.pos[2] + this.r(-4, 4)];
      }
    }
    return g.nav.randomPoint(this.rand);
  }
  repath(t, goal) {
    const g = this.game;
    // muitos bots querendo calcular caminho no mesmo tick: este espera um pouco
    if (g.pathBudget !== undefined) {
      if (g.pathBudget <= 0) { this.repathAt = t + 0.02 + this.rand() * 0.05; return; }
      g.pathBudget--;
    }
    this.goal = goal || this.pickGoal(t);
    this.path = g.nav.findPath(this.p.pos, this.goal);
    this.pathIdx = 0;
    this.repathAt = t + this.r(2.5, 4.5);
    if (!this.path) { this.goal = null; this.repathAt = t + 0.5; }
  }

  // ---------------------------------------------------------- armas
  currentWeapon() { return WEAPONS[this.p.weapon]; }

  manageWeapon(t) {
    const g = this.game, p = this.p;
    const inv = p.inv;
    const prim = inv[p.primary], sec = inv[p.secondary];
    let w = this.currentWeapon();
    const slot = inv[p.weapon];
    if (p.reloading) return;
    if (g.settings.mode === 'gungame') {
      const gw = p.ggWeapon || 'knife';
      if (p.weapon !== gw && g.hasWeapon(p, gw)) { g.playerSwitch(p, gw); return; }
      if (gw !== 'knife' && slot && slot.mag === 0) g.playerReload(p);
      return;
    }
    if (w.type === 'melee' || w.type === 'grenade') {
      g.playerSwitch(p, prim && (prim.mag > 0 || prim.res > 0) ? p.primary : p.secondary);
      return;
    }
    if (slot.mag === 0) {
      if (slot.res > 0 || g.settings.infiniteAmmo) { g.playerReload(p); return; }
      // sem munição: troca de arma
      const other = p.weapon === p.primary ? p.secondary : p.primary;
      if (inv[other] && (inv[other].mag > 0 || inv[other].res > 0)) g.playerSwitch(p, other);
      else g.playerSwitch(p, 'knife');
      return;
    }
    if (!this.targetVisible && slot.mag < w.mag * 0.4 && (slot.res > 0 || g.settings.infiniteAmmo) && t - this.lastShotAt > 1.5) {
      g.playerReload(p);
    }
    if (p.weapon === p.secondary && prim && prim.mag > 0 && !this.targetVisible) g.playerSwitch(p, p.primary);
  }

  tryFire(t, dt) {
    const g = this.game, p = this.p, d = this.d;
    const w = this.currentWeapon();
    if (!w || w.type === 'grenade') return;
    if (t < (p.deployUntil || 0) || p.reloading) return;
    const tg = this.target;
    const eye = [p.pos[0], p.pos[1] + eyeHeight(p.crouch), p.pos[2]];
    const aimPt = this.aimZone === 'head' ? playerHead(tg.pos[0], tg.pos[1], tg.pos[2], tg.crouch) : playerCenter(tg.pos[0], tg.pos[1], tg.pos[2], tg.crouch);
    const dx = aimPt[0] - eye[0], dy = aimPt[1] - eye[1], dz = aimPt[2] - eye[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (w.type === 'melee') {
      if (dist < 1.6 && t >= this.pauseUntil) {
        g.playerKnife(p, dist < 1.2 && this.rand() < 0.4 ? 1 : 0, [dx / dist, dy / dist, dz / dist], t);
        this.pauseUntil = t + 0.5;
      }
      return;
    }
    const wantYaw = yawTo(dx, dz), wantPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    const err = Math.abs(wrapAngle(wantYaw - p.yaw)) + Math.abs(wantPitch - p.pitch);
    const tol = Math.max(Math.atan2(0.3, dist), 1.2 * DEG) + d.aimErr * DEG;
    if (err > tol) return;
    if (t < this.pauseUntil) return;
    // atiradores: só com a mira e parado
    if (w.scope && w.type === 'sniper') {
      if (!p.scoped) { p.scoped = true; this.pauseUntil = t + 0.25; return; }
      if (horizSpeed(this.ms) > 1.2) return;
    }
    // bots difíceis param para atirar com fuzil (como no CS)
    if ((w.type === 'rifle') && this.d.comp > 0.7 && horizSpeed(this.ms) > w.speed * 0.4 && dist > 7) return;
    const cyc = cycleTime(w) * (w.auto ? 1 : 1.5);
    if (t - this.lastShotAt < cyc) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = w.auto ? Math.round(this.r(d.burst[0], d.burst[1])) : 1;
    }
    // direção com recuo (parcialmente compensado) e imprecisão
    const slot = p.inv[p.weapon];
    if (!slot || slot.mag <= 0) return;
    const st = { speed: horizSpeed(this.ms), onGround: this.ms.onGround, crouch: p.crouch, scoped: p.scoped, penalty: this.penalty };
    const inacc = inaccuracy(w, st);
    const yaw = p.yaw + this.recoil[1] * (1 - d.comp) * DEG;
    const pitch = p.pitch + this.recoil[0] * (1 - d.comp) * DEG;
    const base = viewDir(yaw, pitch);
    const dirs = [];
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) dirs.push(spreadDir(base, inacc, n > 1 ? w.pelletSpread : w.acc.spread, this.rand));
    const ok = g.botFire(p, p.weapon, eye, dirs);
    if (!ok) return;
    this.lastShotAt = t;
    this.penalty += w.acc.fire;
    const rs = recoilStep(w, this.shotIndex++, this.rand);
    this.recoil[0] = Math.min(w.recoil.maxUp, this.recoil[0] + rs[0]);
    this.recoil[1] += rs[1];
    this.burstLeft--;
    if (this.burstLeft <= 0) this.pauseUntil = t + this.r(d.pause[0], d.pause[1]);
    if (w.scope && w.scope.unscopeOnFire) { p.scoped = false; this.pauseUntil = Math.max(this.pauseUntil, t + cycleTime(w)); }
  }

  maybeThrow(t) {
    const g = this.game, p = this.p, tg = this.target;
    if (!tg || !p.nades.he || this.rand() > this.d.nade) return;
    const dx = tg.pos[0] - p.pos[0], dz = tg.pos[2] - p.pos[2];
    const dh = tg.pos[1] - p.pos[1];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 9 || dist > 24) return;
    const v = GRENADE.throwSpeedStrong, gr = MOVE.gravity * GRENADE.gravityMult;
    const disc = v ** 4 - gr * (gr * dist * dist + 2 * dh * v * v);
    if (disc < 0) return;
    const theta = Math.atan((v * v - Math.sqrt(disc)) / (gr * dist));
    const yaw = yawTo(dx, dz);
    const eye = [p.pos[0], p.pos[1] + eyeHeight(p.crouch), p.pos[2]];
    const dir = [-Math.sin(yaw) * Math.cos(theta), Math.sin(theta), -Math.cos(yaw) * Math.cos(theta)];
    g.playerThrow(p, 'he', [eye[0] + dir[0] * 0.3, eye[1] - 0.1, eye[2] + dir[2] * 0.3], [dir[0] * v, dir[1] * v, dir[2] * v], 0);
  }

  // ---------------------------------------------------------- ciclo
  update(dt, t) {
    const g = this.game, p = this.p, d = this.d;
    if (!p.alive || !this.ms) return;
    if (g.phase === 'ended') return;
    if (t >= this.perceiveAt) { this.perceive(t); this.perceiveAt = t + 0.1; }
    this.manageWeapon(t);

    // recuperação de recuo/precisão
    const w = this.currentWeapon();
    if (w && w.acc) this.penalty *= Math.exp(-dt * 3 / w.acc.recovery);
    if (t - this.lastShotAt > 0.15) {
      const k = Math.exp(-dt * (w && w.recoil ? w.recoil.recovery : 8));
      this.recoil[0] *= k; this.recoil[1] *= k;
      if (Math.abs(this.recoil[0]) < 0.1) this.shotIndex = 0;
    }

    // ---- mira
    let wantYaw = p.yaw, wantPitch = 0;
    let moveDir = null;
    const tg = this.target;
    if (t > this.errAt) {
      this.errYaw = (this.rand() - 0.5) * 2 * d.aimErr * DEG;
      this.errPitch = (this.rand() - 0.5) * d.aimErr * DEG;
      this.errAt = t + this.r(0.25, 0.6);
    }
    if (tg && this.targetVisible) {
      const eye = [p.pos[0], p.pos[1] + eyeHeight(p.crouch), p.pos[2]];
      const pt = this.aimZone === 'head' ? playerHead(tg.pos[0], tg.pos[1], tg.pos[2], tg.crouch) : playerCenter(tg.pos[0], tg.pos[1], tg.pos[2], tg.crouch);
      // antecipa um pouco o movimento do alvo
      const lead = 0.06;
      pt[0] += (tg.vel ? tg.vel[0] : 0) * lead; pt[2] += (tg.vel ? tg.vel[2] : 0) * lead;
      const dx = pt[0] - eye[0], dy = pt[1] - eye[1], dz = pt[2] - eye[2];
      wantYaw = yawTo(dx, dz) + this.errYaw;
      wantPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) + this.errPitch;
    } else if (this.lastSeen && t - this.lastSeenAt < 3) {
      const dx = this.lastSeen[0] - p.pos[0], dz = this.lastSeen[2] - p.pos[2];
      wantYaw = yawTo(dx, dz);
    }

    // ---- movimento
    const wantNav = !(tg && this.targetVisible);
    if (wantNav) {
      if (!this.path || t > this.repathAt || this.pathIdx >= this.path.length) {
        // Capture a Bandeira: o objetivo (bandeiras) costuma valer mais que perseguir quem sumiu de vista
        const carrier = g.isCarrier && g.isCarrier(p);
        const cg = g.ctfGoal ? g.ctfGoal(p, this.rand) : null;
        const chase = this.lastSeen && t - this.lastSeenAt < 5 ? this.lastSeen : null;
        this.repath(t, cg && (carrier || !chase || this.rand() < 0.75) ? cg : chase);
      }
      if (this.path && this.pathIdx < this.path.length) {
        let wp = this.path[this.pathIdx];
        let dx = wp[0] - p.pos[0], dz = wp[2] - p.pos[2];
        let dd = Math.sqrt(dx * dx + dz * dz);
        while (dd < 0.7 && this.pathIdx < this.path.length - 1) {
          this.pathIdx++;
          wp = this.path[this.pathIdx];
          dx = wp[0] - p.pos[0]; dz = wp[2] - p.pos[2];
          dd = Math.sqrt(dx * dx + dz * dz);
        }
        if (dd < 0.7 && this.pathIdx >= this.path.length - 1) { this.path = null; }
        else {
          moveDir = [dx / dd, dz / dd];
          if (!(this.lastSeen && t - this.lastSeenAt < 3)) {
            wantYaw = yawTo(dx, dz) + Math.sin(t * 0.7 + p.id) * 0.25;
          }
        }
      }
      p.scoped = false;
      this.crouch = false;
    } else {
      // em combate: strafe lateral e aproximação conforme a arma
      const dx = tg.pos[0] - p.pos[0], dz = tg.pos[2] - p.pos[2];
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      if (t > this.strafeUntil) {
        this.strafeDir = this.rand() < 0.5 ? -1 : 1;
        if (this.rand() > d.strafe) this.strafeDir = 0;
        this.strafeUntil = t + this.r(0.35, 1.1);
        this.crouch = this.rand() < 0.18 && dist > 12;
      }
      const fx = dx / dist, fz = dz / dist;
      const rx = -fz, rz = fx;
      const wt = w ? w.type : 'rifle';
      const ideal = wt === 'melee' ? 0.8 : wt === 'shotgun' ? 3 : wt === 'smg' ? 9 : wt === 'sniper' ? 25 : 14;
      const approach = wt === 'melee' ? 1 : dist > ideal + 4 ? 1 : dist < ideal * 0.5 ? -0.6 : 0;
      let mx = fx * approach + rx * this.strafeDir, mz = fz * approach + rz * this.strafeDir;
      const ml = Math.sqrt(mx * mx + mz * mz);
      if (ml > 0.01) moveDir = [mx / ml, mz / ml];
      // atiradores e fuzis "difíceis" param para atirar
      if (wt === 'sniper' && dist > 8) moveDir = null;
      this.maybeThrow(t);
    }

    // giro suave da mira
    const turn = d.turn * (this.targetVisible ? 1 : 0.6);
    const dyaw = wrapAngle(wantYaw - p.yaw);
    p.yaw = wrapAngle(p.yaw + Math.max(-turn * dt, Math.min(turn * dt, dyaw * Math.min(1, dt * 9))));
    const dp = wantPitch - p.pitch;
    p.pitch += Math.max(-turn * dt, Math.min(turn * dt, dp * Math.min(1, dt * 9)));
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));

    if (tg && this.targetVisible && t >= this.reactAt) this.tryFire(t, dt);

    // detecção de "preso"
    if (moveDir && t > this.stuckAt) {
      if (this.stuckPos) {
        const mv = Math.hypot(p.pos[0] - this.stuckPos[0], p.pos[2] - this.stuckPos[2]);
        if (mv < 0.3) {
          this.stuckCount++;
          this.jumpReq = true;
          if (this.stuckCount >= 2) { this.path = null; this.repathAt = 0; this.stuckCount = 0; }
        } else this.stuckCount = 0;
      }
      this.stuckPos = [p.pos[0], p.pos[2]];
      this.stuckAt = t + 0.9;
    }

    // entrada de movimento relativa ao yaw
    let fwd = 0, side = 0;
    if (moveDir) {
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      fwd = moveDir[0] * -sy + moveDir[1] * -cy;
      side = moveDir[0] * cy + moveDir[1] * -sy;
    }
    const scoped = p.scoped && w && w.scope;
    const maxSpeed = scoped ? w.scope.speed : (w ? w.speed : 6);
    const input = { fwd, side, yaw: p.yaw, jump: this.jumpReq, crouch: this.crouch, walk: false };
    this.jumpReq = false;
    stepMove(this.ms, input, dt, g.map.solid, maxSpeed);
    p.pos[0] = this.ms.pos[0]; p.pos[1] = this.ms.pos[1]; p.pos[2] = this.ms.pos[2];
    p.vel = [this.ms.vel[0], this.ms.vel[1], this.ms.vel[2]];
    p.crouch = this.ms.ducked;
    p.onGround = this.ms.onGround;
  }
}
