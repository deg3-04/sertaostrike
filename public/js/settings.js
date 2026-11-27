// Configurações do jogador (salvas no navegador).
const KEY = 'sertao-strike-settings-v1';

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', crouch: 'ControlLeft', walk: 'ShiftLeft', reload: 'KeyR',
  primary: 'Digit1', secondary: 'Digit2', knife: 'Digit3', he: 'Digit4', flash: 'Digit5', smoke: 'Digit6', mine: 'Digit7',
  lastWeapon: 'KeyQ', inspect: 'KeyF', scoreboard: 'Tab', chat: 'KeyY', teamChat: 'KeyU', loadout: 'KeyB', equipment: 'KeyM',
  radio1: 'KeyZ', radio2: 'KeyX', radio3: 'KeyC',
};

export const KEY_LABELS = {
  forward: 'Andar para frente', back: 'Andar para trás', left: 'Esquerda', right: 'Direita',
  jump: 'Pular', crouch: 'Agachar', walk: 'Andar devagar (silencioso)', reload: 'Recarregar',
  primary: 'Arma principal', secondary: 'Pistola', knife: 'Faca', he: 'Granada explosiva', flash: 'Granada de luz', smoke: 'Granada de fumaça', mine: 'Mina terrestre',
  lastWeapon: 'Última arma', inspect: 'Inspecionar arma', scoreboard: 'Placar (segurar)', chat: 'Chat (todos)', teamChat: 'Chat da equipe', loadout: 'Trocar armas', equipment: 'Guia de equipamentos',
  radio1: 'Rádio: comandos', radio2: 'Rádio: respostas', radio3: 'Rádio: geral',
};

export const DEFAULTS = {
  name: '',
  char: 'sombra', primary: 'ak47', secondary: 'glock', side: 'any',
  sensitivity: 2.0, zoomSensitivity: 1.0, invertY: false, rawInput: true, wheelJump: false, autoBhop: false, damageNumbers: true,
  playerId: 'colors',          // identificação de jogadores: 'colors' (aliados e inimigos) | 'classic' (só aliados)
  fov: 74, viewmodelFov: 60, vmX: 0, vmY: 0, vmZ: 0, leftHanded: false, viewBob: true,
  showFps: true, showNet: true, fullscreen: true,
  crosshair: { style: 'classic', dynamic: true, color: '#3cff5a', size: 5, thickness: 2, gap: 3, outline: true, outlineThickness: 1, dot: false, alpha: 1, tStyle: false, followRecoil: false },
  quality: 'high', renderScale: 1.0,
  masterVolume: 0.8, sfxVolume: 1.0, uiVolume: 0.6, musicVolume: 0.5, hrtf: false,
  keys: { ...DEFAULT_KEYS },
};

export const QUALITY = {
  low:    { label: 'Baixa',  shadows: false, shadowSize: 0,    pixelRatio: 0.75, antialias: false, particles: 0.5, decor: false },
  medium: { label: 'Média',  shadows: true,  shadowSize: 1024, pixelRatio: 1.0,  antialias: false, particles: 0.8, decor: true },
  high:   { label: 'Alta',   shadows: true,  shadowSize: 2048, pixelRatio: 1.25, antialias: true,  particles: 1.0, decor: true },
  ultra:  { label: 'Ultra',  shadows: true,  shadowSize: 4096, pixelRatio: 2.0,  antialias: true,  particles: 1.0, decor: true },
};

export const CROSSHAIR_PRESETS = {
  'Clássica verde': { style: 'classic', dynamic: false, color: '#3cff5a', size: 5, thickness: 2, gap: 3, outline: true, outlineThickness: 1, dot: false, alpha: 1, tStyle: false },
  'Dinâmica': { style: 'classic', dynamic: true, color: '#3cff5a', size: 6, thickness: 2, gap: 4, outline: true, outlineThickness: 1, dot: false, alpha: 1, tStyle: false },
  'Ponto': { style: 'dot', dynamic: false, color: '#ff3b3b', size: 3, thickness: 3, gap: 0, outline: true, outlineThickness: 1, dot: true, alpha: 1, tStyle: false },
  'Pequena ciano': { style: 'classic', dynamic: false, color: '#38e8ff', size: 3, thickness: 1, gap: 1, outline: true, outlineThickness: 1, dot: true, alpha: 1, tStyle: false },
  'Estilo T': { style: 'classic', dynamic: false, color: '#ffe04a', size: 5, thickness: 2, gap: 2, outline: true, outlineThickness: 1, dot: false, alpha: 1, tStyle: true },
  'Círculo': { style: 'circle', dynamic: true, color: '#ffffff', size: 10, thickness: 2, gap: 0, outline: true, outlineThickness: 1, dot: true, alpha: 0.9, tStyle: false },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
    else if (typeof over[k] === typeof base[k]) out[k] = over[k];
  }
  return out;
}

export const settings = (() => {
  let s;
  try { s = deepMerge(DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { s = deepMerge(DEFAULTS, {}); }
  // uma tecla não pode servir para as duas telas: se "Trocar armas" ficou na
  // mesma tecla da guia de equipamentos, volta para o padrão (B)
  if (s.keys.loadout === s.keys.equipment) s.keys.loadout = DEFAULT_KEYS.loadout;
  return s;
})();

const listeners = new Set();
export function onSettingsChange(fn) { listeners.add(fn); }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  for (const fn of listeners) fn(settings);
}
export function resetSettings(section) {
  if (section === 'keys') settings.keys = { ...DEFAULT_KEYS };
  else if (section === 'crosshair') settings.crosshair = { ...DEFAULTS.crosshair };
  saveSettings();
}

export function keyName(code) {
  if (!code) return '—';
  const map = {
    Space: 'Espaço', ControlLeft: 'Ctrl Esq', ControlRight: 'Ctrl Dir', ShiftLeft: 'Shift Esq', ShiftRight: 'Shift Dir',
    AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock',
    Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Mouse1: 'Botão do meio', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
