// Efeitos visuais: partículas, marcas de bala, rastros, explosões, fumaça,
// granadas em voo, sangue e luzes de disparo.
import * as THREE from '/lib/three.js';
import { getTextures } from './textures.js';
import { createGrenadeSim, stepGrenade } from '/shared/physics.js';
import { GRENADE } from '/shared/constants.js';
import { weaponGeometryTP } from './models.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

class Particles {
  constructor(max, tex, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.d = []; // dados por partícula
    for (let i = 0; i < max; i++) this.d.push({ alive: false, v: V(0, 0, 0), life: 0, max: 1, s0: 1, s1: 1, a0: 1, g: 0, drag: 0, c: [1, 1, 1] });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(V(0, 0, 0), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(512.0, size * scale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * t.rgb, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.cursor = 0;
  }
  emit(p, v, life, s0, s1, color, a0, g = 0, drag = 0) {
    let i = this.cursor;
    for (let k = 0; k < this.max; k++) {
      const j = (this.cursor + k) % this.max;
      if (!this.d[j].alive) { i = j; break; }
    }
    this.cursor = (i + 1) % this.max;
    const d = this.d[i];
    d.alive = true; d.v.copy(v); d.life = 0; d.max = life; d.s0 = s0; d.s1 = s1; d.a0 = a0; d.g = g; d.drag = drag; d.c = color;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const d = this.d[i];
      if (!d.alive) { this.alpha[i] = 0; continue; }
      d.life += dt;
      if (d.life >= d.max) { d.alive = false; this.alpha[i] = 0; continue; }
      const t = d.life / d.max;
      d.v.y -= d.g * dt;
      if (d.drag) d.v.multiplyScalar(Math.exp(-d.drag * dt));
      this.pos[i * 3] += d.v.x * dt; this.pos[i * 3 + 1] += d.v.y * dt; this.pos[i * 3 + 2] += d.v.z * dt;
      this.size[i] = d.s0 + (d.s1 - d.s0) * t;
      this.alpha[i] = d.a0 * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      this.col[i * 3] = d.c[0]; this.col[i * 3 + 1] = d.c[1]; this.col[i * 3 + 2] = d.c[2];
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

// cat = quadro do atlas de marcas (0 alvenaria, 1 madeira, 2 metal, 3 terra)
const MAT_FX = {
  plaster: { c: [0.92, 0.88, 0.8], chips: [0.85, 0.8, 0.72], cat: 0 }, stone: { c: [0.8, 0.72, 0.6], chips: [0.7, 0.62, 0.5], cat: 0 },
  wall: { c: [0.75, 0.7, 0.62], chips: [0.6, 0.55, 0.48], cat: 0 }, brick: { c: [0.72, 0.42, 0.32], chips: [0.6, 0.3, 0.2], cat: 0 },
  concrete: { c: [0.85, 0.84, 0.8], chips: [0.7, 0.7, 0.68], cat: 0 }, ground: { c: [0.82, 0.68, 0.48], chips: [0.6, 0.48, 0.3], cat: 3 },
  wood: { c: [0.62, 0.45, 0.28], chips: [0.5, 0.33, 0.18], cat: 1 }, crate: { c: [0.62, 0.45, 0.28], chips: [0.5, 0.33, 0.18], cat: 1 },
  door: { c: [0.6, 0.5, 0.4], chips: [0.45, 0.32, 0.2], cat: 1 }, metal: { spark: true, c: [0.7, 0.7, 0.7], cat: 2 }, barrel: { spark: true, c: [0.7, 0.7, 0.7], cat: 2 },
};
const HOLE_MAX = 200, SCUFF_MAX = 80;
const _m4 = new THREE.Matrix4(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3(), _col = new THREE.Color();

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality.particles ?? 1;
    const tex = getTextures();
    this.tex = tex;
    this.soft = new Particles(900, tex.soft, false);
    this.smokeP = new Particles(300, tex.smoke, false);
    this.add = new Particles(700, tex.spark, true);
    scene.add(this.soft.points, this.smokeP.points, this.add.points);
    // marcas de bala (instanciadas): um grupo por tipo de superfície, cada um
    // usando um quadro do atlas, e um grupo para os raspões (tiros oblíquos)
    const hm = new THREE.MeshBasicMaterial({ map: tex.holeAtlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.holeSets = [];
    for (let cat = 0; cat < 4; cat++) {
      const g = new THREE.PlaneGeometry(1, 1);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (cat + uv.getX(i)) / 4);
      const mesh = new THREE.InstancedMesh(g, hm, HOLE_MAX);
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, _col.setRGB(1, 1, 1));
      scene.add(mesh);
      this.holeSets.push({ mesh, idx: 0 });
    }
    const scm = new THREE.MeshBasicMaterial({ map: tex.scuff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.scuffs = { mesh: new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), scm, SCUFF_MAX), idx: 0 };
    this.scuffs.mesh.count = 0; this.scuffs.mesh.frustumCulled = false;
    this.scuffs.mesh.setColorAt(0, _col.setRGB(1, 1, 1));
    scene.add(this.scuffs.mesh);
    this.lightFn = null; // (x, y, z) => brilho 0..1 do lugar (marcas não ficam "acesas" no escuro)
    // minas terrestres plantadas
    this.mines = new Map();
    this.mineLedMat = new THREE.SpriteMaterial({ map: tex.spark, color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.mineLedMatF = new THREE.SpriteMaterial({ map: tex.spark, color: 0x3cff5a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const sm = new THREE.MeshBasicMaterial({ map: tex.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.scorches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), sm, 24);
    this.scorches.count = 0; this.scorchIdx = 0; this.scorches.frustumCulled = false;
    scene.add(this.scorches);
    // rastros
    const tg = new THREE.BoxGeometry(0.014, 0.014, 1); tg.translate(0, 0, -0.5);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = [];
    for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, a: V(0, 0, 0), b: V(0, 0, 0), t: 0, len: 0, dist: 0 }); }
    this.tracerIdx = 0;
    // flashes de boca de cano (sprites)
    const fm = new THREE.SpriteMaterial({ map: tex.muzzle, color: 0xffd28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashes = [];
    for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(fm); s.visible = false; scene.add(s); this.flashes.push({ s, t: 0 }); }
    this.flashIdx = 0;
    // luzes dinâmicas (sempre presentes para não recompilar shaders)
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 14, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 0.05, peak: 0 });
    }
    // fumaças e granadas
    this.smokes = [];
    this.nades = new Map();
    this.nadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
    this.bigFlashes = [];
    this.shake = 0;
    this.time = 0;
    this.onBounce = null;
  }

  flashLight(idx, pos, color, peak, dur, dist = 14) {
    const L = this.lights[idx];
    L.l.position.copy(pos); L.l.color.setHex(color); L.l.distance = dist;
    L.peak = peak; L.dur = dur; L.t = dur;
  }

  // ---------------------------------------------------------------- impactos
  // Marca de bala. Com a direção do tiro (dir), a marca fica alinhada à
  // trajetória: quanto mais de lado a bala chega, mais oval e "puxado" o
  // furo fica, e em ângulos rasos aparece também o sulco do raspão.
  addHole(p, n, size = 0.11, dir = null, mat = 'plaster') {
    const fx = MAT_FX[mat] || MAT_FX.plaster;
    const set = this.holeSets[fx.cat];
    const s = size * (fx.cat === 1 ? 0.9 : fx.cat === 2 ? 0.75 : 1) * (0.85 + Math.random() * 0.3);
    _vz.copy(n);
    let stretch = 1, cosI = 1;
    if (dir) {
      _vx.copy(dir).normalize();
      cosI = Math.abs(_vx.dot(n));
      _vx.addScaledVector(n, -_vx.dot(n)); // componente da trajetória ao longo da parede
    }
    if (dir && _vx.lengthSq() > 1e-4) {
      _vx.normalize();
      stretch = Math.min(2.8, 1 / Math.max(0.36, cosI));
    } else {
      // perpendicular (ou sem direção): rotação aleatória
      const a = Math.random() * Math.PI * 2;
      _vx.set(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0).cross(n).normalize();
      _vy.crossVectors(n, _vx);
      _vx.multiplyScalar(Math.cos(a)).addScaledVector(_vy, Math.sin(a)).normalize();
    }
    _vy.crossVectors(_vz, _vx);
    // tom: cor da superfície (poeira de tijolo é avermelhada etc.) e luz do lugar
    // a luz é medida um pouco à frente da parede (na superfície cairia dentro dela)
    const L = this.lightFn ? this.lightFn(p.x + n.x * 0.3, p.y + n.y * 0.3, p.z + n.z * 0.3) : 1;
    const tint = fx.cat === 2 ? [0.85, 0.86, 0.9] : fx.c;
    _col.setRGB(tint[0] * L, tint[1] * L, tint[2] * L);
    // o furo avança um pouco no sentido da bala quando esticado
    const pos = p.clone().addScaledVector(n, 0.004).addScaledVector(_vx, (stretch - 1) * s * 0.18);
    _m4.makeBasis(_vx.clone().multiplyScalar(s * stretch), _vy.clone().multiplyScalar(s * (0.9 + Math.random() * 0.15)), _vz);
    _m4.setPosition(pos);
    set.mesh.setMatrixAt(set.idx, _m4);
    set.mesh.setColorAt(set.idx, _col);
    set.idx = (set.idx + 1) % HOLE_MAX;
    set.mesh.count = Math.max(set.mesh.count, set.idx === 0 ? HOLE_MAX : set.idx);
    set.mesh.instanceMatrix.needsUpdate = true;
    if (set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
    // raspão: bala chegando a mais de ~57° da perpendicular
    if (dir && cosI < 0.55 && fx.cat !== 3) {
      const len = Math.min(0.26, s * (1.1 + (0.55 - cosI) * 4.5));
      const w = s * (fx.cat === 2 ? 0.7 : 1.0);
      const sc = this.scuffs;
      const c = p.clone().addScaledVector(n, 0.003).addScaledVector(_vx, len * 0.42);
      _m4.makeBasis(_vx.clone().multiplyScalar(len), _vy.clone().multiplyScalar(w), _vz);
      _m4.setPosition(c);
      sc.mesh.setMatrixAt(sc.idx, _m4);
      sc.mesh.setColorAt(sc.idx, fx.cat === 2 ? _col.setRGB(1.3 * L, 1.3 * L, 1.35 * L) : _col);
      sc.idx = (sc.idx + 1) % SCUFF_MAX;
      sc.mesh.count = Math.max(sc.mesh.count, sc.idx === 0 ? SCUFF_MAX : sc.idx);
      sc.mesh.instanceMatrix.needsUpdate = true;
      if (sc.mesh.instanceColor) sc.mesh.instanceColor.needsUpdate = true;
    }
  }

  impact(p, n, mat, dir = null) {
    const fx = MAT_FX[mat] || MAT_FX.plaster;
    const q = this.q;
    this.addHole(p, n, 0.15, dir, mat);
    const base = p.clone().addScaledVector(n, 0.03);
    // os fragmentos saem na direção do ricochete (reflexo da trajetória),
    // não só para fora da parede
    const out = n.clone();
    if (dir) {
      const d = dir.clone().normalize();
      const refl = d.clone().addScaledVector(n, -2 * d.dot(n));
      out.multiplyScalar(0.55).addScaledVector(refl, 0.45 + (1 - Math.abs(d.dot(n))) * 0.4).normalize();
    }
    if (fx.spark) {
      for (let i = 0; i < 10 * q; i++) {
        const v = out.clone().multiplyScalar(2 + Math.random() * 3).add(V((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
        this.add.emit(base, v, 0.18 + Math.random() * 0.25, 0.035, 0.01, [1, 0.8, 0.4], 1, 9, 1);
      }
      this.soft.emit(base, n.clone().multiplyScalar(0.4), 0.4, 0.15, 0.4, fx.c, 0.4);
      return;
    }
    for (let i = 0; i < 3 * q + 1; i++) {
      const v = n.clone().multiplyScalar(0.6 + Math.random() * 0.9).add(V((Math.random() - 0.5) * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 0.5));
      this.soft.emit(base, v, 0.5 + Math.random() * 0.5, 0.12, 0.55 + Math.random() * 0.3, fx.c, 0.55, -0.3, 2.5);
    }
    for (let i = 0; i < 6 * q; i++) {
      const v = out.clone().multiplyScalar(1.5 + Math.random() * 2.5).add(V((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      this.soft.emit(base, v, 0.35 + Math.random() * 0.3, 0.035, 0.025, fx.chips, 1, 9.8, 0.5);
    }
  }

  // ---------------------------------------------------------------- minas
  // friendly: a mina é minha ou de um aliado (LED verde); senão LED vermelho
  addMine(id, p, armIn, friendly) {
    if (this.mines.has(id)) return;
    const m = new THREE.Mesh(weaponGeometryTP('mine'), this.nadeMat);
    m.castShadow = true;
    m.position.set(p[0], p[1] + 0.024, p[2]);
    m.rotation.y = Math.random() * Math.PI * 2;
    const led = new THREE.Sprite(friendly ? this.mineLedMatF : this.mineLedMat);
    led.scale.setScalar(0.09);
    // o LED fica em (0.055, 0.024, 0) no modelo: gira junto com a mina
    led.position.set(p[0] + Math.cos(m.rotation.y) * 0.055, p[1] + 0.06, p[2] - Math.sin(m.rotation.y) * 0.055);
    led.visible = false;
    this.scene.add(m, led);
    this.mines.set(id, { m, led, armAt: this.time + Math.max(0, armIn), trig: false, p: [...p], friendly });
  }
  removeMine(id) {
    const mi = this.mines.get(id);
    if (!mi) return null;
    this.scene.remove(mi.m, mi.led);
    this.mines.delete(id);
    return mi;
  }
  triggerMine(id) {
    const mi = this.mines.get(id);
    if (mi) { mi.trig = true; mi.led.material = this.mineLedMat; mi.led.visible = true; mi.led.scale.setScalar(0.16); }
  }

  blood(p, dir, big, helmet) {
    const q = this.q;
    const n = big ? 14 : 7;
    for (let i = 0; i < n * q; i++) {
      const v = dir.clone().multiplyScalar(1 + Math.random() * 2).add(V((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6));
      this.soft.emit(p, v, 0.35 + Math.random() * 0.4, 0.06, 0.18, [0.45, 0.02, 0.02], 0.95, 6, 1.2);
    }
    for (let i = 0; i < (big ? 4 : 2); i++) this.soft.emit(p, dir.clone().multiplyScalar(0.5), 0.4, 0.2, 0.55, [0.5, 0.05, 0.05], 0.5, -0.2, 2);
    if (helmet) {
      for (let i = 0; i < 12; i++) {
        const v = V((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5);
        this.add.emit(p, v, 0.2 + Math.random() * 0.2, 0.04, 0.01, [1, 0.85, 0.5], 1, 8, 1);
      }
    }
  }

  tracer(a, b) {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    t.a.copy(a); t.b.copy(b);
    t.dist = a.distanceTo(b);
    if (t.dist < 1.2) return;
    t.len = Math.min(3.5, t.dist * 0.4);
    t.t = 0;
    t.m.visible = true;
    t.m.position.copy(a);
    t.m.lookAt(b);
  }

  muzzleFlash(p, small) {
    const f = this.flashes[this.flashIdx++ % this.flashes.length];
    f.s.position.copy(p);
    const s = (small ? 0.35 : 0.6) * (0.8 + Math.random() * 0.4);
    f.s.scale.set(s, s, s);
    f.s.material.rotation = Math.random() * 6;
    f.s.visible = true;
    f.t = 0.05;
  }

  // ---------------------------------------------------------------- explosões
  explosion(p, solid) {
    const q = this.q;
    const pos = V(p[0], p[1] + 0.1, p[2]);
    this.flashLight(1, pos.clone().add(V(0, 0.8, 0)), 0xffa040, 60, 0.35, 22);
    const big = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color: 0xffd080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    big.position.copy(pos).add(V(0, 0.5, 0)); big.scale.setScalar(7);
    this.scene.add(big); this.bigFlashes.push({ s: big, t: 0, dur: 0.22, s0: 7, s1: 9 });
    for (let i = 0; i < 40 * q; i++) {
      const v = V(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 9);
      this.add.emit(pos, v, 0.3 + Math.random() * 0.35, 0.9, 0.3, [1, 0.55 + Math.random() * 0.3, 0.15], 1, 0, 5);
    }
    for (let i = 0; i < 18 * q; i++) {
      const v = V(Math.random() - 0.5, Math.random() * 0.6 + 0.4, Math.random() - 0.5).multiplyScalar(2 + Math.random() * 3);
      this.smokeP.emit(pos.clone().add(V((Math.random() - 0.5), Math.random(), (Math.random() - 0.5))), v, 1.6 + Math.random() * 1.4, 1.2, 4.5, [0.32, 0.29, 0.26], 0.85, -0.6, 1.5);
    }
    for (let i = 0; i < 50 * q; i++) {
      const v = V(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 12);
      this.add.emit(pos, v, 0.5 + Math.random() * 0.6, 0.06, 0.02, [1, 0.75, 0.35], 1, 12, 0.6);
    }
    for (let i = 0; i < 16 * q; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.soft.emit(V(p[0], p[1] + 0.15, p[2]), V(Math.cos(a) * 6, 0.4, Math.sin(a) * 6), 0.9, 0.5, 1.8, [0.78, 0.65, 0.46], 0.6, 0, 3);
    }
    // marca no chão
    const m = new THREE.Matrix4();
    m.compose(V(p[0], Math.max(0, p[1] - 0.06) + 0.012, p[2]), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2), V(3.6, 3.6, 3.6));
    this.scorches.setMatrixAt(this.scorchIdx, m);
    this.scorchIdx = (this.scorchIdx + 1) % 24;
    this.scorches.count = Math.max(this.scorches.count, this.scorchIdx === 0 ? 24 : this.scorchIdx);
    this.scorches.instanceMatrix.needsUpdate = true;
  }

  flashbang(p) {
    const pos = V(p[0], p[1] + 0.1, p[2]);
    this.flashLight(1, pos, 0xffffff, 90, 0.25, 26);
    const big = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    big.position.copy(pos); big.scale.setScalar(5);
    this.scene.add(big); this.bigFlashes.push({ s: big, t: 0, dur: 0.3, s0: 5, s1: 2 });
    for (let i = 0; i < 20 * this.q; i++) {
      const v = V(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 4);
      this.add.emit(pos, v, 0.3 + Math.random() * 0.3, 0.05, 0.02, [1, 1, 0.9], 1, 9, 0.8);
    }
    this.smokeP.emit(pos, V(0, 0.4, 0), 1.2, 0.4, 1.4, [0.7, 0.7, 0.7], 0.4, -0.2, 1);
  }

  // ---------------------------------------------------------------- fumaça
  smoke(id, p, age = 0) {
    if (this.smokes.some((s) => s.id === id)) return;
    const R = GRENADE.smokeRadius, H = GRENADE.smokeHeight;
    const center = V(p[0], p[1], p[2]);
    const puffs = [];
    const n = Math.round(44 * Math.max(0.7, this.q));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R * 0.85;
      const y = 0.35 + Math.random() * (H - 0.5);
      puffs.push({ target: V(Math.cos(a) * r, y, Math.sin(a) * r), size: 2.6 + Math.random() * 1.8, shade: 0.78 + Math.random() * 0.17,
        drift: V((Math.random() - 0.5) * 0.08, Math.random() * 0.05, (Math.random() - 0.5) * 0.08) });
    }
    this.smokes.push({ id, puffs, center, age, dur: GRENADE.smokeDuration });
    for (let i = 0; i < 10; i++) this.smokeP.emit(center.clone().add(V(0, 0.2, 0)), V((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 1.2, 0.5, 2, [0.85, 0.85, 0.83], 0.7, 0, 1.5);
  }

  initSmokeMesh() {
    const MAX = 400;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.smOffset = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.smData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage); // tamanho, alfa, tom
    geo.setAttribute('offset', this.smOffset);
    geo.setAttribute('sdata', this.smData);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex.smoke }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, sunTint: { value: new THREE.Color(1, 0.97, 0.92) } },
      vertexShader: `attribute vec3 offset; attribute vec3 sdata; varying vec2 vUv; varying float vA; varying float vShade; varying float vDepth;
        void main(){ vUv = uv; vA = sdata.y; vShade = sdata.z;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp = offset + (right * position.x + up * position.y) * sdata.x;
          vec4 mv = viewMatrix * vec4(wp, 1.0); vDepth = -mv.z;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform vec3 sunTint;
        varying vec2 vUv; varying float vA; varying float vShade; varying float vDepth;
        void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.01) discard;
          vec3 c = t.rgb * vShade * sunTint;
          float near = smoothstep(0.15, 1.2, vDepth);
          float f = smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(mix(c, fogColor, f), a * near);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.smokeMesh = new THREE.Mesh(geo, mat);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 4;
    this.scene.add(this.smokeMesh);
    this.smokeMax = MAX;
  }

  updateSmokeMesh(camera) {
    if (!this.smokeMesh) this.initSmokeMesh();
    const fog = this.scene.fog;
    const u = this.smokeMesh.material.uniforms;
    if (fog) { u.fogColor.value.copy(fog.color); u.fogNear.value = fog.near; u.fogFar.value = fog.far; }
    const list = [];
    for (const s of this.smokes) {
      const grow = easeOut(Math.min(1, s.age / 1.4));
      const fade = Math.max(0, Math.min(1, (s.dur - s.age) / 2.5));
      for (const pf of s.puffs) {
        const x = s.center.x + pf.target.x * grow + pf.drift.x * s.age;
        const y = s.center.y + 0.3 + (pf.target.y - 0.3) * grow + pf.drift.y * s.age;
        const z = s.center.z + pf.target.z * grow + pf.drift.z * s.age;
        const sz = pf.size * (0.4 + 0.6 * grow) * (1 + s.age * 0.012);
        list.push([x, y, z, sz, 0.95 * fade, pf.shade]);
      }
    }
    // ordena de trás para frente (melhor transparência)
    if (camera && list.length) {
      const c = camera.position;
      list.sort((a, b) => ((b[0] - c.x) ** 2 + (b[1] - c.y) ** 2 + (b[2] - c.z) ** 2) - ((a[0] - c.x) ** 2 + (a[1] - c.y) ** 2 + (a[2] - c.z) ** 2));
    }
    const n = Math.min(list.length, this.smokeMax);
    const o = this.smOffset.array, d = this.smData.array;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      o[i * 3] = e[0]; o[i * 3 + 1] = e[1]; o[i * 3 + 2] = e[2];
      d[i * 3] = e[3]; d[i * 3 + 1] = e[4]; d[i * 3 + 2] = e[5];
    }
    this.smokeMesh.geometry.instanceCount = n;
    this.smOffset.needsUpdate = true; this.smData.needsUpdate = true;
  }

  // densidade da fumaça em um ponto (0..1)
  smokeDensityAt(p) {
    let d = 0;
    for (const s of this.smokes) {
      const grow = Math.min(1, s.age / 1.3);
      const fade = Math.min(1, (s.dur - s.age) / 2.5);
      const k = grow * Math.max(0, fade);
      const dx = (p.x - s.center.x) / GRENADE.smokeRadius, dy = (p.y - s.center.y - GRENADE.smokeHeight * 0.45) / (GRENADE.smokeHeight * 0.7), dz = (p.z - s.center.z) / GRENADE.smokeRadius;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r < 1) d = Math.max(d, Math.min(1, (1 - r) * 2.2) * k);
    }
    return d;
  }
  // um segmento atravessa fumaça densa?
  smokeBlocks(a, b) {
    for (const s of this.smokes) {
      if (s.age < 0.9 || s.dur - s.age < 1.5) continue;
      const c = s.center.clone().add(V(0, 1.2, 0));
      const ab = b.clone().sub(a);
      const t = Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / ab.lengthSq()));
      const pt = a.clone().addScaledVector(ab, t).sub(c);
      pt.y *= 1.4;
      if (pt.length() < GRENADE.smokeRadius * 0.85) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- granadas em voo
  addNade(id, kind, o, v, st, serverNow, mapSolid) {
    if (this.nades.has(id)) return;
    const geo = weaponGeometryTP(kind);
    const m = new THREE.Mesh(geo, this.nadeMat);
    m.castShadow = true;
    m.scale.setScalar(1.3);
    this.scene.add(m);
    const sim = createGrenadeSim(o, v);
    const n = { id, kind, m, sim, st, prev: [...o], solid: mapSolid, bounces: 0, spin: V(Math.random() * 10, Math.random() * 10, Math.random() * 10), created: performance.now() };
    this.nades.set(id, n);
    this.advanceNade(n, serverNow);
  }
  removeNade(id) {
    const n = this.nades.get(id);
    if (!n) return null;
    this.scene.remove(n.m);
    this.nades.delete(id);
    return n;
  }
  advanceNade(n, serverNow) {
    const target = Math.floor((serverNow - n.st) / GRENADE.dt);
    let guard = 0;
    while (n.sim.steps < target && guard++ < 600) {
      n.prev = [...n.sim.p];
      stepGrenade(n.sim, n.solid);
      if (n.sim.bounces !== n.bounces) {
        n.bounces = n.sim.bounces;
        if (this.onBounce) this.onBounce(n.sim.p, n.kind);
      }
    }
    const frac = Math.max(0, Math.min(1, (serverNow - n.st) / GRENADE.dt - n.sim.steps + 1));
    const p = n.sim.p, q = n.prev;
    n.m.position.set(q[0] + (p[0] - q[0]) * frac, q[1] + (p[1] - q[1]) * frac, q[2] + (p[2] - q[2]) * frac);
  }

  // ---------------------------------------------------------------- loop
  update(dt, serverNow, camera) {
    this.time += dt;
    const scale = camera ? (innerHeight * 0.5) / Math.tan((camera.fov * Math.PI / 180) / 2) : 600;
    this.soft.mat.uniforms.scale.value = scale;
    this.smokeP.mat.uniforms.scale.value = scale;
    this.add.mat.uniforms.scale.value = scale;
    this.soft.update(dt); this.smokeP.update(dt); this.add.update(dt);
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.t += dt;
      const travel = t.t * 520;
      if (travel - t.len > t.dist) { t.m.visible = false; continue; }
      const head = Math.min(t.dist, travel), tail = Math.max(0, travel - t.len);
      const dir = t.b.clone().sub(t.a).normalize();
      t.m.position.copy(t.a).addScaledVector(dir, head);
      t.m.scale.set(1, 1, Math.max(0.01, head - tail));
    }
    for (const f of this.flashes) { if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; } }
    for (const L of this.lights) {
      if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.t / L.dur) * L.peak; } else L.l.intensity = 0;
    }
    for (let i = this.bigFlashes.length - 1; i >= 0; i--) {
      const b = this.bigFlashes[i];
      b.t += dt;
      const k = b.t / b.dur;
      b.s.material.opacity = Math.max(0, 1 - k);
      b.s.scale.setScalar(b.s0 + (b.s1 - b.s0) * k);
      if (k >= 1) { this.scene.remove(b.s); b.s.material.dispose(); this.bigFlashes.splice(i, 1); }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.age += dt;
      if (s.age >= s.dur) this.smokes.splice(i, 1);
    }
    this.updateSmokeMesh(camera);
    for (const mi of this.mines.values()) {
      if (mi.trig) continue;
      // pisca rápido enquanto arma, depois um piscar curto a cada 1,2 s
      if (this.time < mi.armAt) mi.led.visible = (this.time * 6) % 1 < 0.5;
      else mi.led.visible = (this.time - mi.armAt) % 1.2 < 0.12;
    }
    for (const n of this.nades.values()) {
      this.advanceNade(n, serverNow);
      if (!n.sim.rest) { n.m.rotation.x += n.spin.x * dt; n.m.rotation.z += n.spin.z * dt; }
      if (performance.now() - n.created > 9000) this.removeNade(n.id);
    }
    this.shake *= Math.exp(-dt * 6);
  }

  clearAll() {
    this.smokes = [];
    for (const id of [...this.nades.keys()]) this.removeNade(id);
    for (const set of this.holeSets) { set.mesh.count = 0; set.idx = 0; }
    this.scuffs.mesh.count = 0; this.scuffs.idx = 0;
    for (const id of [...this.mines.keys()]) this.removeMine(id);
    this.scorches.count = 0; this.scorchIdx = 0;
  }
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
