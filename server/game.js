// Lógica da partida (servidor autoritativo): jogadores, tiros com
// compensação de latência, dano por parte do corpo, granadas, renascimento,
// placar, critérios de desempate e bots.
import { performance } from 'node:perf_hooks';
import { WEAPONS, PRIMARIES, SECONDARIES, WEAPON_INDEX, cycleTime } from '../shared/weapons.js';
import { DAMAGE_SCALE, PLAYER, NET, GRENADE, MINE, DEFAULT_MATCH, MATCH_LIMITS, CHARACTERS, HIT_ZONES, FLAG, clamp, VERSION, GAME_NAME, TEAMS, TEAM_CODE, GUNGAME_LIST, HALF_STEP_KEYS, MODE_IDS, isTeamModeId, CTF } from '../shared/constants.js';
import { getMap, MAP_LIST } from '../shared/maps.js';
import { SOUND_PACK_IDS } from '../shared/sounds.js';
import { floorHeightAt, createGrenadeSim, stepGrenade, lineOfSight, playerCenter, playerHead, eyeHeight, raycastWorld, makeRng } from '../shared/physics.js';
import { traceBullet, rawDamage, applyArmor } from '../shared/combat.js';
import { NavGrid } from './nav.js';
import { BotBrain, BOT_NAMES } from './bots.js';

const now = () => performance.now() / 1000;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const isVec3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
function norm(d) {
  if (!isVec3(d)) return null;
  const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  return l > 1e-6 ? [d[0] / l, d[1] / l, d[2] / l] : null;
}
function dist3(a, b) { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }

const CHAR_IDS = CHARACTERS.map((c) => c.id);
// regras definidas na sala de espera (travadas durante a partida)
export const LOBBY_KEYS = ['mode', 'map', 'endCondition', 'timeLimitMin', 'killLimit', 'teamKillLimit', 'captureLimit'];
const SIDE_IDS = ['any', 'north', 'south'];

export function sanitizeSettings(src, base = DEFAULT_MATCH) {
  const s = { ...base };
  if (!src || typeof src !== 'object') return s;
  for (const [k, [a, b]] of Object.entries(MATCH_LIMITS)) {
    if (k in src && Number.isFinite(+src[k])) {
      const v = HALF_STEP_KEYS.includes(k) ? Math.round(+src[k] * 2) / 2 : Math.round(+src[k]);
      s[k] = clamp(v, a, b);
    }
  }
  if (['time', 'kills', 'both'].includes(src.endCondition)) s.endCondition = src.endCondition;
  if (['stats', 'sudden'].includes(src.tiebreak)) s.tiebreak = src.tiebreak;
  if (['easy', 'normal', 'hard'].includes(src.botDifficulty)) s.botDifficulty = src.botDifficulty;
  if (SOUND_PACK_IDS.includes(src.soundPack)) s.soundPack = src.soundPack;
  if (MAP_LIST.some((m) => m.id === src.map)) s.map = src.map;
  if (MODE_IDS.includes(src.mode)) s.mode = src.mode;
  if (['action', 'safe'].includes(src.spawnMode)) s.spawnMode = src.spawnMode;
  for (const k of ['armor', 'helmet', 'infiniteAmmo', 'headshotOnly', 'friendlyFireSelf', 'friendlyFire', 'killRefill', 'streakBonus']) {
    if (k in src) s[k] = !!src[k];
  }
  return s;
}

function cleanText(t, max) {
  return String(t ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
}

export class Game {
  constructor(config) {
    this.config = config;
    this.maxPlayers = clamp(config.maxPlayers || 16, 2, 32);
    this.settings = sanitizeSettings(config.match || {});
    this.players = new Map();
    this.lobby = new Set();
    this.nextId = 1;
    this.joinCounter = 0;
    this.hostId = null;
    this.grenades = new Map();
    this.nextGrenadeId = 1;
    this.smokes = [];
    this.mines = new Map();
    this.nextMineId = 1;
    this.tickCount = 0;
    this.rand = makeRng(Date.now() & 0xffffffff);
    this.phase = 'room';   // 'room' (sala de espera) | 'live' | 'ended'
    this.phaseStartedAt = now();
    this.endsAt = 0;
    this.suddenDeath = false;
    this.suddenEndsAt = 0;
    this.warmupAutoAt = 0;
    this.result = null;
    this.tscore = { ct: 0, tr: 0 };
    this.afterMatch = false;
    this.loadMap(this.settings.map);
  }

  loadMap(id) {
    this.map = getMap(id);
    this.nav = new NavGrid(this.map, 1);
  }

  // ------------------------------------------------------------------ rede
  send(p, obj) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(obj));
  }
  broadcast(obj, exceptId) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.bot || p.id === exceptId) continue;
      if (p.ws && p.ws.readyState === 1) p.ws.send(s);
    }
  }
  sendInfo(ws) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({
      t: 'info', name: this.config.serverName || GAME_NAME, version: VERSION,
      players: [...this.players.values()].map((p) => ({ name: p.name, bot: p.bot })),
      max: this.maxPlayers, settings: this.settings, phase: this.phase, map: this.map.id,
      ips: this.config.ips || [], port: this.config.port,
    }));
  }
  updateLobby() { for (const ws of this.lobby) this.sendInfo(ws); }
  system(msg) { this.broadcast({ t: 'chat', sys: true, m: msg }); }

  onConnection(ws) {
    this.lobby.add(ws);
    this.sendInfo(ws);
  }
  onClose(ws) {
    this.lobby.delete(ws);
    const p = ws.player;
    if (p) this.removePlayer(p, 'saiu');
  }

  onMessage(ws, m) {
    if (!m || typeof m.t !== 'string') return;
    const p = ws.player;
    if (!p) {
      if (m.t === 'hello') this.join(ws, m);
      else if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', c: m.c, s: now() }));
      return;
    }
    switch (m.t) {
      case 'u': this.onState(p, m); break;
      case 'f': this.onFire(p, m); break;
      case 'k': if (p.alive && p.weapon === 'knife') this.playerKnife(p, m.m ? 1 : 0, norm(m.d), this.clampRt(m.rt)); break;
      case 'g': this.playerThrow(p, m.k, m.o, m.v, m.cid | 0); break;
      case 'mine': this.playerPlaceMine(p); break;
      case 'ready': this.onReady(p, !!m.v); break;
      case 'team': this.onTeamPick(p, m.v); break;
      case 'enter': this.onEnter(p); break;
      case 'r': this.playerReload(p); break;
      case 'sw': this.playerSwitch(p, m.w); break;
      case 'lo': this.onLoadout(p, m); break;
      case 'chat': this.onChat(p, m.m, !!m.team); break;
      case 'radio': this.onRadio(p, m.i); break;
      case 'cfg': this.onConfig(p, m.s, !!m.restart); break;
      case 'cmd': this.onCommand(p, m.c); break;
      case 'ping':
        if (Number.isFinite(m.rtt)) p.ping = Math.round(clamp(m.rtt, 0, 2) * 1000);
        this.send(p, { t: 'pong', c: m.c, s: now() });
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------ jogadores
  uniqueName(name) {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let n = name, i = 2;
    while (taken.has(n.toLowerCase())) n = `${name.slice(0, 13)}(${i++})`;
    return n;
  }

  createPlayer(o) {
    const t = now();
    const p = {
      id: this.nextId++, ws: o.ws || null, bot: !!o.bot,
      name: this.uniqueName(o.name), char: o.char, primary: o.primary, secondary: o.secondary, side: o.side,
      joinOrder: this.joinCounter++, joinedAt: t,
      alive: false, lifeId: 0, respawnAt: t + 0.3,
      pos: [0, 0, 0], vel: [0, 0, 0], yaw: 0, pitch: 0, crouch: false, onGround: true, walk: false, scoped: false,
      weapon: 'knife', inv: {}, nades: { he: 0, flash: 0, smoke: 0, mine: 0 },
      hp: 100, armor: 0, helmet: false, protectedUntil: 0,
      lastShot: {}, lastKnife: 0, lastThrow: -10, reloading: null, deployUntil: 0, lastShotAt: 0,
      stats: { kills: 0, deaths: 0, hs: 0, dmg: 0, suicides: 0, score: 0, lastScoreAt: 0, shots: 0, hits: 0 },
      history: [], ping: 0, lastUpdateAt: t, blindUntil: 0, lastAttacker: null,
      team: null, streak: 0, gg: 0,
      pick: o.pick || null,  // time escolhido na sala ('ct' | 'tr' | null = automático)
      ready: !!o.bot,       // clicou em "pronto" na sala (bots sempre prontos)
      waiting: !o.bot,      // está na sala, fora da partida
    };
    this.players.set(p.id, p);
    return p;
  }

  publicPlayer(p) {
    return {
      id: p.id, name: p.name, char: p.char, bot: p.bot, alive: p.alive, primary: p.primary, secondary: p.secondary,
      team: p.team, st: this.statsRow(p),
    };
  }
  statsRow(p) {
    const s = p.stats;
    return [p.id, s.score, s.kills, s.deaths, s.hs, Math.round(s.dmg), p.bot ? -1 : p.ping, p.alive ? 1 : 0, TEAM_CODE[p.team] || 0, p.streak, p.gg, s.caps || 0];
  }

  join(ws, m) {
    const humans = [...this.players.values()].filter((p) => !p.bot).length;
    if (this.players.size >= this.maxPlayers) {
      // remove um bot para abrir vaga para humanos
      const bot = [...this.players.values()].reverse().find((p) => p.bot);
      if (bot && humans < this.maxPlayers) this.removePlayer(bot, 'saiu para liberar vaga');
      else { ws.send(JSON.stringify({ t: 'err', m: 'Servidor cheio.' })); return; }
    }
    const name = cleanText(m.name, 16) || 'Jogador';
    const p = this.createPlayer({
      ws, name,
      char: CHAR_IDS.includes(m.char) ? m.char : CHAR_IDS[0],
      primary: PRIMARIES.includes(m.primary) ? m.primary : 'ak47',
      secondary: SECONDARIES.includes(m.secondary) ? m.secondary : 'glock',
      side: SIDE_IDS.includes(m.side) ? m.side : 'any',
      pick: m.side === 'north' ? 'ct' : m.side === 'south' ? 'tr' : null,
    });
    ws.player = p;
    this.lobby.delete(ws);
    this.assignTeam(p);
    if (this.hostId === null) this.hostId = p.id;
    this.send(p, {
      t: 'welcome', id: p.id, host: this.hostId, st: now(), name: p.name,
      map: this.map.id, settings: this.settings, match: this.matchState(),
      players: [...this.players.values()].map((q) => this.publicPlayer(q)),
      smokes: this.smokes.map((s) => ({ id: s.id, p: s.p, age: now() - s.start })),
      mines: [...this.mines.values()].map((mi) => this.minePublic(mi)),
      maps: MAP_LIST,
    });
    this.broadcast({ t: 'join', p: this.publicPlayer(p) }, p.id);
    this.system(this.phase === 'room' ? `${p.name} entrou na sala.` : `${p.name} entrou (está na sala).`);
    if (humans === 0) this.goRoom(true); // primeiro humano: abre a sala
    this.syncBots();
    // com os bots já ajustados, confirma o time de quem entrou sem escolher
    if (this.isTeamMode() && !p.pick) { p.team = null; this.assignTeam(p); this.rebalanceBots(); }
    this.broadcastRoom();
    this.updateLobby();
  }

  removePlayer(p, why) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    if (p.ws) p.ws.player = null;
    this.broadcast({ t: 'leave', id: p.id });
    for (const mi of [...this.mines.values()]) if (mi.owner === p.id) this.removeMine(mi);
    if (!p.bot || why) this.system(`${p.name} ${why || 'saiu'}.`);
    if (this.hostId === p.id) {
      const next = [...this.players.values()].filter((q) => !q.bot).sort((a, b) => a.joinOrder - b.joinOrder)[0];
      this.hostId = next ? next.id : null;
      if (next) { this.broadcast({ t: 'host', id: next.id }); this.system(`${next.name} agora é o anfitrião.`); }
    }
    const humans = [...this.players.values()].filter((q) => !q.bot).length;
    if (humans === 0) {
      for (const b of [...this.players.values()]) this.players.delete(b.id);
      this.grenades.clear(); this.smokes = []; this.mines.clear();
      this.setPhase('room');
      this.warmupAutoAt = 0;
    } else if (!p.bot) this.syncBots();
    else this.rebalanceBots();
    if (humans) this.broadcastRoom();
    this.updateLobby();
  }

  addBot() {
    const used = new Set([...this.players.values()].map((p) => p.name));
    let base = BOT_NAMES.find((n) => !used.has('BOT ' + n)) || BOT_NAMES[Math.floor(this.rand() * BOT_NAMES.length)];
    const prim = ['ak47', 'm4a1', 'ak47', 'm4a1', 'galil', 'famas', 'p90', 'aug', 'awp', 'ump45', 'mp5sd', 'mac10', 'ssg08', 'xm1014', 'nova', 'm249'];
    const p = this.createPlayer({
      bot: true, name: 'BOT ' + base,
      char: CHAR_IDS[Math.floor(this.rand() * CHAR_IDS.length)],
      primary: prim[Math.floor(this.rand() * prim.length)],
      secondary: SECONDARIES[Math.floor(this.rand() * SECONDARIES.length)],
      side: 'any',
    });
    p.brain = new BotBrain(this, p, this.settings.botDifficulty);
    this.assignTeam(p);
    this.broadcast({ t: 'join', p: this.publicPlayer(p) });
    return p;
  }

  // bots "de preenchimento": completam a partida até N jogadores no total
  syncBots() {
    const humans = [...this.players.values()].filter((p) => !p.bot).length;
    if (humans === 0) return;
    const bots = [...this.players.values()].filter((p) => p.bot);
    const want = Math.max(0, this.settings.bots - humans);
    while (bots.length < want && this.players.size < this.maxPlayers) bots.push(this.addBot());
    while (bots.length > want) {
      // sai um bot do time maior (mantém as equipes equilibradas)
      let i = bots.length - 1;
      if (this.isTeamMode()) {
        const big = this.teamCount('ct') >= this.teamCount('tr') ? 'ct' : 'tr';
        const j = bots.findLastIndex((b) => b.team === big);
        if (j >= 0) i = j;
      }
      this.removePlayer(bots.splice(i, 1)[0], '');
    }
    for (const b of bots) b.brain.setDifficulty(this.settings.botDifficulty);
    this.rebalanceBots();
  }

  // equipes desequilibradas (alguém saiu): bots trocam de lado no próximo renascimento
  rebalanceBots() {
    if (!this.isTeamMode()) return;
    const n = () => ({ ct: this.teamCount('ct'), tr: this.teamCount('tr') });
    let c = n();
    for (let guard = 0; guard < 16 && Math.abs(c.ct - c.tr) > 1; guard++) {
      const big = c.ct > c.tr ? 'ct' : 'tr', small = big === 'ct' ? 'tr' : 'ct';
      const bot = [...this.players.values()].filter((q) => q.bot && q.team === big).sort((a, b) => a.alive - b.alive)[0];
      if (!bot) break;
      bot.team = small;
      if (bot.alive) { bot.alive = false; bot.respawnAt = now() + 0.5; this.broadcast({ t: 'kill', k: bot.id, v: bot.id, w: 'swap', sw: 1, ks: null, vs: this.statsRow(bot), rs: 0.5 }); }
      c = n();
    }
  }

  // ------------------------------------------------------------ equipes
  isTeamMode() { return isTeamModeId(this.settings.mode); }
  isCtf() { return this.settings.mode === 'ctf'; }
  teamCount(team, except) { let n = 0; for (const q of this.players.values()) if (q !== except && q.team === team) n++; return n; }
  // escolhe a equipe: lado preferido (norte = CT, sul = TR) se não desequilibrar, senão a menor
  assignTeam(p) {
    if (!this.isTeamMode()) { p.team = null; return; }
    if (p.pick) { p.team = p.pick; return; }   // escolheu o time na sala
    const ct = this.teamCount('ct', p), tr = this.teamCount('tr', p);
    const pref = p.side === 'north' ? 'ct' : p.side === 'south' ? 'tr' : null;
    if (pref && (pref === 'ct' ? ct <= tr : tr <= ct)) p.team = pref;
    else if (pref && Math.abs(ct - tr) < 1) p.team = pref;
    else p.team = ct <= tr ? 'ct' : 'tr';
  }
  balanceTeams() {
    if (!this.isTeamMode()) { for (const q of this.players.values()) q.team = null; return; }
    const list = [...this.players.values()].sort((a, b) => (a.bot - b.bot) || (a.joinOrder - b.joinOrder));
    for (const q of list) q.team = null;
    for (const q of list) this.assignTeam(q);
  }
  enemiesOf(p) { return [...this.players.values()].filter((q) => q !== p && q.alive && !(this.isTeamMode() && q.team && q.team === p.team)); }
  sameTeam(a, b) { return this.isTeamMode() && a !== b && a.team && a.team === b.team; }
  teamScores() {
    const t = { ct: 0, tr: 0 };
    for (const q of this.players.values()) if (q.team) t[q.team] = (t[q.team] || 0) + q.stats.score;
    return t;
  }

  // ------------------------------------------------------------ renascer
  giveLoadout(p) {
    const inf = this.settings.infiniteAmmo;
    p.inv = { knife: { mag: 0, res: 0 } };
    if (this.settings.mode === 'gungame') {
      const gun = GUNGAME_LIST[Math.min(p.gg, GUNGAME_LIST.length - 1)];
      if (gun !== 'knife') { const w = WEAPONS[gun]; p.inv[gun] = { mag: w.mag, res: 999 }; }
      p.nades = { he: 0, flash: 0, smoke: 0, mine: 0 };
      p.weapon = gun;
      p.ggWeapon = gun;
      p.reloading = null;
      p.lastShot = {};
      return;
    }
    for (const wid of [p.primary, p.secondary]) {
      const w = WEAPONS[wid];
      p.inv[wid] = { mag: w.mag, res: inf ? 999 : w.reserve };
    }
    p.nades = { he: this.settings.heGrenades, flash: this.settings.flashGrenades, smoke: this.settings.smokeGrenades, mine: this.settings.mines };
    p.weapon = p.primary;
    p.reloading = null;
    p.lastShot = {};
  }

  pickSpawn(p) {
    const all = this.map.spawns.filter((s) => !s.blocked);
    let side = p.side;
    if (this.isTeamMode() && p.team) side = TEAMS[p.team].side;
    let cand = side === 'any' ? all : all.filter((s) => s.side === side);
    // perto da ação: em FFA/Gun Game com lado "qualquer", também usa os pontos das bases
    if (!cand.length) cand = all;
    const enemies = this.enemiesOf(p);
    const mates = this.isTeamMode() ? [...this.players.values()].filter((q) => q !== p && q.alive && q.team === p.team) : [];
    const action = this.settings.spawnMode === 'action';
    let best = cand[0], bestScore = -Infinity;
    for (const s of cand) {
      let minD = 80;
      let visible = false;
      const head = [s.x, s.y + PLAYER.eyeHeight, s.z];
      for (const q of enemies) {
        const d = Math.hypot(q.pos[0] - s.x, q.pos[2] - s.z, q.pos[1] - s.y);
        if (d < minD) minD = d;
        if (!visible && d < 50) {
          const eye = [q.pos[0], q.pos[1] + eyeHeight(q.crouch), q.pos[2]];
          if (lineOfSight(eye, head, this.map.solid)) visible = true;
        }
      }
      const crowded = [...enemies, ...mates].some((q) => Math.hypot(q.pos[0] - s.x, q.pos[2] - s.z) < 1.2);
      let score;
      if (action && enemies.length) {
        // nem colado nem longe: idealmente a ~16 m do inimigo mais próximo, fora da vista dele
        score = -Math.abs(minD - 16) * (minD < 9 ? 3 : 1) - (visible ? 25 : 0);
      } else score = minD - (visible ? 30 : 0);
      score += -(crowded ? 100 : 0) + this.rand() * 5;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  spawnPlayer(p) {
    const t = now();
    if (this.isTeamMode() && (p.reteam || p.forceTeam)) {
      if (p.forceTeam) p.team = p.forceTeam; else this.assignTeam(p);
      p.reteam = false; p.forceTeam = null;
    }
    p.streak = 0;
    const s = this.pickSpawn(p);
    p.lifeId++;
    p.alive = true;
    p.pos = [s.x, s.y, s.z];
    p.vel = [0, 0, 0];
    p.yaw = s.yaw; p.pitch = 0;
    p.crouch = false; p.scoped = false; p.onGround = true;
    p.hp = PLAYER.maxHealth;
    p.armor = this.settings.armor ? PLAYER.maxArmor : 0;
    p.helmet = this.settings.armor && this.settings.helmet;
    p.protectedUntil = t + this.settings.spawnProtection;
    this.giveLoadout(p);
    p.history = [];
    p.lastUpdateAt = t;
    p.blindUntil = 0;
    p.deployUntil = t + 0.3;
    p.respawnAt = 0;
    p.lastAttacker = null;
    if (p.bot) p.brain.onSpawn();
    const inv = {};
    for (const [k, v] of Object.entries(p.inv)) inv[k] = [v.mag, v.res];
    this.broadcast({
      t: 'spawn', id: p.id, p: [r3(s.x), r3(s.y), r3(s.z)], y: r3(s.yaw), s: p.lifeId,
      hp: p.hp, ar: p.armor, hm: p.helmet, prot: this.settings.spawnProtection, team: p.team, gg: p.gg,
      lo: { primary: p.primary, secondary: p.secondary, char: p.char }, inv, nades: p.nades,
    });
  }

  // ------------------------------------------------------------ estado
  onState(p, m) {
    if (!p.alive || m.s !== p.lifeId) return;
    if (!isVec3(m.p)) return;
    const t = now();
    const dt = Math.max(0.016, t - p.lastUpdateAt);
    const dh = Math.hypot(m.p[0] - p.pos[0], m.p[2] - p.pos[2]);
    const dv = Math.abs(m.p[1] - p.pos[1]);
    const b = this.map.bounds;
    const out = m.p[0] < b.minX - 1 || m.p[0] > b.maxX + 1 || m.p[2] < b.minZ - 1 || m.p[2] > b.maxZ + 1 || m.p[1] < -2 || m.p[1] > 20;
    if (out || dh > 13 * dt + 1.5 || dv > 25 * dt + 2.0) {
      this.send(p, { t: 'pos', p: p.pos, s: p.lifeId });
      p.lastUpdateAt = t;
      return;
    }
    p.pos = [m.p[0], m.p[1], m.p[2]];
    if (isVec3(m.v)) p.vel = m.v;
    if (Number.isFinite(m.y)) p.yaw = m.y;
    if (Number.isFinite(m.pi)) p.pitch = clamp(m.pi, -1.57, 1.57);
    const f = m.f | 0;
    p.crouch = !!(f & FLAG.CROUCH);
    p.onGround = !!(f & FLAG.GROUND);
    p.walk = !!(f & FLAG.WALK);
    const w = WEAPONS[p.weapon];
    p.scoped = !!(f & FLAG.SCOPED) && !!(w && w.scope);
    p.lastUpdateAt = t;
  }

  // ------------------------------------------------------------ armas
  clampRt(rt) {
    const t = now();
    if (!Number.isFinite(rt)) return t;
    return clamp(rt, t - NET.maxRewind, t);
  }

  hasWeapon(p, wid) {
    const w = WEAPONS[wid];
    if (!w) return false;
    if (w.type === 'grenade') return p.nades[wid] > 0;
    return !!p.inv[wid];
  }

  playerSwitch(p, wid) {
    if (!p.alive || !this.hasWeapon(p, wid) || p.weapon === wid) return;
    p.weapon = wid;
    p.reloading = null;
    p.scoped = false;
    p.deployUntil = now() + WEAPONS[wid].deploy;
  }

  playerReload(p) {
    if (!p.alive) return;
    const w = WEAPONS[p.weapon];
    const slot = p.inv[p.weapon];
    if (!w || !slot || !w.mag || p.reloading) return;
    if (slot.mag >= w.mag) return;
    if (slot.res <= 0 && !this.settings.infiniteAmmo) return;
    const t = now();
    p.reloading = { weapon: p.weapon, start: t, loaded: 0, end: t + (w.shellReload ? w.reloadStart + w.reload * (w.mag - slot.mag) : w.reload) };
    p.scoped = false;
  }

  updateReload(p, t) {
    const r = p.reloading;
    if (!r) return;
    if (r.weapon !== p.weapon) { p.reloading = null; return; }
    const w = WEAPONS[r.weapon], slot = p.inv[r.weapon];
    const inf = this.settings.infiniteAmmo;
    if (w.shellReload) {
      const total = Math.floor((t - r.start - w.reloadStart) / w.reload + 0.25);
      while (r.loaded < total && slot.mag < w.mag && (slot.res > 0 || inf)) {
        slot.mag++; if (!inf) slot.res--; r.loaded++;
      }
      if (slot.mag >= w.mag || (slot.res <= 0 && !inf)) p.reloading = null;
    } else if (t >= r.end - 0.2) {
      const need = w.mag - slot.mag;
      const take = inf ? need : Math.min(need, slot.res);
      slot.mag += take;
      if (!inf) slot.res -= take;
      p.reloading = null;
    }
  }

  sendAmmo(p, wid) {
    const s = p.inv[wid];
    if (s && !p.bot) this.send(p, { t: 'ammo', w: wid, m: s.mag, r: s.res });
  }

  onFire(p, m) {
    if (!p.alive) return;
    const dirs = Array.isArray(m.d) ? m.d.map(norm).filter(Boolean) : [];
    if (!dirs.length || !isVec3(m.o)) return;
    this.fireCommon(p, m.w, m.o, dirs, this.clampRt(m.rt));
  }

  botFire(p, wid, origin, dirs) {
    return this.fireCommon(p, wid, origin, dirs, now());
  }

  fireCommon(p, wid, origin, dirs, rt) {
    const t = now();
    const w = WEAPONS[wid];
    if (!w || !w.mag || !p.inv[wid]) return false;
    if (this.phase === 'ended') return false;
    if (p.weapon !== wid) this.playerSwitch(p, wid);
    if (t < p.deployUntil - 0.25) return false;
    this.updateReload(p, t);
    if (p.reloading) {
      if (w.shellReload) p.reloading = null;
      else { this.sendAmmo(p, wid); return false; }
    }
    const slot = p.inv[wid];
    let cyc = cycleTime(w);
    if (p.scoped && w.scope && w.scope.fireRateMult) cyc /= w.scope.fireRateMult;
    if (t - (p.lastShot[wid] ?? -10) < cyc * 0.7) return false;
    if (slot.mag <= 0) { this.sendAmmo(p, wid); return false; }
    // origem precisa estar perto dos olhos do jogador
    const eye = [p.pos[0], p.pos[1] + eyeHeight(p.crouch), p.pos[2]];
    let o = origin;
    if (dist3(o, eye) > 1.6) o = eye;
    slot.mag--;
    p.lastShot[wid] = t;
    p.lastShotAt = t;
    p.protectedUntil = 0;
    p.stats.shots++;
    if (w.scope && w.scope.unscopeOnFire) p.scoped = false;
    const n = Math.min(dirs.length, w.pellets || 1);
    const targets = this.rewindTargets(p.id, rt);
    const ends = [];
    const perVictim = new Map();
    for (let i = 0; i < n; i++) {
      const d = dirs[i];
      const r = traceBullet(o, d, w, this.map.solid, targets, p.id);
      if (this.mines.size) this.shootMines(o, d, r.t, p);
      if (process.env.DEBUG_SHOTS && !p.bot) console.log('[tiro]', p.name, 'rt-agora=', (rt - now()).toFixed(3), 'o=', o.map((v) => v.toFixed(2)).join(','), 'd=', d.map((v) => v.toFixed(3)).join(','), 'alvos=', JSON.stringify(targets.map((tg) => [tg.id, +tg.x.toFixed(2), +tg.y.toFixed(2), +tg.z.toFixed(2)])), '=>', r.kind, r.t.toFixed(2), r.box ? r.box.mat + '#' + r.box.id : '');
      const e = [r3(r.end[0]), r3(r.end[1]), r3(r.end[2])];
      if (r.kind === 'player') {
        e.push(1);
        const smoke = this.smokeBlocks(o, r.end);
        const list = perVictim.get(r.target.id) || [];
        list.push({ zone: r.zone, dmg: rawDamage(w, r.zone, r.t, r.penFactor), pen: r.penFactor < 1, smoke });
        perVictim.set(r.target.id, list);
      } else if (r.kind === 'wall') {
        e.push(0, r.axis * 2 + (r.sign > 0 ? 1 : 0));
      } else e.push(2);
      ends.push(e);
    }
    this.broadcast({ t: 'fx', id: p.id, w: wid, o: [r3(o[0]), r3(o[1]), r3(o[2])], e: ends }, p.bot ? undefined : p.id);
    for (const [vid, hits] of perVictim) {
      const v = this.players.get(vid);
      if (v) this.applyHits(p, v, hits, w, o);
    }
    return true;
  }

  rewindTargets(shooterId, rt) {
    const out = [];
    const t = now();
    for (const q of this.players.values()) {
      if (q.id === shooterId || !q.alive) continue;
      let st = { x: q.pos[0], y: q.pos[1], z: q.pos[2], c: q.crouch };
      const h = q.history;
      if (h.length && rt < t - 0.002) {
        if (rt <= h[0].t) st = h[0];
        else if (rt < h[h.length - 1].t) {
          let i = h.length - 2;
          while (i > 0 && h[i].t > rt) i--;
          const a = h[i], b = h[i + 1];
          const k = (rt - a.t) / Math.max(1e-6, b.t - a.t);
          st = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: k < 0.5 ? a.c : b.c, yaw: b.yaw };
        } else st = h[h.length - 1];
      }
      out.push({ id: q.id, x: st.x, y: st.y, z: st.z, crouch: st.c, yaw: st.yaw ?? q.yaw });
    }
    return out;
  }

  isProtected(p) { return now() < p.protectedUntil; }

  // aplica uma lista de impactos (vários bagos de escopeta somados)
  applyHits(attacker, victim, hits, w, origin) {
    if (!victim.alive || this.phase === 'ended') return;
    const ff = this.sameTeam(attacker, victim);
    if (ff && !this.settings.friendlyFire) return;
    if (this.isProtected(victim)) {
      this.send(attacker, { t: 'hit', v: victim.id, dmg: 0, prot: 1 });
      return;
    }
    let total = 0, zoneBest = null, killZone = null, pen = false, smoke = false;
    for (const h of hits) {
      if (!victim.alive) break;
      if (this.settings.headshotOnly && h.zone !== 'head') continue;
      const { health, armorLoss } = applyArmor(ff ? h.dmg * 0.5 : h.dmg, w.armorPen, victim.armor, victim.helmet, h.zone);
      const dmg = Math.max(1, Math.floor(health));
      victim.armor = Math.max(0, victim.armor - Math.round(armorLoss));
      const dealt = Math.min(victim.hp, dmg);
      victim.hp -= dmg;
      total += dealt;
      if (!zoneBest || HIT_ZONES[h.zone].mult > HIT_ZONES[zoneBest].mult) zoneBest = h.zone;
      if (h.pen) pen = true;
      if (h.smoke) smoke = true;
      if (victim.hp <= 0) { killZone = h.zone; break; }
    }
    if (!zoneBest) return;
    attacker.stats.dmg += total;
    attacker.stats.hits++;
    victim.lastAttacker = attacker.id;
    const killed = victim.hp <= 0;
    this.send(attacker, { t: 'hit', v: victim.id, dmg: total, z: zoneBest, k: killed ? 1 : 0, hm: victim.helmet && zoneBest === 'head' ? 1 : 0 });
    this.send(victim, { t: 'hurt', a: attacker.id, dmg: total, hp: Math.max(0, victim.hp), ar: victim.armor, z: zoneBest, from: [r2(origin[0]), r2(origin[1]), r2(origin[2])] });
    if (killed) {
      const air = !attacker.onGround;
      const ns = w.type === 'sniper' && !attacker.scoped;
      this.killPlayer(victim, attacker, w.id, { hs: killZone === 'head', pen, smoke, air, ns });
    }
  }

  playerKnife(p, mode, dir, rt) {
    if (!p.alive || !dir || this.phase === 'ended') return;
    const t = now();
    const w = WEAPONS.knife;
    const cfg = mode ? w.stab : w.slash;
    if (t - p.lastKnife < cfg.rate * 0.8 || t < p.deployUntil - 0.2) return;
    p.lastKnife = t;
    p.protectedUntil = 0;
    const eye = [p.pos[0], p.pos[1] + eyeHeight(p.crouch), p.pos[2]];
    let best = null;
    for (const tg of this.rewindTargets(p.id, rt)) {
      const tq = this.players.get(tg.id);
      if (tq && this.sameTeam(p, tq) && !this.settings.friendlyFire) continue;
      const hb = playerCenter(tg.x, tg.y, tg.z, tg.crouch);
      // ponto do corpo mais próximo da linha de visão
      const topY = tg.y + (tg.crouch ? 1.3 : 1.75);
      const ty = clamp(eye[1] + dir[1] * 1.0, tg.y + 0.2, topY);
      const tx = tg.x - eye[0], tz = tg.z - eye[2];
      const hd = Math.sqrt(tx * tx + tz * tz);
      const reach = hd - 0.32;
      if (reach > cfg.range) continue;
      const v = [tx, ty - eye[1], tz];
      const vl = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
      const cos = (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / vl;
      if (cos < Math.cos((hd < 0.9 ? 60 : 32) * Math.PI / 180)) continue;
      if (!lineOfSight(eye, hb, this.map.solid)) continue;
      if (!best || hd < best.hd) best = { tg, hd };
    }
    this.broadcast({ t: 'kn', id: p.id, m: mode, h: best ? 1 : 0 }, p.id);
    if (!best) return;
    const v = this.players.get(best.tg.id);
    if (!v || !v.alive) return;
    // facada pelas costas?
    const fyaw = best.tg.yaw ?? v.yaw;
    const vf = [-Math.sin(fyaw), -Math.cos(fyaw)];
    const ax = v.pos[0] - p.pos[0], az = v.pos[2] - p.pos[2];
    const al = Math.hypot(ax, az) || 1;
    const back = (vf[0] * ax + vf[1] * az) / al > 0.5;
    const dmg = (back ? cfg.back : cfg.damage) * DAMAGE_SCALE;
    const kw = { ...w, armorPen: 0.85 };
    this.applyHits(p, v, [{ zone: 'chest', dmg }], kw, eye);
  }

  playerThrow(p, kind, o, v, cid) {
    if (!p.alive || !['he', 'flash', 'smoke'].includes(kind) || this.phase === 'ended') return;
    if (!isVec3(o) || !isVec3(v)) return;
    const t = now();
    if (p.nades[kind] <= 0 || t - p.lastThrow < 0.45) return;
    const eye = [p.pos[0], p.pos[1] + eyeHeight(p.crouch), p.pos[2]];
    let origin = o;
    if (dist3(origin, eye) > 1.2) origin = eye;
    // não deixa a granada nascer dentro de uma parede
    const dd = [origin[0] - eye[0], origin[1] - eye[1], origin[2] - eye[2]];
    const dl = Math.sqrt(dd[0] ** 2 + dd[1] ** 2 + dd[2] ** 2);
    if (dl > 0.01) {
      const hit = raycastWorld(eye, [dd[0] / dl, dd[1] / dl, dd[2] / dl], dl + GRENADE.radius + 0.05, this.map.solid);
      if (hit) {
        const k = Math.max(0, hit.t - GRENADE.radius - 0.08);
        origin = [eye[0] + dd[0] / dl * k, eye[1] + dd[1] / dl * k, eye[2] + dd[2] / dl * k];
      }
    }
    const sp = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    const maxSp = GRENADE.throwSpeedStrong + 14;
    const vel = sp > maxSp ? v.map((c) => c * maxSp / sp) : v;
    p.nades[kind]--;
    p.lastThrow = t;
    p.protectedUntil = 0;
    const id = this.nextGrenadeId++;
    const g = { id, kind, owner: p.id, sim: createGrenadeSim(origin, vel), st: t };
    this.grenades.set(id, g);
    this.broadcast({ t: 'gt', id, k: kind, o: origin.map(r3), v: vel.map(r3), by: p.id, st: r3(t), cid });
    // volta para a arma principal quando acabar
    if (p.nades[kind] <= 0) {
      const next = ['he', 'flash', 'smoke', 'mine'].find((k) => p.nades[k] > 0);
      p.weapon = next || (p.inv[p.primary] ? p.primary : 'knife');
      p.deployUntil = t + 0.4;
    }
  }

  // ------------------------------------------------------------ granadas
  smokeBlocks(a, b) {
    if (!this.smokes.length) return false;
    const t = now();
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len2 = dx * dx + dy * dy + dz * dz;
    for (const s of this.smokes) {
      const age = t - s.start;
      if (age < 0.8 || s.end - t < 1.5) continue;
      const c = [s.p[0], s.p[1] + 1.2, s.p[2]];
      const r = GRENADE.smokeRadius * 0.85;
      let k = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy + (c[2] - a[2]) * dz) / (len2 || 1);
      k = clamp(k, 0, 1);
      const px = a[0] + dx * k - c[0], py = (a[1] + dy * k - c[1]) * 1.4, pz = a[2] + dz * k - c[2];
      if (px * px + py * py + pz * pz < r * r) return true;
    }
    return false;
  }

  explode(g) {
    const t = now();
    const p = g.sim.p;
    this.broadcast({ t: 'ge', id: g.id, k: g.kind, p: p.map(r3) });
    this.grenades.delete(g.id);
    const owner = this.players.get(g.owner);
    if (g.kind === 'he') {
      const o = [p[0], p[1] + 0.15, p[2]];
      this.blast(o, GRENADE.heRadius, GRENADE.heDamage, GRENADE.heArmorPen, 1.25, owner, 'he');
      // a explosão detona minas próximas
      for (const mi of [...this.mines.values()]) {
        if (dist3(mi.p, o) < GRENADE.heRadius * 0.6 && lineOfSight(o, [mi.p[0], mi.p[1] + 0.15, mi.p[2]], this.map.solid)) this.triggerMine(mi, t, 0.12, owner);
      }
    } else if (g.kind === 'flash') {
      // bots ficam cegos (humanos calculam no cliente)
      for (const v of this.players.values()) {
        if (!v.alive || !v.bot) continue;
        const eye = [v.pos[0], v.pos[1] + eyeHeight(v.crouch), v.pos[2]];
        const d = dist3(eye, p);
        if (d > 30 || !lineOfSight(eye, p, this.map.solid)) continue;
        const f = [-Math.sin(v.yaw), 0, -Math.cos(v.yaw)];
        const dot = ((p[0] - eye[0]) * f[0] + (p[2] - eye[2]) * f[2]) / Math.max(0.1, d);
        const angF = dot > 0.5 ? 1 : dot > -0.3 ? 0.5 : 0.15;
        const dur = GRENADE.flashMaxDuration * angF * clamp(1.2 - d / 30, 0.15, 1);
        v.blindUntil = Math.max(v.blindUntil, t + dur);
      }
    }
  }

  // dano em área (granada, mina): cai com a distância e precisa de linha de visão
  blast(o, radius, maxDmg, armorPen, falloff, owner, wid) {
    for (const v of this.players.values()) {
      if (!v.alive) continue;
      if (owner && v === owner && !this.settings.friendlyFireSelf) continue;
      if (owner && this.sameTeam(owner, v) && !this.settings.friendlyFire) continue;
      const c = playerCenter(v.pos[0], v.pos[1], v.pos[2], v.crouch);
      const d = dist3(o, c);
      if (d > radius) continue;
      const head = playerHead(v.pos[0], v.pos[1], v.pos[2], v.crouch);
      const feet = [v.pos[0], v.pos[1] + 0.3, v.pos[2]];
      if (!lineOfSight(o, c, this.map.solid) && !lineOfSight(o, head, this.map.solid) && !lineOfSight(o, feet, this.map.solid)) continue;
      const dmg = maxDmg * DAMAGE_SCALE * Math.pow(1 - d / radius, falloff);
      if (dmg < 1) continue;
      if (this.settings.headshotOnly && v !== owner) continue;
      const attacker = owner || v;
      if (this.isProtected(v)) continue;
      const { health, armorLoss } = applyArmor(dmg, armorPen, v.armor, v.helmet, 'chest');
      const real = Math.max(1, Math.floor(health));
      v.armor = Math.max(0, v.armor - Math.round(armorLoss));
      const dealt = Math.min(v.hp, real);
      v.hp -= real;
      if (attacker !== v) { attacker.stats.dmg += dealt; this.send(attacker, { t: 'hit', v: v.id, dmg: dealt, z: 'chest', k: v.hp <= 0 ? 1 : 0, nade: 1 }); }
      this.send(v, { t: 'hurt', a: attacker.id, dmg: dealt, hp: Math.max(0, v.hp), ar: v.armor, z: 'chest', from: o.map(r2), nade: 1 });
      if (v.hp <= 0) this.killPlayer(v, attacker, wid, {});
    }
  }

  // ------------------------------------------------------------ minas terrestres
  minePublic(mi) {
    return { id: mi.id, p: mi.p.map(r3), by: mi.owner, team: mi.team, arm: r3(Math.max(0, mi.armAt - now())) };
  }

  playerPlaceMine(p) {
    const t = now();
    if (!p.alive || this.phase === 'ended' || this.settings.mode === 'gungame') return;
    if (!(p.nades.mine > 0) || t - p.lastThrow < 0.6) return;
    const solid = this.map.solid;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const base = [p.pos[0], p.pos[1] + 0.35, p.pos[2]];
    let spot = null;
    for (const dd of [MINE.placeDist, 0.55, 0.0]) {
      const x = p.pos[0] + fx * dd, z = p.pos[2] + fz * dd;
      if (dd > 0 && !lineOfSight(base, [x + fx * 0.2, base[1], z + fz * 0.2], solid)) continue;
      const top = [x, p.pos[1] + 0.6, z];
      const hit = raycastWorld(top, [0, -1, 0], 2.6, solid);
      let y;
      if (hit && hit.axis === 1 && hit.sign > 0) y = top[1] - hit.t;
      else if (!hit && p.pos[1] < 0.6) y = 0;
      else continue;
      if (Math.abs(y - p.pos[1]) > 1.2) continue;
      spot = [x, y, z];
      break;
    }
    if (!spot) { this.send(p, { t: 'toast', m: 'Não dá para plantar a mina aqui', nades: p.nades }); return; }
    // limite de minas ativas por jogador: a mais antiga some
    const mine = [...this.mines.values()].filter((mi) => mi.owner === p.id).sort((a, b) => a.placed - b.placed);
    while (mine.length >= MINE.maxActive) this.removeMine(mine.shift());
    p.nades.mine--;
    p.lastThrow = t;
    p.protectedUntil = 0;
    const mi = { id: this.nextMineId++, owner: p.id, team: p.team, p: spot, placed: t, armAt: t + MINE.armTime, trigAt: 0, attacker: null };
    this.mines.set(mi.id, mi);
    this.broadcast({ t: 'mp', ...this.minePublic(mi) });
    if (p.nades.mine <= 0) {
      const next = ['he', 'flash', 'smoke'].find((k) => p.nades[k] > 0);
      p.weapon = next || (p.inv[p.primary] ? p.primary : 'knife');
      p.deployUntil = t + 0.4;
    }
  }

  removeMine(mi) {
    if (!this.mines.delete(mi.id)) return;
    this.broadcast({ t: 'mr', id: mi.id });
  }

  // quem pisa na mina? (o dono e, sem fogo amigo, os aliados não a disparam)
  mineVictimNear(mi) {
    const owner = this.players.get(mi.owner);
    for (const v of this.players.values()) {
      if (!v.alive || v.id === mi.owner || this.isProtected(v)) continue;
      if (owner && this.sameTeam(owner, v) && !this.settings.friendlyFire) continue;
      const dy = v.pos[1] - mi.p[1];
      if (dy < -0.5 || dy > MINE.triggerHeight) continue;
      if (Math.hypot(v.pos[0] - mi.p[0], v.pos[2] - mi.p[2]) < MINE.triggerRadius) return v;
    }
    return null;
  }

  triggerMine(mi, t, fuse = MINE.fuse, attacker = null) {
    if (mi.trigAt) return;
    mi.trigAt = t + fuse;
    if (attacker) mi.attacker = attacker.id;
    this.broadcast({ t: 'mt', id: mi.id });
  }

  updateMines(t) {
    if (this.phase === 'ended') return;
    for (const mi of [...this.mines.values()]) {
      if (mi.trigAt) { if (t >= mi.trigAt) this.explodeMine(mi); continue; }
      if (t - mi.placed > MINE.lifetime) { this.removeMine(mi); continue; }
      if (t >= mi.armAt && this.mineVictimNear(mi)) this.triggerMine(mi, t);
    }
  }

  explodeMine(mi) {
    if (!this.mines.delete(mi.id)) return;
    const o = [mi.p[0], mi.p[1] + 0.12, mi.p[2]];
    this.broadcast({ t: 'ge', id: 'm' + mi.id, mid: mi.id, k: 'mine', p: mi.p.map(r3) });
    const attacker = (mi.attacker && this.players.get(mi.attacker)) || this.players.get(mi.owner) || null;
    this.blast(o, MINE.radius, MINE.damage, MINE.armorPen, 1.4, attacker, 'mine');
    // reação em cadeia
    for (const other of [...this.mines.values()]) {
      if (dist3(other.p, mi.p) < MINE.radius * 0.5) this.triggerMine(other, now(), 0.15, attacker);
    }
  }

  // um tiro atinge a mina? (raio x esfera, antes do ponto onde a bala parou)
  shootMines(o, d, maxT, shooter) {
    for (const mi of this.mines.values()) {
      if (mi.trigAt) continue;
      const c = [mi.p[0], mi.p[1] + 0.05, mi.p[2]];
      const lx = c[0] - o[0], ly = c[1] - o[1], lz = c[2] - o[2];
      const tc = lx * d[0] + ly * d[1] + lz * d[2];
      if (tc < 0 || tc > maxT + 0.25) continue; // conta também a bala que bate no chão rente à mina
      const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
      if (d2 < MINE.hitRadius * MINE.hitRadius) { this.triggerMine(mi, now(), 0.05, shooter); return; }
    }
  }

  popSmoke(g) {
    const t = now();
    this.grenades.delete(g.id);
    const s = { id: g.id, p: g.sim.p.map(r3), start: t, end: t + GRENADE.smokeDuration };
    this.smokes.push(s);
    this.broadcast({ t: 'ge', id: g.id, k: 'smoke', p: s.p });
  }

  // ------------------------------------------------------------ mortes
  killPlayer(victim, killer, wid, flags) {
    if (!victim.alive) return;
    const t = now();
    victim.alive = false;
    victim.hp = 0;
    victim.reloading = null;
    victim.scoped = false;
    victim.respawnAt = t + Math.max(0.35, this.settings.respawnTime);
    victim.stats.deaths++;
    victim.streak = 0;
    const suicide = !killer || killer === victim;
    const tk = !suicide && this.sameTeam(killer, victim);
    const gg = this.settings.mode === 'gungame';
    let ggUp = false, ggWin = false, multi = 0;
    if (suicide) {
      victim.stats.suicides++;
      victim.stats.score--;
      victim.stats.lastScoreAt = t;
      if (gg && victim.gg > 0 && this.phase === 'live') victim.gg--;
    } else if (tk) {
      killer.stats.score--;
      killer.stats.lastScoreAt = t;
      if (this.tscore && killer.team && !this.isCtf()) this.tscore[killer.team]--;
    } else {
      killer.stats.kills++;
      killer.stats.score++;
      killer.stats.lastScoreAt = t;
      if (flags.hs) killer.stats.hs++;
      killer.streak++;
      // abates em sequência (duplo, triplo...): até 4 s entre um abate e o próximo
      killer.multi = t - (killer.lastKillAt || -99) <= 4 ? (killer.multi || 1) + 1 : 1;
      killer.lastKillAt = t;
      multi = killer.multi;
      if (this.isTeamMode() && killer.team && !this.isCtf()) this.tscore[killer.team]++;
      if (gg) {
        // Gun Game: sobe de nível ao matar com a arma do nível; facada rouba um nível da vítima
        if (wid === 'knife' && killer.ggWeapon !== 'knife' && victim.gg > 0) victim.gg--;
        if (wid === killer.ggWeapon || killer.ggWeapon === 'knife') {
          killer.gg++;
          ggUp = true;
          if (killer.gg >= GUNGAME_LIST.length) ggWin = true;
        }
      }
    }
    this.broadcast({
      t: 'kill', k: suicide ? victim.id : killer.id, v: victim.id, w: wid,
      hs: flags.hs ? 1 : 0, pen: flags.pen ? 1 : 0, sm: flags.smoke ? 1 : 0, air: flags.air ? 1 : 0, ns: flags.ns ? 1 : 0,
      tk: tk ? 1 : 0, ks: suicide ? null : this.statsRow(killer), vs: this.statsRow(victim), mk: multi >= 2 ? multi : 0,
      kst: suicide || tk ? 0 : killer.streak,
      kh: suicide ? 0 : killer.hp, ka: suicide ? 0 : killer.armor,
      rs: this.settings.respawnTime, ts: this.tscore,
    });
    if (!suicide && !tk && killer.alive) this.rewardKill(killer, ggUp && !ggWin);
    if (this.phase === 'live' && !suicide) {
      const lim = this.settings.endCondition;
      if (ggWin) this.endMatch('gungame');
      else if (!gg && (lim === 'kills' || lim === 'both')) {
        if (this.isCtf()) { /* em Capture a Bandeira a meta é de capturas */ }
        else if (this.isTeamMode()) {
          if (Math.max(this.tscore.ct, this.tscore.tr) >= this.settings.teamKillLimit) this.endMatch('kills');
        } else if (killer.stats.score >= this.settings.killLimit) this.endMatch('kills');
      }
    }
    if (this.phase === 'live' && this.suddenDeath) this.checkSudden();
  }

  // recompensas por abate: vida, munição, bônus de sequência e (Gun Game) próxima arma
  rewardKill(k, ggUp) {
    const st = this.settings;
    const out = { t: 'heal', hp: 0, streak: k.streak };
    if (ggUp) {
      this.giveLoadout(k);
      k.deployUntil = now() + 0.25;
      out.gg = k.gg;
      out.gun = k.weapon;
    } else if (st.killRefill && !st.infiniteAmmo) {
      for (const [wid, slot] of Object.entries(k.inv)) {
        const w = WEAPONS[wid];
        if (!w || !w.mag) continue;
        // recarrega o pente da arma atual instantaneamente; nas outras completa o pente
        const need = w.mag - slot.mag;
        if (need <= 0) continue;
        const take = Math.min(need, slot.res);
        slot.mag += take; slot.res -= take;
      }
      if (k.reloading) k.reloading = null;
    }
    const before = k.hp;
    k.hp = Math.min(PLAYER.maxHealth, k.hp + (st.killHeal || 0));
    out.hp = k.hp; out.healed = k.hp - before;
    if (st.streakBonus && !ggUp && st.mode !== 'gungame') {
      if (k.streak > 0 && k.streak % 3 === 0) {
        // a cada 3 abates seguidos: +1 granada (HE, depois flash, depois fumaça)
        const order = ['he', 'flash', 'smoke'];
        const kind = order.find((n) => (k.nades[n] || 0) < 2) || null;
        if (kind) { k.nades[kind] = (k.nades[kind] || 0) + 1; out.bonus = kind; }
      }
      if (k.streak > 0 && k.streak % 5 === 0) {
        k.armor = PLAYER.maxArmor; k.helmet = true; out.bonus2 = 'armor';
      }
    }
    out.ar = k.armor; out.hm = k.helmet;
    const inv = {};
    for (const [w, v] of Object.entries(k.inv)) inv[w] = [v.mag, v.res];
    out.inv = inv; out.nades = k.nades;
    this.send(k, out);
  }

  // ------------------------------------------------------------ partida
  ranking() {
    const gg = this.settings.mode === 'gungame';
    return [...this.players.values()].sort((a, b) =>
      (gg ? b.gg - a.gg : 0) ||
      (b.stats.score - a.stats.score) ||
      (a.stats.deaths - b.stats.deaths) ||
      (b.stats.hs - a.stats.hs) ||
      (b.stats.dmg - a.stats.dmg) ||
      (a.stats.lastScoreAt - b.stats.lastScoreAt) ||
      (a.joinOrder - b.joinOrder));
  }

  tiebreakReason(a, b) {
    if (!a || !b || a.stats.score !== b.stats.score) return null;
    if (this.settings.mode === 'gungame' && a.gg !== b.gg) return null;
    if (a.stats.deaths !== b.stats.deaths) return 'menos mortes';
    if (a.stats.hs !== b.stats.hs) return 'mais headshots';
    if (Math.round(a.stats.dmg) !== Math.round(b.stats.dmg)) return 'mais dano causado';
    if (a.stats.lastScoreAt !== b.stats.lastScoreAt) return 'chegou primeiro à pontuação';
    return 'ordem de entrada';
  }

  matchState() {
    return {
      phase: this.phase, startedAt: this.phaseStartedAt, endsAt: this.endsAt,
      sudden: this.suddenDeath, suddenEndsAt: this.suddenEndsAt, st: now(),
      result: this.phase === 'ended' ? this.result : null,
      warmupAutoAt: this.warmupAutoAt, mode: this.settings.mode, ts: this.tscore,
      fl: this.isCtf() ? this.flagState() : null,
    };
  }

  broadcastMatch() {
    this.broadcast({ t: 'match', match: this.matchState(), settings: this.settings });
    this.updateLobby();
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseStartedAt = now();
    if (phase === 'room') { this.endsAt = 0; this.suddenDeath = false; }
  }

  // (o aquecimento automático deu lugar à sala de espera)
  scheduleAutoStart() { this.warmupAutoAt = 0; }

  // ------------------------------------------------------------ sala de espera
  // Na sala ninguém está no mapa: o servidor não simula nem manda estado,
  // só uma mensagem pequena quando algo muda (entrou, saiu, pronto...).
  roomHumans() { return [...this.players.values()].filter((p) => !p.bot); }
  canStart() { const h = this.roomHumans(); return h.length > 0 && h.every((p) => p.ready); }
  roomState() {
    return {
      t: 'room', host: this.hostId, phase: this.phase, can: this.canStart() ? 1 : 0,
      tm: this.isTeamMode() ? 1 : 0, after: this.afterMatch ? 1 : 0,
      p: [...this.players.values()].map((p) => [p.id, p.name, p.char, p.ready ? 1 : 0, p.bot ? 1 : 0, p.waiting ? 1 : 0, TEAM_CODE[p.team] || 0, p.pick ? TEAM_CODE[p.pick] : 0]),
    };
  }
  broadcastRoom() { this.broadcast(this.roomState()); }

  goRoom(silent) {
    this.setPhase('room');
    this.warmupAutoAt = 0;
    this.grenades.clear(); this.smokes = []; this.mines.clear();
    for (const p of this.players.values()) {
      p.alive = false; p.respawnAt = 0; p.reloading = null;
      p.waiting = !p.bot; p.ready = p.bot;
    }
    if (silent) { this.afterMatch = false; return; }
    this.afterMatch = true;   // fim de partida: o dono pode sortear novos times
    this.broadcast({ t: 'reset' });
    this.broadcastMatch();
    this.broadcastRoom();
    this.system(this.isTeamMode() ? 'De volta à sala: os times da última partida foram mantidos. Troquem de time, ou o dono pode sortear novos times.' : 'De volta à sala: cliquem em PRONTO para a próxima partida.');
  }

  // escolha de time na sala (ou enquanto espera para entrar numa partida em andamento)
  onTeamPick(p, v) {
    if (p.bot || !(this.phase === 'room' || p.waiting)) return;
    const pick = v === 'ct' || v === 'tr' ? v : null;
    if (pick && this.isTeamMode() && p.team !== pick) {
      const other = pick === 'ct' ? 'tr' : 'ct';
      const nh = (team) => this.roomHumans().filter((q) => q !== p && q.team === team).length;
      if (nh(pick) - nh(other) >= 2) { this.send(p, { t: 'toast', m: `${TEAMS[pick].full}: time cheio. Escolha o outro ou Automático.` }); this.broadcastRoom(); return; }
    }
    p.pick = pick;
    p.side = pick === 'ct' ? 'north' : pick === 'tr' ? 'south' : 'any';
    p.reteam = false;
    if (this.isTeamMode()) {
      if (pick) p.team = pick;
      else { p.team = null; this.assignTeam(p); }
      this.rebalanceBots();
    }
    this.broadcastRoom();
  }

  // sorteia times equilibrados entre os humanos (bots completam depois)
  shuffleTeams(by) {
    if (!this.isTeamMode()) { this.send(by, { t: 'toast', m: 'Sortear times só vale no Mata-mata em equipe' }); return; }
    if (this.phase !== 'room') { this.send(by, { t: 'toast', m: 'Os times só podem ser sorteados na sala de espera' }); return; }
    const humans = this.roomHumans();
    for (let i = humans.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [humans[i], humans[j]] = [humans[j], humans[i]]; }
    const first = this.rand() < 0.5 ? 'ct' : 'tr', second = first === 'ct' ? 'tr' : 'ct';
    humans.forEach((q, i) => { q.team = i % 2 ? second : first; q.pick = null; q.side = 'any'; q.reteam = false; });
    const bots = [...this.players.values()].filter((q) => q.bot);
    for (const b of bots) b.team = null;
    for (const b of bots) this.assignTeam(b);
    this.afterMatch = false;
    const names = (team) => humans.filter((q) => q.team === team).map((q) => q.name).join(', ') || '—';
    this.system(`${by.name} sorteou os times. CT: ${names('ct')} • TR: ${names('tr')}`);
    this.broadcastRoom();
  }

  onReady(p, v) {
    if (this.phase !== 'room' || p.bot || p.ready === v) return;
    p.ready = v;
    this.broadcastRoom();
  }

  // entra na partida que já está em andamento
  onEnter(p) {
    if (this.phase === 'room' || !p.waiting) return;
    p.waiting = false;
    p.respawnAt = now() + 0.2;
    this.system(`${p.name} entrou na partida.`);
    this.broadcastRoom();
  }

  resetStats() {
    for (const p of this.players.values()) {
      p.stats = { kills: 0, deaths: 0, hs: 0, dmg: 0, suicides: 0, score: 0, lastScoreAt: 0, shots: 0, hits: 0, caps: 0 };
      p.streak = 0; p.gg = 0;
    }
    this.tscore = { ct: 0, tr: 0 };
    this.resetFlags();
  }

  startMatch() {
    const t = now();
    if (this.phase === 'room') for (const p of this.players.values()) { p.waiting = false; p.ready = false; }
    this.afterMatch = false;
    this.setPhase('live');
    this.warmupAutoAt = 0;
    const tl = this.settings.endCondition;
    this.endsAt = (tl === 'time' || tl === 'both') ? t + this.settings.timeLimitMin * 60 : 0;
    this.suddenDeath = false;
    this.result = null;
    this.resetStats();
    this.grenades.clear();
    this.smokes = [];
    this.mines.clear();
    this.broadcast({ t: 'reset' });
    for (const p of this.players.values()) { p.alive = false; if (!p.waiting) this.spawnPlayer(p); }
    this.broadcastMatch();
    this.broadcastRoom();
    this.broadcast({ t: 'sc', l: [...this.players.values()].map((p) => this.statsRow(p)) });
    this.system('A partida começou! Boa sorte.');
  }

  endMatch(reason) {
    const t = now();
    const rk = this.ranking();
    const team = this.isTeamMode();
    const ts = this.tscore;
    const winnerTeam = team ? (ts.ct > ts.tr ? 'ct' : ts.tr > ts.ct ? 'tr' : null) : null;
    this.result = {
      reason, mode: this.settings.mode, teams: team ? { ...ts } : null, winnerTeam,
      winner: rk[0] ? rk[0].id : null,
      tiebreak: team ? null : this.tiebreakReason(rk[0], rk[1]),
      ranking: rk.map((p) => ({ id: p.id, name: p.name, char: p.char, bot: p.bot, row: this.statsRow(p), suicides: p.stats.suicides, shots: p.stats.shots, hits: p.stats.hits })),
    };
    this.phase = 'ended';
    this.phaseStartedAt = t;
    this.endsAt = t + this.settings.intermission;
    this.suddenDeath = false;
    this.broadcastMatch();
    const w = rk[0];
    if (team) this.system(winnerTeam ? `Fim de partida! Vitória dos ${TEAMS[winnerTeam].full} (${ts.ct} × ${ts.tr}).` : `Fim de partida! Empate (${ts.ct} × ${ts.tr}).`);
    else if (w) this.system(`Fim de partida! Vencedor: ${w.name}${this.result.tiebreak ? ` (desempate: ${this.result.tiebreak})` : ''}.`);
  }

  isTied() {
    if (this.isTeamMode()) return this.tscore.ct === this.tscore.tr;
    const rk = this.ranking();
    return !!rk[1] && rk[0].stats.score === rk[1].stats.score && (this.settings.mode !== 'gungame' || rk[0].gg === rk[1].gg);
  }

  checkSudden() {
    if (!this.isTied()) this.endMatch('sudden');
    else if (now() >= this.suddenEndsAt) this.endMatch('time');
  }

  updateMatch(t) {
    if (this.phase === 'live') {
      if (this.suddenDeath) this.checkSudden();
      else if (this.endsAt && t >= this.endsAt) {
        const tied = this.isTied();
        if (tied && this.settings.tiebreak === 'sudden') {
          this.suddenDeath = true;
          this.suddenEndsAt = t + 120;
          this.broadcastMatch();
          this.system(this.isCtf() ? 'Empate! MORTE SÚBITA: a próxima captura decide a equipe vencedora.' : this.isTeamMode() ? 'Empate! MORTE SÚBITA: o próximo abate decide a equipe vencedora.' : 'Empate! MORTE SÚBITA: o próximo abate de um dos líderes decide a partida.');
        } else this.endMatch('time');
      }
    } else if (this.phase === 'ended' && t >= this.endsAt) {
      this.goRoom();
    }
  }

  // ------------------------------------------------------------ comandos
  isHost(p) { return p.id === this.hostId; }

  onLoadout(p, m) {
    if (PRIMARIES.includes(m.primary)) p.primary = m.primary;
    if (SECONDARIES.includes(m.secondary)) p.secondary = m.secondary;
    if (CHAR_IDS.includes(m.char) && m.char !== p.char) { p.char = m.char; if (this.phase === 'room') this.broadcastRoom(); }
    if (SIDE_IDS.includes(m.side) && m.side !== p.side) {
      // na sala, o lado preferido é a escolha de time
      if (this.phase === 'room' || p.waiting) this.onTeamPick(p, m.side === 'north' ? 'ct' : m.side === 'south' ? 'tr' : null);
      else { p.side = m.side; p.pick = m.side === 'north' ? 'ct' : m.side === 'south' ? 'tr' : null; p.reteam = true; }
    }
    const t = now();
    let applied = false;
    // troca imediata se ainda estiver na proteção de renascimento (como no CS DM)
    if (this.settings.mode !== 'gungame' && p.alive && (t < p.protectedUntil || this.phase === 'warmup' && t - (p.lastShotAt || 0) > 3 && p.hp === 100)) {
      this.giveLoadout(p);
      applied = true;
      const inv = {};
      for (const [k, v] of Object.entries(p.inv)) inv[k] = [v.mag, v.res];
      this.send(p, { t: 'equip', inv, nades: p.nades, lo: { primary: p.primary, secondary: p.secondary, char: p.char } });
    }
    this.broadcast({ t: 'pinfo', id: p.id, name: p.name, char: p.char, primary: p.primary, secondary: p.secondary, team: p.team });
    this.send(p, { t: 'lo', applied });
  }

  // limite anti-spam: 6 mensagens a cada 4 s
  chatAllowed(p) {
    const t = now();
    p.chatTimes = (p.chatTimes || []).filter((x) => t - x < 4);
    if (p.chatTimes.length >= 6) { this.send(p, { t: 'chat', sys: true, m: 'Calma! Você está enviando mensagens rápido demais.' }); return false; }
    p.chatTimes.push(t);
    return true;
  }
  sendTeam(team, obj) { for (const q of this.players.values()) if (!q.bot && q.team === team) this.send(q, obj); }

  onChat(p, text, team) {
    // < e > são permitidos no chat (o cliente escapa o texto); nomes continuam filtrados
    const msg = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
    if (!msg) return;
    if (msg.startsWith('/')) { this.chatCommand(p, msg); return; }
    if (!this.chatAllowed(p)) return;
    const toTeam = team && this.isTeamMode() && p.team;
    const out = { t: 'chat', id: p.id, name: p.name, m: msg, team: toTeam ? p.team : null, tm: p.team, dead: p.alive ? 0 : 1 };
    if (toTeam) this.sendTeam(p.team, out); else this.broadcast(out);
  }

  // rádio (mensagens rápidas): em equipe só os aliados recebem, com a posição para marcar no radar
  onRadio(p, i) {
    i = Math.floor(+i);
    if (!(i >= 0 && i < 18) || !this.chatAllowed(p)) return;
    const out = { t: 'radio', id: p.id, i, p: p.alive ? [r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2])] : null, tm: p.team };
    if (this.isTeamMode() && p.team) this.sendTeam(p.team, out); else this.broadcast(out);
  }

  chatCommand(p, msg) {
    const [cmd, ...rest] = msg.slice(1).split(/\s+/);
    const arg = rest.join(' ');
    const reply = (m) => this.send(p, { t: 'chat', sys: true, m });
    switch ((cmd || '').toLowerCase()) {
      case 'admin':
        if (this.config.adminPassword && arg === this.config.adminPassword) {
          this.hostId = p.id; this.broadcast({ t: 'host', id: p.id }); this.system(`${p.name} agora é o anfitrião.`);
          this.broadcastRoom();
        } else reply('Senha incorreta (ou senha de admin não configurada no config.json).');
        break;
      case 'bots':
        if (!this.isHost(p)) return reply('Apenas o anfitrião pode fazer isso.');
        this.onConfig(p, { ...this.settings, bots: +arg }, false);
        break;
      case 'kick': {
        if (!this.isHost(p)) return reply('Apenas o anfitrião pode fazer isso.');
        const tgt = [...this.players.values()].find((q) => q.name.toLowerCase() === arg.toLowerCase());
        if (!tgt || tgt === p) return reply('Jogador não encontrado.');
        if (tgt.bot) { this.settings.bots = Math.max(0, this.players.size - 1); this.removePlayer(tgt, 'foi removido'); this.syncBots(); this.broadcastMatch(); }
        else { this.send(tgt, { t: 'err', m: 'Você foi removido pelo anfitrião.' }); this.removePlayer(tgt, 'foi removido'); tgt.ws?.close(); }
        break;
      }
      case 'restart': case 'start':
        if (!this.isHost(p)) return reply('Apenas o anfitrião pode fazer isso.');
        this.onCommand(p, 'start');
        break;
      case 'sortear': case 'shuffle':
        if (!this.isHost(p)) return reply('Apenas o anfitrião pode fazer isso.');
        this.shuffleTeams(p);
        break;
      case 'warmup': case 'sala':
        if (!this.isHost(p)) return reply('Apenas o anfitrião pode fazer isso.');
        this.goRoom();
        break;
      case 'ajuda': case 'help':
        reply('Comandos: /bots N, /kick nome, /start, /sala, /sortear, /admin senha (anfitrião) • /mute nome, /unmute nome (silenciar no seu chat) • U = chat da equipe • Z/X/C = rádio');
        break;
      default: reply('Comando desconhecido. Digite /ajuda');
    }
  }

  goWarmup() { this.goRoom(); }

  onConfig(p, s, restart) {
    if (!this.isHost(p)) { this.send(p, { t: 'chat', sys: true, m: 'Apenas o anfitrião pode alterar as configurações.' }); return; }
    const prev = this.settings;
    this.settings = sanitizeSettings(s, prev);
    // regras principais só mudam na sala de espera (antes de a partida começar)
    const lobbyChanged = LOBBY_KEYS.some((k) => this.settings[k] !== prev[k]);
    if (lobbyChanged && this.phase !== 'room') {
      for (const k of LOBBY_KEYS) this.settings[k] = prev[k];
      this.send(p, { t: 'toast', m: 'Modo, mapa, tempo e abates só mudam na sala de espera' });
    }
    // na sala, mudar as regras desmarca o PRONTO de todos (precisam concordar de novo)
    if (lobbyChanged && this.phase === 'room') {
      for (const q of this.players.values()) if (!q.bot) q.ready = false;
    }
    if (this.settings.map !== prev.map) this.loadMap(this.settings.map);
    this.syncBots();
    this.system(lobbyChanged && this.phase === 'room' ? `${p.name} alterou as regras da partida: confirmem PRONTO de novo.` : `${p.name} alterou as configurações da partida.`);
    const mapChanged = this.settings.map !== prev.map;
    const modeChanged = this.settings.mode !== prev.mode;
    if (modeChanged) {
      this.balanceTeams();
      this.rebalanceBots();
      for (const q of this.players.values()) this.broadcast({ t: 'pinfo', id: q.id, name: q.name, char: q.char, primary: q.primary, secondary: q.secondary, team: q.team });
    }
    if (mapChanged) { this.grenades.clear(); this.smokes = []; this.mines.clear(); this.broadcastMatch(); }
    if (this.phase === 'room') { this.broadcastMatch(); this.broadcastRoom(); return; }
    if (restart || mapChanged || modeChanged || (this.phase === 'live' && (prev.teamKillLimit !== this.settings.teamKillLimit || prev.captureLimit !== this.settings.captureLimit)) || (this.phase === 'live' && (prev.endCondition !== this.settings.endCondition || prev.timeLimitMin !== this.settings.timeLimitMin || prev.killLimit !== this.settings.killLimit))) {
      this.startMatch();
    } else {
      // tempo limite alterado durante o aquecimento/partida
      this.broadcastMatch();
    }
    this.scheduleAutoStart();
  }

  onCommand(p, c) {
    if (!this.isHost(p)) return;
    if (c === 'start' || c === 'restart') {
      // da sala, só começa quando todos clicaram em pronto
      if (this.phase === 'room' && !this.canStart()) { this.send(p, { t: 'toast', m: 'Ainda há jogadores que não estão prontos' }); return; }
      this.startMatch();
    } else if (c === 'warmup' || c === 'room') this.goRoom();
    else if (c === 'shuffle') this.shuffleTeams(p);
    else if (c === 'end' && this.phase === 'live') this.endMatch('host');
  }

  // ------------------------------------------------------------ loop
  start() {
    const dt = 1 / NET.tickRate;
    this.nextTick = now();
    const loop = () => {
      const t = now();
      let n = 0;
      while (this.nextTick <= t && n < 8) { this.tick(dt); this.nextTick += dt; n++; }
      if (this.nextTick < t - 0.5) this.nextTick = t; // servidor travou: não acumula atraso
      const wait = Math.max(0, (this.nextTick - now()) * 1000);
      setTimeout(loop, wait > 2 ? wait - 1 : 0);
    };
    loop();
  }

  tick(dt) {
    const t = now();
    this.tickCount++;
    if (this.phase === 'room') return; // sala: nada a simular nem a enviar
    const humans = [...this.players.values()].some((p) => !p.bot);
    if (!humans) return;

    for (const p of this.players.values()) {
      if (p.bot && p.alive) {
        try { p.brain.update(dt, t); } catch (e) { console.error('bot error', e); }
      }
      if (p.reloading) this.updateReload(p, t);
    }
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.history.push({ t, x: p.pos[0], y: p.pos[1], z: p.pos[2], c: p.crouch, yaw: p.yaw });
      if (p.history.length > NET.tickRate * NET.historySeconds) p.history.shift();
    }
    for (const g of [...this.grenades.values()]) {
      stepGrenade(g.sim, this.map.solid);
      if (g.kind === 'smoke') {
        if ((g.sim.rest && g.sim.steps >= GRENADE.smokeMinSteps) || g.sim.steps >= GRENADE.smokeMaxSteps) this.popSmoke(g);
      } else if (g.sim.steps >= GRENADE.fuseSteps) this.explode(g);
    }
    if (this.smokes.length) this.smokes = this.smokes.filter((s) => s.end > t);
    if (this.mines.size) this.updateMines(t);
    if (this.phase !== 'ended') {
      for (const p of this.players.values()) {
        if (!p.alive && !p.waiting && p.respawnAt && t >= p.respawnAt) this.spawnPlayer(p);
      }
    }
    if (this.isCtf() && this.phase === 'live') this.updateFlags(t);
    this.updateMatch(t);

    const snapEvery = Math.max(1, Math.round(NET.tickRate / (this.config.snapshotRate || NET.snapshotRate)));
    if (this.tickCount % snapEvery === 0) this.sendSnapshot(t);
    if (this.tickCount % NET.tickRate === 0) {
      this.broadcast({ t: 'sc', l: [...this.players.values()].map((p) => this.statsRow(p)) });
    }
  }

  // ------------------------------------------------------------ capture a bandeira
  // A bandeira de cada equipe fica na própria base (CT = norte, TR = sul).
  // Estados: 0 = na base, 1 = carregada por um inimigo, 2 = caída no chão.
  flagBase(team) {
    const b = this.map.flagBases && this.map.flagBases[TEAMS[team].side];
    return b ? [b.x, b.y, b.z] : [0, 0, 0];
  }
  resetFlags() {
    this.flags = {};
    for (const team of ['ct', 'tr']) this.flags[team] = { s: 0, p: this.flagBase(team), c: null, dropAt: 0 };
  }
  flagState() {
    if (!this.flags) this.resetFlags();
    const out = {};
    for (const [team, f] of Object.entries(this.flags)) {
      out[team] = { s: f.s, p: f.p.map(r3), c: f.c, back: f.s === 2 ? f.dropAt + CTF.returnTime : 0 };
    }
    return out;
  }
  flagEvent(ev, team, p) {
    this.broadcast({ t: 'flag', ev, team, id: p ? p.id : null, fl: this.flagState(), ts: this.tscore, st: now() });
  }
  dropFlag(team, pos, t) {
    const f = this.flags[team];
    const x = pos[0], z = pos[2];
    let y = floorHeightAt(x, z, pos[1] + 0.3, this.map.solid, 0.2);
    if (!isFinite(y) || y < pos[1] - 30) y = Math.max(0, pos[1]);
    f.s = 2; f.c = null; f.p = [x, y, z]; f.dropAt = t;
  }
  updateFlags(t) {
    if (!this.flags) this.resetFlags();
    const near = (p, q, r) => Math.hypot(p[0] - q[0], p[2] - q[2]) < r && Math.abs(p[1] - q[1]) < 2.2;
    for (const [team, f] of Object.entries(this.flags)) {
      if (f.s === 1) {
        const c = this.players.get(f.c);
        if (!c || !c.alive || c.waiting || !c.team || c.team === team) {
          // portador morreu, saiu ou trocou de time: a bandeira cai onde ele estava
          this.dropFlag(team, c ? c.pos : f.p, t);
          this.flagEvent('drop', team, c);
          if (c) this.system(`${c.name} deixou cair a bandeira dos ${TEAMS[team].name}!`);
        } else f.p = [c.pos[0], c.pos[1], c.pos[2]];
      } else if (f.s === 2 && t >= f.dropAt + CTF.returnTime) {
        f.s = 0; f.p = this.flagBase(team); f.c = null;
        this.flagEvent('return', team, null);
        this.system(`A bandeira dos ${TEAMS[team].name} voltou para a base.`);
      }
    }
    for (const p of this.players.values()) {
      if (!p.alive || p.waiting || !p.team) continue;
      const own = this.flags[p.team];
      const enemyTeam = p.team === 'ct' ? 'tr' : 'ct';
      const enemy = this.flags[enemyTeam];
      // devolve a própria bandeira caída
      if (own.s === 2 && near(p.pos, own.p, CTF.touchRadius)) {
        own.s = 0; own.p = this.flagBase(p.team); own.c = null;
        p.stats.score += CTF.returnScore; p.stats.lastScoreAt = t;
        this.flagEvent('return', p.team, p);
        this.system(`${p.name} devolveu a bandeira dos ${TEAMS[p.team].name}.`);
      }
      // pega a bandeira inimiga (na base ou caída)
      if (enemy.s !== 1 && near(p.pos, enemy.p, CTF.touchRadius)) {
        enemy.s = 1; enemy.c = p.id; enemy.p = [p.pos[0], p.pos[1], p.pos[2]];
        this.flagEvent('take', enemyTeam, p);
        this.system(`${p.name} pegou a bandeira dos ${TEAMS[enemyTeam].name}!`);
      }
      // captura: leva a bandeira inimiga até a própria base, com a própria bandeira lá
      if (enemy.s === 1 && enemy.c === p.id && own.s === 0 && near(p.pos, this.flagBase(p.team), CTF.captureRadius)) {
        enemy.s = 0; enemy.p = this.flagBase(enemyTeam); enemy.c = null;
        this.tscore[p.team]++;
        p.stats.caps = (p.stats.caps || 0) + 1;
        p.stats.score += CTF.captureScore; p.stats.lastScoreAt = t;
        this.flagEvent('cap', enemyTeam, p);
        this.system(`${p.name} capturou a bandeira! ${TEAMS.ct.name} ${this.tscore.ct} × ${this.tscore.tr} ${TEAMS.tr.name}`);
        const lim = this.settings.endCondition;
        if (this.suddenDeath) { this.checkSudden(); return; }
        if ((lim === 'kills' || lim === 'both') && this.tscore[p.team] >= this.settings.captureLimit) { this.endMatch('kills'); return; }
      }
    }
  }
  // objetivo de navegação dos bots em Capture a Bandeira (ou null)
  ctfGoal(p, rand) {
    if (!this.isCtf() || this.phase !== 'live' || !p.team || !this.flags) return null;
    const own = this.flags[p.team], enemyTeam = p.team === 'ct' ? 'tr' : 'ct', enemy = this.flags[enemyTeam];
    if (enemy.s === 1 && enemy.c === p.id) return this.flagBase(p.team);          // leva para casa
    if (own.s !== 0 && rand() < 0.6) return own.p.slice();                         // recupera a nossa
    if (enemy.s !== 1 && rand() < 0.7) return enemy.p.slice();                     // vai buscar a deles
    if (enemy.s === 1 && rand() < 0.35) { const c = this.players.get(enemy.c); if (c) return c.pos.slice(); } // escolta
    return null;
  }
  // este bot está carregando a bandeira inimiga?
  isCarrier(p) {
    if (!this.flags || !p.team) return false;
    const f = this.flags[p.team === 'ct' ? 'tr' : 'ct'];
    return f.s === 1 && f.c === p.id;
  }

  sendSnapshot(t) {
    const list = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      let f = 0;
      if (p.crouch) f |= FLAG.CROUCH;
      if (p.onGround) f |= FLAG.GROUND;
      if (p.walk) f |= FLAG.WALK;
      if (p.scoped) f |= FLAG.SCOPED;
      if (p.reloading) f |= FLAG.RELOAD;
      if (t < p.protectedUntil) f |= FLAG.PROTECTED;
      if (p.bot) f |= FLAG.BOT;
      list.push([p.id, r3(p.pos[0]), r3(p.pos[1]), r3(p.pos[2]), r3(p.yaw), r3(p.pitch), f, WEAPON_INDEX[p.weapon] ?? 0,
        r2(p.vel[0]), r2(p.vel[1]), r2(p.vel[2])]);
    }
    this.broadcast({ t: 's', st: r3(t), p: list });
  }
}
