// Arma em primeira pessoa: braços, balanço, recuo, recarga, saque,
// inspeção, faca, granadas, fogo na boca do cano e cápsulas ejetadas.
import * as THREE from '/lib/three.js';
import { WEAPONS, cycleTime } from '/shared/weapons.js';
import { buildWeaponFP, CHAR_STYLE, weaponMaterials } from './models.js';
import { getTextures } from './textures.js';

const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => ease((t - a) / (b - a));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const KICK = { rifle: [0.03, 0.045], smg: [0.018, 0.03], pistol: [0.04, 0.09], sniper: [0.09, 0.12], shotgun: [0.08, 0.12], magnum: [0.07, 0.16] };
const POSE = {
  rifle: V(0.225, -0.25, -0.62), smg: V(0.215, -0.24, -0.56), sniper: V(0.25, -0.265, -0.76), shotgun: V(0.225, -0.25, -0.6),
  pistol: V(0.17, -0.215, -0.5), melee: V(0.22, -0.235, -0.46), grenade: V(0.2, -0.215, -0.44),
};

export class ViewModel {
  constructor(settings) {
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.viewmodelFov, 1, 0.01, 20);
    this.scene.add(this.camera);
    this.root = new THREE.Group();     // segue o yaw/pitch da câmera
    this.camera.add(this.root);
    this.holder = new THREE.Group();   // pose da arma
    this.root.add(this.holder);
    this.anim = new THREE.Group();     // animações
    this.holder.add(this.anim);
    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x8a6a48, 1.5);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.cache = {};
    this.cur = null;
    this.weaponId = null;
    this.charId = 'sombra';
    this.armMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    this.st = { t: 0, bob: 0, swayX: 0, swayY: 0, swayTX: 0, swayTY: 0, kick: 0, kickR: 0, land: 0, draw: 1, drawDur: 0.5, reload: -1, reloadDur: 2, inspect: -1, knife: -1, knifeMode: 0, throwT: -1, bolt: -1, boltDur: 1, shell: -1, slide: 0 };
    this.scoped = false;
    // fogo na boca do cano
    const tex = getTextures();
    const fm = new THREE.MeshBasicMaterial({ map: tex.muzzle, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd9a0 });
    this.flash = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.09), fm); p2.rotation.y = Math.PI / 2; p2.position.z = -0.08;
    const p3 = p2.clone(); p3.rotation.z = Math.PI / 2;
    this.flash.add(p1, p2, p3);
    this.flash.visible = false;
    this.flashT = 0;
    // cápsulas
    this.shells = [];
    const sg = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6); sg.rotateZ(Math.PI / 2);
    const smat = weaponMaterials().brass;
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(sg, smat); m.visible = false;
      this.root.add(m);
      this.shells.push({ m, v: V(0, 0, 0), life: 0, spin: V(0, 0, 0) });
    }
    this.shellIdx = 0;
    this.setCharacter('sombra');
  }

  setCharacter(id) {
    this.charId = id;
    const st = CHAR_STYLE[id] || CHAR_STYLE.sombra;
    this.armMat.color.setHex(st.top).lerp(new THREE.Color(0x6a6a6a), 0.18);
    this.gloveMat.color.setHex(st.gloves);
  }

  buildArms(fp) {
    const info = fp.info;
    const group = new THREE.Group();
    const mk = (hand, elbowOff, isLeft) => {
      const g = new THREE.Group();
      const H = hand.clone();
      const E = H.clone().add(elbowOff);
      const S = E.clone().add(V(isLeft ? -0.05 : 0.08, -0.2, 0.3));
      const cylBetween = (A, B, r1, r2, mat) => {
        const d = B.clone().sub(A); const len = d.length();
        const geo = new THREE.CylinderGeometry(r2, r1, len, 10);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(A).add(B).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
        return m;
      };
      g.add(cylBetween(E, H.clone().add(V(0, -0.012, 0.045)), 0.036, 0.03, this.armMat));
      g.add(cylBetween(S, E, 0.044, 0.038, this.armMat));
      const cuff = cylBetween(H.clone().add(V(0, -0.012, 0.075)), H.clone().add(V(0, -0.01, 0.04)), 0.033, 0.031, this.gloveMat);
      g.add(cuff);
      const handM = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.055, 0.075), this.gloveMat);
      handM.position.copy(H).add(V(0, -0.01, 0.012));
      g.add(handM);
      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.04), this.gloveMat);
      fingers.position.copy(H).add(V(isLeft ? 0.016 : -0.016, 0.014, -0.022));
      g.add(fingers);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.04), this.gloveMat);
      thumb.position.copy(H).add(V(isLeft ? -0.024 : 0.024, 0.02, -0.01));
      g.add(thumb);
      return g;
    };
    const right = mk(info.gripR, V(0.05, -0.12, 0.25), false);
    group.add(right);
    let left = null;
    if (info.gripL) {
      left = mk(info.gripL, V(-0.11, -0.1, 0.22), true);
      group.add(left);
    } else if (info.kind === 'pistol') {
      left = mk(info.gripR.clone().add(V(-0.03, -0.01, 0.01)), V(-0.12, -0.1, 0.22), true);
      group.add(left);
    }
    return { group, left, right };
  }

  getFP(id) {
    if (this.cache[id]) return this.cache[id];
    const fp = buildWeaponFP(id);
    const arms = this.buildArms(fp);
    fp.root.add(arms.group);
    fp.arms = arms;
    fp.magBase = fp.mag.position.clone();
    fp.boltBase = fp.bolt.position.clone();
    this.cache[id] = fp;
    return fp;
  }

  setWeapon(id, drawTime) {
    const w = WEAPONS[id];
    if (this.cur) this.anim.remove(this.cur.root);
    const fp = this.getFP(id);
    this.cur = fp;
    this.weaponId = id;
    this.anim.add(fp.root);
    fp.root.visible = true;
    fp.mag.visible = true;
    fp.mag.position.copy(fp.magBase); fp.mag.rotation.set(0, 0, 0);
    fp.bolt.position.copy(fp.boltBase); fp.bolt.rotation.set(0, 0, 0);
    if (fp.arms.left) fp.arms.left.position.set(0, 0, 0);
    if (this.flash.parent) this.flash.parent.remove(this.flash);
    fp.muzzle.add(this.flash);
    const kind = w.type === 'melee' ? 'melee' : w.type;
    this.kind = kind;
    this.pose = POSE[kind] || POSE.rifle;
    const s = this.st;
    s.draw = 0; s.drawDur = Math.max(0.2, drawTime || w.deploy || 0.5);
    s.reload = -1; s.inspect = -1; s.knife = -1; s.throwT = -1; s.bolt = -1; s.pump = -1;
  }

  fire(w) {
    const s = this.st;
    const k = KICK[w.snd && w.snd.kind === 'magnum' ? 'magnum' : w.type] || KICK.rifle;
    s.kick = Math.min(1.6, s.kick + 1);
    this.kickAmt = k;
    s.inspect = -1;
    if (!(w.snd && w.snd.suppressed)) {
      this.flash.visible = true;
      this.flashT = 0.045;
      this.flash.rotation.z = Math.random() * Math.PI;
      const sc = (w.type === 'sniper' || w.type === 'shotgun' ? 1.5 : w.type === 'pistol' ? 0.8 : 1.0) * (0.8 + Math.random() * 0.4);
      this.flash.scale.setScalar(sc);
    }
    if (w.type === 'pistol') s.slide = 1;
    if (w.type === 'sniper') { s.bolt = 0; s.boltDur = cycleTime(w) * 0.85; }
    if (w.pump) { s.pump = 0; s.pumpDur = Math.min(0.6, cycleTime(w) * 0.7); this.pumpShell = false; }
    else if (w.noEject) { /* revólver: estojos ficam no tambor */ }
    else if (w.type !== 'shotgun' && w.type !== 'sniper') this.ejectShell();
    else if (w.type === 'shotgun') setTimeout(() => this.ejectShell(true), 120);
  }

  ejectShell(big) {
    if (!this.cur) return;
    const sh = this.shells[this.shellIdx++ % this.shells.length];
    const p = this.cur.eject.getWorldPosition(V(0, 0, 0));
    this.root.worldToLocal(p);
    sh.m.position.copy(p);
    sh.m.visible = true;
    sh.m.scale.setScalar(big ? 1.6 : 1);
    sh.v.set(0.9 + Math.random() * 0.6, 1.1 + Math.random() * 0.6, 0.2 + Math.random() * 0.3);
    if (this.settings.leftHanded) sh.v.x *= -1;
    sh.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    sh.life = 0.55;
  }

  reload(dur, shell) {
    const s = this.st;
    s.reload = 0; s.reloadDur = dur; this.shellReload = !!shell;
    s.inspect = -1;
  }
  stopReload() { this.st.reload = -1; if (this.cur) { this.cur.mag.visible = true; this.cur.mag.position.copy(this.cur.magBase); } }
  inspect() { if (this.st.reload < 0 && this.st.draw >= 1) this.st.inspect = 0; }
  knife(mode) { this.st.knife = 0; this.st.knifeMode = mode; this.st.inspect = -1; }
  throwNade() { this.st.throwT = 0; }
  setScoped(on) { this.scoped = on; }
  landed(speed) { this.st.land = Math.min(0.07, speed * 0.006); }

  update(dt, info) {
    // info: { speed, maxSpeed, onGround, crouch, mouseDX, mouseDY, aimQuat, sunDir, fov }
    const s = this.st;
    s.t += dt;
    const set = this.settings;
    this.camera.fov = set.viewmodelFov;
    this.camera.updateProjectionMatrix();
    this.camera.quaternion.copy(info.aimQuat);
    if (info.sunDir) { this.sun.position.copy(info.sunDir).multiplyScalar(10); }
    // luz do ambiente onde o jogador está (dentro de salas a arma fica mais escura; lâmpadas iluminam)
    if (info.light) {
      const k = Math.min(1, dt * 5), L = info.light;
      this.skyL = (this.skyL ?? 1) + (L.sky - (this.skyL ?? 1)) * k;
      const sm = Math.min(1, Math.max(0, (this.skyL - 0.05) / 0.55));
      this.hemi.intensity = 1.5 * (0.15 + 0.85 * this.skyL);
      this.sun.intensity = 2.4 * (0.2 + 0.8 * sm * sm * (3 - 2 * sm));
      if (this.scene.environment) this.scene.environmentIntensity = 0.2 + 0.8 * this.skyL;
      if (!this.lampLight) { this.lampLight = new THREE.PointLight(0xffd9a0, 0, 6, 1.5); this.lampLight.position.set(0.3, 1.2, 0.4); this.scene.add(this.lampLight); }
      const li = (L.lamp[0] + L.lamp[1] + L.lamp[2]) / 3;
      this.lampI = (this.lampI || 0) + (li * 6 - (this.lampI || 0)) * k;
      this.lampLight.intensity = this.lampI;
    }
    this.holder.visible = !this.scoped && !!this.cur;
    if (!this.cur) return;
    const pose = this.pose;
    this.holder.position.set(pose.x + set.vmX * 0.01, pose.y + set.vmY * 0.01, pose.z + set.vmZ * 0.01);
    this.holder.scale.x = set.leftHanded ? -1 : 1;
    this.holder.rotation.set(0, set.leftHanded ? -0.02 : 0.02, 0);

    // balanço do mouse
    s.swayTX = THREE.MathUtils.clamp(s.swayTX - (info.mouseDX || 0) * 0.0006, -0.07, 0.07);
    s.swayTY = THREE.MathUtils.clamp(s.swayTY - (info.mouseDY || 0) * 0.0006, -0.06, 0.06);
    s.swayTX *= Math.exp(-dt * 10); s.swayTY *= Math.exp(-dt * 10);
    s.swayX += (s.swayTX - s.swayX) * Math.min(1, dt * 14);
    s.swayY += (s.swayTY - s.swayY) * Math.min(1, dt * 14);
    // passo
    const moveA = info.onGround ? Math.min(1, info.speed / Math.max(1, info.maxSpeed)) : 0;
    s.bob += dt * (4 + info.speed * 1.45);
    const bobK = set.viewBob ? 1 : 0.25;
    s.kick *= Math.exp(-dt * 16);
    s.land *= Math.exp(-dt * 9);
    s.slide *= Math.exp(-dt * 30);

    const A = this.anim;
    let px = Math.sin(s.bob) * 0.011 * moveA * bobK, py = -Math.abs(Math.cos(s.bob)) * 0.012 * moveA * bobK;
    let pz = 0, rx = 0, ry = 0, rz = Math.sin(s.bob) * 0.012 * moveA * bobK;
    py += Math.sin(s.t * 1.4) * 0.0016; rx += Math.sin(s.t * 1.1) * 0.003;
    px += s.swayX * 0.4; py += s.swayY * 0.4;
    ry += s.swayX * 1.2; rx += s.swayY * 1.0;
    if (!info.onGround) { py -= 0.012; rx += 0.03; }
    py -= s.land;
    if (info.crouch) { py += 0.008; px -= 0.006; }
    // recuo
    const k = this.kickAmt || KICK.rifle;
    pz += s.kick * k[0];
    rx += s.kick * k[1];
    py += s.kick * k[0] * 0.15;
    // saque
    if (s.draw < 1) {
      s.draw = Math.min(1, s.draw + dt / s.drawDur);
      const e = 1 - easeOut(s.draw);
      py -= e * 0.28; rx -= e * 0.9; rz += e * 0.4;
    }
    const fp = this.cur;
    // recarga
    if (s.reload >= 0) {
      s.reload += dt / s.reloadDur;
      const t = Math.min(1, s.reload);
      if (this.shellReload) {
        const tilt = seg(t, 0, 0.08) * (1 - seg(t, 0.92, 1));
        rz += tilt * 0.4; rx += tilt * 0.15; py -= tilt * 0.02;
        const cyc = (s.t * 2.4) % 1;
        if (fp.arms.left) fp.arms.left.position.set(0.0, -0.03 * Math.sin(cyc * Math.PI) * tilt, 0.18 * tilt);
        if (s.reload >= 1) s.reload = 0; // repete até ser interrompida
      } else {
        const tilt = seg(t, 0, 0.14) * (1 - seg(t, 0.86, 1));
        rz += tilt * 0.38; rx += tilt * 0.12; py -= tilt * 0.025; px -= tilt * 0.01;
        // pente sai e volta
        const out = seg(t, 0.14, 0.32), back = seg(t, 0.5, 0.68);
        fp.mag.visible = t < 0.36 || t > 0.46;
        const drop = t < 0.42 ? out : 1 - back;
        fp.mag.position.set(fp.magBase.x, fp.magBase.y - drop * 0.28, fp.magBase.z + drop * 0.05);
        fp.mag.rotation.x = drop * 0.4;
        if (fp.arms.left) {
          const handDown = seg(t, 0.12, 0.3) * (1 - seg(t, 0.62, 0.78));
          const magPos = fp.magBase.clone().sub(fp.info.gripL || fp.info.gripR);
          fp.arms.left.position.copy(magPos.multiplyScalar(handDown));
          fp.arms.left.position.y -= Math.sin(Math.min(1, Math.max(0, (t - 0.3) / 0.25)) * Math.PI) * 0.18;
        }
        // ferrolho / slide
        const bolt = seg(t, 0.74, 0.8) * (1 - seg(t, 0.82, 0.88));
        fp.bolt.position.set(fp.boltBase.x, fp.boltBase.y, fp.boltBase.z + bolt * 0.05);
        if (s.reload >= 1) { s.reload = -1; fp.mag.visible = true; fp.mag.position.copy(fp.magBase); fp.mag.rotation.x = 0; if (fp.arms.left) fp.arms.left.position.set(0, 0, 0); }
      }
    }
    // ferrolho de rifle de precisão
    if (s.bolt >= 0) {
      s.bolt += dt / s.boltDur;
      const t = s.bolt;
      const up = seg(t, 0.15, 0.3) * (1 - seg(t, 0.7, 0.85));
      const backz = seg(t, 0.3, 0.45) * (1 - seg(t, 0.55, 0.7));
      fp.bolt.rotation.z = up * 1.1;
      fp.bolt.position.z = fp.boltBase.z + backz * 0.08;
      rz += up * 0.12; py -= up * 0.012;
      if (backz > 0.9 && !this.boltShell) { this.boltShell = true; this.ejectShell(true); }
      if (t >= 1) { s.bolt = -1; this.boltShell = false; fp.bolt.rotation.z = 0; fp.bolt.position.copy(fp.boltBase); }
    }
    // telha da escopeta de bombeamento (a mão esquerda acompanha)
    if (s.pump >= 0) {
      s.pump += dt / s.pumpDur;
      const t = s.pump;
      const back = seg(t, 0.2, 0.5) * (1 - seg(t, 0.55, 0.9));
      fp.bolt.position.z = fp.boltBase.z + back * 0.08;
      if (fp.arms.left && s.reload < 0) fp.arms.left.position.set(0, 0, back * 0.08);
      rx += back * 0.03;
      if (back > 0.9 && !this.pumpShell) { this.pumpShell = true; this.ejectShell(true); }
      if (t >= 1) { s.pump = -1; fp.bolt.position.copy(fp.boltBase); if (fp.arms.left && s.reload < 0) fp.arms.left.position.set(0, 0, 0); }
    }
    // slide da pistola
    if (this.kind === 'pistol' && s.reload < 0) fp.bolt.position.z = fp.boltBase.z + s.slide * 0.03;
    // inspeção
    if (s.inspect >= 0) {
      s.inspect += dt / 2.6;
      const t = s.inspect;
      const a = seg(t, 0.05, 0.25) * (1 - seg(t, 0.45, 0.6));
      const b = seg(t, 0.5, 0.65) * (1 - seg(t, 0.85, 1));
      ry += a * 0.9 - b * 0.5; rz += a * 0.45 + b * 0.9; px -= a * 0.06; py += a * 0.03 + b * 0.02; rx += b * 0.25;
      if (t >= 1) s.inspect = -1;
    }
    // faca
    if (s.knife >= 0) {
      const dur = s.knifeMode ? 0.62 : 0.38;
      s.knife += dt / dur;
      const t = s.knife;
      if (s.knifeMode === 0) {
        const a = seg(t, 0, 0.2), b = seg(t, 0.2, 0.55), c = seg(t, 0.6, 1);
        const sw = a * (1 - b);
        ry += sw * 0.6 - b * (1 - c) * 0.9; rz += -sw * 0.5 + b * (1 - c) * 0.7; px += sw * 0.08 - b * (1 - c) * 0.16;
        py += sw * 0.05 - b * (1 - c) * 0.03; rx += -b * (1 - c) * 0.3;
      } else {
        const a = seg(t, 0, 0.25), b = seg(t, 0.25, 0.45), c = seg(t, 0.55, 1);
        pz += a * (1 - b) * 0.08 - b * (1 - c) * 0.22; rx += -a * (1 - b) * 0.2 - b * (1 - c) * 0.35; px -= b * (1 - c) * 0.06;
      }
      if (t >= 1) s.knife = -1;
    }
    // granada
    if (s.throwT >= 0) {
      s.throwT += dt / 0.45;
      const t = s.throwT;
      const back = seg(t, 0, 0.35), fwd = seg(t, 0.35, 0.6);
      pz += back * (1 - fwd) * 0.1 - fwd * 0.25; py += back * (1 - fwd) * 0.06 - fwd * 0.08; rx += back * (1 - fwd) * 0.6 - fwd * 0.9;
      fp.root.visible = t < 0.55;
      if (t >= 1) { s.throwT = -1; }
    } else if (this.kind !== 'grenade' || s.draw > 0) fp.root.visible = true;

    A.position.set(px, py, pz);
    A.rotation.set(rx, ry, rz);

    // fogo
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    // cápsulas
    for (const sh of this.shells) {
      if (sh.life <= 0) continue;
      sh.life -= dt;
      sh.v.y -= 9 * dt;
      sh.m.position.addScaledVector(sh.v, dt);
      sh.m.rotation.x += sh.spin.x * dt; sh.m.rotation.y += sh.spin.y * dt;
      if (sh.life <= 0) sh.m.visible = false;
    }
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  isBusy() { return this.st.reload >= 0 || this.st.draw < 1; }
  hide(h) { this.root.visible = !h; }
}
