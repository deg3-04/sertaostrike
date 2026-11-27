// Constantes compartilhadas entre servidor e cliente.
// Unidades: metros e segundos. Valores inspirados na engine Source (CS),
// convertidos de "unidades" (1u ≈ 2,54 cm).

export const GAME_NAME = 'SERTÃO STRIKE';
export const VERSION = '1.5.0';

// Multiplicador global de dano (0.9 = armas 10% mais fracas que o padrão do CS)
export const DAMAGE_SCALE = 0.9;

export const PLAYER = {
  radius: 0.41,            // meia-largura da caixa de colisão (16u)
  height: 1.83,            // em pé (72u)
  crouchHeight: 1.37,      // agachado (54u)
  eyeHeight: 1.63,         // altura dos olhos em pé (64u)
  crouchEyeHeight: 1.17,   // altura dos olhos agachado (46u)
  stepHeight: 0.46,        // degrau máximo (18u)
  maxHealth: 100,
  maxArmor: 100,
};

export const MOVE = {
  gravity: 20.32,          // 800u/s²
  jumpSpeed: 7.67,         // ≈302u/s → pulo de ~1,45 m
  accelerate: 5.5,         // sv_accelerate
  airAccelerate: 18,       // mais controle no ar
  airSpeedCap: 0.762,      // 30u/s (permite "air strafe")
  friction: 5.2,           // sv_friction
  stopSpeed: 2.03,         // 80u/s
  speedMult: 1.07,         // movimento 7% mais rápido que o CS (mais dinâmico)
  walkMult: 0.52,          // andar (Shift)
  crouchMult: 0.34,        // agachado
  maxHorizontalSpeed: 11,  // limite de segurança (bunny hop)
  maxFallSpeed: 40,
  tagMult: 0.55,           // lentidão ao levar tiro ("tagging")
  tagTime: 0.35,
};

export const GRENADE = {
  dt: 1 / 64,
  gravityMult: 0.4,
  radius: 0.07,
  restitution: 0.45,
  throwSpeedStrong: 17.5,
  throwSpeedWeak: 7.0,
  fuseSteps: 102,          // 1,6 s a 64 passos/s (HE e flash)
  chargeTime: 0.9,         // segurando o botão: tempo para chegar à força máxima
  minCharge: 0.3,          // força de um toque rápido (0..1)
  cookFree: 1.0,           // segundos segurando antes do pavio começar a queimar (HE e flash)
  smokeMinSteps: 64,       // fumaça só "estoura" parada e após 1 s
  smokeMaxSteps: 64 * 6,
  heRadius: 9.0,
  heDamage: 98,
  heArmorPen: 0.575,
  smokeDuration: 18,
  smokeRadius: 3.9,
  smokeHeight: 3.0,
  flashMaxDuration: 4.8,
};

// Mina terrestre
export const MINE = {
  armTime: 1.5,            // segundos até armar depois de plantada
  triggerRadius: 1.25,     // distância horizontal que dispara a mina
  triggerHeight: 0.9,      // o pé precisa estar a menos disso acima da mina
  fuse: 0.32,              // "clique" → explosão (dá tempo de ouvir, não de fugir)
  radius: 6.0,             // raio de dano
  damage: 200,             // dano máximo (no centro), reduzido pela distância
  armorPen: 0.8,
  maxActive: 2,            // minas ativas por jogador (a mais antiga some)
  lifetime: 120,           // segundos até a mina se desfazer sozinha
  placeDist: 0.95,         // distância à frente do jogador onde ela é plantada
  hitRadius: 0.2,          // raio para ser atingida por tiros
};

export const NET = {
  tickRate: 64,
  snapshotRate: 32,
  historySeconds: 1.25,    // histórico para compensação de latência
  maxRewind: 1.0,          // segundos (folga para PCs mais lentos)
};

// Partes do corpo e multiplicadores de dano (padrão CS)
export const HIT_ZONES = {
  head:    { name: 'Cabeça',  mult: 4.0,  armored: 'helmet' },
  chest:   { name: 'Tronco',  mult: 1.0,  armored: 'kevlar' },
  stomach: { name: 'Abdômen', mult: 1.25, armored: 'kevlar' },
  legs:    { name: 'Pernas',  mult: 0.75, armored: null },
};

export const CHARACTERS = [
  { id: 'sombra',      name: 'Sombra',      desc: 'Operador tático urbano', team: 'ct' },
  { id: 'cangaceiro',  name: 'Cangaceiro',  desc: 'Lenda do sertão',        team: 'tr' },
  { id: 'coiote',      name: 'Coiote',      desc: 'Forças especiais do deserto', team: 'ct' },
  { id: 'guerrilha',   name: 'Guerrilha',   desc: 'Combatente da mata',     team: 'tr' },
  { id: 'artico',      name: 'Ártico',      desc: 'Atirador de elite das neves', team: 'ct' },
  { id: 'mercenario',  name: 'Mercenário',  desc: 'Soldado de aluguel',     team: 'tr' },
  { id: 'joao',        name: 'João',        desc: 'Chimpanzé que anda em pé', team: 'tr' },
  { id: 'padre',       name: 'Lincuzinho',  desc: 'Padre de batina e tonsura', team: 'ct' },
  { id: 'professor',   name: 'Will',        desc: 'Óculos e duas entradas',  team: 'ct' },
  { id: 'ceissa',      name: 'Ceissa',      desc: 'Loira de olhos verdes e pitó no alto', team: 'ct' },
  { id: 'uriel',       name: 'Uriel',       desc: 'Babuíno albino de juba branca', team: 'tr' },
];

export const SIDES = [
  { id: 'any',   name: 'Qualquer lugar' },
  { id: 'north', name: 'Base Norte (CT)' },
  { id: 'south', name: 'Base Sul (TR)' },
];

export const MODES = [
  { id: 'ffa', name: 'Mata-mata (todos contra todos)' },
  { id: 'tdm', name: 'Mata-mata em equipe (CT × TR)' },
  { id: 'gungame', name: 'Gun Game (troca de arma a cada abate)' },
  { id: 'ctf', name: 'Capture a Bandeira (CT × TR)' },
];
export const MODE_IDS = MODES.map((m) => m.id);
export function modeName(id) { const m = MODES.find((x) => x.id === id); return m ? m.name : id; }
// modos jogados em equipes (CT × TR)
export function isTeamModeId(id) { return id === 'tdm' || id === 'ctf'; }

// Capture a Bandeira: cada equipe tem a sua bandeira na própria base.
// Pegue a bandeira inimiga e leve até a sua base (com a sua bandeira lá) para pontuar.
export const CTF = {
  touchRadius: 1.5,    // distância (m) para pegar/devolver a bandeira
  captureRadius: 2.2,  // distância da base para capturar
  returnTime: 25,      // segundos até a bandeira caída voltar sozinha para a base
  captureScore: 5,     // pontos no placar individual por captura
  returnScore: 1,      // pontos por devolver a própria bandeira
};

export const TEAMS = {
  ct: { id: 'ct', name: 'CT', full: 'Contra-Terroristas', color: '#5aa9ff', side: 'north' },
  tr: { id: 'tr', name: 'TR', full: 'Terroristas', color: '#ffb347', side: 'south' },
};
export const TEAM_CODE = { ct: 1, tr: 2 };

// Sequência do Gun Game (o último nível é a faca)
export const GUNGAME_LIST = ['glock', 'usps', 'fiveseven', 'rev38', 'deagle', 'mac10', 'mp5sd', 'ump45', 'p90', 'xm1014', 'ssg08', 'galil', 'm4a1', 'ak47', 'aug', 'awp', 'knife'];

// Configurações padrão da partida (podem ser alteradas no config.json
// e pelo anfitrião dentro do jogo)
export const DEFAULT_MATCH = {
  map: 'sertao',
  mode: 'ffa',               // 'ffa' | 'tdm' | 'gungame' | 'ctf'
  endCondition: 'both',      // 'time' | 'kills' | 'both' (o que vier primeiro)
  timeLimitMin: 10,
  killLimit: 30,
  tiebreak: 'stats',         // 'stats' (menos mortes → mais HS → mais dano → quem chegou antes) | 'sudden' (morte súbita)
  teamKillLimit: 50,         // abates da equipe para vencer (mata-mata em equipe)
  captureLimit: 3,           // capturas para vencer (capture a bandeira)
  friendlyFire: false,       // dano em companheiros de equipe
  respawnTime: 1.5,
  spawnProtection: 1.5,
  spawnMode: 'action',       // 'action' (perto da ação) | 'safe' (longe dos inimigos)
  killHeal: 25,              // vida recuperada a cada abate
  killRefill: true,          // abate recarrega o pente da arma em uso
  streakBonus: true,         // bônus em sequências de 3 abates
  armor: true,               // colete
  helmet: true,              // capacete
  infiniteAmmo: false,       // munição reserva infinita
  heGrenades: 1,
  flashGrenades: 1,
  smokeGrenades: 1,
  mines: 1,                  // minas terrestres por vida
  headshotOnly: false,
  friendlyFireSelf: true,    // dano da própria granada
  intermission: 15,          // segundos de placar final antes da próxima partida
  bots: 4,                   // preenche com bots até N jogadores (0 = sem bots)
  botDifficulty: 'normal',   // 'easy' | 'normal' | 'hard'
  soundPack: 'padrao',       // 'padrao' | 'profissional' | 'zoeira' (veja shared/sounds.js)
};

export const MATCH_LIMITS = {
  timeLimitMin: [1, 60],
  killLimit: [1, 200],
  respawnTime: [0, 30],
  spawnProtection: [0, 10],
  teamKillLimit: [5, 300],
  captureLimit: [1, 20],
  killHeal: [0, 100],
  heGrenades: [0, 3],
  flashGrenades: [0, 3],
  smokeGrenades: [0, 3],
  mines: [0, 3],
  intermission: [5, 60],
  bots: [0, 16],
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Bits de estado enviados na rede
export const FLAG = { CROUCH: 1, GROUND: 2, WALK: 4, SCOPED: 8, RELOAD: 16, PROTECTED: 32, BOT: 64 };

export const HALF_STEP_KEYS = ['respawnTime', 'spawnProtection'];
