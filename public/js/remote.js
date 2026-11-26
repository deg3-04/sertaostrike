// Outros jogadores: interpolação dos snapshots, animação, passos e efeitos.
import * as THREE from '/lib/three.js';
import { Character } from './models.js';
import { WEAPON_LIST, WEAPONS } from '/shared/weapons.js';
import { FLAG, PLAYER } from '/shared/constants.js';
import { raycastWorld } from '/shared/physics.js';

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RemotePlayer {
  constructor(game, info) {
    this.g = game;
    this.id = info.id;
    this.name = info.name;
    this.bot = info.bot;
    this.model = new Character(info.char || 'sombra');
    this.model.setWeapon(info.primary || 'ak47');
    this.model.root.visible = false;
    game.scene.add(this.model.root);
    this.snaps = [];
    this.alive = false;
    this.visiblePos = null;
    this.state = null;
    this.stepAcc = 0;
    this.wasGround = true;
    this.lastVy = 0;
    this.radarAt = -99;
    this.lastSnapAt = 0;
    this.corpseUntil = 0;
    if (info.alive) { this.alive = true; this.spawnedLife = true; this.lastSnapAt = performance.now(); }
  }

  setInfo(info) {
    if (info.name) this.name = info.name;
    if (info.char) this.model.setChar(info.char);
  }

  // Identificação: kind = 'ally' (marcador da cor da equipe, visível através
  // das paredes, como no CS), 'enemy' (marcador vermelho só quando ele está
  // à vista) ou null. opts: { rim, bands, bandColor }
  setIdent(kind, color, opts = {}) {
    this.identKind = kind;
    this.model.setTeamLook(kind ? (opts.bandColor || color) : null, 0, !!opts.bands);
    if (kind && opts.rim) {
      const c = new THREE.Color(color);
      this.model.rimU.uRim.value.set(c.r, c.g, c.b, opts.rim);
    }
    if (!kind) { if (this.marker) this.marker.visible = false; return; }
    if (!this.marker) {
      const geo = new THREE.OctahedronGeometry(0.11, 0);
      geo.scale(1, 1.5, 1);
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 });
      this.marker = new THREE.Mesh(geo, mat);
      this.marker.renderOrder = 10;
      this.marker.position.y = 2.15;
      this.model.root.add(this.marker);
      const eg = new THREE.ConeGeometry(0.09, 0.16, 3);
      eg.rotateX(Math.PI);
      this.enemyMarker = new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9 }));
      this.enemyMarker.position.y = 2.12;
      this.model.root.add(this.enemyMarker);
    }
    const ally = kind === 'ally';
    this.marker.material.color.set(color);
    this.marker.visible = ally && this.alive;
    this.enemyMarker.visible = false;
  }
  // compatibilidade: marcador simples de aliado
  setTeamMarker(color) { this.setIdent(color ? 'ally' : null, color); }

  push(t, a) {
    // a = [id, x, y, z, yaw, pitch, flags, weaponIdx, vx, vy, vz]
    const s = { t, x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], f: a[6], w: a[7], vx: a[8], vy: a[9], vz: a[10] };
    const last = this.snaps[this.snaps.length - 1];
    if (last && t <= last.t) return;
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
    this.lastSnapAt = performance.now();
    if (!this.alive && this.spawnedLife) { this.alive = true; }
  }

  spawn(p, yaw) {
    this.snaps = [];
    this.alive = true;
    this.spawnedLife = true;
    this.model.revive();
    this.model.root.position.set(p[0], p[1], p[2]);
    this.model.root.rotation.y = yaw;
    this.model.root.visible = true;
    this.visiblePos = new THREE.Vector3(p[0], p[1], p[2]);
    this.state = { x: p[0], y: p[1], z: p[2], yaw, pitch: 0, f: FLAG.GROUND, w: 0, vx: 0, vy: 0, vz: 0 };
  }

  // opts: { hs, w } — o impulso vem da direção do atirador
  die(fromPos, opts = {}) {
    this.alive = false;
    if (this.marker) this.marker.visible = false;
    if (this.enemyMarker) this.enemyMarker.visible = false;
    this.spawnedLife = false;
    let dir = 1, side = (Math.random() - 0.5) * 0.6;
    this.slide = null;
    if (fromPos && this.visiblePos) {
      const yaw = this.model.root.rotation.y;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let dx = this.visiblePos.x - fromPos[0], dz = this.visiblePos.z - fromPos[2];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const along = fx * dx + fz * dz;
      dir = along >= 0 ? -1 : 1;          // empurrado para trás se levou o tiro de frente
      side = rx * dx + rz * dz;
      const w = WEAPONS[opts.w];
      const power = w ? (w.type === 'sniper' ? 2.2 : w.type === 'shotgun' ? 2.4 : w.type === 'grenade' ? 3 : 1.2) : 1;
      const sp = Math.min(3.2, (opts.hs ? 1.4 : 0.9) * power);
      this.slide = { vx: dx * sp, vz: dz * sp };
    }
    const w = WEAPONS[opts.w];
    const strength = w ? (w.type === 'sniper' || w.type === 'shotgun' ? 1.8 : w.type === 'grenade' ? 2.2 : 1) : 1;
    this.model.die({ dir, side, hs: !!opts.hs, strength });
    this.corpseUntil = performance.now() + 9000;
  }

  // corpo escorrega um pouco com o impulso, parando em paredes
  updateCorpse(dt) {
    const sl = this.slide;
    if (!sl) return;
    const sp = Math.hypot(sl.vx, sl.vz);
    if (sp < 0.05) { this.slide = null; return; }
    const root = this.model.root;
    const o = [root.position.x, root.position.y + 0.5, root.position.z];
    const step = sp * dt;
    const hit = raycastWorld(o, [sl.vx / sp, 0, sl.vz / sp], step + 0.45, this.g.map.solid);
    if (hit) { this.slide = null; return; }
    root.position.x += sl.vx * dt; root.position.z += sl.vz * dt;
    const k = Math.exp(-dt * 5);
    sl.vx *= k; sl.vz *= k;
  }

  sample(rt) {
    const s = this.snaps;
    if (!s.length) return this.state;
    while (s.length > 2 && s[1].t < rt - 0.25) s.shift();
    if (rt <= s[0].t) return s[0];
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1];
      if (rt >= a.t && rt <= b.t) {
        const k = (rt - a.t) / Math.max(1e-6, b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k,
          yaw: lerpAngle(a.yaw, b.yaw, k), pitch: a.pitch + (b.pitch - a.pitch) * k,
          f: k < 0.5 ? a.f : b.f, w: b.w, vx: a.vx + (b.vx - a.vx) * k, vy: a.vy + (b.vy - a.vy) * k, vz: a.vz + (b.vz - a.vz) * k,
        };
      }
    }
    // extrapola um pouco (até 100 ms)
    const l = s[s.length - 1];
    const dt = Math.min(0.1, rt - l.t);
    return { ...l, x: l.x + l.vx * dt, z: l.z + l.vz * dt, y: l.y + (l.f & FLAG.GROUND ? 0 : l.vy * dt) };
  }

  update(dt, rt, t) {
    const m = this.model;
    if (!this.alive) {
      if (m.deadT >= 0) { m.animate({ dt }); this.updateCorpse(dt); }
      if (performance.now() > this.corpseUntil) m.root.visible = false;
      return;
    }
    const st = this.sample(rt);
    if (!st) { m.root.visible = false; return; }
    this.state = st;
    const stale = performance.now() - this.lastSnapAt > 2000;
    m.root.visible = !stale;
    m.root.position.set(st.x, st.y, st.z);
    m.root.rotation.y = st.yaw;
    if (!this.visiblePos) this.visiblePos = new THREE.Vector3();
    this.visiblePos.set(st.x, st.y, st.z);
    const wid = WEAPON_LIST[st.w] || 'knife';
    m.setWeapon(wid);
    const speed = Math.hypot(st.vx, st.vz);
    const fwdX = -Math.sin(st.yaw), fwdZ = -Math.cos(st.yaw);
    const fwdSpeed = st.vx * fwdX + st.vz * fwdZ;
    const sideSpeed = st.vx * fwdZ - st.vz * fwdX;
    const onGround = !!(st.f & FLAG.GROUND);
    const crouch = !!(st.f & FLAG.CROUCH);
    m.animate({ speed, crouch, pitch: st.pitch, onGround, dt, fwdSpeed, sideSpeed, vy: st.vy, reload: !!(st.f & FLAG.RELOAD) });
    m.setProtected(!!(st.f & FLAG.PROTECTED), t);
    // marcador de inimigo: só enquanto ele está à vista (sem "wallhack")
    if (this.enemyMarker) this.enemyMarker.visible = this.identKind === 'enemy' && performance.now() / 1000 - (this.seenAt || -9) < 0.45;
    if (this.marker && this.identKind === 'ally') this.marker.visible = true;
    if (this.g.world && this.g.world.lightAt) {
      const L = this.g.world.lightAt(st.x, st.y + 1, st.z, this.lightTmp || (this.lightTmp = { sky: 1, lamp: [0, 0, 0] }));
      m.setLight(L.sky, L.lamp, dt);
    }
    // passos (correndo, não andando devagar nem agachado)
    const w = WEAPONS[wid];
    if (onGround && !crouch && !(st.f & FLAG.WALK) && speed > (w ? w.speed : 6) * 0.58) {
      this.stepAcc += speed * dt;
      if (this.stepAcc > 1.7) { this.stepAcc = 0; this.g.audio.footstep([st.x, st.y + 0.1, st.z], false); }
    }
    if (onGround && !this.wasGround && this.lastVy < -4) this.g.audio.land([st.x, st.y, st.z], false, -this.lastVy);
    this.wasGround = onGround;
    this.lastVy = st.vy;
  }

  muzzle(out) { return this.model.muzzleWorld(out); }
  remove() { this.g.scene.remove(this.model.root); this.model.dispose(); }
}
