// Capture a Bandeira: bandeiras 3D, bases e marcadores visíveis através das paredes.
import * as THREE from '/lib/three.js';
import { TEAMS } from '/shared/constants.js';

const CLOTH_W = 0.9, CLOTH_H = 0.6, POLE_H = 2.2;

function markerTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.55)';
  x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
  x.strokeStyle = color; x.lineWidth = 4;
  x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.stroke();
  // mastro e pano
  x.fillStyle = '#ddd'; x.fillRect(22, 14, 4, 36);
  x.fillStyle = color;
  x.beginPath(); x.moveTo(26, 14); x.lineTo(46, 21); x.lineTo(26, 29); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FlagView {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.items = {};
    for (const team of ['ct', 'tr']) {
      const color = new THREE.Color(TEAMS[team].color);
      // bandeira (mastro + pano que balança)
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, POLE_H, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 }));
      pole.position.y = POLE_H / 2;
      flag.add(pole);
      const geo = new THREE.PlaneGeometry(CLOTH_W, CLOTH_H, 12, 4);
      geo.translate(CLOTH_W / 2, 0, 0);
      const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.8 }));
      cloth.position.set(0.03, POLE_H - CLOTH_H / 2 - 0.05, 0);
      flag.add(cloth);
      const glow = new THREE.PointLight(color, 1.2, 6, 2);
      glow.position.set(0.4, POLE_H - 0.4, 0);
      flag.add(glow);
      this.root.add(flag);
      // base: anel no chão
      const base = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      base.rotation.x = -Math.PI / 2;
      this.root.add(base);
      // marcador que aparece através das paredes
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(TEAMS[team].color), depthTest: false, depthWrite: false, transparent: true }));
      marker.scale.set(0.9, 0.9, 1);
      marker.renderOrder = 999;
      this.root.add(marker);
      this.items[team] = { flag, cloth, base, marker, rest: geo.attributes.position.array.slice() };
    }
  }

  // g = jogo (main.js); fl = estado das bandeiras vindo do servidor
  update(g, dt, clock, camPos) {
    const on = !!(g.match && g.match.phase !== 'room' && g.matchSettings && g.matchSettings.mode === 'ctf' && g.flags && g.map && g.map.flagBases);
    this.root.visible = on;
    if (!on) return;
    for (const team of ['ct', 'tr']) {
      const it = this.items[team], f = g.flags[team];
      const b = g.map.flagBases[TEAMS[team].side];
      if (b) it.base.position.set(b.x, b.y + 0.03, b.z);
      it.base.visible = !!b;
      let pos = null, carried = false;
      if (f.s === 1) {
        carried = true;
        if (f.c === g.myId) pos = null; // quem carrega não vê a própria bandeira na cara
        else {
          const r = g.remotes.get(f.c);
          if (r && r.alive && r.visiblePos) pos = r.visiblePos;
          else pos = new THREE.Vector3(f.p[0], f.p[1], f.p[2]);
        }
      } else pos = new THREE.Vector3(f.p[0], f.p[1], f.p[2]);
      it.flag.visible = !!pos;
      it.marker.visible = !!pos;
      if (!pos) continue;
      if (carried) {
        // presa nas costas do portador, um pouco acima
        it.flag.position.set(pos.x, pos.y + 0.4, pos.z);
        it.flag.scale.setScalar(0.75);
      } else {
        it.flag.position.set(pos.x, pos.y, pos.z);
        it.flag.scale.setScalar(1);
        it.flag.rotation.y += dt * (f.s === 2 ? 1.6 : 0.25);
      }
      // pano balançando
      const arr = it.cloth.geometry.attributes.position.array, rest = it.rest;
      for (let i = 0; i < arr.length; i += 3) {
        const x = rest[i];
        arr[i + 2] = Math.sin(clock * 5 + x * 6 + (team === 'ct' ? 0 : 1.7)) * 0.08 * (x / CLOTH_W);
      }
      it.cloth.geometry.attributes.position.needsUpdate = true;
      // marcador: acima da bandeira, tamanho constante na tela
      const top = pos.y + (carried ? 2.4 : 3.0);
      it.marker.position.set(pos.x, top, pos.z);
      const d = camPos ? Math.hypot(camPos.x - pos.x, camPos.y - top, camPos.z - pos.z) : 10;
      const sc = Math.min(3.5, Math.max(0.6, d * 0.045));
      it.marker.scale.set(sc, sc, 1);
      it.marker.material.opacity = d < 4 ? 0.3 : 0.95;
    }
  }
}
