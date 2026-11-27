// Jogador local: movimento (predição no cliente), armas e envio de estado.
import * as THREE from '/lib/three.js';
import { stepMove, createMoveState, horizSpeed, viewDir, grenadeThrow, raycastWorld } from '/shared/physics.js';
import { WEAPONS, cycleTime, recoilStep, WEAPON_INDEX } from '/shared/weapons.js';
import { inaccuracy, spreadDir, traceBullet } from '/shared/combat.js';
import { PLAYER, MOVE, FLAG, GRENADE } from '/shared/constants.js';

const DEG = Math.PI / 180;
const VIEW_KICK = 0.5;
const NADES = ['he', 'flash', 'smoke', 'mine'];

export class LocalPlayer {
  constructor(game) {
    this.g = game;
    this.ms = createMoveState([0, 0, 0]);
    this.yaw = 0; this.pitch = 0;
    this.alive = false;
    this.lifeId = 0;
    this.weapon = 'knife'; this.prevWeapon = 'knife';
    this.inv = {}; this.nades = { he: 0, flash: 0, smoke: 0, mine: 0 };
    this.hp = 100; this.armor = 0; this.helmet = false;
    this.protectedUntil = 0;
    this.primary = 'ak47'; this.secondary = 'glock';
    this.resetWeaponState();
    this.sendAcc = 0;
    this.stepAcc = 0;
    this.punch = 0; this.punchYaw = 0;
    this.camPos = new THREE.Vector3();
    this.camY = 0;
    this.deathPos = null; this.deathT = 0; this.killerId = null;
    this.curInacc = 0;
    this.cidSeq = 1;
    this.jumpQueued = false;
    this.totalShake = 0;
  }

  resetWeaponState() {
    this.nextFire = 0; this.deployUntil = 0; this.reloading = null;
    this.penalty = 0; this.recoil = [0, 0]; this.shotIndex = 0; this.lastShotAt = -10;
    this.scope = 0; this.resumeZoom = null; this.triggerLock = false; this.throwing = null; this.knifeNext = 0;
    this.dryLock = false;
  }

  now() { return performance.now() / 1000; }
  w() { return WEAPONS[this.weapon]; }

  // ------------------------------------------------------------ eventos do servidor
  spawn(m) {
    const g = this.g;
    this.alive = true;
    this.lifeId = m.s;
    this.ms = createMoveState(m.p);
    this.ms.onGround = true;
    this.yaw = m.y; this.pitch = 0;
    this.hp = m.hp; this.armor = m.ar; this.helmet = m.hm;
    this.protectedUntil = this.now() + (m.prot || 0);
    this.applyInventory(m.inv, m.nades, m.lo);
    this.camY = m.p[1] + PLAYER.eyeHeight;
    this.deathPos = null;
    this.punch = 0;
    g.audio.ui('spawn');
  }

  applyInventory(inv, nades, lo) {
    this.inv = {};
    for (const [k, v] of Object.entries(inv)) this.inv[k] = { mag: v[0], res: v[1] };
    this.nades = { ...nades };
    // inventário pode não ter as armas escolhidas (Gun Game): usa o que houver
    const guns = Object.keys(this.inv).filter((k) => WEAPONS[k] && WEAPONS[k].type !== 'melee' && WEAPONS[k].type !== 'grenade');
    const pist = guns.find((k) => WEAPONS[k].type === 'pistol');
    const main = guns.find((k) => WEAPONS[k].type !== 'pistol');
    this.primary = this.inv[lo.primary] ? lo.primary : (main || pist || 'knife');
    this.secondary = this.inv[lo.secondary] ? lo.secondary : (pist || main || 'knife');
    this.resetWeaponState();
    this.weapon = null;
    this.prevWeapon = this.secondary;
    if (!this.switchTo(this.primary, true)) this.switchTo('knife', true);
  }

  // recompensa de abate: atualiza munição/granadas sem trocar de arma
  refillInventory(inv, nades) {
    for (const [k, v] of Object.entries(inv)) {
      if (this.inv[k]) { this.inv[k].mag = v[0]; this.inv[k].res = v[1]; } else this.inv[k] = { mag: v[0], res: v[1] };
    }
    this.nades = { ...nades };
    if (this.reloading) this.reloading = null;
  }

  die(killerId) {
    this.alive = false;
    if (this.cooking) { this.cooking = null; this.g.viewmodel.holdNade(false); }
    this.deathPos = new THREE.Vector3(this.ms.pos[0], this.ms.pos[1] + this.ms.eyeOffset, this.ms.pos[2]);
    this.deathT = 0;
    this.killerId = killerId;
    this.scope = 0;
    this.g.viewmodel.setScoped(false);
    this.reloading = null;
  }

  hurt(m) {
    this.hp = m.hp; this.armor = m.ar;
    this.ms.tagTime = MOVE.tagTime;
    this.punch += Math.min(3, 0.6 + m.dmg * 0.04);
    this.punchYaw += (Math.random() - 0.5) * Math.min(2, m.dmg * 0.03);
  }

  // ------------------------------------------------------------ armas
  hasWeapon(id) {
    const w = WEAPONS[id];
    if (!w) return false;
    if (w.type === 'grenade') return this.nades[id] > 0;
    return !!this.inv[id];
  }

  switchTo(id, force) {
    if (!id || !this.hasWeapon(id)) return false;
    if (id === this.weapon && !force) return false;
    if (this.weapon && this.weapon !== id) this.prevWeapon = this.weapon;
    this.weapon = id;
    const w = WEAPONS[id];
    this.reloading = null;
    this.setScope(0, true);
    this.resumeZoom = null;
    this.throwing = null;
    this.cancelCook();
    this.deployUntil = this.now() + w.deploy;
    this.triggerLock = false;
    this.g.viewmodel.setWeapon(id, w.deploy);
    this.g.audio.deploy(w);
    this.g.net.send({ t: 'sw', w: id });
    this.g.hud.showSlots();
    return true;
  }

  setScope(level, silent) {
    const w = this.w();
    this.scope = level;
    this.g.viewmodel.setScoped(level > 0 && !!w && w.scope);
    if (!silent) this.g.audio.scope();
  }

  scopeFov() {
    const w = this.w();
    if (!this.scope || !w || !w.scope) return null;
    return w.scope.levels[this.scope - 1];
  }

  startReload() {
    const w = this.w();
    const slot = this.inv[this.weapon];
    if (!w || !slot || !w.mag || this.reloading) return;
    if (slot.mag >= w.mag) return;
    if (slot.res <= 0 && !this.g.settings_match().infiniteAmmo) return;
    const t = this.now();
    if (t < this.deployUntil) return;
    this.setScope(0, true);
    this.resumeZoom = null;
    if (w.shellReload) {
      this.reloading = { wid: this.weapon, start: t, loaded: 0, shell: true };
      this.g.viewmodel.reload(1.0, true);
    } else {
      this.reloading = { wid: this.weapon, start: t, end: t + w.reload };
      this.g.viewmodel.reload(w.reload, false);
      this.g.audio.reload(w, w.reload);
    }
    this.g.net.send({ t: 'r' });
  }

  updateReload(t) {
    const r = this.reloading;
    if (!r) return;
    const w = WEAPONS[r.wid], slot = this.inv[r.wid];
    const inf = this.g.settings_match().infiniteAmmo;
    if (r.shell) {
      const due = Math.floor((t - r.start - w.reloadStart) / w.reload);
      while (r.loaded < due && slot.mag < w.mag && (slot.res > 0 || inf)) {
        slot.mag++; if (!inf) slot.res--; r.loaded++;
        this.g.audio.shellInsert();
      }
      if (slot.mag >= w.mag || (slot.res <= 0 && !inf)) { this.reloading = null; this.g.viewmodel.stopReload(); this.g.audio.shellInsert(true); }
    } else if (t >= r.end) {
      const need = w.mag - slot.mag;
      const take = inf ? need : Math.min(need, slot.res);
      slot.mag += take; if (!inf) slot.res -= take;
      this.reloading = null;
    }
  }

  fireShot(t) {
    const g = this.g;
    const w = this.w();
    const slot = this.inv[this.weapon];
    const eye = this.eye();
    const st = { speed: horizSpeed(this.ms), onGround: this.ms.onGround, crouch: this.ms.ducked, scoped: this.scope > 0, penalty: this.penalty };
    const inacc = inaccuracy(w, st);
    const ry = this.yaw - this.recoil[1] * DEG, rp = this.pitch + this.recoil[0] * DEG;
    const base = viewDir(ry, rp);
    const n = w.pellets || 1;
    const dirs = [];
    for (let i = 0; i < n; i++) dirs.push(spreadDir(base, inacc, n > 1 ? w.pelletSpread : w.acc.spread, Math.random));
    g.net.send({ t: 'f', w: this.weapon, o: eye.map((v) => Math.round(v * 1000) / 1000), d: dirs.map((d) => d.map((v) => Math.round(v * 100000) / 100000)), rt: g.renderTime() });
    // efeitos locais imediatos (paredes)
    const muzzle = this.muzzleWorld();
    this.shotCount = (this.shotCount || 0) + 1;
    for (let i = 0; i < n; i++) {
      const r = traceBullet(eye, dirs[i], w, g.map.solid, [], -1);
      const end = new THREE.Vector3(...r.end);
      if (r.kind === 'wall') {
        const nrm = new THREE.Vector3(0, 0, 0); nrm.setComponent(r.axis, r.sign);
        g.effects.impact(end, nrm, r.box.floor ? 'ground' : r.box.mat, new THREE.Vector3(...dirs[i]));
      }
      for (const p of r.pens) {
        const pp = new THREE.Vector3(eye[0] + dirs[i][0] * p.tExit, eye[1] + dirs[i][1] * p.tExit, eye[2] + dirs[i][2] * p.tExit);
        g.effects.addHole(pp, new THREE.Vector3(...dirs[i]));
      }
      if (n === 1 && (w.type !== 'smg' && w.type !== 'rifle' || this.shotCount % 3 === 0)) g.effects.tracer(muzzle, end);
      else if (n > 1 && i < 2) g.effects.tracer(muzzle, end);
    }
    if (!(w.snd && w.snd.suppressed)) g.effects.flashLight(0, new THREE.Vector3(eye[0], eye[1], eye[2]).addScaledVector(new THREE.Vector3(...viewDir(this.yaw, this.pitch)), 0.8), 0xffc070, 8, 0.06, 10);
    g.audio.shot(w, null, true);
    g.viewmodel.fire(w);
    slot.mag--;
    this.lastShotAt = t;
    this.penalty += w.acc.fire;
    const rs = recoilStep(w, this.shotIndex++, Math.random);
    const rm = this.scope && w.scope && w.scope.recoilMult ? w.scope.recoilMult : 1;
    this.recoil[0] = Math.min(w.recoil.maxUp, this.recoil[0] + rs[0] * rm);
    this.recoil[1] += rs[1] * rm;
    this.protectedUntil = 0;
    let cyc = cycleTime(w);
    if (this.scope && w.scope && w.scope.fireRateMult) cyc /= w.scope.fireRateMult;
    this.nextFire = t + cyc;
    if (w.scope && w.scope.unscopeOnFire && this.scope) {
      this.resumeZoom = { at: t + cyc * 0.95, level: this.scope };
      this.setScope(0, true);
    }
    if (w.type === 'sniper') g.audio.bolt(0.25);
    if (!w.auto) this.triggerLock = true;
    if (slot.mag === 0 && (slot.res > 0 || g.settings_match().infiniteAmmo)) this.autoReloadAt = t + 0.35;
  }

  knife(mode, t) {
    const w = WEAPONS.knife;
    const cfg = mode ? w.stab : w.slash;
    if (t < this.knifeNext || t < this.deployUntil) return;
    this.knifeNext = t + cfg.rate;
    this.g.viewmodel.knife(mode);
    this.g.audio.knifeSwing(null);
    this.g.net.send({ t: 'k', m: mode, d: viewDir(this.yaw, this.pitch), rt: this.g.renderTime() });
    this.protectedUntil = 0;
  }

  // segurar o botão: puxa o pino e carrega a força; soltar: lança
  startCook(t) {
    if (this.throwing || this.cooking || t < this.deployUntil || !(this.nades[this.weapon] > 0)) return;
    this.cooking = { kind: this.weapon, at: t };
    this.g.viewmodel.holdNade(true);
    this.g.audio.pin();
    this.g.net.send({ t: 'gp', k: this.weapon });
  }
  cookState(t) {
    const c = this.cooking;
    if (!c) return null;
    const held = t - c.at;
    const power = Math.min(1, GRENADE.minCharge + (1 - GRENADE.minCharge) * held / GRENADE.chargeTime);
    const fuse = GRENADE.fuseSteps * GRENADE.dt;
    const burnt = c.kind === 'smoke' ? 0 : Math.max(0, held - GRENADE.cookFree);
    return { power, fuseLeft: c.kind === 'smoke' ? null : Math.max(0, fuse - burnt), fuse, kind: c.kind };
  }
  releaseCook(t) {
    const st = this.cookState(t);
    this.cooking = null;
    if (!st) return;
    this.throwing = { strong: st.power, at: t + 0.12, kind: st.kind };
    this.g.viewmodel.holdNade(false);
    this.g.viewmodel.throwNade(true);
  }
  cancelCook() {
    if (!this.cooking) return;
    this.cooking = null;
    this.g.viewmodel.holdNade(false);
    this.g.net.send({ t: 'gp', k: null });
  }

  startThrow(strong, t) {
    if (this.throwing || t < this.deployUntil) return;
    this.throwing = { strong, at: t + 0.2, kind: this.weapon };
    this.g.viewmodel.throwNade();
    this.g.audio.pin();
  }

  doThrow() {
    const g = this.g;
    const th = this.throwing;
    const kind = th.kind;
    if (this.nades[kind] <= 0) { this.throwing = null; return; }
    const { o, v } = grenadeThrow(this.eye(), this.yaw, this.pitch, th.strong, this.ms.vel);
    // não começa dentro da parede
    const eye = this.eye();
    const dd = [o[0] - eye[0], o[1] - eye[1], o[2] - eye[2]];
    const dl = Math.hypot(...dd);
    const hit = raycastWorld(eye, dd.map((c) => c / dl), dl + GRENADE.radius + 0.05, g.map.solid);
    if (hit) { const k = Math.max(0, hit.t - GRENADE.radius - 0.08); for (let i = 0; i < 3; i++) o[i] = eye[i] + dd[i] / dl * k; }
    const cid = this.cidSeq++;
    g.net.send({ t: 'g', k: kind, o, v, cid });
    g.effects.addNade('c' + cid, kind, o, v, g.serverTime(), g.serverTime(), g.map.solid);
    g.audio.throwSound(null);
    this.nades[kind]--;
    this.protectedUntil = 0;
    this.throwing = null;
    this.afterThrowAt = this.now() + 0.45;
  }

  // mina terrestre: planta no chão à frente (o servidor escolhe o ponto exato)
  placeMine(t) {
    if (t < this.deployUntil || this.throwing || !(this.nades.mine > 0) || t < (this.mineNext || 0)) return;
    this.mineNext = t + 0.7;
    this.g.net.send({ t: 'mine' });
    this.g.viewmodel.throwNade();
    this.g.audio.minePlace(null);
    this.nades.mine--;
    this.protectedUntil = 0;
    this.afterThrowAt = this.now() + 0.5;
  }

  // ------------------------------------------------------------ utilidades
  eye() { return [this.ms.pos[0], this.ms.pos[1] + this.ms.eyeOffset, this.ms.pos[2]]; }
  muzzleWorld() {
    const e = this.eye();
    const f = new THREE.Vector3(...viewDir(this.yaw, this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const side = this.g.settings.leftHanded ? -1 : 1;
    return new THREE.Vector3(e[0], e[1] - 0.09, e[2]).addScaledVector(f, 0.55).addScaledVector(right, 0.11 * side);
  }
  maxSpeed() {
    const w = this.w();
    if (!w) return 6;
    if (this.scope && w.scope) return w.scope.speed;
    return w.speed;
  }

  // ------------------------------------------------------------ ciclo principal
  update(dt, input, controls) {
    const g = this.g;
    const t = this.now();
    const set = g.settings;
    // ---- olhar
    if (controls) {
      const zf = this.scopeFov() ? (this.scopeFov() / set.fov) * set.zoomSensitivity : 1;
      const k = set.sensitivity * 0.022 * DEG * zf;
      this.yaw -= input.dx * k;
      this.pitch -= input.dy * k * (set.invertY ? -1 : 1);
      this.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.pitch));
      if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    }
    if (!this.alive) { this.deathT += dt; return; }

    // ---- movimento (sub-passos fixos)
    const fwd = controls ? (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0) : 0;
    const side = controls ? (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0) : 0;
    if (controls && (input.pressed('jump') || (set.wheelJump && input.wheel !== 0) || (set.autoBhop && input.held('jump')))) this.jumpQueued = true;
    const crouch = controls && input.held('crouch');
    const walk = controls && input.held('walk');
    let rem = Math.min(dt, 0.1);
    const maxSpeed = this.maxSpeed();
    let landed = 0;
    while (rem > 1e-6) {
      const step = Math.min(rem, 1 / 120);
      stepMove(this.ms, { fwd, side, yaw: this.yaw, jump: this.jumpQueued, crouch, walk }, step, g.map.solid, maxSpeed);
      if (this.ms.justJumped) { this.jumpQueued = false; }
      if (this.ms.justLanded) landed = Math.max(landed, this.ms.landSpeed);
      rem -= step;
    }
    this.jumpQueued = false;
    if (landed > 3) { g.audio.land(null, true, landed); g.viewmodel.landed(landed); }
    // passos
    const sp = horizSpeed(this.ms);
    if (this.ms.onGround && sp > maxSpeed * 0.58 && !walk && !this.ms.ducked) {
      this.stepAcc += sp * dt;
      if (this.stepAcc > 1.7) { this.stepAcc = 0; g.audio.footstep(null, true); }
    }

    // ---- armas
    const w = this.w();
    if (controls) {
      if (input.pressed('primary')) this.switchTo(this.primary);
      if (input.pressed('secondary')) this.switchTo(this.secondary);
      if (input.pressed('knife')) this.switchTo('knife');
      for (const k of NADES) if (input.pressed(k)) this.switchTo(k);
      if (input.pressed('lastWeapon')) this.switchTo(this.prevWeapon) || this.switchTo(this.secondary);
      if (!set.wheelJump && input.wheel !== 0) this.cycleWeapon(input.wheel);
      if (input.pressed('reload')) this.startReload();
      if (input.pressed('inspect')) g.viewmodel.inspect();
    }
    this.updateReload(t);
    if (this.autoReloadAt && t >= this.autoReloadAt) { this.autoReloadAt = 0; if (this.inv[this.weapon] && this.inv[this.weapon].mag === 0) this.startReload(); }
    if (this.resumeZoom && t >= this.resumeZoom.at) {
      if (WEAPONS[this.weapon].scope && !this.reloading && this.inv[this.weapon] && this.inv[this.weapon].mag > 0) this.setScope(this.resumeZoom.level, true);
      this.resumeZoom = null;
    }
    // recuperação
    if (w && w.acc) this.penalty *= Math.exp(-dt * 3 / w.acc.recovery);
    if (w && w.recoil && t - this.lastShotAt > Math.max(0.08, cycleTime(w) * 1.15)) {
      const k = Math.exp(-dt * w.recoil.recovery);
      this.recoil[0] *= k; this.recoil[1] *= k;
      if (Math.abs(this.recoil[0]) < 0.15 && Math.abs(this.recoil[1]) < 0.15) this.shotIndex = 0;
    }
    if (!input.fire()) { this.triggerLock = false; this.dryLock = false; }
    const matchOver = g.match && g.match.phase === 'ended';
    if (controls && w && !matchOver) {
      if (w.type === 'melee') {
        if (input.fire()) this.knife(0, t);
        else if (input.mouseButtons & 4) this.knife(1, t);
      } else if (this.weapon === 'mine') {
        if (input.firePressed()) this.placeMine(t);
      } else if (w.type === 'grenade') {
        // botão esquerdo: segure para carregar, solte para lançar; direito: lançamento curto por baixo
        if (this.cooking) {
          const st = this.cookState(t);
          if (!(this.nades[this.cooking.kind] > 0) || (st.fuseLeft !== null && st.fuseLeft <= 0)) { this.cooking = null; g.viewmodel.holdNade(false); this.afterThrowAt = t + 0.3; }
          else if (!input.fire()) this.releaseCook(t);
        } else if (input.firePressed()) this.startCook(t);
        else if (input.altPressed()) this.startThrow(false, t);
      } else {
        if (input.altPressed() && w.scope && t >= this.deployUntil && !this.reloading) {
          const next = (this.scope + 1) % (w.scope.levels.length + 1);
          this.setScope(next);
          this.resumeZoom = null;
        }
        if (input.fire() && !this.triggerLock && t >= this.nextFire && t >= this.deployUntil) {
          const slot = this.inv[this.weapon];
          if (this.reloading && w.shellReload && slot.mag > 0) { this.reloading = null; g.viewmodel.stopReload(); }
          if (!this.reloading) {
            if (slot.mag > 0) this.fireShot(t);
            else if (!this.dryLock) {
              g.audio.dryFire(); this.dryLock = true; this.triggerLock = true;
              if (slot.res > 0 || g.settings_match().infiniteAmmo) this.startReload();
            }
          }
        }
      }
    }
    if (this.cooking && !(controls && w && w.type === 'grenade')) this.releaseCook(t);
    if (this.throwing && t >= this.throwing.at) this.doThrow();
    if (this.afterThrowAt && t >= this.afterThrowAt) {
      this.afterThrowAt = 0;
      if (!this.hasWeapon(this.weapon)) {
        const back = this.prevWeapon && WEAPONS[this.prevWeapon] && WEAPONS[this.prevWeapon].type !== 'grenade' && this.hasWeapon(this.prevWeapon) ? this.prevWeapon : this.primary;
        this.switchTo(back) || this.switchTo(this.secondary) || this.switchTo('knife');
      } else this.g.viewmodel.setWeapon(this.weapon, 0.35);
    }
    // imprecisão atual (mira dinâmica)
    if (w && w.acc) {
      this.curInacc = inaccuracy(w, { speed: sp, onGround: this.ms.onGround, crouch: this.ms.ducked, scoped: this.scope > 0, penalty: this.penalty });
    } else this.curInacc = 0;

    this.punch *= Math.exp(-dt * 10);
    this.punchYaw *= Math.exp(-dt * 10);

    // ---- envia estado (até 60 Hz)
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / 60) {
      this.sendAcc = 0;
      let f = 0;
      if (this.ms.ducked) f |= FLAG.CROUCH;
      if (this.ms.onGround) f |= FLAG.GROUND;
      if (walk) f |= FLAG.WALK;
      if (this.scope) f |= FLAG.SCOPED;
      if (this.reloading) f |= FLAG.RELOAD;
      const r = (v) => Math.round(v * 1000) / 1000;
      g.net.send({ t: 'u', s: this.lifeId, p: this.ms.pos.map(r), v: this.ms.vel.map((v) => Math.round(v * 100) / 100), y: r(this.yaw), pi: r(this.pitch), f });
    }
  }

  cycleWeapon(dir) {
    const order = [this.primary, this.secondary, 'knife', ...NADES].filter((id, i, a) => this.hasWeapon(id) && a.indexOf(id) === i);
    let i = order.indexOf(this.weapon);
    if (i < 0) i = 0;
    const next = order[(i + (dir > 0 ? 1 : -1) + order.length) % order.length];
    this.switchTo(next);
  }

  // câmera: posição e orientação (com recuo visual, tranco e tremor)
  applyCamera(camera, dt) {
    const set = this.g.settings;
    let px, py, pz, yaw = this.yaw, pitch = this.pitch;
    if (this.alive) {
      px = this.ms.pos[0]; pz = this.ms.pos[2];
      const target = this.ms.pos[1] + this.ms.eyeOffset;
      if (this.ms.onGround && Math.abs(target - this.camY) < 0.6) this.camY += (target - this.camY) * Math.min(1, dt * 22);
      else this.camY = target;
      py = this.camY;
      pitch += (this.recoil[0] * VIEW_KICK + this.punch) * DEG;
      yaw -= (this.recoil[1] * VIEW_KICK + this.punchYaw) * DEG;
    } else if (this.deathPos) {
      const k = Math.min(1, this.deathT / 1.2);
      px = this.deathPos.x; pz = this.deathPos.z;
      py = this.deathPos.y + k * 1.6;
      const killer = this.g.remotes.get(this.killerId);
      if (killer && killer.visiblePos && this.killerId !== this.g.myId) {
        const kp = killer.visiblePos;
        const dx = kp.x - px, dz = kp.z - pz, dy = kp.y + 1.2 - py;
        const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
        let dyaw = ty - this.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        this.yaw += dyaw * Math.min(1, dt * 3);
        this.pitch += (tp - this.pitch) * Math.min(1, dt * 3);
        yaw = this.yaw; pitch = this.pitch;
      } else pitch = this.pitch - k * 0.35;
    } else return false;
    const sh = this.g.effects.shake;
    if (sh > 0.001) { pitch += (Math.random() - 0.5) * sh * 0.05; yaw += (Math.random() - 0.5) * sh * 0.05; }
    camera.position.set(px, py, pz);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
    const zoom = this.scopeFov();
    const targetFov = zoom || set.fov;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * (zoom ? 30 : 20));
    if (Math.abs(camera.fov - targetFov) < 0.05) camera.fov = targetFov;
    camera.updateProjectionMatrix();
    return true;
  }
}
