// Sertão Strike — cliente. Liga renderização, rede, entrada, HUD e menus.
import * as THREE from '/lib/three.js';
import { net } from './net.js';
import { settings, onSettingsChange, QUALITY, keyName } from './settings.js';
import { getMap, mapName } from '/shared/maps.js';
import { buildWorld } from './world.js';
import { ViewModel } from './viewmodel.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { Chat } from './chat.js';
import { Room } from './room.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';
import { RemotePlayer } from './remote.js';
import { renderWeaponIcons } from './models.js';
import { WEAPONS, WEAPON_LIST } from '/shared/weapons.js';
import { DEFAULT_MATCH, GRENADE, NET, TEAMS, GUNGAME_LIST, isTeamModeId } from '/shared/constants.js';
import { FlagView } from './flags.js';
const teamColorOf = (team) => (team && TEAMS[team] ? TEAMS[team].color : null);
import { raycastWorld, lineOfSight, rayHitPlayer, viewDir } from '/shared/physics.js';
const ENEMY_COLOR = '#ff4a3d';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

class Game {
  constructor() {
    this.settings = settings;
    this.net = net;
    this.players = new Map();
    this.remotes = new Map();
    this.scores = new Map();
    this.myId = null; this.hostId = null; this.joined = false;
    this.match = null;
    this.matchSettings = { ...DEFAULT_MATCH };
    this.menuOpen = false;
    this.respawnAt = 0;
    this.myKills = [];
    this.firstBlood = false;
    this.tagAcc = 0; this.spotAcc = 0;
    this.smokeDensity = 0;
    this.clock = 0;
    this.ignoreUnlock = false;
    this.teamScore = { ct: 0, tr: 0 };
    this.flags = null; // Capture a Bandeira: estado das bandeiras
    this.myStreak = 0;
  }

  // ------------------------------------------------------------------ equipes
  isTeamMode() { return !!this.matchSettings && isTeamModeId(this.matchSettings.mode); }
  teamOf(id) {
    if (!this.isTeamMode()) return null;
    const p = this.players.get(id);
    if (p && p.team) return p.team;
    const row = this.scores.get(id);
    return row ? [null, 'ct', 'tr'][row[8] || 0] : null;
  }
  mineFriendly(mi) { return mi.by === this.myId || this.isMate(mi.by); }
  isMate(id) { const a = this.teamOf(id), b = this.teamOf(this.myId); return !!a && a === b && id !== this.myId; }
  refreshTeams() {
    for (const r of this.remotes.values()) this.refreshIdent(r);
  }
  // como cada jogador aparece: aliado (cor da equipe) ou inimigo (vermelho)
  refreshIdent(r) {
    const colors = settings.playerId !== 'classic';
    const mate = this.isMate(r.id);
    const team = this.teamOf(r.id);
    if (mate) {
      const c = TEAMS[team].color;
      if (colors) r.setIdent('ally', c, { rim: 0.55, bands: true });
      else r.setIdent(r.alive ? 'ally' : null, c);
    } else if (colors) {
      // no modo em equipe o inimigo usa as faixas da equipe dele; contorno vermelho
      r.setIdent('enemy', ENEMY_COLOR, { rim: 0.4, bands: !!team, bandColor: team ? TEAMS[team].color : null });
    } else r.setIdent(null);
  }

  serverTime() { return net.serverTime(); }
  renderTime() { return net.serverTime() - this.interpDelay(); }
  interpDelay() {
    const target = Math.min(0.2, Math.max(0.05, 2.2 / NET.snapshotRate + net.jitter * 2));
    const nowS = performance.now() / 1000;
    if (this.interpCur === undefined) { this.interpCur = target; this.interpAt = nowS; }
    // aproxima-se do alvo a no máximo 20 ms por segundo
    const step = Math.min(0.1, nowS - this.interpAt) * 0.02;
    this.interpAt = nowS;
    this.interpCur += Math.max(-step, Math.min(step, target - this.interpCur));
    return this.interpCur;
  }
  settings_match() { return this.matchSettings; }

  // ------------------------------------------------------------------ inicialização
  async init() {
    const q = QUALITY[settings.quality] || QUALITY.high;
    const canvas = $('game');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      this.fatal('Seu navegador não conseguiu iniciar o WebGL (gráficos 3D). Atualize o navegador/driver de vídeo ou ative a aceleração de hardware.');
      throw e;
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 1200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.setLoading('Construindo o mapa...');
    await new Promise((r) => setTimeout(r, 20));
    this.map = getMap('sertao');
    this.world = buildWorld(this.scene, this.map, q);
    this.viewmodel = new ViewModel(settings);
    this.applyEnv();
    this.effects = new Effects(this.scene, q);
    this.flagView = new FlagView(this.scene);
    this.audio = new GameAudio(settings);
    this.audio.occlusion = (pos) => this.occluded(pos);
    window.addEventListener('focus', () => this.audio.refresh());
    this.effects.onBounce = (p, kind) => this.audio.bounce(p, kind);
    // brilho do lugar (marcas de bala não ficam "acesas" em salas escuras)
    const lightTmp = { sky: 1, lamp: [0, 0, 0] };
    this.effects.lightFn = (x, y, z) => {
      if (!this.world || !this.world.lightAt) return 1;
      const L = this.world.lightAt(x, y, z, lightTmp);
      return Math.min(1, 0.3 + 0.7 * L.sky + (L.lamp[0] + L.lamp[1] + L.lamp[2]) * 0.4);
    };
    // ambiente do som (interno/externo) no ponto de quem ouve
    this.audio.skyAt = (x, y, z) => (this.world && this.world.lightAt ? this.world.lightAt(x, y, z, lightTmp).sky : 1);
    this.hud = new HUD(this);
    this.hud.buildRadarMap(this.map);
    this.setLoading('Preparando armas...');
    await new Promise((r) => setTimeout(r, 20));
    this.icons = renderWeaponIcons(WEAPON_LIST);
    this.hud.setIcons(this.icons);
    this.me = new LocalPlayer(this);
    this.input = new Input(canvas, settings);
    this.menus = new Menus(this);
    this.chat = new Chat(this);
    this.room = new Room(this);
    this.inRoom = false;
    this.roomFrameAcc = 1;
    this.menus.buildStart();
    this.applySettings();
    onSettingsChange(() => this.applySettings());
    this.bindInput();
    this.bindNet();
    net.connect();
    addEventListener('resize', () => this.resize());
    this.resize();
    addEventListener('beforeunload', (e) => { if (this.joined && !this.leaving) { e.preventDefault(); e.returnValue = ''; } });
    $('loading').classList.add('hidden');
    // música da tela principal (continua na sala de espera; o navegador só
    // libera o som depois do primeiro clique ou tecla)
    this.audio.roomMusic(true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  applyEnv() {
    try {
      if (this.envTex) this.envTex.dispose();
      const env = this.world.makeEnvironment(this.renderer);
      this.envTex = env;
      this.scene.environment = env; this.scene.environmentIntensity = 0.35;
      this.viewmodel.scene.environment = env; this.viewmodel.scene.environmentIntensity = 1.0;
    } catch (e) { console.warn('sem mapa de ambiente', e); }
  }

  // troca o mapa (quando o servidor/anfitrião muda)
  switchMap(id) {
    if (!id || (this.map && this.map.id === id)) return;
    const q = QUALITY[settings.quality] || QUALITY.high;
    this.world.dispose();
    this.map = getMap(id);
    this.world = buildWorld(this.scene, this.map, q);
    this.world.setShadows(q);
    this.applyEnv();
    this.hud.buildRadarMap(this.map);
    this.effects.clearAll();
    if (this.joined) this.hud.toast(`Mapa: ${mapName(id)}`, 3);
  }

  setLoading(t) { const el = $('loadingtext'); if (el) el.textContent = t; }
  fatal(msg) {
    const el = $('fatal');
    el.innerHTML = `<div>${msg}<br><button class="btn primary" onclick="location.reload()">Recarregar</button></div>`;
    el.classList.remove('hidden');
    $('loading').classList.add('hidden');
  }

  applySettings() {
    if (this.remotes) this.refreshTeams();
    const q = QUALITY[settings.quality] || QUALITY.high;
    const pr = Math.min(devicePixelRatio || 1, q.pixelRatio) * settings.renderScale;
    if (Math.abs(this.renderer.getPixelRatio() - pr) > 0.01) { this.renderer.setPixelRatio(pr); this.resize(); }
    this.world.setShadows(q);
    this.renderer.shadowMap.enabled = q.shadows;
    this.effects.q = q.particles;
    this.audio.applyVolumes();
    this.hud.xhKey = '';
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(w / h);
    this.hud.xhKey = '';
  }

  occluded(pos) {
    const c = this.camera.position;
    const d = [pos[0] - c.x, pos[1] - c.y, pos[2] - c.z];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1) return false;
    return !!raycastWorld([c.x, c.y, c.z], [d[0] / len, d[1] / len, d[2] / len], len - 0.5, this.map.solid);
  }

  enterFullscreen() {
    if (!settings.fullscreen || document.fullscreenElement) return;
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {});
      }).catch(() => {});
    }
  }
  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else { const old = settings.fullscreen; settings.fullscreen = true; this.enterFullscreen(); settings.fullscreen = old; }
  }

  join(info) {
    this.enterFullscreen();
    net.send({ t: 'hello', ...info });
    this.viewmodel.setCharacter(info.char);
  }

  // ------------------------------------------------------------------ menus e teclas
  onMenu(open, resume) {
    const m = this.menus;
    this.menuOpen = !m.loadout.classList.contains('hidden') || !m.guide.classList.contains('hidden') || !m.pause.classList.contains('hidden') || !m.settingsEl.classList.contains('hidden');
    if (this.menuOpen && this.input.locked) { this.ignoreUnlock = true; this.input.unlock(); }
    if (!this.menuOpen && this.joined && resume && !this.inRoom) this.input.lock();
  }

  bindInput() {
    const inp = this.input;
    inp.onUnlock = () => {
      if (this.ignoreUnlock) { this.ignoreUnlock = false; return; }
      if (this.inRoom) return;
      if (this.joined && !this.menuOpen && !this.hud.chatOpen) this.menus.openPause();
    };
    inp.onKey = (e) => {
      if (this.menus.waitingKey) { this.menus.captureKey(e.code); return true; }
      if (!this.joined) return false;
      if (this.inRoom && !this.menuOpen) return false; // na sala as teclas do jogo não valem
      if (e.code === 'Escape') {
        if (!this.menus.loadout.classList.contains('hidden')) { this.menus.closeLoadout(); return true; }
        if (!this.menus.guide.classList.contains('hidden')) { this.menus.closeGuide(); return true; }
        if (!this.menus.settingsEl.classList.contains('hidden')) { this.menus.closeSettings(); return true; }
        if (!this.menus.pause.classList.contains('hidden')) { this.menus.closePause(); return true; }
        if (inp.locked) { this.menus.openPause(); return true; }
        return false;
      }
      if (e.code === settings.keys.loadout && !e.repeat) {
        if (!this.menus.loadout.classList.contains('hidden')) this.menus.closeLoadout();
        else if (!this.menuOpen) this.menus.openLoadout();
        return true;
      }
      if (e.code === settings.keys.equipment && !e.repeat) {
        if (!this.menus.guide.classList.contains('hidden')) this.menus.closeGuide();
        else if (!this.menuOpen) this.menus.openGuide();
        return true;
      }
      const teamKey = e.code === settings.keys.teamChat;
      if ((e.code === settings.keys.chat || e.code === 'Enter' || teamKey) && !e.repeat && inp.locked && !this.menuOpen) {
        this.chat.closeRadio();
        this.hud.openChat(teamKey);
        inp.typing = true;
        inp.clear();
        // libera o mouse para clicar nos emojis e rolar o histórico
        this.ignoreUnlock = true; inp.unlock();
        return true;
      }
      if (!e.repeat && inp.locked && !this.menuOpen && this.chat.radioKey(e.code)) return true;
      if (e.code === settings.keys.scoreboard) e.preventDefault();
      return false;
    };
    const chat = $('chatinput');
    chat.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this.chat.submit();
        this.closeChat();
      } else if (e.key === 'Escape') { this.closeChat(); e.preventDefault(); }
      else if (e.key === 'Tab') { e.preventDefault(); this.chat.toggleMode(); }
    });
    $('clicktoplay').addEventListener('click', () => { this.audio.init(); this.input.lock(); });
    document.addEventListener('click', () => this.audio.init(), { once: true });
  }
  closeChat() {
    this.hud.closeChat();
    this.input.typing = false;
    this.input.lock();
  }

  // ------------------------------------------------------------------ rede
  addPlayer(p) {
    this.players.set(p.id, { id: p.id, name: p.name, char: p.char, bot: p.bot, team: p.team || null });
    if (p.st) this.scores.set(p.id, p.st);
    if (p.id !== this.myId && !this.remotes.has(p.id)) {
      const r = new RemotePlayer(this, p);
      this.remotes.set(p.id, r);
      this.refreshIdent(r);
    }
  }
  removePlayer(id) {
    this.players.delete(id);
    this.scores.delete(id);
    const r = this.remotes.get(id);
    if (r) { r.remove(); this.remotes.delete(id); }
  }
  pname(id) { const p = this.players.get(id); return p ? p.name : '?'; }

  bindNet() {
    net.on('info', (m) => { if (!this.joined) this.switchMap(m.map); this.menus.updateServerInfo(m); });
    net.on('open', () => { if (this.pendingJoin && !this.joined) { const j = this.pendingJoin; this.pendingJoin = null; this.join(j); } });
    net.on('close', () => {
      if (this.joined) this.fatal('Conexão com o servidor perdida. Verifique se o servidor ainda está rodando.');
      else this.menus.updateServerInfo(null);
    });
    net.on('err', (m) => this.fatal(m.m));
    net.on('welcome', (m) => {
      this.switchMap(m.settings.map);
      this.myId = m.id; this.hostId = m.host; this.joined = true;
      net.autoReconnect = false;
      this.matchSettings = m.settings; this.match = m.match;
      this.audio.setPack(m.settings.soundPack);
      if (m.match.ts) this.teamScore = m.match.ts;
      this.flags = m.match.fl || null;
      for (const p of m.players) this.addPlayer(p);
      this.refreshTeams();
      for (const s of m.smokes) this.effects.smoke(s.id, s.p, s.age);
      for (const mi of m.mines || []) this.effects.addMine(mi.id, mi.p, mi.arm, this.mineFriendly(mi));
      this.menus.hideStart();
      this.inRoom = true; // quem entra começa na sala de espera
      this.syncRoomView();
      this.hud.chatLine({ sys: true, m: `Bem-vindo, ${m.name}! Pressione ${keyName(settings.keys.loadout)} para trocar de arma, ${keyName(settings.keys.equipment)} para ver os equipamentos, ESC para opções.` });
      if (m.match.phase === 'ended' && m.match.result) this.hud.showEnd(m.match.result, m.match.endsAt);
      this.menuOpen = false;
    });
    net.on('join', (m) => this.addPlayer(m.p));
    net.on('room', (m) => this.room.update(m));
    net.on('leave', (m) => this.removePlayer(m.id));
    net.on('host', (m) => { this.hostId = m.id; if (m.id === this.myId) this.hud.toast('Agora você é o anfitrião (ESC › Configurar partida)', 4); });
    net.on('pinfo', (m) => {
      const p = this.players.get(m.id);
      if (p) { p.name = m.name; p.char = m.char; if ('team' in m) p.team = m.team; }
      const r = this.remotes.get(m.id);
      if (r) r.setInfo(m);
      this.refreshTeams();
    });
    net.on('s', (m) => {
      for (const a of m.p) {
        if (a[0] === this.myId) continue;
        const r = this.remotes.get(a[0]);
        if (r) r.push(m.st, a);
      }
    });
    net.on('spawn', (m) => {
      const p = this.players.get(m.id);
      if (p) { p.char = m.lo.char; p.team = m.team || null; }
      if (m.id === this.myId) {
        this.me.spawn(m);
        this.myStreak = 0; this.hud.setStreak(0);
        if (this.isTeamMode() && m.team && m.team !== this.lastTeam) this.hud.announce(`Você está nos ${TEAMS[m.team].full}`);
        this.lastTeam = m.team;
        this.viewmodel.setCharacter(m.lo.char);
        this.hud.showDeath(null);
        this.respawnAt = 0;
        this.viewmodel.hide(false);
      } else {
        const r = this.remotes.get(m.id);
        if (r) { r.model.setChar(m.lo.char); r.spawn(m.p, m.y); }
      }
      const row = this.scores.get(m.id);
      if (row) row[7] = 1;
      if (m.id === this.myId) this.refreshTeams();
      else { const r = this.remotes.get(m.id); if (r) this.refreshIdent(r); }
    });
    net.on('fx', (m) => this.onRemoteShot(m));
    net.on('hit', (m) => {
      const kind = m.k ? 'kill' : m.z === 'head' ? 'hs' : 'hit';
      if (m.prot) { this.hud.toast('Alvo protegido (acabou de renascer)', 1.2); return; }
      this.hud.hitmarker(kind);
      if (m.z === 'head' && !m.nade) this.audio.headshot(!!m.hm); else this.audio.hitmarker(!!m.k);
      const r = this.remotes.get(m.v);
      if (r && r.visiblePos) {
        const cr = r.state && (r.state.f & 1);
        const y = m.z === 'head' ? (cr ? 1.19 : 1.645) : m.z === 'legs' ? 0.5 : (cr ? 0.85 : 1.2);
        const pos = r.visiblePos.clone().add(V(0, y, 0));
        if (!m.nade) {
          const dir = pos.clone().sub(this.camera.position).normalize();
          this.effects.blood(pos, dir, m.z === 'head', !!m.hm);
        }
        const sp = pos.clone().add(V(0, 0.25, 0)).project(this.camera);
        if (sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1) {
          this.hud.damageNumber((sp.x + 1) / 2 * innerWidth, (1 - sp.y) / 2 * innerHeight, m.dmg, m.k ? 'kill' : m.z === 'head' ? 'hs' : '');
        }
      }
    });
    net.on('hurt', (m) => {
      this.me.hurt(m);
      if (m.from) this.hud.damageFrom(m.from, this.me.ms.pos, this.me.yaw);
      this.audio.hurt(m.dmg);
      if (m.z === 'head' && !m.nade) this.audio.headshot(this.me.helmet);
    });
    net.on('kill', (m) => this.onKill(m));
    net.on('flag', (m) => this.onFlag(m));
    net.on('gt', (m) => {
      if (m.by === this.myId && m.cid) this.effects.removeNade('c' + m.cid);
      this.effects.addNade(m.id, m.k, m.o, m.v, m.st, this.serverTime(), this.map.solid);
      if (m.by !== this.myId) this.audio.throwSound(m.o);
    });
    net.on('ge', (m) => this.onNade(m));
    // minas terrestres
    net.on('mp', (m) => {
      this.effects.addMine(m.id, m.p, m.arm, this.mineFriendly(m));
      if (m.by !== this.myId) this.audio.minePlace(m.p);
      else this.hud.toast('Mina plantada: arma em 1,5 s', 1.5);
      this.audio.mineArm(m.p, m.arm);
    });
    net.on('mr', (m) => this.effects.removeMine(m.id));
    net.on('mt', (m) => {
      const mi = this.effects.mines.get(m.id);
      this.effects.triggerMine(m.id);
      if (mi) this.audio.mineClick(mi.p);
    });
    net.on('toast', (m) => {
      if (m.m) this.hud.toast(m.m, 2);
      if (m.nades) { this.me.nades = { ...m.nades }; this.hud.showSlots(); }
    });
    net.on('kn', (m) => {
      const r = this.remotes.get(m.id);
      if (!r || !r.visiblePos) return;
      const p = [r.visiblePos.x, r.visiblePos.y + 1.3, r.visiblePos.z];
      this.audio.knifeSwing(p);
      if (m.h) this.audio.knifeHit(p);
      r.model.fireKick();
    });
    net.on('sc', (m) => { for (const row of m.l) this.scores.set(row[0], row); });
    net.on('heal', (m) => this.onHeal(m));
    net.on('match', (m) => {
      const prev = this.match ? this.match.phase : null;
      const prevMode = this.matchSettings && this.matchSettings.mode;
      this.match = m.match;
      this.matchSettings = m.settings;
      this.audio.setPack(m.settings.soundPack);
      if (m.match.ts) this.teamScore = m.match.ts;
      this.flags = m.match.fl || null;
      if (prevMode !== m.settings.mode) this.refreshTeams();
      if (this.room.visible) this.room.render();
      // na sala, o cenário 3D só é refeito quando o dono para de trocar de mapa
      // (a prévia 2D já mostra o mapa na hora); fora da sala, troca imediata
      clearTimeout(this.mapTimer);
      if (m.match.phase === 'room' && this.map && this.map.id !== m.settings.map) this.mapTimer = setTimeout(() => this.switchMap(this.matchSettings.map), 1500);
      else this.switchMap(m.settings.map);
      if (m.match.phase === 'ended') {
        this.hud.showEnd(m.match.result, m.match.endsAt);
        if (prev !== 'ended') this.audio.ui('end');
      } else {
        this.hud.showEnd(null);
        if (m.match.phase === 'live' && prev !== 'live') {
          this.hud.announce(m.settings.mode === 'tdm' ? 'Mata-mata em equipe!' : m.settings.mode === 'ctf' ? 'Capture a bandeira!' : m.settings.mode === 'gungame' ? 'Gun Game!' : 'Partida iniciada!');
          this.audio.ui('start');
          this.firstBlood = false;
          this.myKills = [];
        }
        if (m.match.sudden && !this.wasSudden) { this.hud.announce('Morte súbita!'); this.audio.announce(4); }
      }
      this.wasSudden = m.match.sudden;
      if (!this.menus.settingsEl.classList.contains('hidden') && this.menus.settingsTab === 'partida') this.menus.renderSettings();
    });
    net.on('reset', () => { this.effects.clearAll(); $('killfeed').innerHTML = ''; });
    net.on('chat', (m) => {
      if (m.id && this.chat.isMuted(m.id)) return;
      this.hud.chatLine(m); this.audio.ui('chat');
      const e = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      this.room.chat(m.sys ? `<i>${e(m.m)}</i>` : `<b>${e(m.name || this.pname(m.id))}:</b> ${e(m.m)}`);
    });
    net.on('radio', (m) => this.chat.radio(m));
    net.on('ammo', (m) => { if (this.me.inv[m.w]) { this.me.inv[m.w].mag = m.m; this.me.inv[m.w].res = m.r; } });
    net.on('pos', (m) => { if (m.s === this.me.lifeId) { this.me.ms.pos = [...m.p]; this.me.ms.vel = [0, 0, 0]; } });
    net.on('equip', (m) => { this.me.applyInventory(m.inv, m.nades, m.lo); this.hud.toast('Equipamento atualizado!'); });
    net.on('lo', (m) => {
      if (this.matchSettings.mode === 'gungame') this.hud.toast('No Gun Game as armas são definidas pelo nível');
      else if (!m.applied) this.hud.toast('O novo equipamento vale no próximo renascimento');
    });
  }

  onRemoteShot(m) {
    const w = WEAPONS[m.w];
    const r = this.remotes.get(m.id);
    let muzzle = V(m.o[0], m.o[1], m.o[2]);
    if (r && r.model.root.visible && r.alive) {
      muzzle = r.muzzle(V(0, 0, 0));
      r.model.fireKick();
      if (!(w.snd && w.snd.suppressed)) r.radarAt = performance.now() / 1000;
    }
    this.audio.shot(w, [muzzle.x, muzzle.y, muzzle.z], false);
    if (!(w.snd && w.snd.suppressed)) {
      this.effects.muzzleFlash(muzzle, w.type === 'pistol' || w.type === 'smg');
      if (muzzle.distanceTo(this.camera.position) < 40) this.effects.flashLight(2, muzzle, 0xffc070, 5, 0.05, 8);
    }
    r && (r.shots = (r.shots || 0) + 1);
    m.e.forEach((e, i) => {
      const end = V(e[0], e[1], e[2]);
      if (e[3] === 0) {
        const axis = e[4] >> 1, sign = e[4] & 1 ? 1 : -1;
        const n = V(0, 0, 0); n.setComponent(axis, sign);
        // descobre o material com um raycast curto
        const o = end.clone().addScaledVector(n, 0.05);
        const h = raycastWorld([o.x, o.y, o.z], [-n.x, -n.y, -n.z], 0.2, this.map.solid);
        const sdir = V(e[0] - m.o[0], e[1] - m.o[1], e[2] - m.o[2]);
        this.effects.impact(end, n, h ? (h.box.floor ? 'ground' : h.box.mat) : 'plaster', sdir);
      }
      if (i < 2 && (w.type !== 'rifle' && w.type !== 'smg' || (r && r.shots % 3 === 0))) this.effects.tracer(muzzle, end);
    });
  }

  onKill(m) {
    const killer = this.pname(m.k), victim = this.pname(m.v);
    const suicide = m.k === m.v;
    const mine = m.k === this.myId && !suicide;
    const me = m.v === this.myId;
    if (m.ks) this.scores.set(m.ks[0], m.ks);
    if (m.vs) this.scores.set(m.vs[0], m.vs);
    if (m.ts) this.teamScore = m.ts;
    if (m.sw) {
      // bot trocado de equipe para equilibrar: sem entrada no killfeed
      const r = this.remotes.get(m.v);
      if (r) { r.die(null); r.corpseUntil = 0; }
      return;
    }
    // abate duplo, triplo...: todo mundo vê e ouve, com o nick de quem fez
    if (m.mk >= 2 && !suicide && !m.tk) {
      this.hud.multiKill(killer, m.mk, mine, this.isTeamMode() ? teamColorOf(this.teamOf(m.k)) : null);
      this.audio.multiKill(m.mk, mine);
    }
    this.hud.killfeed({ killer, victim, w: m.w, hs: m.hs, pen: m.pen, sm: m.sm, air: m.air, ns: m.ns, mine, me, suicide, tk: m.tk, streak: m.kst || 0, kt: this.teamOf(m.k), vt: this.teamOf(m.v) });
    if (me) { this.myStreak = 0; this.hud.setStreak(0); }
    const kr = this.remotes.get(m.k);
    if (me) {
      this.me.die(m.k);
      this.viewmodel.hide(true);
      this.respawnAt = performance.now() / 1000 + m.rs;
      this.hud.showDeath({ killer, w: m.w, hs: m.hs, pen: m.pen, kh: m.kh, ka: m.ka, suicide });
      this.audio.death();
    } else {
      const r = this.remotes.get(m.v);
      if (r) r.die(kr && kr.visiblePos ? [kr.visiblePos.x, 0, kr.visiblePos.z] : (m.k === this.myId ? [this.me.ms.pos[0], 0, this.me.ms.pos[2]] : null), { hs: m.hs, w: m.w });
    }
    if (mine) {
      const t = performance.now() / 1000;
      this.myKills = this.myKills.filter((x) => t - x < 4);
      this.myKills.push(t);
      const n = this.myKills.length;
      const ic = this.hud.icon(m.w);
      this.hud.center(`<div class="km">Você abateu <span style="color:#ffd27a">${victim.replace(/</g, '&lt;')}</span>${ic ? `<img src="${ic}">` : ''}${m.hs ? ' <span style="color:#ff5a4a">TIRO NA CABEÇA</span>' : ''}</div>`, 2.2);
      if (m.tk) { this.hud.center('<div class="km" style="color:#ff6a5a">Você abateu um ALIADO (−1 ponto)</div>', 2.2); return; }
      if (m.hs) this.audio.headshotKill(); else this.audio.kill();
      this.myStreak = m.kst || this.myStreak + 1;
      this.hud.setStreak(this.myStreak);
      void n;
    }
    if (!this.firstBlood && this.match && this.match.phase === 'live' && !suicide) {
      this.firstBlood = true;
      if (mine) { this.hud.announce('Primeiro abate!'); this.audio.announce(1); }
    }
  }

  // recompensa por abate (vida, munição, bônus de sequência, nível do Gun Game)
  onHeal(m) {
    const me = this.me;
    if (!me.alive) return;
    me.hp = m.hp; me.armor = m.ar; me.helmet = m.hm;
    const parts = [];
    if (m.healed > 0) parts.push(`+${m.healed} HP`);
    if (m.gun) {
      me.applyInventory(m.inv, m.nades, { primary: m.gun, secondary: m.gun });
      this.audio.levelUp();
      const last = m.gg >= GUNGAME_LIST.length - 1;
      this.hud.announce(last ? 'ÚLTIMO NÍVEL: FACA!' : `Nível ${m.gg + 1}: ${WEAPONS[m.gun].name}`);
    } else {
      me.refillInventory(m.inv, m.nades);
      if (this.matchSettings.killRefill && !this.matchSettings.infiniteAmmo) parts.push('munição');
    }
    const nn = { he: 'granada HE', flash: 'granada de luz', smoke: 'granada de fumaça', mine: 'mina' };
    if (m.bonus) { parts.push(`+1 ${nn[m.bonus]}`); this.hud.announce(`${m.mk === 3 ? 'Triple Kill' : 'Sequência de ' + m.mk}! +1 ${nn[m.bonus]}`); }
    if (m.bonus2) { parts.push('colete + capacete'); this.hud.announce(`Sequência de ${m.streak}! Colete completo`); this.audio.announce(3); }
    if (parts.length) { this.hud.toast(parts.join(' • '), 1.6); this.audio.heal(); }
    this.myStreak = m.streak; this.hud.setStreak(m.streak);
    this.hud.showSlots();
  }

  onNade(m) {
    this.effects.removeNade(m.id);
    const p = m.p;
    const cam = this.camera.position;
    const dist = Math.hypot(p[0] - cam.x, p[1] - cam.y, p[2] - cam.z);
    if (m.k === 'he' || m.k === 'mine') {
      if (m.k === 'mine') this.effects.removeMine(m.mid);
      this.effects.explosion(p, this.map.solid);
      this.audio.explosion(p, dist, m.k === 'mine');
      if (dist < 18) this.effects.shake = Math.max(this.effects.shake, (1 - dist / 18) * (m.k === 'mine' ? 1.9 : 1.5));
    } else if (m.k === 'flash') {
      this.effects.flashbang(p);
      this.audio.flashbang(p);
      // cegueira (calculada no cliente)
      const eye = [cam.x, cam.y, cam.z];
      if (dist < 40 && lineOfSight(eye, [p[0], p[1] + 0.1, p[2]], this.map.solid)) {
        const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
        const to = V(p[0] - cam.x, p[1] - cam.y, p[2] - cam.z).normalize();
        const dot = f.dot(to);
        const angF = dot > 0.6 ? 1 : dot > 0 ? 0.35 + dot : dot > -0.5 ? 0.2 : 0.08;
        const distF = Math.max(0.15, Math.min(1, 1.25 - dist / 30));
        const amount = Math.min(1, angF * distF * 1.15);
        const dur = GRENADE.flashMaxDuration * amount;
        if (amount > 0.05) { this.hud.flashbang(Math.min(1, amount * 1.1), dur); this.audio.tinnitus(amount, dur); }
      }
    } else if (m.k === 'smoke') {
      this.effects.smoke(m.id, p, 0);
      this.audio.smokePop(p);
    }
  }

  // ------------------------------------------------------------------ quadro
  flyover(t) {
    const a = t * 0.05;
    const B = this.map && this.map.bounds;
    const half = B ? Math.min(B.maxX - B.minX, B.maxZ - B.minZ) / 2 : 40;
    const r = Math.min(34, half * 0.8);
    this.camera.position.set(Math.cos(a) * r, (half < 30 ? 11 : 13) + Math.sin(t * 0.13) * 3, Math.sin(a) * r);
    this.camera.lookAt(Math.cos(a + 1.3) * 6, 2, Math.sin(a + 1.3) * 6);
    if (this.camera.fov !== settings.fov) { this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); }
  }

  updateNameTag(dt) {
    this.tagAcc += dt;
    if (this.tagAcc < 0.08) return;
    this.tagAcc = 0;
    const cam = this.camera.position;
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
    const o = [cam.x, cam.y, cam.z], d = [f.x, f.y, f.z];
    let best = null;
    for (const r of this.remotes.values()) {
      if (!r.alive || !r.model.root.visible || !r.visiblePos) continue;
      const crouch = r.state && (r.state.f & 1);
      const h = rayHitPlayer(o, d, 80, r.visiblePos.x, r.visiblePos.y, r.visiblePos.z, !!crouch);
      if (h && (!best || h.t < best.t)) best = { t: h.t, r };
    }
    let txt = '';
    if (best) {
      const wall = raycastWorld(o, d, best.t, this.map.solid);
      const end = V(o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t);
      if (!wall && !this.effects.smokeBlocks(cam.clone(), end)) txt = best.r.name;
    }
    const el = this.hud.el.nametag;
    const mate = best && txt && this.isMate(best.r.id);
    if (mate) txt = '● ' + txt + ' (aliado)';
    const enemyCol = txt && !mate && settings.playerId !== 'classic' ? ENEMY_COLOR : '';
    if (el.textContent !== txt || el.style.color !== (mate ? TEAMS[this.teamOf(best.r.id)].color : enemyCol)) { el.textContent = txt; el.style.color = mate ? TEAMS[this.teamOf(best.r.id)].color : enemyCol; }
  }

  updateSpotting(dt) {
    this.spotAcc += dt;
    if (this.spotAcc < 0.2) return;
    this.spotAcc = 0;
    const cam = this.camera.position;
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const now = performance.now() / 1000;
    for (const r of this.remotes.values()) {
      if (!r.alive || !r.visiblePos) continue;
      const head = r.visiblePos.clone().add(V(0, 1.4, 0));
      if (!frustum.containsPoint(head)) continue;
      if (cam.distanceTo(head) > 70) continue;
      if (!lineOfSight([cam.x, cam.y, cam.z], [head.x, head.y, head.z], this.map.solid)) continue;
      if (this.effects.smokeBlocks(cam.clone(), head)) continue;
      r.radarAt = now;
      r.seenAt = now;
    }
  }

  // Capture a Bandeira: alguém pegou, derrubou, devolveu ou capturou uma bandeira
  onFlag(m) {
    this.flags = m.fl;
    if (m.ts) this.teamScore = m.ts;
    const me = this.teamOf(this.myId);
    const who = m.id ? (m.id === this.myId ? 'Você' : this.pname(m.id)) : '';
    const ours = m.team === me; // a bandeira em questão é da minha equipe?
    const T = TEAMS[m.team] ? TEAMS[m.team].name : '';
    let text = '', good = false;
    if (m.ev === 'take') { good = !ours; text = m.id === this.myId ? 'Você pegou a bandeira! Leve até a sua base' : ours ? `${who} pegou a NOSSA bandeira!` : `${who} pegou a bandeira dos ${T}!`; }
    else if (m.ev === 'drop') { good = ours; text = ours ? 'A nossa bandeira caiu! Toque nela para devolver' : `A bandeira dos ${T} caiu!`; }
    else if (m.ev === 'return') { good = ours; text = m.id ? `${who} devolveu a bandeira dos ${T}` : `A bandeira dos ${T} voltou para a base`; }
    else if (m.ev === 'cap') { good = !ours; text = m.id === this.myId ? 'Você capturou a bandeira!' : ours ? `${who} capturou a nossa bandeira!` : `${who} capturou a bandeira! Ponto para a equipe!`; }
    if (text) this.hud.announce(text);
    this.audio.flag(m.ev, good);
  }

  // mostra a sala ou o jogo conforme o estado vindo do servidor
  syncRoomView() {
    const was = this.inRoom;
    this.inRoom = !!this.joined && this.room.inRoom();
    this.room.show(this.inRoom);
    this.hud.show(this.joined && !this.inRoom);
    if (this.inRoom && this.input.locked) { this.ignoreUnlock = true; this.input.unlock(); }
    if (was && !this.inRoom) this.audio.ui('start');
    this.audio.roomMusic(!this.joined || this.inRoom);
  }

  frame(tms) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, Math.max(0, (tms - this.last) / 1000));
    this.last = tms;
    this.clock += dt;
    // sala de espera: só o cenário de fundo, a no máximo 12 quadros por segundo
    if (this.inRoom) {
      this.roomFrameAcc += dt;
      if (this.roomFrameAcc < 1 / 12) return;
      this.flyover(this.clock);
      this.camera.updateMatrixWorld();
      this.world.update(this.clock, this.camera.position);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.roomFrameAcc = 0;
      this.input.endFrame();
      return;
    }
    const inp = this.input;
    const controls = this.joined && inp.locked && !this.menuOpen && !this.hud.chatOpen;
    $('clicktoplay').classList.toggle('hidden', !(this.joined && !inp.locked && !this.menuOpen && !this.hud.chatOpen && !this.inRoom));
    if (this.joined) {
      this.me.update(dt, inp, controls);
      const showSb = (controls || !inp.locked) && inp.held('scoreboard') && !this.menuOpen;
      if (showSb !== this.sbShown || (showSb && Math.floor(this.clock * 4) !== this.sbTick)) { this.hud.showScoreboard(showSb); this.sbShown = showSb; this.sbTick = Math.floor(this.clock * 4); }
    }
    const rt = this.renderTime();
    for (const r of this.remotes.values()) r.update(dt, rt, this.clock);
    let cam = false;
    if (this.joined) cam = this.me.applyCamera(this.camera, dt);
    if (!cam) this.flyover(this.clock);
    this.camera.updateMatrixWorld();
    if (this.joined) { this.updateNameTag(dt); this.updateSpotting(dt); }
    this.effects.update(dt, this.serverTime(), this.camera);
    this.flagView.update(this, dt, this.clock, this.camera.position);
    this.world.update(this.clock, this.camera.position);
    // arma em primeira pessoa
    const showVm = this.joined && this.me.alive;
    if (showVm) {
      const q = new THREE.Quaternion().setFromEuler(this.camera.rotation);
      this.viewmodel.update(dt, {
        speed: Math.hypot(this.me.ms.vel[0], this.me.ms.vel[2]), maxSpeed: this.me.maxSpeed(), onGround: this.me.ms.onGround,
        crouch: this.me.ms.ducked, mouseDX: controls ? inp.dx : 0, mouseDY: controls ? inp.dy : 0, aimQuat: q,
        sunDir: this.world.sun.position.clone().normalize(),
        light: this.world.lightAt ? this.world.lightAt(this.me.ms.pos[0], this.me.ms.pos[1] + 1.4, this.me.ms.pos[2], this.vmLight || (this.vmLight = { sky: 1, lamp: [0, 0, 0] })) : null,
      });
    }
    // áudio
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
    const up = V(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.audio.setListener(this.camera.position, f, up);
    this.smokeDensity = this.effects.smokeDensityAt(this.camera.position);
    if (this.joined) this.hud.update(dt);
    // render
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (showVm) { r.clearDepth(); r.render(this.viewmodel.scene, this.viewmodel.camera); }
    inp.endFrame();
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => { console.error(e); if (!document.getElementById('fatal').classList.contains('hidden')) return; game.fatal('Erro ao iniciar o jogo: ' + e.message); });
