// Interface durante o jogo: vida, colete, munição, mira, killfeed (canto
// superior esquerdo), radar, placar, chat, tela de morte e fim de partida.
import { WEAPONS, WEAPON_LIST } from '/shared/weapons.js';
import { HIT_ZONES, TEAMS, GUNGAME_LIST, modeName, isTeamModeId } from '/shared/constants.js';
import { mapName } from '/shared/maps.js';
import { settings, keyName } from './settings.js';

// nomes dos abates em sequência
const MULTI_NAMES = { 2: 'Double Kill', 3: 'Triple Kill', 4: 'Quadra Kill', 5: 'Penta Kill', 6: 'Hexa Kill', 7: 'Hepta Kill', 8: 'Octa Kill', 9: 'Nona Kill', 10: 'Deca Kill' };
export function multiKillName(n) { return MULTI_NAMES[n] || 'Godlike Kill'; }

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEG = Math.PI / 180;
const TEAM_BY_CODE = [null, 'ct', 'tr'];
const teamColor = (t) => (t && TEAMS[t] ? TEAMS[t].color : null);

const ICONS = {
  hs: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="7" r="5.2" fill="none" stroke="#ff5a4a" stroke-width="1.8"/><circle cx="8" cy="7" r="1.6" fill="#ff5a4a"/><path d="M8 0v3M8 11v5M0 7h3M13 7h3" stroke="#ff5a4a" stroke-width="1.6"/></svg>',
  pen: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="5" y="1" width="6" height="14" fill="#c9a26a"/><path d="M0 8h16" stroke="#fff" stroke-width="1.6" stroke-dasharray="2 1.5"/></svg>',
  sm: '<svg width="18" height="16" viewBox="0 0 18 16"><circle cx="6" cy="9" r="4.5" fill="#bbb"/><circle cx="11" cy="7" r="5" fill="#ddd"/><circle cx="13" cy="11" r="3.5" fill="#aaa"/></svg>',
  ns: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M2 2l12 12" stroke="#ff5a4a" stroke-width="2"/></svg>',
  air: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 2v9M4 6l4-4 4 4" fill="none" stroke="#7fe3ff" stroke-width="2"/><path d="M3 14h10" stroke="#7fe3ff" stroke-width="2"/></svg>',
  skull: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1C4 1 2 3.6 2 6.6c0 2 1 3.2 2 3.8V13h8v-2.6c1-.6 2-1.8 2-3.8C14 3.6 12 1 8 1z" fill="#ddd"/><circle cx="5.6" cy="7" r="1.6" fill="#222"/><circle cx="10.4" cy="7" r="1.6" fill="#222"/></svg>',
};

export class HUD {
  constructor(game) {
    this.g = game;
    this.el = {};
    for (const id of ['multikill', 'hud', 'killfeed', 'timer', 'matchinfo', 'banner', 'radar', 'perf', 'crosshair', 'hitmarker', 'dmgind', 'nametag', 'centermsg', 'announce', 'protect', 'vitals', 'hp', 'ar', 'hpbar', 'arbar', 'ammo', 'nades', 'weapname', 'mag', 'res', 'slots', 'chat', 'chatlog', 'chatinput', 'scope', 'smokeov', 'vignette', 'flash', 'death', 'toast', 'scoreboard', 'endscreen', 'armorico']) this.el[id] = $(id);
    this.xhCtx = this.el.crosshair.getContext('2d');
    this.radarCtx = this.el.radar.getContext('2d');
    this.xhKey = '';
    this.hitT = 0; this.flashA = 0; this.flashT = 0; this.flashDur = 0;
    this.lastVals = {};
    this.slotsT = 0;
    this.toastT = 0;
    this.centerT = 0; this.announceT = 0;
    this.chatOpen = false;
    this.mapCanvas = null;
    this.radarAcc = 0;
    this.fpsAcc = 0; this.fpsFrames = 0; this.fps = 0;
    this.icons = {};
  }

  setIcons(icons) { this.icons = icons; }
  icon(wid, kind = 'white') { return this.icons[wid] ? this.icons[wid][kind] : ''; }
  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  // ------------------------------------------------------------- radar
  buildRadarMap(map) {
    const s = 6;
    const B = map.bounds;
    const W = (B.maxX - B.minX) * s, H = (B.maxZ - B.minZ) * s;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(205,180,140,0.55)'; ctx.fillRect(0, 0, W, H);
    const boxes = [...map.boxes].filter((b) => !b.floor && !b.hidden && b.min[1] < 2.5).sort((a, b) => a.max[1] - b.max[1]);
    for (const b of boxes) {
      const x = (b.min[0] - B.minX) * s, y = (b.min[2] - B.minZ) * s, w = (b.max[0] - b.min[0]) * s, h = (b.max[2] - b.min[2]) * s;
      const tall = b.max[1] > 2.2;
      ctx.fillStyle = tall ? 'rgba(40,44,52,0.95)' : b.max[1] > 1.2 ? 'rgba(120,95,60,0.95)' : 'rgba(150,125,90,0.9)';
      if (b.mat === 'stone' && !tall) ctx.fillStyle = 'rgba(150,145,140,0.95)';
      ctx.fillRect(x, y, w, h);
      if (tall) { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    }
    this.mapCanvas = c;
    this.mapScale = s;
    this.mapB = B;
  }

  drawRadar(me, remotes, smokes) {
    const ctx = this.radarCtx, R = 100, k = 3.4; // px por metro
    ctx.clearRect(0, 0, 200, 200);
    if (!this.mapCanvas) return;
    const pos = me.pos, yaw = me.yaw;
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    ctx.translate(R, R);
    ctx.rotate(yaw);
    const s = this.mapScale, B = this.mapB;
    ctx.drawImage(this.mapCanvas, -(pos[0] - B.minX) * k, -(pos[2] - B.minZ) * k, this.mapCanvas.width * k / s, this.mapCanvas.height * k / s);
    for (const sm of smokes) {
      ctx.fillStyle = 'rgba(220,220,220,0.75)';
      ctx.beginPath(); ctx.arc((sm.center.x - pos[0]) * k, (sm.center.z - pos[2]) * k, 3.8 * k, 0, Math.PI * 2); ctx.fill();
    }
    const now = performance.now() / 1000;
    if (this.pings && this.pings.length) {
      const tn = performance.now();
      for (const pg of this.pings) {
        const age = (tn - pg.t) / 1000;
        if (age > 4) continue;
        const x = (pg.p[0] - pos[0]) * k, y = (pg.p[2] - pos[2]) * k;
        const ph = (age * 1.5) % 1;
        ctx.strokeStyle = pg.color; ctx.globalAlpha = (1 - ph) * Math.min(1, 4 - age);
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4 + ph * 12, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // minas minhas e dos aliados
    if (this.g.effects && this.g.effects.mines.size) {
      ctx.fillStyle = '#3cff5a'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
      for (const mi of this.g.effects.mines.values()) {
        if (!mi.friendly) continue;
        const x = (mi.p[0] - pos[0]) * k, y = (mi.p[2] - pos[2]) * k;
        ctx.beginPath(); ctx.moveTo(x, y - 3.5); ctx.lineTo(x + 3.5, y); ctx.lineTo(x, y + 3.5); ctx.lineTo(x - 3.5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    for (const r of remotes) {
      if (!r.alive || !r.visiblePos) continue;
      if (this.g.isMate(r.id)) {
        const x = (r.visiblePos.x - pos[0]) * k, y = (r.visiblePos.z - pos[2]) * k;
        ctx.fillStyle = teamColor(this.g.teamOf(r.id)) || '#5aa9ff';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
        continue;
      }
      const seen = now - (r.radarAt || -99);
      if (seen > 1.6) continue;
      const a = Math.min(1, 1.6 - seen);
      const x = (r.visiblePos.x - pos[0]) * k, y = (r.visiblePos.z - pos[2]) * k;
      ctx.fillStyle = `rgba(255,70,60,${a})`;
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(0,0,0,${a * 0.7})`; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    // jogador no centro
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.moveTo(R, R - 8); ctx.lineTo(R + 6, R + 6); ctx.lineTo(R, R + 3); ctx.lineTo(R - 6, R + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    // cone de visão
    const f = this.g.camera.fov * DEG;
    const hf = Math.atan(Math.tan(f / 2) * this.g.camera.aspect);
    const grad = ctx.createRadialGradient(R, R, 0, R, R, 80);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, 80, -Math.PI / 2 - hf, -Math.PI / 2 + hf); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    const nx = R + Math.sin(-yaw) * 88 * -1, ny = R - Math.cos(-yaw) * 88;
    ctx.fillText('N', R - Math.sin(yaw) * 88, R - Math.cos(yaw) * 88 + 4);
    void nx; void ny;
  }

  // ------------------------------------------------------------- mira
  drawCrosshair(inaccDeg, recoilOff, hide, smallDot) {
    const c = this.g.settings.crosshair;
    const cv = this.el.crosshair;
    if (hide) { if (this.xhKey !== 'hide') { this.xhCtx.clearRect(0, 0, 200, 200); this.xhKey = 'hide'; } return; }
    const fov = this.g.camera.fov * DEG;
    const focal = (innerHeight / 2) / Math.tan(fov / 2);
    const dyn = c.dynamic ? Math.min(80, Math.tan(inaccDeg * DEG) * focal * 0.5) : 0;
    const gap = Math.round(c.gap + dyn);
    const ox = c.followRecoil && recoilOff ? Math.round(recoilOff[0] * focal) : 0;
    const oy = c.followRecoil && recoilOff ? Math.round(recoilOff[1] * focal) : 0;
    const key = [gap, ox, oy, smallDot, JSON.stringify(c)].join('|');
    if (key === this.xhKey) return;
    this.xhKey = key;
    const ctx = this.xhCtx;
    ctx.clearRect(0, 0, 200, 200);
    const cx = 100 + ox, cy = 100 + oy;
    const th = Math.max(1, c.thickness), len = c.size * 2, ol = c.outline ? c.outlineThickness : 0;
    ctx.globalAlpha = c.alpha;
    const rect = (x, y, w, h) => {
      if (ol) { ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(x - ol, y - ol, w + ol * 2, h + ol * 2); }
      ctx.fillStyle = c.color; ctx.fillRect(x, y, w, h);
    };
    if (smallDot) { rect(cx - 1, cy - 1, 2, 2); ctx.globalAlpha = 1; return; }
    const off = th % 2 ? 0.5 : 0;
    if (c.style === 'circle') {
      const r = Math.max(4, gap + c.size);
      if (ol) { ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = th + ol * 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = c.color; ctx.lineWidth = th; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    } else if (c.style !== 'dot') {
      const h = Math.floor(th / 2);
      rect(cx + gap, cy - h - off + 0.5, len, th);
      rect(cx - gap - len, cy - h - off + 0.5, len, th);
      rect(cx - h - off + 0.5, cy + gap, th, len);
      if (!c.tStyle) rect(cx - h - off + 0.5, cy - gap - len, th, len);
    }
    if (c.dot || c.style === 'dot') { const d = Math.max(2, th); rect(cx - d / 2, cy - d / 2, d, d); }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- eventos
  killfeed(k) {
    const div = document.createElement('div');
    div.className = 'kf' + (k.mine ? ' mine' : '') + (k.me ? ' me' : '');
    const ic = this.icon(k.w);
    const flags = (k.air ? ICONS.air : '') + (k.ns ? ICONS.ns : '') + (k.sm ? ICONS.sm : '') + (k.pen ? ICONS.pen : '') + (k.hs ? ICONS.hs : '');
    const kc = teamColor(k.kt), vc = teamColor(k.vt);
    const ks = kc ? ` style="color:${kc}"` : '', vs = vc ? ` style="color:${vc}"` : '';
    const streak = k.streak >= 3 ? `<span class="kstreak">${k.streak}×</span>` : '';
    if (k.suicide) div.innerHTML = `${ic ? `<img src="${ic}">` : ICONS.skull}<span class="v ${k.me ? 'meName' : ''}"${vs}>${esc(k.victim)}</span>`;
    else div.innerHTML = `<span class="k ${k.mine ? 'meName' : ''}"${ks}>${esc(k.killer)}</span>${streak}${ic ? `<img src="${ic}">` : ''}<span class="ic">${flags}</span>${k.tk ? '<span class="tktag">ALIADO</span>' : ''}<span class="v ${k.me ? 'meName' : ''}"${vs}>${esc(k.victim)}</span>`;
    const feed = this.el.killfeed;
    feed.appendChild(div);
    while (feed.children.length > 7) feed.removeChild(feed.firstChild);
    setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 600); }, k.mine || k.me ? 9000 : 6500);
  }

  hitmarker(kind) {
    const h = this.el.hitmarker;
    h.className = kind === 'kill' ? 'kill' : kind === 'hs' ? 'hs' : '';
    h.style.transition = 'none';
    h.style.opacity = '1';
    h.style.transform = `scale(${kind === 'kill' ? 1.25 : 1})`;
    void h.offsetWidth;
    h.style.transition = 'opacity .35s ease-out, transform .2s';
    h.style.opacity = '0';
    h.style.transform = 'scale(1)';
  }

  damageFrom(srcPos, myPos, yaw) {
    const dx = srcPos[0] - myPos[0], dz = srcPos[2] - myPos[2];
    const ang = Math.atan2(-dx, -dz) - yaw; // relativo à visão
    const arc = document.createElement('div');
    arc.className = 'dmgarc';
    arc.style.transform = `rotate(${-ang}rad)`;
    this.el.dmgind.appendChild(arc);
    requestAnimationFrame(() => { arc.style.opacity = '0'; });
    setTimeout(() => arc.remove(), 1000);
  }

  // número de dano flutuante no ponto atingido (posição de tela já projetada)
  damageNumber(x, y, dmg, kind) {
    if (!this.g.settings.damageNumbers || dmg <= 0) return;
    const d = document.createElement('div');
    d.className = 'dmgnum ' + (kind || '');
    d.textContent = dmg;
    d.style.left = (x + (Math.random() - 0.5) * 18) + 'px';
    d.style.top = y + 'px';
    this.el.hud.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  setStreak(n) {
    if (!this.streakEl) { this.streakEl = document.createElement('div'); this.streakEl.id = 'streak'; this.el.hud.appendChild(this.streakEl); }
    const txt = n >= 2 ? `SEQUÊNCIA ${n}` : '';
    if (this.streakEl.textContent !== txt) {
      this.streakEl.textContent = txt;
      this.streakEl.classList.remove('pop'); void this.streakEl.offsetWidth; if (txt) this.streakEl.classList.add('pop');
    }
  }

  center(html, dur = 2) { this.el.centermsg.innerHTML = html; this.centerT = dur; this.el.centermsg.style.opacity = 1; }
  announce(text) {
    this.el.announce.innerHTML = `<div class="an">${esc(text)}</div>`;
    this.announceT = 2.2;
    this.el.announce.style.opacity = 1;
  }
  // abate em sequência: nome cresce com a quantidade de abates
  multiKill(name, n, mine, color) {
    const el = this.el.multikill;
    if (!el) return;
    const tier = Math.min(10, n);
    el.className = 'mk' + tier + (mine ? ' mine' : '');
    el.innerHTML = `<div class="mkt">${esc(multiKillName(n))}</div><div class="mkn"${color ? ` style="color:${color}"` : ''}>${esc(name)}${n > 10 ? ` • ${n} abates seguidos` : ''}</div>`;
    el.style.opacity = 1;
    // reinicia a animação
    void el.offsetWidth;
    el.classList.add('show');
    this.multiT = 2.2 + Math.min(2, (n - 2) * 0.25);
  }
  toast(text, dur = 2.5) { this.el.toast.textContent = text; this.el.toast.style.opacity = 1; this.toastT = dur; }

  flashbang(amount, dur) {
    this.flashA = Math.max(this.flashA, amount);
    this.flashDur = dur; this.flashT = dur;
    this.flashFull = dur * 0.45;
  }

  // ------------------------------------------------------------- chat
  chatLine(m) { this.g.chat.line(m); }
  openChat(team) { this.chatOpen = true; this.g.chat.openInput(team); }
  closeChat() { this.chatOpen = false; this.g.chat.closeInput(); }

  // marcador temporário no radar (mensagem de rádio)
  radarPing(p, color) {
    this.pings = (this.pings || []).filter((x) => performance.now() - x.t < 4000);
    this.pings.push({ p, color, t: performance.now() });
  }

  showSlots() { this.slotsT = 2.2; this.slotsDirty = true; }

  // ------------------------------------------------------------- placar
  rows() {
    const g = this.g;
    const list = [...g.scores.values()].filter((r) => g.players.has(r[0]));
    const gg = g.matchSettings.mode === 'gungame';
    list.sort((a, b) => (gg ? (b[10] || 0) - (a[10] || 0) : 0) || (b[1] - a[1]) || (a[3] - b[3]) || (b[4] - a[4]) || (b[5] - a[5]));
    return list;
  }

  scoreboardHTML(rows, title, cls = '') {
    const g = this.g;
    const gg = g.matchSettings.mode === 'gungame', ctf = g.matchSettings.mode === 'ctf';
    let h = `<table class="sb ${cls}">${title ? `<caption>${title}</caption>` : ''}<tr><th>#</th><th>Jogador</th>${gg ? '<th>Nível</th>' : ''}${ctf ? '<th>Capturas</th>' : ''}<th>Pontos</th><th>Abates</th><th>Mortes</th><th>K/D</th><th>HS%</th><th>Dano</th><th>Ping</th></tr>`;
    rows.forEach((r, i) => {
      const p = g.players.get(r[0]);
      const name = p ? p.name : (r.name || '?');
      const kd = r[3] ? (r[2] / r[3]).toFixed(2) : r[2].toFixed(2);
      const hs = r[2] ? Math.round(r[4] / r[2] * 100) + '%' : '0%';
      const tags = (p && p.id === g.hostId ? '<span class="hostbadge" style="margin-left:6px">HOST</span>' : '') + (p && p.bot || r[6] < 0 ? '<span class="tag">BOT</span>' : '');
      const lvl = gg ? `<td>${Math.min((r[10] || 0) + 1, GUNGAME_LIST.length)}/${GUNGAME_LIST.length}</td>` : ctf ? `<td>${r[11] || 0}</td>` : '';
      h += `<tr class="${r[0] === g.myId ? 'me' : ''} ${r[7] ? '' : 'dead'}"><td class="pos">${i + 1}</td><td>${esc(name)}${tags}</td>${lvl}<td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${kd}</td><td>${hs}</td><td>${r[5]}</td><td>${r[6] < 0 ? 'BOT' : r[6]}</td></tr>`;
    });
    h += '</table>';
    return h;
  }

  teamTables(rows, ts) {
    const t = ts || { ct: 0, tr: 0 };
    const part = (team) => {
      const T = TEAMS[team];
      const list = rows.filter((r) => TEAM_BY_CODE[r[8]] === team);
      return this.scoreboardHTML(list, `<span style="color:${T.color}">${T.full}</span> <b style="color:${T.color}">${t[team] || 0}</b>`, 'team-' + team);
    };
    return `<div class="sbteams">${part('ct')}${part('tr')}</div>`;
  }

  showScoreboard(on) {
    const el = this.el.scoreboard;
    if (!on) { el.classList.add('hidden'); return; }
    const g = this.g;
    const s = g.matchSettings;
    const team = isTeamModeId(s.mode), gg = s.mode === 'gungame', ctf = s.mode === 'ctf';
    const lim = ctf ? `${s.captureLimit} capturas` : `${team ? s.teamKillLimit : s.killLimit} abates`;
    const cond = gg ? `vence quem passar pelas ${GUNGAME_LIST.length} armas${s.endCondition !== 'kills' ? ` • ${s.timeLimitMin} min` : ''}`
      : s.endCondition === 'time' ? `${s.timeLimitMin} min` : s.endCondition === 'kills' ? lim : `${s.timeLimitMin} min ou ${lim}`;
    const tb = team ? '' : ` • desempate: ${s.tiebreak === 'sudden' ? 'morte súbita' : 'menos mortes → mais HS → mais dano'}`;
    const body = team ? this.teamTables(this.rows(), g.teamScore) : this.scoreboardHTML(this.rows());
    el.innerHTML = `<div class="sbhead"><h2>Placar — ${esc(modeName(s.mode))}</h2><span>${mapName(s.map)} • ${cond}${tb}</span></div>` + body;
    el.classList.remove('hidden');
  }

  showDeath(info) {
    const el = this.el.death;
    if (!info) { el.classList.add('hidden'); return; }
    const ic = this.icon(info.w);
    el.innerHTML = `<h2>${info.suicide ? 'Você se matou' : 'Você foi abatido'}</h2>
      ${info.suicide ? '' : `<div class="who"><span>${esc(info.killer)}</span>${ic ? `<img src="${ic}">` : ''}${info.hs ? ICONS.hs : ''}</div>
      <div class="info">${esc(WEAPONS[info.w] ? WEAPONS[info.w].name : '')}${info.hs ? ' • tiro na cabeça' : ''}${info.pen ? ' • através da parede' : ''} — ${esc(info.killer)} ficou com <b>${info.kh} HP</b>${info.ka ? ` e ${info.ka} de colete` : ''}</div>`}
      <div class="resp" id="respawncd"></div><div class="info">${keyName(settings.keys.loadout)} = trocar armas • ${keyName(settings.keys.equipment)} = equipamentos • ${keyName(settings.keys.scoreboard)} = placar</div>`;
    el.classList.remove('hidden');
  }

  showEnd(result, endsAt) {
    const el = this.el.endscreen;
    if (!result) { el.classList.add('hidden'); return; }
    const g = this.g;
    const rk = result.ranking;
    const w = rk[0];
    const reasons = { kills: 'limite de abates atingido', time: 'tempo esgotado', sudden: 'morte súbita', host: 'encerrada pelo anfitrião', gungame: 'completou todas as armas' };
    const pod = (r, i) => r ? `<div class="pd p${i + 1}"><div class="nm">${esc(r.name)}</div><div class="sc">${r.row[1]} pts • ${r.row[2]}/${r.row[3]} • ${r.row[4]} HS</div><div class="blk">${i + 1}º</div></div>` : '<div class="pd"></div>';
    const rows = rk.map((r) => { const row = [...r.row]; row.name = r.name; return row; });
    if (result.teams) {
      const T = result.winnerTeam ? TEAMS[result.winnerTeam] : null;
      el.innerHTML = `<div class="winner">${T ? `🏆 <b style="color:${T.color}">${T.full}</b> venceram!` : 'Empate!'}</div>
        <div class="teamscore"><span style="color:${TEAMS.ct.color}">CT ${result.teams.ct}</span> × <span style="color:${TEAMS.tr.color}">${result.teams.tr} TR</span></div>
        <div class="subwin">${result.mode === 'ctf' && result.reason === 'kills' ? 'limite de capturas atingido' : reasons[result.reason] || ''} • MVP: <b>${w ? esc(w.name) : '-'}</b> • <span id="nextmatch"></span></div>` + this.teamTables(rows, result.teams);
      el.classList.remove('hidden');
      this.endsAt = endsAt;
      return;
    }
    el.innerHTML = `<div class="winner">${w ? `🏆 <b>${esc(w.name)}</b> venceu!` : 'Fim de partida'}</div>
      <div class="subwin">${reasons[result.reason] || ''}${result.tiebreak ? ` • desempate: ${esc(result.tiebreak)}` : ''} • <span id="nextmatch"></span></div>
      <div class="podium">${pod(rk[1], 1)}${pod(rk[0], 0)}${pod(rk[2], 2)}</div>` + this.scoreboardHTML(rows);
    el.classList.remove('hidden');
    this.endsAt = endsAt;
    void g;
  }

  // ------------------------------------------------------------- quadro a quadro
  update(dt) {
    const g = this.g, me = g.me, el = this.el;
    const w = WEAPONS[me.weapon];
    const set = g.settings;
    // vida / colete
    const v = this.lastVals;
    if (v.hp !== me.hp) { el.hp.textContent = Math.max(0, me.hp); el.hpbar.style.width = Math.max(0, me.hp) + '%'; el.vitals.classList.toggle('low', me.hp <= 25); v.hp = me.hp; }
    if (v.ar !== me.armor || v.hm !== me.helmet) { el.ar.textContent = me.armor; el.arbar.style.width = me.armor + '%'; el.armorico.textContent = me.helmet ? '⛑' : '⛨'; v.ar = me.armor; v.hm = me.helmet; }
    // munição
    const slot = me.inv[me.weapon];
    const magTxt = w && w.mag ? (slot ? slot.mag : 0) : w && w.type === 'grenade' ? me.nades[me.weapon] : '';
    const resTxt = w && w.mag ? `/ ${g.matchSettings.infiniteAmmo ? '∞' : (slot ? slot.res : 0)}` : '';
    if (v.mag !== magTxt || v.res !== resTxt) { el.mag.textContent = magTxt; el.res.textContent = resTxt; el.mag.classList.toggle('empty', w && w.mag && slot && slot.mag <= Math.ceil(w.mag * 0.2)); v.mag = magTxt; v.res = resTxt; }
    if (v.wn !== me.weapon) { el.weapname.textContent = w ? w.name : ''; v.wn = me.weapon; }
    const nk = `${me.nades.he}${me.nades.flash}${me.nades.smoke}${me.nades.mine || 0}${me.weapon}`;
    if (v.nades !== nk) {
      el.nades.innerHTML = [['he', 'HE'], ['flash', 'LUZ'], ['smoke', 'FUMAÇA'], ['mine', 'MINA']].filter(([k]) => me.nades[k] > 0).map(([k, n]) => `<span class="${me.weapon === k ? 'sel' : ''}">${n}${me.nades[k] > 1 ? ' ×' + me.nades[k] : ''}</span>`).join('');
      v.nades = nk;
    }
    // slots
    if (this.slotsT > 0) {
      this.slotsT -= dt;
      if (this.slotsDirty) {
        const list = [[me.primary, '1'], [me.secondary, '2'], ['knife', '3'], ['he', '4'], ['flash', '5'], ['smoke', '6'], ['mine', '7']].filter(([id], i, arr) => me.hasWeapon(id) && arr.findIndex((x) => x[0] === id) === i);
        el.slots.innerHTML = list.map(([id, key]) => `<div class="slot ${id === me.weapon ? 'cur' : ''}"><b>${key}</b><img src="${this.icon(id)}"><span>${WEAPONS[id].name}</span></div>`).join('');
        this.slotsDirty = false;
      }
      el.slots.style.opacity = Math.min(1, this.slotsT * 2);
    } else el.slots.style.opacity = 0;
    // proteção
    const prot = me.alive && performance.now() / 1000 < me.protectedUntil;
    el.protect.textContent = prot ? `PROTEGIDO ${(me.protectedUntil - performance.now() / 1000).toFixed(1)}s` : '';
    // mira / luneta
    const scoped = me.alive && me.scope > 0 && w && w.scope;
    el.scope.classList.toggle('hidden', !scoped);
    if (scoped) el.scope.classList.toggle('reddot', w.scope.overlay === 'red-dot');
    const hideXh = !me.alive || scoped || g.menuOpen;
    const sniperUnscoped = w && w.type === 'sniper' && !scoped;
    const rOff = [Math.tan(-me.recoil[1] * 0.5 * DEG), Math.tan(-me.recoil[0] * 0.5 * DEG)];
    this.drawCrosshair(me.curInacc || 0, rOff, hideXh, sniperUnscoped);
    // flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      const el2 = this.flashDur - this.flashT;
      const a = el2 < this.flashFull ? this.flashA : this.flashA * Math.max(0, this.flashT / (this.flashDur - this.flashFull));
      el.flash.style.opacity = a.toFixed(3);
    } else if (el.flash.style.opacity !== '0') el.flash.style.opacity = '0';
    // fumaça (dentro)
    const sd = g.smokeDensity || 0;
    el.smokeov.style.opacity = (sd * 0.97).toFixed(3);
    // vida baixa
    el.vignette.style.opacity = me.alive && me.hp < 35 ? ((35 - me.hp) / 35 * (0.6 + Math.sin(performance.now() / 300) * 0.2)).toFixed(3) : '0';
    // mensagens
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT < 0.4) el.centermsg.style.opacity = Math.max(0, this.centerT / 0.4); }
    if (this.announceT > 0) { this.announceT -= dt; if (this.announceT < 0.5) el.announce.style.opacity = Math.max(0, this.announceT / 0.5); }
    if (this.multiT > 0) { this.multiT -= dt; if (this.multiT <= 0) { el.multikill.style.opacity = 0; el.multikill.classList.remove('show'); } }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) el.toast.style.opacity = 0; }
    // relógio / informações
    this.updateTimer();
    g.chat.update();
    // radar
    this.radarAcc += dt;
    if (this.radarAcc > 1 / 30) {
      this.radarAcc = 0;
      const pos = me.alive ? me.ms.pos : (me.deathPos ? [me.deathPos.x, 0, me.deathPos.z] : [0, 0, 0]);
      this.drawRadar({ pos, yaw: me.yaw }, [...g.remotes.values()], g.effects.smokes);
    }
    // fps / ping
    this.fpsFrames++; this.fpsAcc += dt;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsFrames = 0; this.fpsAcc = 0;
      const parts = [];
      if (set.showFps) parts.push(`${this.fps} FPS`);
      if (set.showNet) parts.push(`${Math.round(g.net.rtt * 1000)} ms`);
      el.perf.textContent = parts.join(' • ');
    }
    // contagem de renascimento
    const cd = document.getElementById('respawncd');
    if (cd && g.respawnAt) {
      const left = g.respawnAt - performance.now() / 1000;
      cd.textContent = g.match.phase === 'ended' ? 'Aguardando a próxima partida' : left > 0 ? `Renascendo em ${left.toFixed(1)}s` : 'Renascendo...';
    }
    const nm = document.getElementById('nextmatch');
    if (nm && this.endsAt) nm.textContent = `próxima partida em ${Math.max(0, Math.ceil(this.endsAt - g.serverTime()))}s`;
  }

  updateTimer() {
    const g = this.g, el = this.el, m = g.match, s = g.matchSettings;
    if (!m) return;
    const now = g.serverTime();
    let timer = '--:--', banner = '', low = false;
    const fmt = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
    if (m.phase === 'room') {
      timer = '--:--';
      banner = 'Sala de espera';
    } else if (m.phase === 'live') {
      if (m.sudden) { timer = 'MORTE SÚBITA'; banner = s.mode === 'ctf' ? 'A próxima captura decide a equipe vencedora!' : s.mode === 'tdm' ? 'O próximo abate decide a equipe vencedora!' : 'O próximo abate de um líder decide!'; low = true; }
      else if (m.endsAt) { const left = m.endsAt - now; timer = fmt(left); low = left < 30; }
      else timer = fmt(now - m.startedAt);
    } else if (m.phase === 'ended') {
      timer = 'FIM'; banner = `Próxima partida em ${fmt(m.endsAt - now)}`;
    }
    if (el.timer.textContent !== timer) el.timer.textContent = timer;
    el.timer.classList.toggle('low', low);
    if (el.banner.textContent !== banner) el.banner.textContent = banner;
    // líder e posição
    const rows = this.rows();
    const lead = rows[0];
    const myIdx = rows.findIndex((r) => r[0] === g.myId);
    let info = '';
    const goal = s.endCondition === 'time' ? '' : s.mode === 'ctf' ? `Meta: <b>${s.captureLimit}</b> capturas • ` : `Meta: <b>${s.mode === 'tdm' ? s.teamKillLimit : s.killLimit}</b> • `;
    if (s.mode === 'ctf') {
      const t = g.teamScore || { ct: 0, tr: 0 };
      const fl = g.flags;
      const st = (team) => {
        const f = fl && fl[team];
        if (!f || f.s === 0) return 'na base';
        if (f.s === 1) return f.c === g.myId ? '<b>com você!</b>' : `com <b>${esc(g.pname(f.c))}</b>`;
        return `caída (${Math.max(0, Math.ceil(f.back - now))}s)`;
      };
      info = `<span class="tsc" style="color:${TEAMS.ct.color}">CT ${t.ct}</span> × <span class="tsc" style="color:${TEAMS.tr.color}">${t.tr} TR</span> • ${goal}<span style="color:${TEAMS.ct.color}">⚑ CT</span> ${st('ct')} • <span style="color:${TEAMS.tr.color}">⚑ TR</span> ${st('tr')}`;
    } else if (s.mode === 'tdm') {
      const t = g.teamScore || { ct: 0, tr: 0 };
      const mt = g.teamOf(g.myId);
      info = `<span class="tsc" style="color:${TEAMS.ct.color}">CT ${t.ct}</span> × <span class="tsc" style="color:${TEAMS.tr.color}">${t.tr} TR</span> • ${goal}Você: <b style="color:${teamColor(mt) || '#fff'}">${mt ? TEAMS[mt].full : '-'}</b>`;
    } else if (s.mode === 'gungame') {
      const mine = rows[myIdx];
      const lvl = mine ? (mine[10] || 0) : 0;
      const wid = GUNGAME_LIST[Math.min(lvl, GUNGAME_LIST.length - 1)];
      const lp = lead ? g.players.get(lead[0]) : null;
      info = `Nível <b>${Math.min(lvl + 1, GUNGAME_LIST.length)}/${GUNGAME_LIST.length}</b> (${esc(WEAPONS[wid].name)})${lead ? ` • Líder: <b>${esc(lp ? lp.name : '?')}</b> (nível ${(lead[10] || 0) + 1})` : ''}`;
    } else if (lead) {
      const lp = g.players.get(lead[0]);
      info = `${goal}Líder: <b>${esc(lp ? lp.name : '?')}</b> (${lead[1]})`;
      if (myIdx >= 0) info += ` • Você: <b>${myIdx + 1}º</b> (${rows[myIdx][1]})`;
    }
    if (this.lastInfo !== info) { el.matchinfo.innerHTML = info; this.lastInfo = info; }
  }
}
