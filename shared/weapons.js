// Definição das armas. Valores baseados nas armas reais e no balanceamento
// clássico do Counter-Strike (dano, cadência, penetração de colete, queda
// de dano por distância, imprecisão e padrão de recuo).
//
// Imprecisão ("acc") em GRAUS (meio-ângulo do cone):
//   spread   = dispersão intrínseca da arma
//   stand    = parado em pé        crouch = agachado
//   move     = correndo na velocidade máxima (somado)
//   jump     = no ar (somado)
//   fire     = acréscimo a cada disparo (acumula e se recupera)
//   recovery = tempo (s) para recuperar a precisão após disparar
//   max      = teto do acúmulo por disparos
// Recuo ("recoil") em GRAUS por disparo:
//   up = subida por tiro nos primeiros 'upShots' tiros, depois 'upTail'
//   side = amplitude lateral, começa em 'sideStart', alterna em 'sideFreq'
//   maxUp = subida máxima acumulada, recovery = velocidade de retorno
// rangeMod: fração do dano mantida a cada 12,7 m (500u)
// armorPen: fração do dano que atravessa o colete/capacete
// penetration: espessura (m) de madeira/metal fino que a bala atravessa

export const WEAPONS = {
  // ======================= FACA =======================
  knife: {
    id: 'knife', name: 'Faca', cls: 'Corpo a corpo', slot: 'melee', type: 'melee',
    real: 'Faca tática de lâmina fixa',
    speed: 6.35, deploy: 0.45,
    slash: { damage: 34, back: 90, range: 1.7, rate: 0.42 },
    stab: { damage: 65, back: 180, range: 1.35, rate: 1.0 },
    killIcon: 'knife',
  },

  // ======================= PISTOLAS =======================
  glock: {
    id: 'glock', name: 'Glock-18', cls: 'Pistola', slot: 'secondary', type: 'pistol',
    real: 'Glock 18 · Áustria · 9×19 mm Parabellum',
    damage: 30, armorPen: 0.47, rangeMod: 0.85, range: 140, penetration: 0.15,
    rpm: 400, auto: false, mag: 20, reserve: 120, reload: 2.2, deploy: 0.55, speed: 6.10,
    acc: { spread: 0.10, stand: 0.32, crouch: 0.24, move: 1.7, jump: 5.5, fire: 1.25, recovery: 0.30, max: 4.0 },
    recoil: { up: 1.25, upShots: 4, upTail: 0.5, side: 0.35, sideStart: 1, sideFreq: 2.1, maxUp: 4.5, recovery: 9 },
    snd: { kind: 'pistol', pitch: 1.15, power: 0.75 },
  },
  usps: {
    id: 'usps', name: 'USP-S', cls: 'Pistola', slot: 'secondary', type: 'pistol',
    real: 'H&K USP Tactical (com supressor) · Alemanha · .45 ACP',
    damage: 35, armorPen: 0.505, rangeMod: 0.91, range: 160, penetration: 0.2,
    rpm: 352, auto: false, mag: 12, reserve: 48, reload: 2.2, deploy: 0.55, speed: 6.10,
    acc: { spread: 0.06, stand: 0.18, crouch: 0.12, move: 1.6, jump: 5.5, fire: 1.45, recovery: 0.34, max: 4.0 },
    recoil: { up: 1.55, upShots: 4, upTail: 0.6, side: 0.25, sideStart: 1, sideFreq: 1.7, maxUp: 5, recovery: 9 },
    snd: { kind: 'pistol', pitch: 1.0, power: 0.5, suppressed: true },
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', cls: 'Pistola', slot: 'secondary', type: 'pistol',
    real: 'Magnum Research Desert Eagle · Israel/EUA · .50 AE',
    damage: 63, armorPen: 0.932, rangeMod: 0.81, range: 160, penetration: 0.45,
    rpm: 267, auto: false, mag: 7, reserve: 35, reload: 2.2, deploy: 0.7, speed: 5.84,
    acc: { spread: 0.08, stand: 0.36, crouch: 0.26, move: 3.6, jump: 7.5, fire: 3.4, recovery: 0.62, max: 7.0 },
    recoil: { up: 3.9, upShots: 3, upTail: 1.5, side: 0.9, sideStart: 1, sideFreq: 2.4, maxUp: 9, recovery: 5.5 },
    snd: { kind: 'magnum', pitch: 0.9, power: 1.0 },
  },
  fiveseven: {
    id: 'fiveseven', name: 'Five-seveN', cls: 'Pistola', slot: 'secondary', type: 'pistol',
    real: 'FN Five-seveN · Bélgica · 5,7×28 mm',
    damage: 32, armorPen: 0.911, rangeMod: 0.81, range: 150, penetration: 0.3,
    rpm: 400, auto: false, mag: 20, reserve: 100, reload: 2.2, deploy: 0.55, speed: 6.10,
    acc: { spread: 0.08, stand: 0.27, crouch: 0.2, move: 1.8, jump: 5.5, fire: 1.35, recovery: 0.32, max: 4.2 },
    recoil: { up: 1.35, upShots: 4, upTail: 0.55, side: 0.3, sideStart: 1, sideFreq: 1.9, maxUp: 4.8, recovery: 9 },
    snd: { kind: 'pistol', pitch: 1.25, power: 0.7, supersonic: true },
  },
  p250: {
    id: 'p250', name: 'P250', cls: 'Pistola', slot: 'secondary', type: 'pistol',
    real: 'SIG Sauer P250 · Alemanha/EUA · 9×19 mm',
    damage: 38, armorPen: 0.64, rangeMod: 0.85, range: 140, penetration: 0.2,
    rpm: 400, auto: false, mag: 13, reserve: 52, reload: 2.2, deploy: 0.55, speed: 6.10,
    acc: { spread: 0.09, stand: 0.30, crouch: 0.22, move: 1.9, jump: 5.5, fire: 1.6, recovery: 0.34, max: 4.5 },
    recoil: { up: 1.6, upShots: 4, upTail: 0.6, side: 0.35, sideStart: 1, sideFreq: 2.0, maxUp: 5.2, recovery: 8.5 },
    snd: { kind: 'pistol', pitch: 1.05, power: 0.8 },
  },
  rev38: {
    id: 'rev38', name: 'Revólver .38', cls: 'Pistola', slot: 'secondary', type: 'pistol',
    real: 'Taurus Modelo 82 · Brasil · .38 Special (6 tiros)',
    damage: 55, armorPen: 0.7, rangeMod: 0.83, range: 150, penetration: 0.35,
    rpm: 160, auto: false, mag: 6, reserve: 36, reload: 2.9, deploy: 0.65, speed: 6.0,
    acc: { spread: 0.07, stand: 0.30, crouch: 0.22, move: 2.8, jump: 6.5, fire: 2.8, recovery: 0.55, max: 6.0 },
    recoil: { up: 3.0, upShots: 3, upTail: 1.2, side: 0.7, sideStart: 1, sideFreq: 2.2, maxUp: 7.5, recovery: 6 },
    snd: { kind: 'magnum', pitch: 1.05, power: 0.9 },
    noEject: true,   // revólver não ejeta o estojo a cada tiro
  },

  // ======================= SUBMETRALHADORAS =======================
  p90: {
    id: 'p90', name: 'P90', cls: 'Submetralhadora', slot: 'primary', type: 'smg',
    real: 'FN P90 · Bélgica · 5,7×28 mm',
    damage: 26, armorPen: 0.69, rangeMod: 0.86, range: 120, penetration: 0.25,
    rpm: 857, auto: true, mag: 50, reserve: 100, reload: 3.35, deploy: 0.9, speed: 5.84,
    acc: { spread: 0.05, stand: 0.55, crouch: 0.44, move: 1.5, jump: 7.5, fire: 0.24, recovery: 0.34, max: 3.0 },
    recoil: { up: 0.42, upShots: 12, upTail: 0.08, side: 0.32, sideStart: 8, sideFreq: 0.55, maxUp: 4.6, recovery: 8 },
    snd: { kind: 'smg', pitch: 1.2, power: 0.6, supersonic: true },
  },
  mp5sd: {
    id: 'mp5sd', name: 'MP5-SD', cls: 'Submetralhadora', slot: 'primary', type: 'smg',
    real: 'H&K MP5SD (supressor integrado) · Alemanha · 9×19 mm',
    damage: 27, armorPen: 0.625, rangeMod: 0.85, range: 120, penetration: 0.2,
    rpm: 750, auto: true, mag: 30, reserve: 120, reload: 2.65, deploy: 0.9, speed: 5.97,
    acc: { spread: 0.05, stand: 0.46, crouch: 0.36, move: 1.3, jump: 7.5, fire: 0.22, recovery: 0.3, max: 2.8 },
    recoil: { up: 0.4, upShots: 10, upTail: 0.08, side: 0.28, sideStart: 7, sideFreq: 0.6, maxUp: 4.0, recovery: 8.5 },
    snd: { kind: 'smg', pitch: 1.0, power: 0.45, suppressed: true },
  },
  ump45: {
    id: 'ump45', name: 'UMP-45', cls: 'Submetralhadora', slot: 'primary', type: 'smg',
    real: 'H&K UMP45 · Alemanha · .45 ACP',
    damage: 35, armorPen: 0.65, rangeMod: 0.75, range: 120, penetration: 0.25,
    rpm: 666, auto: true, mag: 25, reserve: 100, reload: 3.5, deploy: 0.9, speed: 5.84,
    acc: { spread: 0.06, stand: 0.56, crouch: 0.43, move: 1.9, jump: 7.5, fire: 0.36, recovery: 0.34, max: 3.3 },
    recoil: { up: 0.58, upShots: 9, upTail: 0.1, side: 0.42, sideStart: 6, sideFreq: 0.6, maxUp: 5.4, recovery: 7.5 },
    snd: { kind: 'smg', pitch: 0.92, power: 0.7 },
  },
  mac10: {
    id: 'mac10', name: 'MAC-10', cls: 'Submetralhadora', slot: 'primary', type: 'smg',
    real: 'Ingram MAC-10 · EUA · .45 ACP',
    damage: 29, armorPen: 0.575, rangeMod: 0.8, range: 100, penetration: 0.2,
    rpm: 800, auto: true, mag: 30, reserve: 100, reload: 2.6, deploy: 0.8, speed: 6.10,
    acc: { spread: 0.08, stand: 0.7, crouch: 0.55, move: 1.4, jump: 7.5, fire: 0.3, recovery: 0.32, max: 3.6 },
    recoil: { up: 0.48, upShots: 10, upTail: 0.1, side: 0.45, sideStart: 6, sideFreq: 0.6, maxUp: 5.0, recovery: 8 },
    snd: { kind: 'smg', pitch: 1.08, power: 0.65 },
  },

  // ======================= FUZIS =======================
  ak47: {
    id: 'ak47', name: 'AK-47', cls: 'Fuzil', slot: 'primary', type: 'rifle',
    real: 'Kalashnikov AK-47 · URSS · 7,62×39 mm',
    damage: 36, armorPen: 0.775, rangeMod: 0.98, range: 220, penetration: 0.55,
    rpm: 600, auto: true, mag: 30, reserve: 90, reload: 2.45, deploy: 1.0, speed: 5.46,
    acc: { spread: 0.03, stand: 0.34, crouch: 0.25, move: 7.5, jump: 12, fire: 0.42, recovery: 0.38, max: 3.4 },
    recoil: { up: 0.92, upShots: 8, upTail: 0.14, side: 0.85, sideStart: 7, sideFreq: 0.42, maxUp: 7.5, recovery: 7 },
    snd: { kind: 'rifle', pitch: 0.88, power: 1.0 },
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1', cls: 'Fuzil', slot: 'primary', type: 'rifle',
    real: 'Colt M4A1 · EUA · 5,56×45 mm NATO',
    damage: 33, armorPen: 0.70, rangeMod: 0.97, range: 220, penetration: 0.5,
    rpm: 666, auto: true, mag: 30, reserve: 90, reload: 3.05, deploy: 1.0, speed: 5.72,
    acc: { spread: 0.03, stand: 0.29, crouch: 0.21, move: 7.0, jump: 12, fire: 0.36, recovery: 0.36, max: 3.0 },
    recoil: { up: 0.74, upShots: 9, upTail: 0.12, side: 0.62, sideStart: 8, sideFreq: 0.46, maxUp: 6.2, recovery: 7.5 },
    snd: { kind: 'rifle', pitch: 1.05, power: 0.9 },
  },
  aug: {
    id: 'aug', name: 'AUG', cls: 'Fuzil', slot: 'primary', type: 'rifle',
    real: 'Steyr AUG A1 com luneta 1,5× · Áustria · 5,56×45 mm',
    damage: 28, armorPen: 0.9, rangeMod: 0.98, range: 220, penetration: 0.5,
    rpm: 666, auto: true, mag: 30, reserve: 90, reload: 3.8, deploy: 1.0, speed: 5.59,
    acc: { spread: 0.03, stand: 0.30, crouch: 0.22, move: 7.0, jump: 12, fire: 0.36, recovery: 0.36, max: 3.0 },
    recoil: { up: 0.66, upShots: 9, upTail: 0.1, side: 0.5, sideStart: 8, sideFreq: 0.5, maxUp: 5.6, recovery: 7.5 },
    scope: { levels: [45], accMult: 0.45, recoilMult: 0.75, speed: 4.4, overlay: 'red-dot', fireRateMult: 0.85 },
    snd: { kind: 'rifle', pitch: 1.12, power: 0.85 },
  },
  galil: {
    id: 'galil', name: 'Galil AR', cls: 'Fuzil', slot: 'primary', type: 'rifle',
    real: 'IWI Galil ACE · Israel · 5,56×45 mm NATO',
    damage: 30, armorPen: 0.775, rangeMod: 0.98, range: 200, penetration: 0.5,
    rpm: 666, auto: true, mag: 35, reserve: 90, reload: 3.0, deploy: 1.0, speed: 5.84,
    acc: { spread: 0.04, stand: 0.40, crouch: 0.30, move: 7.5, jump: 12, fire: 0.40, recovery: 0.38, max: 3.4 },
    recoil: { up: 0.8, upShots: 8, upTail: 0.13, side: 0.7, sideStart: 7, sideFreq: 0.45, maxUp: 6.8, recovery: 7 },
    snd: { kind: 'rifle', pitch: 1.0, power: 0.9 },
  },
  famas: {
    id: 'famas', name: 'FAMAS', cls: 'Fuzil', slot: 'primary', type: 'rifle',
    real: 'MAS FAMAS F1 (bullpup) · França · 5,56×45 mm',
    damage: 30, armorPen: 0.7, rangeMod: 0.96, range: 200, penetration: 0.5,
    rpm: 666, auto: true, mag: 25, reserve: 90, reload: 3.3, deploy: 1.0, speed: 5.84,
    acc: { spread: 0.03, stand: 0.33, crouch: 0.24, move: 7.0, jump: 12, fire: 0.38, recovery: 0.36, max: 3.1 },
    recoil: { up: 0.72, upShots: 9, upTail: 0.12, side: 0.55, sideStart: 8, sideFreq: 0.48, maxUp: 6.0, recovery: 7.5 },
    snd: { kind: 'rifle', pitch: 1.1, power: 0.85 },
  },

  // ======================= RIFLES DE PRECISÃO =======================
  awp: {
    id: 'awp', name: 'AWP', cls: 'Rifle de precisão', slot: 'primary', type: 'sniper',
    real: 'Accuracy International AWM · Reino Unido · .338 Lapua Magnum',
    damage: 115, armorPen: 0.975, rangeMod: 0.99, range: 400, penetration: 1.2,
    rpm: 41, auto: false, mag: 5, reserve: 30, reload: 3.6, deploy: 1.25, speed: 5.08,
    acc: { spread: 0.05, stand: 4.6, crouch: 4.2, move: 9, jump: 18, fire: 3.0, recovery: 0.4, max: 6 },
    scopedAcc: { stand: 0.025, crouch: 0.015, move: 6.5, jump: 15 },
    recoil: { up: 2.6, upShots: 1, upTail: 2.6, side: 0.4, sideStart: 0, sideFreq: 1.3, maxUp: 4, recovery: 4 },
    scope: { levels: [40, 12], speed: 2.54, overlay: 'sniper', unscopeOnFire: true },
    snd: { kind: 'sniper', pitch: 0.8, power: 1.25 },
  },
  ssg08: {
    id: 'ssg08', name: 'SSG 08', cls: 'Rifle de precisão', slot: 'primary', type: 'sniper',
    real: 'Steyr SSG 08 · Áustria · .308 Winchester',
    damage: 88, armorPen: 0.85, rangeMod: 0.98, range: 400, penetration: 0.9,
    rpm: 48, auto: false, mag: 10, reserve: 90, reload: 3.7, deploy: 1.1, speed: 5.84,
    acc: { spread: 0.04, stand: 2.6, crouch: 2.4, move: 6, jump: 9, fire: 2.0, recovery: 0.35, max: 5 },
    scopedAcc: { stand: 0.03, crouch: 0.02, move: 3.8, jump: 0.6 },
    recoil: { up: 1.9, upShots: 1, upTail: 1.9, side: 0.3, sideStart: 0, sideFreq: 1.3, maxUp: 3, recovery: 5 },
    scope: { levels: [40, 15], speed: 5.84, overlay: 'sniper', unscopeOnFire: true },
    snd: { kind: 'sniper', pitch: 1.05, power: 0.95 },
  },

  // ======================= ESCOPETA =======================
  xm1014: {
    id: 'xm1014', name: 'XM1014', cls: 'Escopeta', slot: 'primary', type: 'shotgun',
    real: 'Benelli M4 Super 90 · Itália · calibre 12',
    damage: 20, pellets: 6, pelletSpread: 3.4, armorPen: 0.8, rangeMod: 0.7, range: 45, penetration: 0.15,
    rpm: 171, auto: true, mag: 7, reserve: 32, reload: 0.42, reloadStart: 0.35, shellReload: true, deploy: 0.9, speed: 5.46,
    acc: { spread: 0, stand: 0.5, crouch: 0.4, move: 3.0, jump: 6, fire: 0.8, recovery: 0.4, max: 3 },
    recoil: { up: 2.4, upShots: 3, upTail: 1.2, side: 0.6, sideStart: 0, sideFreq: 1.7, maxUp: 6.5, recovery: 6 },
    snd: { kind: 'shotgun', pitch: 0.95, power: 1.1 },
  },
  nova: {
    id: 'nova', name: 'Nova', cls: 'Escopeta', slot: 'primary', type: 'shotgun',
    real: 'Benelli Nova (de bombeamento) · Itália · calibre 12',
    damage: 24, pellets: 8, pelletSpread: 3.8, armorPen: 0.5, rangeMod: 0.7, range: 40, penetration: 0.15,
    rpm: 68, auto: false, mag: 8, reserve: 32, reload: 0.5, reloadStart: 0.4, shellReload: true, deploy: 0.9, speed: 5.72,
    acc: { spread: 0, stand: 0.6, crouch: 0.5, move: 3.0, jump: 6, fire: 1.2, recovery: 0.5, max: 3 },
    recoil: { up: 3.2, upShots: 1, upTail: 3.2, side: 0.6, sideStart: 0, sideFreq: 1.7, maxUp: 6, recovery: 5 },
    snd: { kind: 'shotgun', pitch: 0.9, power: 1.15 },
    pump: true,      // puxa a telha depois de cada tiro
  },

  // ======================= METRALHADORA =======================
  m249: {
    id: 'm249', name: 'M249', cls: 'Metralhadora', slot: 'primary', type: 'rifle',
    real: 'FN M249 SAW · Bélgica/EUA · 5,56×45 mm (caixa de 100)',
    damage: 32, armorPen: 0.8, rangeMod: 0.97, range: 220, penetration: 0.6,
    rpm: 750, auto: true, mag: 100, reserve: 200, reload: 5.7, deploy: 1.2, speed: 5.2,
    acc: { spread: 0.04, stand: 0.6, crouch: 0.42, move: 9, jump: 14, fire: 0.3, recovery: 0.42, max: 4.2 },
    recoil: { up: 0.7, upShots: 10, upTail: 0.16, side: 0.9, sideStart: 8, sideFreq: 0.38, maxUp: 7.5, recovery: 6.5 },
    snd: { kind: 'rifle', pitch: 0.95, power: 1.0 },
  },

  // ======================= GRANADAS =======================
  he: {
    id: 'he', name: 'Granada explosiva', cls: 'Granada', slot: 'grenade', type: 'grenade', nade: 'he',
    real: 'Granada de fragmentação M67', speed: 6.22, deploy: 0.55,
  },
  flash: {
    id: 'flash', name: 'Granada de luz', cls: 'Granada', slot: 'grenade', type: 'grenade', nade: 'flash',
    real: 'Granada atordoante M84', speed: 6.22, deploy: 0.55,
  },
  smoke: {
    id: 'smoke', name: 'Granada de fumaça', cls: 'Granada', slot: 'grenade', type: 'grenade', nade: 'smoke',
    real: 'Granada de fumaça M18', speed: 6.22, deploy: 0.55,
  },

  // ======================= EXPLOSIVOS =======================
  // Plantada no chão à frente do jogador (botão esquerdo). Arma em ~1,5 s e
  // explode quando um inimigo pisa perto dela. Também explode com tiros e
  // com granadas explosivas próximas.
  mine: {
    id: 'mine', name: 'Mina terrestre', cls: 'Explosivo', slot: 'grenade', type: 'grenade', nade: 'mine',
    real: 'Mina antipessoal de pressão (estilo M14/M16)', speed: 6.1, deploy: 0.6,
  },
};

export const PRIMARIES = ['ak47', 'm4a1', 'galil', 'famas', 'aug', 'awp', 'ssg08', 'p90', 'mp5sd', 'ump45', 'mac10', 'xm1014', 'nova', 'm249'];
export const SECONDARIES = ['glock', 'usps', 'p250', 'deagle', 'rev38', 'fiveseven'];
export const GRENADES = ['he', 'flash', 'smoke', 'mine'];
export const THROWABLES = ['he', 'flash', 'smoke'];
export const WEAPON_LIST = Object.keys(WEAPONS);           // índice usado na rede
export const WEAPON_INDEX = Object.fromEntries(WEAPON_LIST.map((k, i) => [k, i]));

export function cycleTime(w) { return 60 / w.rpm; }

// Recuo determinístico por índice do disparo (graus). Retorna [pitch, yaw].
export function recoilStep(w, shotIndex, rand) {
  const r = w.recoil;
  if (!r) return [0, 0];
  const up = shotIndex < r.upShots ? r.up : r.upTail;
  let side = 0;
  if (shotIndex >= r.sideStart) {
    const k = shotIndex - r.sideStart;
    // padrão: primeiro para um lado, depois para o outro (como o "7" da AK)
    side = Math.sin(k * r.sideFreq + 0.6) * r.side;
  }
  const jitter = (rand() - 0.5) * 0.25;
  return [up * (1 + jitter * 0.6), side + (rand() - 0.5) * r.side * 0.35];
}

// Estatísticas normalizadas (0..1) para os gráficos de barra do menu.
export function weaponBars(w) {
  if (w.type === 'melee' || w.type === 'grenade') return null;
  const dmg = (w.damage * (w.pellets || 1));
  const acc = w.scopedAcc ? 1 - Math.min(1, w.scopedAcc.stand * 8) : 1 - Math.min(1, (w.acc.stand + w.acc.spread) / 1.2);
  const ctrl = 1 - Math.min(1, w.recoil.up * (w.auto ? 1.6 : 0.35) / 2.2);
  return {
    dano: Math.min(1, dmg / 120),
    cadencia: Math.min(1, w.rpm / 900),
    precisao: Math.max(0.05, acc),
    controle: Math.max(0.05, ctrl),
    mobilidade: Math.min(1, Math.max(0.05, (w.speed - 4.8) / (6.35 - 4.8))),
    alcance: Math.min(1, Math.pow(w.rangeMod, 6) * (w.range / 220)),
  };
}
