// Chat de texto: todos / equipe, histórico rolável, emojis, rádio rápido (estilo CS) e silenciar jogadores.
import { TEAMS } from '/shared/constants.js';
import { settings, keyName } from './settings.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// atalhos de emoji (substituídos na exibição)
const SHORTCUTS = [
  [':)', '🙂'], [':D', '😄'], [':(', '🙁'], [';)', '😉'], [':P', '😛'], [':O', '😮'], ['<3', '❤️'], ['xD', '😆'],
  [':fogo:', '🔥'], [':caveira:', '💀'], [':joia:', '👍'], [':ok:', '👌'], [':rir:', '🤣'], [':raiva:', '😡'], [':gg:', '🤝'], [':alvo:', '🎯'],
];
const PICKER = ['😄', '😂', '🤣', '😎', '😡', '😭', '🤔', '😱', '👍', '👎', '👏', '🤝', '🔥', '💀', '🎯', '💣', '🏆', '❤️', '😴', '🍀'];

export const RADIO = [
  { key: 'radio1', title: 'Comandos', items: ['Vamos, vamos, vamos!', 'Recuar!', 'Me dê cobertura!', 'Segurem esta posição!', 'Reagrupar!', 'Sigam-me!'] },
  { key: 'radio2', title: 'Respostas', items: ['Afirmativo!', 'Negativo!', 'Preciso de ajuda!', 'Inimigo avistado!', 'Área limpa!', 'Estou em posição.'] },
  { key: 'radio3', title: 'Geral', items: ['Boa!', 'Valeu!', 'Foi mal!', 'GG!', 'Kkkkk', 'Cuidado, granada!'] },
];

function emojify(text) {
  let out = esc(text);
  for (const [k, v] of SHORTCUTS) out = out.split(esc(k)).join(v);
  return out;
}

export class Chat {
  constructor(game) {
    this.g = game;
    this.history = [];      // { html, t }
    this.muted = new Set(); // ids silenciados
    this.open = false;
    this.team = false;
    this.radioMenu = -1;
    this.log = $('chatlog');
    this.input = $('chatinput');
    this.root = $('chat');
    // cabeçalho do chat aberto: modo + emojis
    this.bar = document.createElement('div');
    this.bar.id = 'chatbar';
    this.bar.innerHTML = `<span id="chatmode"></span><span class="emojis">${PICKER.map((e) => `<button tabindex="-1">${e}</button>`).join('')}</span>`;
    this.root.insertBefore(this.bar, this.input);
    this.bar.querySelectorAll('.emojis button').forEach((b) => b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const i = this.input, pos = i.selectionStart ?? i.value.length;
      i.value = (i.value.slice(0, pos) + b.textContent + i.value.slice(pos)).slice(0, 160);
      i.focus(); i.selectionStart = i.selectionEnd = pos + b.textContent.length;
    }));
    this.input.maxLength = 160;
    this.radioEl = document.createElement('div');
    this.radioEl.id = 'radiomenu';
    this.radioEl.className = 'hidden';
    $('hud').appendChild(this.radioEl);
  }

  // ------------------------------------------------------------ mensagens
  line(m) {
    const g = this.g;
    if (m.id && this.muted.has(m.id)) return;
    let html;
    if (m.sys) html = `<span class="sys">${esc(m.m)}</span>`;
    else {
      const tc = m.tm && TEAMS[m.tm] ? TEAMS[m.tm].color : '#7fe3ff';
      const tags = (m.dead ? '<i class="dead">*MORTO*</i> ' : '') + (m.team ? `<i class="tteam" style="color:${tc}">(EQUIPE)</i> ` : '');
      const me = m.id === g.myId ? ' me' : '';
      html = `${tags}<b class="${me}" style="color:${tc}">${esc(m.name)}:</b> ${emojify(m.m)}`;
    }
    this.push(html, m.radio ? 'radio' : m.sys ? 'sys' : '');
  }

  radio(m) {
    const g = this.g;
    if (this.muted.has(m.id)) return;
    const cat = RADIO[Math.floor(m.i / 6)], txt = cat && cat.items[m.i % 6];
    if (!txt) return;
    const tc = m.tm && TEAMS[m.tm] ? TEAMS[m.tm].color : '#7fe3ff';
    this.push(`📻 <b style="color:${tc}">${esc(g.pname(m.id))}</b>: ${esc(txt)}`, 'radio');
    // marca no radar por alguns segundos
    if (m.p && m.id !== g.myId) g.hud.radarPing(m.p, tc);
    g.audio.radio();
  }

  push(html, cls) {
    const d = document.createElement('div');
    d.className = cls || '';
    d.innerHTML = html;
    this.log.appendChild(d);
    this.history.push(d);
    while (this.history.length > 100) this.history.shift().remove();
    d.dataset.t = performance.now();
    if (this.open) this.log.scrollTop = this.log.scrollHeight;
    this.refreshVisible();
  }

  // com o chat fechado só as últimas 8 mensagens recentes aparecem (somem depois de 11 s)
  refreshVisible() {
    if (this.open) { for (const d of this.history) d.classList.remove('gone', 'fade'); return; }
    const now = performance.now();
    const n = this.history.length;
    this.history.forEach((d, i) => {
      const age = now - (+d.dataset.t);
      const recent = i >= n - 8 && age < 11000;
      d.classList.toggle('gone', !recent && age >= 12000 || i < n - 8);
      d.classList.toggle('fade', !recent);
    });
  }
  update() { if (!this.open && this.history.length) { this.acc = (this.acc || 0) + 1; if (this.acc % 20 === 0) this.refreshVisible(); } }

  // ------------------------------------------------------------ abrir / enviar
  openInput(team) {
    const g = this.g;
    this.team = !!team && g.isTeamMode();
    this.open = true;
    this.root.classList.add('open');
    this.updateMode();
    this.input.value = '';
    this.refreshVisible();
    this.log.scrollTop = this.log.scrollHeight;
    setTimeout(() => this.input.focus(), 0);
  }
  updateMode() {
    const m = $('chatmode');
    const tc = this.team ? TEAMS[this.g.teamOf(this.g.myId)]?.color || '#5aa9ff' : '#ffd27a';
    m.innerHTML = `<b style="color:${tc}">${this.team ? 'EQUIPE' : 'TODOS'}</b>${this.g.isTeamMode() ? ' <small>(Tab alterna)</small>' : ''}`;
    this.input.placeholder = this.team ? 'Mensagem para a equipe (Enter envia, Esc cancela)' : 'Mensagem para todos (Enter envia, Esc cancela)';
  }
  closeInput() {
    this.open = false;
    this.root.classList.remove('open');
    this.input.blur();
    this.refreshVisible();
  }
  toggleMode() { if (this.g.isTeamMode()) { this.team = !this.team; this.updateMode(); } }

  submit() {
    const v = this.input.value.trim();
    if (!v) return;
    if (this.localCommand(v)) return;
    this.g.net.send({ t: 'chat', m: v, team: this.team });
  }

  // comandos que valem só para você
  localCommand(v) {
    const [cmd, ...rest] = v.split(/\s+/);
    const arg = rest.join(' ').toLowerCase();
    const find = () => [...this.g.players.values()].find((p) => p.name.toLowerCase() === arg) || [...this.g.players.values()].find((p) => p.name.toLowerCase().includes(arg));
    if (cmd === '/mute' || cmd === '/silenciar') {
      const p = arg && find();
      if (!p || p.id === this.g.myId) this.line({ sys: true, m: 'Jogador não encontrado. Use /mute nome' });
      else { this.muted.add(p.id); this.line({ sys: true, m: `${p.name} foi silenciado (só para você). /unmute ${p.name} desfaz.` }); }
      return true;
    }
    if (cmd === '/unmute') {
      const p = arg && find();
      if (!p) this.line({ sys: true, m: 'Jogador não encontrado.' });
      else { this.muted.delete(p.id); this.line({ sys: true, m: `${p.name} não está mais silenciado.` }); }
      return true;
    }
    if (cmd === '/limpar' || cmd === '/clear') { for (const d of this.history) d.remove(); this.history = []; return true; }
    return false;
  }
  isMuted(id) { return this.muted.has(id); }
  toggleMute(id) { if (this.muted.has(id)) this.muted.delete(id); else this.muted.add(id); }

  // ------------------------------------------------------------ rádio
  openRadio(i) {
    if (this.radioMenu === i) { this.closeRadio(); return; }
    this.radioMenu = i;
    const cat = RADIO[i];
    const where = this.g.isTeamMode() ? 'para a equipe' : 'para todos';
    this.radioEl.innerHTML = `<h4>📻 ${cat.title} <small>${where}</small></h4>` + cat.items.map((t, k) => `<div><b>${k + 1}</b> ${esc(t)}</div>`).join('') + `<div class="cl"><b>0</b> Fechar</div>`;
    this.radioEl.classList.remove('hidden');
    clearTimeout(this.radioT);
    this.radioT = setTimeout(() => this.closeRadio(), 6000);
  }
  closeRadio() { this.radioMenu = -1; this.radioEl.classList.add('hidden'); }
  // devolve true se a tecla foi usada pelo menu de rádio
  radioKey(code) {
    // não rouba teclas usadas por outras ações (ex.: agachar no C)
    const taken = Object.entries(settings.keys).some(([k, v]) => v === code && !k.startsWith('radio'));
    for (let i = 0; i < RADIO.length; i++) {
      if (code === settings.keys[RADIO[i].key] && !taken) { this.openRadio(i); return true; }
    }
    if (this.radioMenu < 0) return false;
    const m = /^(Digit|Numpad)(\d)$/.exec(code);
    if (!m) return false;
    const n = +m[2];
    if (n >= 1 && n <= 6) this.g.net.send({ t: 'radio', i: this.radioMenu * 6 + n - 1 });
    this.closeRadio();
    return true;
  }
  radioHint() { return RADIO.map((r) => `${keyName(settings.keys[r.key])} ${r.title}`).join(' • '); }
}
