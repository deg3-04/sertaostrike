// Sala de espera: os jogadores entram aqui, escolhem personagem e armas,
// conversam e clicam em PRONTO. O dono da sala só consegue iniciar quando
// todos estiverem prontos. Leve de propósito: a lista só é redesenhada
// quando o servidor avisa uma mudança, e o 3D de fundo roda a poucos FPS.
import { CHARACTERS, MODES, MATCH_LIMITS, TEAMS, modeName } from '/shared/constants.js';
import { mapName, MAP_LIST } from '/shared/maps.js';
import { CHAR_STYLE } from './models.js';
import { settings, saveSettings } from './settings.js';
import { mapCard } from './mappreview.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const charName = (id) => (CHARACTERS.find((c) => c.id === id) || {}).name || id;

export class Room {
  constructor(game) {
    this.g = game;
    this.el = $('room');
    this.state = null;
    this.visible = false;
    this.lines = [];
    this.el.innerHTML = `
      <div class="roompanel panel">
        <div class="roomhead"><h2>Sala de espera</h2><span id="roominfo"></span></div>
        <div class="roomcols">
          <div class="roomcol">
            <div id="roomteambar"></div>
            <div id="roomlist"></div>
            <div class="roomchat"><div id="roomchatlog"></div><input id="roomchatin" maxlength="120" autocomplete="off" placeholder="Conversar com a sala (Enter envia)"></div>
          </div>
          <div class="roomcol">
            <div class="roomrules"><h3>Regras da partida</h3><div id="roomrules"></div><div id="roommap"></div></div>
            <div class="roomactions">
              <button class="btn small" id="rloadout">Personagem e armas</button>
              <button class="btn small" id="rcfg">Mais regras…</button>
              <button class="btn small" id="ropts">Opções</button>
            </div>
            <div id="roomstatus"></div>
            <div class="roommain">
              <button class="btn big" id="rready">Pronto</button>
              <button class="btn big primary" id="rstart">Iniciar partida</button>
              <button class="btn big primary" id="renter">Entrar na partida</button>
            </div>
          </div>
        </div>
      </div>`;
    $('rready').onclick = () => { const me = this.myRow(); if (me) this.g.net.send({ t: 'ready', v: !me[3] }); this.g.audio.ui('click'); };
    $('rstart').onclick = () => { this.g.net.send({ t: 'cmd', c: 'start' }); this.g.audio.ui('click'); };
    $('renter').onclick = () => { this.g.net.send({ t: 'enter' }); this.g.audio.ui('click'); };
    $('rloadout').onclick = () => this.g.menus.openLoadout();
    // escolha de time e sorteio (delegado: os botões são redesenhados a cada mudança)
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-team],[data-shuffle]');
      if (!b || b.disabled) return;
      if (b.dataset.shuffle) this.g.net.send({ t: 'cmd', c: 'shuffle' });
      else this.g.net.send({ t: 'team', v: b.dataset.team });
      this.g.audio.ui('click');
    });
    $('rcfg').onclick = () => this.g.menus.openSettings('partida');
    $('ropts').onclick = () => this.g.menus.openSettings('jogo');
    // regras: o dono muda direto na sala (envia ao soltar o controle)
    $('roomrules').addEventListener('change', (e) => {
      const k = e.target.dataset.r;
      if (!k || this.g.myId !== (this.state && this.state.host)) return;
      const v = e.target.type === 'range' ? +e.target.value : e.target.value;
      this.g.net.send({ t: 'cfg', s: { ...this.g.matchSettings, [k]: v } });
    });
    $('roomrules').addEventListener('input', (e) => { const o = e.target.dataset.r && $('rv_' + e.target.dataset.r); if (o) o.textContent = e.target.value; });
    const inp = $('roomchatin');
    inp.addEventListener('focus', () => { this.g.input.typing = true; });
    inp.addEventListener('blur', () => { this.g.input.typing = false; });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = inp.value.trim(); if (v) this.g.net.send({ t: 'chat', m: v, team: false }); inp.value = ''; }
      else if (e.key === 'Escape') inp.blur();
    });
  }

  myRow() { return this.state ? this.state.p.find((r) => r[0] === this.g.myId) : null; }
  // estou na sala? (antes da primeira mensagem, quem acabou de entrar está na sala)
  inRoom() { const me = this.myRow(); return me ? !!me[5] : !!this.g.joined; }

  update(m) {
    this.state = m;
    this.g.hostId = m.host;
    this.render();
    this.g.syncRoomView();
  }

  render() {
    const m = this.state;
    if (!m) return;
    const g = this.g, meHost = g.myId === m.host;
    const s = g.matchSettings || {};
    $('roominfo').textContent = `${modeName(s.mode)} • ${mapName(s.map)}`;
    const live = m.phase !== 'room';
    const rows = [...m.p].sort((a, b) => (a[4] - b[4]) || (a[0] - b[0]));
    const me0 = this.myRow();
    // mantém a preferência salva igual à escolha feita na sala
    if (me0) { const side = me0[7] === 1 ? 'north' : me0[7] === 2 ? 'south' : 'any'; if (settings.side !== side) { settings.side = side; saveSettings(); } }
    const rowHtml = ([id, name, char, ready, bot, waiting], compact) => {
      const st = CHAR_STYLE[char] || CHAR_STYLE.sombra;
      const tag = bot ? '<span class="rtag bot">BOT</span>'
        : live ? (waiting ? '<span class="rtag">na sala</span>' : '<span class="rtag ok">jogando</span>')
          : ready ? `<span class="rtag ok">✔${compact ? '' : ' PRONTO'}</span>` : `<span class="rtag wait">${compact ? '…' : 'aguardando…'}</span>`;
      return `<div class="rrow ${id === g.myId ? 'me' : ''}"><span class="sw">${st.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <b>${esc(name)}</b>${id === m.host ? `<span class="rhost" title="Dono da sala">👑${compact ? '' : ' dono'}</span>` : ''}${compact ? '<span class="rgap"></span>' : `<span class="rchar">${esc(charName(char))}</span>`}${tag}</div>`;
    };
    const canPick = !live || (me0 && me0[5]);
    if (m.tm) {
      const col = (code, team) => {
        const list = rows.filter((r) => r[6] === code);
        const mine = me0 && me0[6] === code;
        const T = TEAMS[team];
        return `<div class="tcol" style="--tc:${T.color}"><div class="thead"><b>${T.name}</b><span>${T.full}</span><em>${list.length}</em></div>
          ${list.map((r) => rowHtml(r, true)).join('') || '<div class="tempty">ninguém ainda</div>'}
          ${canPick ? `<button class="btn small tjoin" data-team="${team}" ${mine && me0[7] ? 'disabled' : ''}>${mine && me0[7] ? 'Você está aqui' : mine ? 'Ficar neste time' : 'Entrar neste time'}</button>` : ''}</div>`;
      };
      $('roomlist').innerHTML = `<div class="tcols">${col(1, 'ct')}${col(2, 'tr')}</div>`;
      const auto = me0 && !me0[7];
      $('roomteambar').innerHTML = canPick ? `<div class="teambar"><span>Times:</span>
        <button class="btn small ${auto ? 'sel' : ''}" data-team="auto" ${auto ? 'disabled' : ''}>${auto ? '✔ Automático' : 'Automático'}</button>
        ${meHost && !live ? `<button class="btn small ${m.after ? 'primary pulse' : ''}" data-shuffle="1" title="Mistura os jogadores em times equilibrados">🎲 Sortear times</button>` : ''}</div>` : '';
    } else {
      $('roomlist').innerHTML = rows.map((r) => rowHtml(r, false)).join('');
      $('roomteambar').innerHTML = '';
    }
    this.renderRules(meHost && !live);
    const humans = m.p.filter((r) => !r[4]);
    const notReady = humans.filter((r) => !r[3]).length;
    const me = this.myRow();
    $('rready').style.display = live ? 'none' : '';
    $('rready').textContent = me && me[3] ? 'Cancelar pronto' : 'Pronto';
    $('rready').classList.toggle('primary', !(me && me[3]));
    $('rstart').style.display = !live && meHost ? '' : 'none';
    $('rstart').disabled = !m.can;
    $('renter').style.display = live && me && me[5] ? '' : 'none';
    $('rcfg').style.display = meHost ? '' : 'none';
    let status;
    if (live) status = 'Partida em andamento. Entre agora ou espere a próxima.';
    else if (m.tm && m.after && meHost) status = 'Partida encerrada. Mantenha os times ou clique em 🎲 Sortear times.';
    else if (m.can) status = meHost ? 'Todos prontos! Você já pode iniciar a partida.' : 'Todos prontos! Aguardando o dono iniciar.';
    else status = `Aguardando ${notReady} jogador${notReady === 1 ? '' : 'es'} clicar${notReady === 1 ? '' : 'em'} em PRONTO.`;
    $('roomstatus').textContent = status;
  }

  // painel de regras: editável para o dono (na sala), só leitura para os outros
  renderRules(edit) {
    const s = this.g.matchSettings;
    if (!s) return;
    const dis = edit ? '' : 'disabled';
    const sel = (k, label, opts) => `<label class="rr"><span>${label}</span><select data-r="${k}" ${dis}>${opts.map(([v, n]) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    const rng = (k, label, unit = '') => { const [a, b] = MATCH_LIMITS[k]; return `<label class="rr"><span>${label}</span><span class="rrv"><input type="range" data-r="${k}" min="${a}" max="${b}" step="1" value="${s[k]}" ${dis}><b id="rv_${k}">${s[k]}</b>${unit}</span></label>`; };
    const gg = s.mode === 'gungame', team = s.mode === 'tdm';
    const byTime = s.endCondition !== 'kills', byKills = s.endCondition !== 'time' && !gg;
    const html = [
      sel('mode', 'Modo', MODES.map((m) => [m.id, m.name])),
      sel('map', 'Mapa', MAP_LIST.map((m) => [m.id, m.name])),
      sel('endCondition', 'Fim da partida', [['time', 'Por tempo'], ['kills', gg ? 'Ao completar as armas' : 'Por abates'], ['both', 'O que vier primeiro']]),
      byTime ? rng('timeLimitMin', 'Tempo', ' min') : '',
      byKills ? (team ? rng('teamKillLimit', 'Abates da equipe para vencer') : rng('killLimit', 'Abates para vencer')) : '',
      rng('bots', 'Completar com bots até', ' jog.'),
      s.bots > 0 ? sel('botDifficulty', 'Dificuldade dos bots', [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']]) : '',
    ].join('');
    if (this.mapShown !== s.map) { this.mapShown = s.map; $('roommap').innerHTML = mapCard(s.map, 200); }
    const box = $('roomrules');
    // não redesenha enquanto o dono está mexendo num controle
    if (box.contains(document.activeElement) && document.activeElement.type === 'range') return;
    box.innerHTML = html + (edit ? '' : `<div class="rrnote">${this.state && this.state.phase !== 'room' ? 'Partida em andamento: as regras mudam na sala, antes da próxima partida.' : 'Só o dono da sala muda as regras.'}</div>`);
  }

  chat(html) {
    this.lines.push(html);
    if (this.lines.length > 40) this.lines.shift();
    if (this.visible) this.renderChat();
  }
  renderChat() {
    const log = $('roomchatlog');
    log.innerHTML = this.lines.slice(-12).map((l) => `<div>${l}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  show(on) {
    if (this.visible === on) return;
    this.visible = on;
    this.el.classList.toggle('hidden', !on);
    if (on) { this.render(); this.renderChat(); }
  }
}
