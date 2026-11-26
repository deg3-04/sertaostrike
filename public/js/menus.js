// Menus: tela inicial, seleção de equipamento, pausa, opções e
// configurações da partida (anfitrião).
import * as THREE from '/lib/three.js';
import { WEAPONS, PRIMARIES, SECONDARIES, weaponBars, cycleTime } from '/shared/weapons.js';
import { CHARACTERS, SIDES, HIT_ZONES, MATCH_LIMITS, GAME_NAME, DAMAGE_SCALE } from '/shared/constants.js';
import { applyArmor } from '/shared/combat.js';
import { settings, saveSettings, resetSettings, KEY_LABELS, keyName, QUALITY, CROSSHAIR_PRESETS } from './settings.js';
import { Character, CHAR_STYLE } from './models.js';
import { MAP_LIST, mapName } from '/shared/maps.js';
import { mapCard } from './mappreview.js';
import { MODES, modeName, GUNGAME_LIST, HALF_STEP_KEYS } from '/shared/constants.js';
import { SOUND_PACKS } from '/shared/sounds.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ seletor de armas
function damageLine(w, dist = 10) {
  if (!w.damage) return '';
  const falloff = Math.pow(w.rangeMod, dist / 12.7) * (w.pellets || 1) * DAMAGE_SCALE;
  const z = (zone, armor) => {
    const raw = w.damage * falloff * HIT_ZONES[zone].mult;
    return Math.floor(armor ? applyArmor(raw, w.armorPen, 100, true, zone).health : raw);
  };
  const chest = z('chest', true);
  const btk = Math.ceil(100 / Math.max(1, chest));
  return `<div class="zones">
    <span>Cabeça <b>${z('head', true)}</b></span><span>Tronco <b>${chest}</b></span>
    <span>Abdômen <b>${z('stomach', true)}</b></span><span>Pernas <b>${z('legs', false)}</b></span>
  </div><div class="tiny muted" style="margin-top:6px">Dano a ${dist} m contra colete e capacete${w.pellets ? ` (${w.pellets} bagos somados)` : ''} • ${btk} tiro${btk > 1 ? 's' : ''} no tronco para abater</div>`;
}

export function weaponPicker(container, state, icons, onChange) {
  let tab = state.tab || 'primary';
  const render = () => {
    const list = tab === 'primary' ? PRIMARIES : SECONDARIES;
    const selId = tab === 'primary' ? state.primary : state.secondary;
    const w = WEAPONS[selId];
    const bars = weaponBars(w);
    const barRow = (label, v, txt) => `<div class="stat"><span>${label}</span><div class="b"><i style="width:${Math.round(v * 100)}%"></i></div><em>${txt}</em></div>`;
    container.innerHTML = `
      <div class="wtabs seg"><button data-tab="primary" class="${tab === 'primary' ? 'sel' : ''}">Arma principal</button><button data-tab="secondary" class="${tab === 'secondary' ? 'sel' : ''}">Pistola</button></div>
      <div class="wgrid">${list.map((id) => `<div class="wcard ${id === selId ? 'sel' : ''}" data-w="${id}"><img src="${icons[id] ? icons[id].color : ''}" alt=""><b>${WEAPONS[id].name}</b><div class="cls">${WEAPONS[id].cls}</div></div>`).join('')}</div>
      <div class="wdetail">
        <div>
          <div class="big"><img src="${icons[selId] ? icons[selId].color : ''}" alt=""></div>
          <h4>${w.name}</h4><div class="real">${esc(w.real)}</div>
          ${damageLine(w)}
        </div>
        <div>
          ${barRow('Dano', bars.dano, Math.round(w.damage * DAMAGE_SCALE * (w.pellets || 1)))}
          ${barRow('Cadência', bars.cadencia, w.rpm + ' rpm')}
          ${barRow('Precisão', bars.precisao, '')}
          ${barRow('Controle', bars.controle, '')}
          ${barRow('Mobilidade', bars.mobilidade, Math.round(w.speed / 0.0254) + ' u/s')}
          ${barRow('Alcance', bars.alcance, Math.round(w.rangeMod * 100) + '%')}
          <div class="specs">
            <span>Pente: <b>${w.mag}</b> / ${w.reserve}</span><span>Recarga: <b>${w.shellReload ? (w.reloadStart + w.reload * w.mag).toFixed(1) + 's (cartucho a cartucho)' : w.reload + 's'}</b></span>
            <span>Disparo: <b>${w.auto ? 'automático' : 'semiautomático'}</b></span><span>Penetra colete: <b>${Math.round(w.armorPen * 100)}%</b></span>
            ${w.scope ? `<span>Luneta: <b>${w.scope.levels.length} nível${w.scope.levels.length > 1 ? 's' : ''}</b></span>` : ''}${w.penetration >= 0.5 ? '<span>Atravessa madeira/metal</span>' : ''}
          </div>
        </div>
      </div>`;
  };
  container.onclick = (e) => {
    const t = e.target.closest('[data-tab],[data-w]');
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; state.tab = tab; render(); return; }
    const id = t.dataset.w;
    if (PRIMARIES.includes(id)) state.primary = id; else state.secondary = id;
    render();
    onChange && onChange(state);
  };
  render();
  return { render };
}

// ------------------------------------------------------------------ prévia do personagem
class CharPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x7a5a3a, 1.6));
    const d = new THREE.DirectionalLight(0xffe6c0, 3); d.position.set(-2, 3, -3); this.scene.add(d);
    const r = new THREE.DirectionalLight(0x88aaff, 1.2); r.position.set(3, 2, 2); this.scene.add(r);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.2, -3.9); this.camera.lookAt(0, 0.95, 0);
    this.char = null;
    this.t = 0;
    this.running = false;
  }
  set(charId, weapon) {
    if (!this.char) { this.char = new Character(charId); this.scene.add(this.char.root); }
    this.char.setChar(charId);
    this.char.setWeapon(weapon);
  }
  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.t += dt;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (w && h && (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.floor(h * this.renderer.getPixelRatio()))) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      }
      if (this.char) {
        this.char.root.rotation.y = Math.PI * 0.12 + Math.sin(this.t * 0.6) * 0.5;
        this.char.animate({ speed: 0, crouch: false, pitch: Math.sin(this.t * 0.8) * 0.08, onGround: true, dt, fwdSpeed: 0, sideSpeed: 0 });
      }
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }
}

// ------------------------------------------------------------------ menus
export class Menus {
  constructor(game) {
    this.g = game;
    this.start = $('start');
    this.loadout = $('loadout');
    this.pause = $('pause');
    this.settingsEl = $('settings');
    this.state = { primary: settings.primary, secondary: settings.secondary, tab: 'primary' };
    this.settingsTab = 'jogo';
    this.waitingKey = null;
    this.serverInfo = null;
  }

  anyOpen() {
    return !this.loadout.classList.contains('hidden') || !this.pause.classList.contains('hidden') || !this.settingsEl.classList.contains('hidden') || !this.start.classList.contains('hidden');
  }

  // ---------------------------------------------------------------- inicial
  buildStart() {
    const g = this.g;
    const chars = CHARACTERS.map((c) => {
      const st = CHAR_STYLE[c.id];
      return `<div class="charcard ${settings.char === c.id ? 'sel' : ''}" data-char="${c.id}"><div class="sw">${st.swatch.map((s) => `<i style="background:${s}"></i>`).join('')}</div><b>${c.name}</b><span>${c.desc}</span></div>`;
    }).join('');
    this.start.innerHTML = `
      <div class="wrap">
        <div class="col">
          <div class="logo">SERTÃO<br>STRIKE<small>FPS NA REDE LOCAL</small></div>
          <div class="panel">
            <h3>Seu nick</h3>
            <input class="text" id="nick" maxlength="16" placeholder="Digite seu nome" value="${esc(settings.name)}" autocomplete="off">
          </div>
          <div class="panel">
            <h3>Personagem</h3>
            <canvas id="charpreview"></canvas>
            <div class="chars">${chars}</div>
          </div>
          <div class="panel">
            <h3>Lado de renascimento</h3>
            <div class="seg" id="sides">${SIDES.map((s) => `<button data-side="${s.id}" class="${settings.side === s.id ? 'sel' : ''}">${s.name}</button>`).join('')}</div>
            <div class="tiny muted" style="margin-top:8px">O servidor escolhe o ponto mais seguro (longe dos inimigos) dentro do lado escolhido.</div>
          </div>
        </div>
        <div class="col">
          <div class="panel" id="serverpanel"><h3>Servidor</h3><div class="serverinfo" id="serverinfo">Conectando...</div></div>
          <div class="panel"><h3>Armamento</h3><div id="startweapons"></div></div>
          <div class="row">
            <button class="btn" id="btnsettings">Opções</button>
            <div class="grow"></div>
            <button class="btn primary big" id="btnplay" style="max-width:360px">Jogar</button>
          </div>
          <div class="tiny muted">WASD movimenta • Mouse atira/mira • Espaço pula • Ctrl agacha • Shift anda em silêncio • R recarrega • 1-6 armas • Q última arma • B equipamento • TAB placar • Y chat • Esc menu</div>
        </div>
      </div>`;
    const nick = $('nick');
    nick.addEventListener('input', () => { settings.name = nick.value.slice(0, 16); saveSettings(); });
    nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.play(); });
    this.start.querySelector('.chars').onclick = (e) => {
      const c = e.target.closest('[data-char]');
      if (!c) return;
      settings.char = c.dataset.char; saveSettings();
      this.start.querySelectorAll('.charcard').forEach((el) => el.classList.toggle('sel', el.dataset.char === settings.char));
      this.preview.set(settings.char, this.state.primary);
      g.audio.ui('click');
    };
    $('sides').onclick = (e) => {
      const b = e.target.closest('[data-side]');
      if (!b) return;
      settings.side = b.dataset.side; saveSettings();
      $('sides').querySelectorAll('button').forEach((el) => el.classList.toggle('sel', el.dataset.side === settings.side));
    };
    weaponPicker($('startweapons'), this.state, g.icons, (st) => {
      settings.primary = st.primary; settings.secondary = st.secondary; saveSettings();
      this.preview.set(settings.char, st.tab === 'secondary' ? st.secondary : st.primary);
    });
    $('btnplay').onclick = () => this.play();
    $('btnsettings').onclick = () => this.openSettings('jogo');
    this.preview = new CharPreview($('charpreview'));
    this.preview.set(settings.char, settings.primary);
    this.preview.start();
    if (this.serverInfo) this.updateServerInfo(this.serverInfo);
  }

  updateServerInfo(info) {
    this.serverInfo = info;
    const el = $('serverinfo');
    if (!el) return;
    if (!info) { el.innerHTML = '<span class="status-dot off"></span>Sem conexão com o servidor. Verifique se ele está rodando e recarregue a página.'; return; }
    const s = info.settings;
    const lim = s.mode === 'tdm' ? `${s.teamKillLimit} abates da equipe` : `${s.killLimit} abates`;
    const cond = s.mode === 'gungame' ? `${GUNGAME_LIST.length} armas` : s.endCondition === 'time' ? `${s.timeLimitMin} minutos` : s.endCondition === 'kills' ? lim : `${s.timeLimitMin} min ou ${lim} (o que vier primeiro)`;
    const humans = info.players.filter((p) => !p.bot);
    const addr = (info.ips && info.ips.length ? info.ips.map((ip) => `http://${ip}:${info.port}`).join(' ou ') : location.origin);
    el.innerHTML = `<span class="status-dot"></span><b>${esc(info.name)}</b> — ${humans.length} jogador${humans.length === 1 ? '' : 'es'}${info.players.length > humans.length ? ` + ${info.players.length - humans.length} bot(s)` : ''} (máx. ${info.max})<br>
      ${esc(modeName(s.mode))} • ${esc(mapName(s.map))} • ${cond} • renascimento ${s.respawnTime}s • fase: ${info.phase === 'room' ? 'sala de espera' : info.phase === 'live' ? 'em andamento' : 'fim de partida'}<br>
      <span class="muted">Amigos entram por: <b>${esc(addr)}</b></span>
      <div class="players">${info.players.map((p) => `<span>${esc(p.name)}</span>`).join('')}</div>`;
  }

  play() {
    const g = this.g;
    const nick = $('nick');
    let name = (nick.value || '').trim();
    if (!name) { name = 'Jogador' + Math.floor(Math.random() * 900 + 100); nick.value = name; }
    settings.name = name; saveSettings();
    g.audio.init();
    const info = { name, char: settings.char, primary: settings.primary, secondary: settings.secondary, side: settings.side };
    if (!g.net.connected) {
      g.pendingJoin = info;
      const el = $('serverinfo'); if (el) el.innerHTML = '<span class="status-dot off"></span>Conectando ao servidor... você entra assim que a conexão abrir.';
      g.enterFullscreen();
      return;
    }
    g.join(info);
  }

  hideStart() { this.start.classList.add('hidden'); if (this.preview) this.preview.stop(); }
  showStart() { this.start.classList.remove('hidden'); if (this.preview) this.preview.start(); }

  // ---------------------------------------------------------------- equipamento
  openLoadout() {
    const g = this.g;
    const st = { primary: g.me.primary || settings.primary, secondary: g.me.secondary || settings.secondary, tab: 'primary' };
    this.loadout.innerHTML = `<div class="modal"><div class="head"><h2>Equipamento</h2><span class="muted tiny" style="max-width:420px">Vale na hora se você ainda estiver protegido no renascimento; senão, no próximo renascimento.</span><button class="btn small" id="locancel">Fechar (B)</button><button class="btn small primary" id="lookbtn2">Confirmar</button></div>
      <div class="panel"><div id="lopicker"></div></div>
      <div class="row" style="margin-top:14px"><div class="grow muted tiny">Personagem e lado também podem ser trocados aqui:</div></div>
      <div class="row wrap" style="margin-top:6px"><div class="seg" id="lochar">${CHARACTERS.map((c) => `<button data-char="${c.id}" class="${settings.char === c.id ? 'sel' : ''}">${c.name}</button>`).join('')}</div></div>
      <div class="row wrap" style="margin-top:8px"><div class="seg" id="loside">${SIDES.map((s) => `<button data-side="${s.id}" class="${settings.side === s.id ? 'sel' : ''}">${s.name}</button>`).join('')}</div></div>
      <div class="row" style="margin-top:16px"><div class="grow"></div><button class="btn primary" id="lookbtn">Confirmar</button></div></div>`;
    weaponPicker($('lopicker'), st, g.icons);
    $('lochar').onclick = (e) => { const b = e.target.closest('[data-char]'); if (!b) return; settings.char = b.dataset.char; $('lochar').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); };
    $('loside').onclick = (e) => { const b = e.target.closest('[data-side]'); if (!b) return; settings.side = b.dataset.side; $('loside').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); };
    $('locancel').onclick = () => this.closeLoadout();
    const confirm = () => {
      settings.primary = st.primary; settings.secondary = st.secondary; saveSettings();
      g.net.send({ t: 'lo', primary: st.primary, secondary: st.secondary, char: settings.char, side: settings.side });
      g.viewmodel.setCharacter(settings.char);
      this.closeLoadout();
    };
    $('lookbtn').onclick = confirm;
    $('lookbtn2').onclick = confirm;
    this.loadout.classList.remove('hidden');
    g.onMenu(true);
  }
  closeLoadout() { this.loadout.classList.add('hidden'); this.g.onMenu(false); }

  // ---------------------------------------------------------------- pausa
  openPause() {
    const g = this.g;
    const host = g.myId === g.hostId;
    this.pause.innerHTML = `<div class="modal pausebox"><div class="logo">${GAME_NAME}</div>
      <button class="btn primary" data-a="resume">Continuar</button>
      <button class="btn" data-a="loadout">Equipamento</button>
      <button class="btn" data-a="settings">Opções</button>
      <button class="btn" data-a="match">${host ? 'Configurar partida' : 'Regras da partida'}</button>
      <button class="btn danger" data-a="leave">Sair para o menu inicial</button>
      ${this.muteListHTML()}
      <div class="tiny muted" style="text-align:center;margin-top:6px">Amigos entram por: ${esc(this.serverInfo && this.serverInfo.ips && this.serverInfo.ips.length ? this.serverInfo.ips.map((ip) => ip + ':' + this.serverInfo.port).join(' ou ') : location.host)}</div></div>`;
    this.pause.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      g.audio.ui('click');
      const a = b.dataset.a;
      if (a === 'mute') { g.chat.toggleMute(+b.dataset.id); this.openPause(); return; }
      if (a === 'resume') this.closePause(true);
      else if (a === 'loadout') { this.closePause(); this.openLoadout(); }
      else if (a === 'settings') { this.closePause(); this.openSettings('jogo'); }
      else if (a === 'match') { this.closePause(); this.openSettings('partida'); }
      else if (a === 'leave') { g.leaving = true; location.reload(); }
    };
    this.pause.classList.remove('hidden');
    g.onMenu(true);
  }
  muteListHTML() {
    const g = this.g;
    const list = [...g.players.values()].filter((p) => p.id !== g.myId && !p.bot);
    if (!list.length) return '';
    return `<div class="mutelist"><div class="tiny muted">Silenciar no chat:</div>${list.map((p) => `<button class="btn small ${g.chat.isMuted(p.id) ? 'on' : ''}" data-a="mute" data-id="${p.id}">${g.chat.isMuted(p.id) ? '🔇' : '🔊'} ${esc(p.name)}</button>`).join('')}</div>`;
  }
  closePause(resume) { this.pause.classList.add('hidden'); this.g.onMenu(false, resume); }

  // ---------------------------------------------------------------- opções
  openSettings(tab) {
    this.settingsTab = tab || this.settingsTab;
    this.settingsEl.classList.remove('hidden');
    this.renderSettings();
    this.g.onMenu(true);
  }
  closeSettings() {
    this.settingsEl.classList.add('hidden');
    this.waitingKey = null;
    this.g.onMenu(false);
  }

  renderSettings() {
    const tabs = [['jogo', 'Jogo'], ['teclas', 'Teclas'], ['mira', 'Mira'], ['video', 'Vídeo'], ['audio', 'Áudio'], ['partida', 'Partida']];
    const body = this[`tab_${this.settingsTab}`]();
    this.settingsEl.innerHTML = `<div class="modal"><div class="head"><h2>Opções</h2><button class="btn small" id="setclose">Fechar</button></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === this.settingsTab ? 'sel' : ''}">${n}</button>`).join('')}</div>
      <div id="setbody">${body}</div></div>`;
    $('setclose').onclick = () => this.closeSettings();
    this.settingsEl.querySelector('.tabs').onclick = (e) => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      this.settingsTab = b.dataset.tab; this.renderSettings();
    };
    this.bindInputs($('setbody'));
    if (this.settingsTab === 'mira') this.drawXhPreview();
  }

  // componentes
  range(path, label, min, max, step, hint, fmt) {
    const v = this.getPath(path);
    return `<div class="opt"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label><input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${v}"><input type="number" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${v}" style="width:70px"></div>`;
  }
  toggle(path, label, hint) {
    return `<div class="opt"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label><span class="toggle"><input type="checkbox" id="tg_${path}" data-path="${path}" ${this.getPath(path) ? 'checked' : ''}><span onclick="document.getElementById('tg_${path}').click()"></span></span></div>`;
  }
  select(path, label, options, hint) {
    const v = this.getPath(path);
    return `<div class="opt"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label><select data-path="${path}">${options.map(([k, n]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
  }
  getPath(path) { return path.split('.').reduce((o, k) => o[k], settings); }
  setPath(path, val) {
    const ks = path.split('.'); let o = settings;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    const cur = o[ks[ks.length - 1]];
    o[ks[ks.length - 1]] = typeof cur === 'number' ? parseFloat(val) : typeof cur === 'boolean' ? !!val : val;
  }
  bindInputs(root) {
    root.querySelectorAll('[data-path]').forEach((inp) => {
      const ev = inp.type === 'range' || inp.type === 'color' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const val = inp.type === 'checkbox' ? inp.checked : inp.value;
        this.setPath(inp.dataset.path, val);
        if (inp.type === 'range' || inp.type === 'number') root.querySelectorAll(`[data-path="${inp.dataset.path}"]`).forEach((o) => { if (o !== inp) o.value = inp.value; });
        saveSettings();
        if (this.settingsTab === 'mira') this.drawXhPreview();
      });
    });
    root.querySelectorAll('[data-key]').forEach((b) => {
      b.onclick = () => {
        this.waitingKey = b.dataset.key;
        root.querySelectorAll('.keybtn').forEach((x) => x.classList.remove('wait'));
        b.classList.add('wait'); b.textContent = 'Pressione...';
      };
    });
    root.querySelectorAll('[data-preset]').forEach((b) => {
      b.onclick = () => { Object.assign(settings.crosshair, CROSSHAIR_PRESETS[b.dataset.preset]); saveSettings(); this.renderSettings(); };
    });
    const rk = root.querySelector('#resetkeys'); if (rk) rk.onclick = () => { resetSettings('keys'); this.renderSettings(); };
    const rx = root.querySelector('#resetxh'); if (rx) rx.onclick = () => { resetSettings('crosshair'); this.renderSettings(); };
    const fs = root.querySelector('#gofull'); if (fs) fs.onclick = () => this.g.toggleFullscreen();
    this.bindMatch(root);
  }
  // captura de tecla para atalhos (chamado por main)
  captureKey(code) {
    if (!this.waitingKey) return false;
    if (code !== 'Escape') {
      for (const k of Object.keys(settings.keys)) if (settings.keys[k] === code) settings.keys[k] = settings.keys[this.waitingKey];
      settings.keys[this.waitingKey] = code;
      saveSettings();
    }
    this.waitingKey = null;
    this.renderSettings();
    return true;
  }

  tab_jogo() {
    return `<div class="form">
      ${this.range('sensitivity', 'Sensibilidade do mouse', 0.1, 10, 0.05, 'Mesma escala do CS (0,022°/contagem)')}
      ${this.range('zoomSensitivity', 'Sensibilidade com luneta', 0.2, 3, 0.05, 'Multiplicador ao mirar com zoom')}
      ${this.toggle('invertY', 'Inverter eixo Y')}
      ${this.toggle('rawInput', 'Entrada bruta do mouse', 'Ignora a aceleração do sistema (recomendado)')}
      ${this.range('fov', 'Campo de visão (vertical)', 55, 100, 1, '74° ≈ 106° horizontal em 16:9')}
      ${this.toggle('wheelJump', 'Pular com a roda do mouse', 'Para bunny hop; desativa troca de arma pela roda')}
      ${this.toggle('autoBhop', 'Pulo automático (segurar espaço)', 'Pula de novo assim que toca o chão — facilita o bunny hop')}
      ${this.toggle('damageNumbers', 'Números de dano', 'Mostra o dano causado sobre o alvo')}
      ${this.select('playerId', 'Identificação de jogadores', [['colors', 'Aliados e inimigos (cores)'], ['classic', 'Só aliados (clássico)']], 'Cores: aliados com contorno e marcador da equipe (vistos através das paredes), inimigos com contorno e marcador vermelhos (só quando visíveis)')}
      ${this.toggle('fullscreen', 'Tela cheia ao entrar no jogo', 'Necessário para usar Ctrl (agachar) sem fechar a aba')}
      ${this.toggle('showFps', 'Mostrar FPS')}
      ${this.toggle('showNet', 'Mostrar ping')}
    </div><div class="row" style="margin-top:12px"><button class="btn small" id="gofull">Alternar tela cheia agora</button></div>
    <div class="note">Dica: no Chrome/Edge em tela cheia o jogo "trava" o teclado, então Ctrl+W não fecha a aba. Em outros navegadores, considere trocar o agachar para C na aba Teclas.</div>`;
  }
  tab_teclas() {
    return `<div class="form">${Object.keys(KEY_LABELS).map((k) => `<div class="opt"><label>${KEY_LABELS[k]}</label><button class="keybtn" data-key="${k}">${keyName(settings.keys[k])}</button></div>`).join('')}
      <div class="opt"><label>Atirar</label><span class="muted">Botão esquerdo</span></div>
      <div class="opt"><label>Mira / luneta / facada forte / arremesso curto</label><span class="muted">Botão direito</span></div>
      <div class="opt"><label>Menu</label><span class="muted">Esc</span></div></div>
      <div class="row" style="margin-top:12px"><button class="btn small" id="resetkeys">Restaurar padrão</button></div>`;
  }
  tab_mira() {
    const c = 'crosshair.';
    return `<div class="row" style="align-items:flex-start;gap:24px;flex-wrap:wrap">
      <div><canvas id="xhprev" class="xhprev" width="200" height="150"></canvas>
        <div class="row wrap" style="margin-top:10px;max-width:220px">${Object.keys(CROSSHAIR_PRESETS).map((p) => `<button class="btn small" data-preset="${p}">${p}</button>`).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn small" id="resetxh">Padrão</button></div></div>
      <div class="form grow">
        ${this.select(c + 'style', 'Estilo', [['classic', 'Clássica (cruz)'], ['dot', 'Ponto'], ['circle', 'Círculo']])}
        ${this.toggle(c + 'dynamic', 'Dinâmica', 'Abre conforme a imprecisão real (movimento/disparo)')}
        <div class="opt"><label>Cor</label><input type="color" data-path="${c}color" value="${settings.crosshair.color}"></div>
        ${this.range(c + 'size', 'Tamanho', 0, 20, 0.5)}
        ${this.range(c + 'thickness', 'Espessura', 1, 6, 0.5)}
        ${this.range(c + 'gap', 'Espaço central', -4, 20, 0.5)}
        ${this.toggle(c + 'outline', 'Contorno')}
        ${this.range(c + 'outlineThickness', 'Espessura do contorno', 0.5, 3, 0.5)}
        ${this.toggle(c + 'dot', 'Ponto central')}
        ${this.range(c + 'alpha', 'Opacidade', 0.2, 1, 0.05)}
        ${this.toggle(c + 'tStyle', 'Estilo T', 'Remove a linha de cima')}
        ${this.toggle(c + 'followRecoil', 'Mira acompanha o recuo', 'Mostra onde as balas realmente vão')}
      </div></div>`;
  }
  drawXhPreview() {
    const cv = $('xhprev'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const hud = this.g.hud;
    const save = hud.xhCtx, key = hud.xhKey;
    const tmp = document.createElement('canvas'); tmp.width = 200; tmp.height = 200;
    hud.xhCtx = tmp.getContext('2d'); hud.xhKey = '';
    hud.drawCrosshair(settings.crosshair.dynamic ? 0.6 : 0, [0, 0], false, false);
    hud.xhCtx = save; hud.xhKey = key === '' ? '' : 'stale';
    ctx.clearRect(0, 0, 200, 150);
    ctx.drawImage(tmp, 0, -25);
  }
  tab_video() {
    return `<div class="form">
      ${this.select('quality', 'Qualidade gráfica', Object.entries(QUALITY).map(([k, q]) => [k, q.label]), 'Sombras, resolução e partículas')}
      ${this.range('renderScale', 'Escala de resolução', 0.5, 1, 0.05, 'Diminua para ganhar FPS')}
      ${this.range('viewmodelFov', 'FOV da arma', 45, 90, 1)}
      ${this.range('vmX', 'Posição da arma (X)', -5, 5, 0.5)}
      ${this.range('vmY', 'Posição da arma (Y)', -5, 5, 0.5)}
      ${this.range('vmZ', 'Posição da arma (Z)', -5, 5, 0.5)}
      ${this.toggle('leftHanded', 'Arma na mão esquerda')}
      ${this.toggle('viewBob', 'Balanço da arma ao andar')}
    </div><div class="note">Antisserrilhado muda com a qualidade e é aplicado ao recarregar a página (F5).</div>`;
  }
  tab_audio() {
    return `<div class="form">
      ${this.range('masterVolume', 'Volume geral', 0, 1, 0.05)}
      ${this.range('sfxVolume', 'Efeitos', 0, 1.5, 0.05)}
      ${this.range('uiVolume', 'Interface', 0, 1, 0.05)}
      ${this.toggle('hrtf', 'Áudio 3D avançado (HRTF)', 'Melhor noção de direção com fone; usa mais CPU')}
    </div><div class="note">Todos os sons são sintetizados em tempo real. Use fones para ouvir de onde vêm os passos e tiros.</div>`;
  }

  // ---------------------------------------------------------------- partida
  tab_partida() {
    const g = this.g;
    const s = g.matchSettings || (this.serverInfo && this.serverInfo.settings) || {};
    const host = g.joined && g.myId === g.hostId;
    const dis = host ? '' : 'disabled';
    // modo, mapa, tempo e abates são definidos na sala de espera
    const inRoomPhase = !g.match || g.match.phase === 'room';
    const lock = (k) => (!inRoomPhase && ['mode', 'map', 'endCondition', 'timeLimitMin', 'killLimit', 'teamKillLimit'].includes(k) ? 'disabled' : '');
    const lockHint = inRoomPhase ? '' : 'Só na sala de espera, antes da partida';
    const num = (k, label, hint) => {
      const [a, b] = MATCH_LIMITS[k];
      const step = HALF_STEP_KEYS.includes(k) ? 0.5 : k === 'killHeal' ? 5 : 1;
      return `<div class="opt"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label><input type="range" data-m="${k}" min="${a}" max="${b}" step="${step}" value="${s[k]}" ${dis || lock(k)}><span class="val" id="mv_${k}">${s[k]}</span></div>`;
    };
    const tg = (k, label, hint) => `<div class="opt"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label><span class="toggle"><input type="checkbox" id="mt_${k}" data-m="${k}" ${s[k] ? 'checked' : ''} ${dis}><span onclick="document.getElementById('mt_${k}').click()"></span></span></div>`;
    const sel = (k, label, opts, hint) => `<div class="opt"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label><select data-m="${k}" ${dis || lock(k)}>${opts.map(([v, n]) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const phase = g.match ? g.match.phase : '';
    return `${host ? `<div class="note">Você é o <b>anfitrião</b>: só você pode alterar estas regras.${inRoomPhase ? ' Modo, mapa, tempo e abates também podem ser escolhidos direto na sala.' : ' Modo, mapa, tempo e abates ficam travados durante a partida (mude na sala de espera).'}</div>` : '<div class="note">Somente o anfitrião (primeiro a entrar) pode alterar as regras. Use /admin senha no chat se o servidor tiver senha de admin.</div>'}
      <div class="form">
        ${sel('mode', 'Modo de jogo', MODES.map((m) => [m.id, m.name]), lockHint)}
        ${sel('map', 'Mapa', MAP_LIST.map((m) => [m.id, m.name]), lockHint)}
        <div class="opt optmap" id="optmap">${mapCard(s.map, 200)}</div>
        ${sel('endCondition', 'Fim da partida', [['time', 'Por tempo'], ['kills', 'Por abates'], ['both', 'O que vier primeiro']], lockHint || 'No Gun Game vence quem passar por todas as armas')}
        ${num('timeLimitMin', 'Tempo da partida (min)', lockHint)}
        ${num('killLimit', 'Abates para vencer (individual)', lockHint || 'Todos contra todos')}
        ${num('teamKillLimit', 'Abates para vencer (equipe)', lockHint || 'Mata-mata em equipe')}
        ${tg('friendlyFire', 'Fogo amigo', 'Em equipe: tiros acertam aliados (50% do dano)')}
        ${sel('tiebreak', 'Critério de desempate', [['stats', 'Menos mortes → mais HS → mais dano → quem chegou antes'], ['sudden', 'Morte súbita (próximo abate decide)']])}
        ${num('respawnTime', 'Tempo de renascimento (s)')}
        ${num('spawnProtection', 'Proteção ao renascer (s)', 'Termina ao atirar')}
        ${sel('spawnMode', 'Onde renascer', [['action', 'Perto da ação (longe da mira inimiga)'], ['safe', 'Seguro (o mais longe possível)']])}
        ${num('killHeal', 'Vida recuperada por abate', '0 = desativado')}
        ${tg('killRefill', 'Abate recarrega a munição')}
        ${tg('streakBonus', 'Bônus de sequência', '3 abates seguidos: +1 granada • 5: colete completo')}
        ${tg('armor', 'Colete', 'Reduz dano no tronco')}
        ${tg('helmet', 'Capacete', 'Reduz dano na cabeça')}
        ${tg('infiniteAmmo', 'Munição reserva infinita')}
        ${num('heGrenades', 'Granadas explosivas')}
        ${num('flashGrenades', 'Granadas de luz')}
        ${num('smokeGrenades', 'Granadas de fumaça')}
        ${num('mines', 'Minas terrestres')}
        ${tg('headshotOnly', 'Só tiro na cabeça')}
        ${tg('friendlyFireSelf', 'Dano da própria granada')}
        ${num('intermission', 'Placar final (s)', 'Tempo até a próxima partida')}
        ${num('bots', 'Completar com bots até', 'Total de jogadores; bots saem quando entra gente (0 = sem bots)')}
        ${sel('botDifficulty', 'Dificuldade dos bots', [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']])}
        ${sel('soundPack', 'Pacote de sons', SOUND_PACKS.map((p) => [p.id, p.name]), 'Todo mundo na sala ouve o mesmo pacote • <a href="/gravar.html" target="_blank">gravar sons da zoeira</a>')}
      </div>
      ${host ? `<div class="row wrap" style="margin-top:16px;gap:8px">
        <button class="btn primary" id="mapply">Aplicar</button>
        <button class="btn" id="mrestart">Aplicar e reiniciar partida</button>
        ${phase === 'room' ? '<span class="muted">Inicie a partida pela sala de espera, quando todos estiverem prontos.</span>' : '<button class="btn" id="mwarm">Voltar para a sala</button>'}
        ${phase === 'live' ? '<button class="btn danger" id="mend">Encerrar partida</button>' : ''}
      </div>` : ''}`;
  }
  bindMatch(root) {
    const g = this.g;
    root.querySelectorAll('[data-m]').forEach((inp) => {
      inp.addEventListener('input', () => { const v = $('mv_' + inp.dataset.m); if (v) v.textContent = inp.value; });
    });
    const ms = root.querySelector('[data-m="map"]');
    if (ms) ms.addEventListener('change', () => { const o = root.querySelector('#optmap'); if (o) o.innerHTML = mapCard(ms.value, 200); });
    const collect = () => {
      const s = { ...g.matchSettings };
      root.querySelectorAll('[data-m]').forEach((inp) => {
        const k = inp.dataset.m;
        s[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
      });
      return s;
    };
    const ap = root.querySelector('#mapply'); if (ap) ap.onclick = () => { g.net.send({ t: 'cfg', s: collect() }); this.g.hud.toast('Configurações enviadas'); };
    const rs = root.querySelector('#mrestart'); if (rs) rs.onclick = () => { g.net.send({ t: 'cfg', s: collect(), restart: true }); this.closeSettings(); };
    const st = root.querySelector('#mstart'); if (st) st.onclick = () => { g.net.send({ t: 'cfg', s: collect() }); g.net.send({ t: 'cmd', c: 'start' }); this.closeSettings(); };
    const wm = root.querySelector('#mwarm'); if (wm) wm.onclick = () => { g.net.send({ t: 'cmd', c: 'room' }); this.closeSettings(); };
    const en = root.querySelector('#mend'); if (en) en.onclick = () => { g.net.send({ t: 'cmd', c: 'end' }); this.closeSettings(); };
  }
}
