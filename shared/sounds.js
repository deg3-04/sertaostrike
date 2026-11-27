// Pacotes de som (escolhidos pelo dono da sala) e a lista de "espaços" de som
// que um pacote pode preencher. Compartilhado entre servidor e cliente.
//
// Cada pacote é uma pasta em public/sounds/<pasta>/ com arquivos nomeados pelo
// espaço: ak47.wav, ak47_2.wav (variação), footstep_1.ogg... O que faltar no
// pacote cai no som gerado pelo próprio jogo.

export const SOUND_PACKS = [
  { id: 'padrao', name: 'Padrão (gerado pelo jogo)', dir: '' },
  { id: 'profissional', name: 'Profissional (gravações reais)', dir: 'profissional' },
  { id: 'zoeira', name: 'Zoeira (gravado pela galera)', dir: 'zoeira' },
];
export const SOUND_PACK_IDS = SOUND_PACKS.map((p) => p.id);
export function soundPackDir(id) { const p = SOUND_PACKS.find((x) => x.id === id); return p ? p.dir : ''; }

// [id, nome, dica para quem grava]
export const SOUND_GROUPS = [
  {
    name: 'Tiros: pistolas', dir: '01-tiros-pistolas', slots: [
      ['glock', 'Glock-18', 'pá! curtinho'],
      ['usps', 'USP-S (com silenciador)', 'pfff baixinho'],
      ['deagle', 'Desert Eagle', 'BOOM bem grave'],
      ['fiveseven', 'Five-seveN', 'pá! agudo'],
      ['p250', 'P250', 'pá!'],
      ['rev38', 'Revólver .38', 'BAM! de faroeste'],
    ],
  },
  {
    name: 'Tiros: submetralhadoras', dir: '02-tiros-submetralhadoras', slots: [
      ['p90', 'P90', 'tá! (um tiro só, a rajada o jogo faz)'],
      ['mp5sd', 'MP5-SD (com silenciador)', 'tsc!'],
      ['ump45', 'UMP-45', 'tó!'],
      ['mac10', 'MAC-10', 'tec!'],
    ],
  },
  {
    name: 'Tiros: fuzis e metralhadora', dir: '03-tiros-fuzis', slots: [
      ['ak47', 'AK-47', 'PÁ! (um tiro só)'],
      ['m4a1', 'M4A1', 'pá!'],
      ['aug', 'AUG', 'pá!'],
      ['galil', 'Galil AR', 'pá!'],
      ['famas', 'FAMAS', 'pá!'],
      ['m249', 'M249', 'TÁ! (um tiro só)'],
    ],
  },
  {
    name: 'Tiros: precisão e escopetas', dir: '04-tiros-precisao-escopetas', slots: [
      ['awp', 'AWP', 'KABUM! o mais alto de todos'],
      ['ssg08', 'SSG 08', 'PÁÁ!'],
      ['xm1014', 'XM1014', 'PUM!'],
      ['nova', 'Nova', 'PUM! + tchec-tchec'],
    ],
  },
  {
    name: 'Explosivos', dir: '05-explosivos', slots: [
      ['explosion', 'Granada explosiva', 'KABUUUM'],
      ['mine', 'Mina terrestre', 'BUUM grave'],
      ['flashbang', 'Granada de luz', 'PÁ! seco + piiii'],
      ['smoke', 'Granada de fumaça', 'fssssss'],
      ['pin', 'Tirar o pino', 'plim'],
      ['throw', 'Arremessar', 'vush'],
      ['bounce', 'Granada quicando', 'toc'],
      ['mineplace', 'Plantar mina', 'cavando + clic'],
      ['mineclick', 'Pisar na mina', 'clic... ops'],
    ],
  },
  {
    name: 'Armas: manuseio', dir: '06-armas-manuseio', slots: [
      ['reload', 'Recarregar', 'tirar pente, pôr pente, tchec'],
      ['deploy', 'Sacar arma', 'tchec'],
      ['bolt', 'Ferrolho (AWP/SSG)', 'clac-clac'],
      ['shell', 'Cartucho caindo no chão', 'tilim'],
      ['dryfire', 'Sem munição', 'clic'],
      ['scope', 'Mira (zoom)', 'tic'],
      ['knife', 'Faca no ar', 'vush'],
      ['knifehit', 'Faca acertando', 'tchak'],
    ],
  },
  {
    name: 'Corpo', dir: '07-corpo', slots: [
      ['footstep', 'Passo', 'tum (grave 2 ou 3 variações)'],
      ['land', 'Cair de um pulo', 'tóim'],
      ['hurt', 'Levar tiro', 'ai!'],
      ['death', 'Morrer', 'aaargh / morri'],
    ],
  },
  {
    name: 'Acertos e anúncios', dir: '08-acertos-anuncios', slots: [
      ['hitmarker', 'Acertar alguém', 'tic'],
      ['headshot', 'Tiro na cabeça', 'plim!'],
      ['kill', 'Abate', 'toma!'],
      ['headshotkill', 'Abate com tiro na cabeça', 'BOOM HEADSHOT'],
      ['streak', 'Sequência de abates', 'tá on fire!'],
      ['heal', 'Recuperar vida', 'ahh'],
      ['levelup', 'Subir de arma (gun game)', 'uhuul'],
    ],
  },
  {
    name: 'Interface', dir: '09-interface', slots: [
      ['ui_start', 'Começo da partida', 'bora!'],
      ['ui_end', 'Fim da partida', 'acabou!'],
      ['ui_spawn', 'Renascer', 'voltei'],
      ['ui_chat', 'Mensagem no chat', 'plim'],
      ['radio', 'Rádio', 'kssh'],
    ],
  },
];
export const SOUND_SLOT_IDS = SOUND_GROUPS.flatMap((g) => g.slots.map((s) => s[0]));
// subpasta de cada som dentro de public/sounds/zoeira/ (ex.: glock -> 01-tiros-pistolas)
export const SLOT_DIR = Object.fromEntries(SOUND_GROUPS.flatMap((g) => g.slots.map((s) => [s[0], g.dir])));
export const SOUND_DIRS = SOUND_GROUPS.map((g) => g.dir);
export const MAX_VARIATIONS = 5;
