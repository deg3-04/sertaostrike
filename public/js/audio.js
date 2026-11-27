// Áudio do jogo com Web Audio.
//
// Tiros: cada arma tem um som próprio, gerado amostra por amostra a partir
// de um modelo físico simplificado do disparo real:
//   • onda de choque da boca do cano (pulso de Friedlander, o "BUM" seco)
//   • jato de gás (ruído filtrado), estalo agudo e ressonância do cano
//   • mecanismo da arma (ferrolho/slide batendo alguns milissegundos depois)
//   • de longe: estalo supersônico da bala chegando antes do estrondo
//     abafado e do "ronco" que rola pelo cenário
// Na reprodução entram o atraso do som pela distância (343 m/s), o
// abafamento atrás de paredes e o eco do lugar (sala fechada × céu aberto).
//
// Pacotes de som (o dono da sala escolhe, veja shared/sounds.js):
//   padrao       → sons gerados aqui + arquivos soltos em public/sounds/
//   profissional → gravações reais em public/sounds/profissional/
//   zoeira       → gravações da galera em public/sounds/zoeira/ (gravar.html)
// Cada arquivo tem o nome do "espaço" de som (ak47_1.wav, footstep_2.wav,
// awp_far_1.wav = AWP ouvida de longe...). O que faltar usa o som gerado.

const SOUND_OF_SPEED = 343;

// Perfis por tipo de arma (o "pitch" de cada arma escala tempos e frequências)
export const SHOT_PROFILES = {
  rifle:   { td: 0.0011, b: 1.8, blast: 1.0, roar: 0.55, roarDecay: 0.045, lp: 5500, hp: 110, crack: 0.35, crackDecay: 0.006, res: 0.25, f0: 260, resDecay: 0.05, thump: 0.8, th0: 120, th1: 45, thDur: 0.16, mech: [[0.018, 2600, 0.12], [0.034, 1800, 0.1]], tail: 0.6, tailFar: 1.6, supersonic: true, drive: 2.2 },
  smg:     { td: 0.0007, b: 1.8, blast: 0.9, roar: 0.5, roarDecay: 0.03, lp: 6500, hp: 140, crack: 0.3, crackDecay: 0.005, res: 0.2, f0: 340, resDecay: 0.035, thump: 0.55, th0: 140, th1: 55, thDur: 0.1, mech: [[0.012, 3000, 0.13], [0.024, 2000, 0.1]], tail: 0.45, tailFar: 1.2, supersonic: false, drive: 2.0 },
  pistol:  { td: 0.0008, b: 1.9, blast: 0.95, roar: 0.5, roarDecay: 0.032, lp: 7000, hp: 150, crack: 0.4, crackDecay: 0.005, res: 0.3, f0: 420, resDecay: 0.03, thump: 0.6, th0: 150, th1: 60, thDur: 0.11, mech: [[0.014, 3400, 0.15], [0.03, 2400, 0.12]], tail: 0.45, tailFar: 1.2, supersonic: false, drive: 2.0 },
  magnum:  { td: 0.0014, b: 1.7, blast: 1.1, roar: 0.7, roarDecay: 0.06, lp: 5000, hp: 90, crack: 0.45, crackDecay: 0.007, res: 0.35, f0: 230, resDecay: 0.06, thump: 1.0, th0: 100, th1: 38, thDur: 0.22, mech: [[0.02, 2200, 0.14], [0.04, 1600, 0.12]], tail: 0.75, tailFar: 1.8, supersonic: true, drive: 2.6 },
  sniper:  { td: 0.0018, b: 1.6, blast: 1.2, roar: 0.75, roarDecay: 0.075, lp: 4200, hp: 70, crack: 0.55, crackDecay: 0.01, res: 0.3, f0: 180, resDecay: 0.08, thump: 1.2, th0: 85, th1: 30, thDur: 0.3, mech: [], tail: 1.1, tailFar: 2.4, supersonic: true, drive: 2.8 },
  shotgun: { td: 0.0024, b: 1.4, blast: 1.15, roar: 0.85, roarDecay: 0.07, lp: 3800, hp: 70, crack: 0.25, crackDecay: 0.008, res: 0.3, f0: 160, resDecay: 0.07, thump: 1.1, th0: 95, th1: 35, thDur: 0.26, mech: [[0.06, 1500, 0.1]], tail: 0.9, tailFar: 2.0, supersonic: false, drive: 2.6 },
};
// com supressor: quase só o mecanismo e um "pfft" abafado
export const SUPPRESSED = { td: 0.0004, b: 2.2, blast: 0.25, roar: 0.35, roarDecay: 0.018, lp: 2200, hp: 300, crack: 0.05, crackDecay: 0.003, res: 0.15, f0: 600, resDecay: 0.02, thump: 0.15, th0: 160, th1: 80, thDur: 0.05, tail: 0.25, tailFar: 0.4, supersonic: false, drive: 1.4 };

// ------------------------------------------------------------- DSP básico
function makeRand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// filtro biquad (RBJ) aplicado no lugar, num trecho [from, to)
function biquad(x, type, f, q, sr, from = 0, to = x.length) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; } // passa-faixa
  a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = from; i < to; i++) {
    const xi = x[i], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
function noiseArr(n, rand) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rand() * 2 - 1; return a; }
function mixInto(dst, src, at, gain) { const n = Math.min(src.length, dst.length - at); for (let i = 0; i < n; i++) dst[at + i] += src[i] * gain; }
function finish(x, drive, level) {
  const k = Math.tanh(drive);
  let peak = 0;
  for (let i = 0; i < x.length; i++) { x[i] = Math.tanh(x[i] * drive) / k; peak = Math.max(peak, Math.abs(x[i])); }
  const g = peak > 0 ? level / peak : 1;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  // rampa final curta (sem estalo no corte)
  const fade = Math.min(x.length, 512);
  for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  return x;
}
// clique mecânico: ruído curto em faixa estreita + ressonância metálica
function click(sr, freq, amp, rand) {
  const n = Math.floor(sr * 0.02);
  const a = noiseArr(n, rand);
  for (let i = 0; i < n; i++) a[i] *= Math.exp(-i / (sr * 0.0025));
  biquad(a, 'bp', freq, 4, sr);
  for (let i = 0; i < n; i++) a[i] = a[i] * 3 + Math.sin(2 * Math.PI * freq * 0.62 * i / sr) * Math.exp(-i / (sr * 0.005)) * 0.35;
  for (let i = 0; i < n; i++) a[i] *= amp;
  return a;
}

// Gera um disparo. far = versão ouvida de longe.
export function renderShot(sr, P, pitch, far, seed) {
  const rand = makeRand(seed);
  const len = Math.floor(sr * (far ? P.tailFar : P.tail));
  const x = new Float32Array(len);
  const ph = pitch * (0.97 + rand() * 0.06);
  const td = P.td / ph;
  // 1) onda de choque (Friedlander): pico, queda e fase negativa
  const nb = Math.min(len, Math.floor(td * 9 * sr));
  for (let i = 0; i < nb; i++) { const t = i / sr; x[i] += P.blast * (1 - t / td) * Math.exp(-P.b * t / td); }
  // 2) jato de gás: ruído com ataque de 0,3 ms
  const nr = Math.min(len, Math.floor(P.roarDecay * 7 * sr));
  const roar = noiseArr(nr, rand);
  for (let i = 0; i < nr; i++) { const t = i / sr; roar[i] *= (1 - Math.exp(-t / 0.0003)) * Math.exp(-t / P.roarDecay); }
  biquad(roar, 'lp', P.lp * ph, 0.7, sr); biquad(roar, 'hp', P.hp, 0.7, sr);
  mixInto(x, roar, 0, P.roar);
  // 3) estalo agudo
  const nc = Math.min(len, Math.floor(P.crackDecay * 7 * sr));
  const cr = noiseArr(nc, rand);
  for (let i = 0; i < nc; i++) cr[i] *= Math.exp(-i / (P.crackDecay * sr));
  biquad(cr, 'hp', 3000 * ph, 0.7, sr);
  mixInto(x, cr, 0, P.crack);
  // 4) ressonância do cano e 5) "tum" grave com queda de tom
  const ns = Math.min(len, Math.floor(Math.max(P.resDecay * 6, P.thDur * 1.5) * sr));
  let phR = 0, phT = 0;
  for (let i = 0; i < ns; i++) {
    const t = i / sr;
    const fr = P.f0 * ph * (1 - 0.15 * Math.min(1, t / 0.05));
    phR += 2 * Math.PI * fr / sr;
    const ft = P.th0 * ph * Math.pow(P.th1 / P.th0, Math.min(1, t / P.thDur));
    phT += 2 * Math.PI * ft / sr;
    x[i] += Math.sin(phR) * Math.exp(-t / P.resDecay) * P.res + Math.sin(phT) * Math.exp(-t / (P.thDur * 0.4)) * P.thump * (1 - Math.exp(-t / 0.002));
  }
  // 6) mecanismo
  if (!far) for (const [d, f, a] of P.mech || []) mixInto(x, click(sr, f * (0.95 + rand() * 0.1), a * (P === SUPPRESSED ? 2 : 1) * 4, rand), Math.floor((d + rand() * 0.003) * sr), 1);
  if (far) {
    // de longe: some o agudo, entra o estalo supersônico e o "ronco"
    biquad(x, 'lp', 1100 * ph, 0.6, sr); biquad(x, 'lp', 1600 * ph, 0.6, sr);
    const shift = P.supersonic ? Math.floor(0.045 * sr) : 0;
    if (shift) { x.copyWithin(shift, 0, len - shift); x.fill(0, 0, shift); }
    if (P.supersonic) {
      // onda N: subida instantânea, rampa até o negativo, volta a zero (~0,4 ms)
      const nn = Math.floor(0.0004 * sr) + 1;
      for (let i = 0; i < nn; i++) x[i] += 0.9 * (1 - 2 * i / nn);
      const tick = noiseArr(Math.floor(0.004 * sr), rand);
      for (let i = 0; i < tick.length; i++) tick[i] *= Math.exp(-i / (0.0008 * sr));
      biquad(tick, 'hp', 2500, 0.7, sr);
      mixInto(x, tick, 0, 0.5);
    }
    const nrum = len - shift;
    const rum = noiseArr(nrum, rand);
    const dec = P.tailFar * 0.28;
    for (let i = 0; i < nrum; i++) { const t = i / sr; rum[i] *= (1 - Math.exp(-t / 0.03)) * Math.exp(-t / dec); }
    biquad(rum, 'lp', 320 * ph, 0.7, sr); biquad(rum, 'lp', 450, 0.7, sr);
    mixInto(x, rum, shift, P.thump * 2.2);
  }
  return finish(x, P.drive, 0.92);
}

// Explosão (granada ou mina). big = mina (mais grave, mais terra voando).
export function renderExplosion(sr, big, far, seed) {
  const rand = makeRand(seed);
  const len = Math.floor(sr * (far ? 3.2 : 2.6));
  const x = new Float32Array(len);
  const td = big ? 0.009 : 0.006;
  for (let i = 0; i < Math.min(len, td * 9 * sr); i++) { const t = i / sr; x[i] += 1.4 * (1 - t / td) * Math.exp(-1.3 * t / td); }
  const rum = noiseArr(len, rand);
  for (let i = 0; i < len; i++) { const t = i / sr; rum[i] *= (1 - Math.exp(-t / 0.004)) * (Math.exp(-t / 0.12) * 0.7 + Math.exp(-t / (big ? 0.9 : 0.7)) * 0.5); }
  biquad(rum, 'lp', far ? 300 : 1400, 0.6, sr); biquad(rum, 'lp', far ? 450 : 2400, 0.6, sr);
  mixInto(x, rum, 0, 1.6);
  let phs = 0;
  for (let i = 0; i < Math.min(len, sr * 1.2); i++) { const t = i / sr; phs += 2 * Math.PI * (60 * Math.pow(22 / 60, Math.min(1, t / 0.7))) / sr; x[i] += Math.sin(phs) * Math.exp(-t / 0.35) * (big ? 1.5 : 1.2); }
  if (!far) {
    // estilhaços, pedras e terra caindo
    const nDeb = big ? 90 : 45;
    for (let k = 0; k < nDeb; k++) {
      const at = Math.floor(sr * (0.05 + Math.pow(rand(), 1.6) * (big ? 1.6 : 1.1)));
      const c = click(sr, 600 + rand() * (big ? 1600 : 3200), (0.15 + rand() * 0.35) * (1 - at / len), rand);
      mixInto(x, c, at, big ? 0.9 : 0.6);
    }
  }
  if (far) biquad(x, 'lp', 900, 0.6, sr);
  return finish(x, 2.4, 0.95);
}

// resposta ao impulso do ambiente (estéreo)
function makeIR(ctx, kind) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (kind === 'indoor' ? 0.9 : 2.6));
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const rand = makeRand(kind === 'indoor' ? 11 + ch : 77 + ch);
    const d = ir.getChannelData(ch);
    if (kind === 'indoor') {
      // sala: reflexões iniciais fortes e cauda densa e curta
      for (let i = 0; i < len; i++) { const t = i / sr; d[i] = (rand() * 2 - 1) * Math.exp(-t / 0.16) * (i < 200 ? i / 200 : 1); }
      for (let k = 0; k < 8; k++) { const at = Math.floor(sr * (0.004 + rand() * 0.03)); d[at] += (rand() < 0.5 ? -1 : 1) * (0.9 - k * 0.08); }
      biquad(d, 'lp', 5000, 0.7, sr);
    } else {
      // céu aberto: pouca cauda difusa e ecos que voltam das fachadas
      for (let i = 0; i < len; i++) { const t = i / sr; d[i] = (rand() * 2 - 1) * Math.exp(-t / 0.5) * 0.18 * (i < 2000 ? i / 2000 : 1); }
      for (let k = 0; k < 7; k++) {
        const at = Math.floor(sr * (0.09 + k * 0.11 + rand() * 0.12));
        const n = Math.floor(sr * 0.03);
        const amp = 0.75 * Math.pow(0.7, k);
        for (let i = 0; i < n && at + i < len; i++) d[at + i] += (rand() * 2 - 1) * amp * Math.exp(-i / (sr * 0.008));
      }
      biquad(d, 'lp', 2200, 0.7, sr);
    }
  }
  return ir;
}

// deixa o pico do som em "level" (gravações caseiras vêm em volumes bem diferentes)
function normalize(buf, level) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  if (peak < 1e-4) return;
  const g = level / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
}

export class GameAudio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.occlusion = null; // função (pos) => bool
    this.skyAt = null;     // função (x, y, z) => 0 (fechado) .. 1 (céu aberto)
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.listenerSky = 1;
    this.voices = 0;
    this.shotCache = new Map();
    this.samples = {};
    this.pack = 'padrao';
    this.packLoad = 0; // contador para descartar carregamentos antigos
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.25;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle); this.muffle.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.uiGain = ctx.createGain(); this.uiGain.connect(this.master);
    // dois ambientes de eco: sala fechada e céu aberto
    this.revIn = ctx.createConvolver(); this.revIn.buffer = makeIR(ctx, 'indoor');
    this.revOutd = ctx.createConvolver(); this.revOutd.buffer = makeIR(ctx, 'outdoor');
    this.revSendIn = ctx.createGain(); this.revSendOut = ctx.createGain();
    this.revSendIn.connect(this.revIn); this.revSendOut.connect(this.revOutd);
    const wetIn = ctx.createGain(); wetIn.gain.value = 0.42;
    const wetOut = ctx.createGain(); wetOut.gain.value = 0.55;
    this.revIn.connect(wetIn); wetIn.connect(this.master);
    this.revOutd.connect(wetOut); wetOut.connect(this.master);
    // ruído branco
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.applyVolumes();
    this.loadSamples(this.pack);
    this.prerender();
  }

  // troca o pacote de som (chamado quando o dono da sala muda a opção).
  // force = recarrega mesmo sem mudar (ex.: alguém gravou sons novos)
  setPack(pack, force = false) {
    pack = pack || 'padrao';
    if (pack === this.pack && !force) { this.refresh(); return; }
    this.pack = pack;
    if (this.ctx) this.loadSamples(pack);
  }

  // recarrega o pacote só se a lista de arquivos mudou (ex.: alguém gravou
  // um som novo na página de gravação)
  async refresh() {
    if (!this.ctx || this.refreshing) return;
    this.refreshing = true;
    try {
      const res = await fetch('/sounds/index.json?pack=' + encodeURIComponent(this.pack), { cache: 'no-cache' });
      if (res.ok && (await res.text()) !== this.lastIndex) this.loadSamples(this.pack);
    } catch { /* servidor fora: fica como está */ }
    this.refreshing = false;
  }

  // sons do pacote (lista vem do servidor). Os arquivos são normalizados ao
  // carregar, então gravações altas ou baixas tocam no mesmo volume.
  async loadSamples(pack) {
    const my = ++this.packLoad;
    const next = {};
    try {
      const res = await fetch('/sounds/index.json?pack=' + encodeURIComponent(pack), { cache: 'no-cache' });
      if (res.ok) {
        const text = await res.text();
        this.lastIndex = text;
        const files = JSON.parse(text);
        await Promise.all(files.map(async (f) => {
          const name = f.split('/').pop();
          const key = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]\d+$/, '').toLowerCase();
          try {
            const url = '/sounds/' + f.split('/').map(encodeURIComponent).join('/');
            const buf = await this.ctx.decodeAudioData(await (await fetch(url, { cache: 'no-cache' })).arrayBuffer());
            normalize(buf, 0.9);
            (next[key] = next[key] || []).push(buf);
          } catch (e) { console.warn('som inválido:', f, e); }
        }));
      }
    } catch { /* sem pasta de sons: usa os gerados */ }
    if (my !== this.packLoad) return; // outro pacote foi pedido enquanto carregava
    this.samples = next;
    const keys = Object.keys(next);
    console.log(`pacote de som "${pack}": ${keys.length ? keys.join(', ') : 'só sons gerados'}`);
  }

  // toca um som do pacote, se existir. Devolve true se tocou (aí o som
  // gerado não toca). rateVar = variação aleatória de velocidade.
  sam(key, dest, t, gain = 1, rateVar = 0.06) {
    const list = this.samples[key];
    if (!list || !dest) return false;
    this.play(list[Math.floor(Math.random() * list.length)], dest, t, gain, 1 - rateVar / 2 + Math.random() * rateVar);
    return true;
  }

  // gera os sons das armas aos poucos, sem travar o jogo
  prerender() {
    import('/shared/weapons.js').then(({ WEAPON_LIST, WEAPONS }) => {
      const ids = WEAPON_LIST.filter((id) => WEAPONS[id].snd);
      const step = () => { const id = ids.shift(); if (!id) return; this.shotSet(WEAPONS[id]); setTimeout(step, 25); };
      setTimeout(step, 300);
    });
  }

  toBuffer(arr) {
    const b = this.ctx.createBuffer(1, arr.length, this.ctx.sampleRate);
    b.getChannelData(0).set(arr);
    return b;
  }

  shotSet(w) {
    let s = this.shotCache.get(w.id);
    if (s) return s;
    const sn = w.snd;
    const base = sn.suppressed ? SUPPRESSED : SHOT_PROFILES[sn.kind] || SHOT_PROFILES.rifle;
    const P = { ...base, supersonic: sn.supersonic ?? base.supersonic };
    if (sn.suppressed) P.mech = (SHOT_PROFILES[sn.kind] || SHOT_PROFILES.smg).mech;
    const sr = this.ctx.sampleRate;
    let seed = 0; for (const ch of w.id) seed = seed * 31 + ch.charCodeAt(0);
    s = { near: [], far: [] };
    for (let v = 0; v < 3; v++) {
      s.near.push(this.toBuffer(renderShot(sr, P, sn.pitch || 1, false, seed + v * 101)));
      s.far.push(this.toBuffer(renderShot(sr, P, sn.pitch || 1, true, seed + v * 101 + 7)));
    }
    this.shotCache.set(w.id, s);
    return s;
  }

  explosionSet(big) {
    const key = big ? '#mine' : '#he';
    let s = this.shotCache.get(key);
    if (s) return s;
    const sr = this.ctx.sampleRate;
    s = { near: [this.toBuffer(renderExplosion(sr, big, false, big ? 5 : 3))], far: [this.toBuffer(renderExplosion(sr, big, true, big ? 6 : 4))] };
    this.shotCache.set(key, s);
    return s;
  }

  applyVolumes() {
    this.musicVolume();
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.masterVolume;
    this.sfx.gain.value = s.sfxVolume;
    this.uiGain.gain.value = s.uiVolume;
  }

  // ---------------------------------------------------- música da sala de espera
  // toca public/music/sala.m4a em loop enquanto o jogador está na sala.
  // O navegador só deixa tocar depois de um clique/tecla: se for bloqueado,
  // tenta de novo no próximo clique ou tecla.
  musicVolume() {
    if (!this.music) return;
    const s = this.settings;
    this.musicTarget = Math.max(0, Math.min(1, (s.masterVolume ?? 0.8) * (s.musicVolume ?? 0.5)));
    if (this.musicOn && !this.musicFade) this.music.volume = this.musicTarget;
  }

  roomMusic(on) {
    if (on === this.musicOn) return;
    this.musicOn = on;
    if (!this.music) {
      if (!on) return;
      const a = new Audio('/music/sala.m4a');
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      a.addEventListener('error', () => { this.musicMissing = true; });
      this.music = a;
      const retry = () => { if (this.musicOn && this.music.paused && !this.musicMissing) this.startMusic(); };
      document.addEventListener('pointerdown', retry);
      document.addEventListener('keydown', retry);
    }
    this.musicVolume();
    if (on) this.startMusic();
    else this.fadeMusic(0, 1.2, () => { if (!this.musicOn) this.music.pause(); });
  }

  startMusic() {
    const a = this.music;
    if (!a || this.musicMissing) return;
    a.volume = 0;
    const p = a.play();
    if (p && p.then) p.then(() => this.fadeMusic(this.musicTarget, 1.5)).catch(() => {});
    else this.fadeMusic(this.musicTarget, 1.5);
  }

  fadeMusic(to, secs, done) {
    const a = this.music;
    if (!a) return;
    clearInterval(this.musicFade);
    const from = a.volume, t0 = performance.now();
    this.musicFade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(this.musicFade); this.musicFade = null; if (done) done(); }
    }, 50);
  }

  setListener(p, f, u) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    this.listenerPos = { x: p.x, y: p.y, z: p.z };
    if (this.skyAt) this.listenerSky += (this.skyAt(p.x, p.y, p.z) - this.listenerSky) * 0.2;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  // envia para o eco do ambiente (dividido entre sala e céu aberto)
  sendRev(node, amount) {
    const sky = Math.max(0, Math.min(1, this.listenerSky));
    const ctx = this.ctx;
    const a = ctx.createGain(); a.gain.value = amount * 1.15 * (1 - sky);
    const b = ctx.createGain(); b.gain.value = amount * 0.9 * sky;
    node.connect(a); a.connect(this.revSendIn);
    node.connect(b); b.connect(this.revSendOut);
  }

  // nó de saída para um som (2D se pos == null)
  out(pos, o = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    const dest = o.ui ? this.uiGain : this.sfx;
    if (!pos) {
      g.connect(dest);
      if (o.rev) this.sendRev(g, o.rev);
      return g;
    }
    const dx = pos[0] - this.listenerPos.x, dy = pos[1] - this.listenerPos.y, dz = pos[2] - this.listenerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > (o.maxDist || 140)) return null;
    const occ = this.occlusion ? this.occlusion(pos) : false;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(500, (occ ? 1400 : 18000) - dist * (occ ? 12 : 70));
    const p = ctx.createPanner();
    p.panningModel = this.settings.hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = o.ref || 3;
    p.maxDistance = 200;
    p.rolloffFactor = o.roll || 1.1;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    g.connect(lp); lp.connect(p); p.connect(dest);
    if (occ) g.gain.value *= 0.55;
    if (o.rev) this.sendRev(p, o.rev * Math.min(1.6, 0.4 + dist / 30) * (occ ? 1.3 : 1));
    return g;
  }

  // toca um buffer num destino, com atraso e variação de velocidade
  play(buf, dest, t, gain = 1, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (gain !== 1) { const g = this.ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(dest); } else src.connect(dest);
    src.start(t);
    return src;
  }

  noise(dest, t0, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const dur = (o.attack || 0.001) + o.decay * 3;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.sweep), t0 + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + (o.attack || 0.001));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.attack || 0.001) + o.decay * 3);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  tone(dest, t0, o) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.attack || 0.002) + o.dur);
    osc.connect(g); g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  ready() { return this.ctx && this.ctx.state === 'running'; }

  distTo(pos) {
    const L = this.listenerPos;
    return Math.hypot(pos[0] - L.x, pos[1] - L.y, pos[2] - L.z);
  }

  // ------------------------------------------------------------- armas
  shot(w, pos, local) {
    if (!this.ready() || !w.snd) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const sn = w.snd;
    const real = this.samples[w.id];
    const set = real ? { near: real, far: this.samples[w.id + '_far'] || real } : this.shotSet(w);
    const rate = real ? 0.97 + Math.random() * 0.06 : 1;
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const vol = (sn.power || 1) * (local ? 0.6 : 1.0) * (real ? 0.9 : 1.1);
    if (local) {
      const dest = this.out(null, { rev: sn.suppressed ? 0.06 : 0.5 });
      this.play(pick(set.near), dest, t, vol, rate);
      return;
    }
    const dest = this.out(pos, { ref: sn.suppressed ? 2 : 5, roll: sn.suppressed ? 1.6 : 0.85, rev: sn.suppressed ? 0.05 : 0.65, maxDist: sn.suppressed ? 45 : 220 });
    if (!dest) return;
    const dist = this.distTo(pos);
    // o som chega depois do clarão: ~3 ms por metro
    const delay = Math.min(0.4, dist / SOUND_OF_SPEED);
    const nearW = Math.max(0, Math.min(1, 1 - (dist - 12) / 45));
    if (nearW > 0.02) this.play(pick(set.near), dest, t + delay, vol * nearW, rate);
    if (nearW < 0.98) this.play(pick(set.far), dest, t + delay, vol * (1 - nearW) * 1.25, rate);
  }

  dryFire() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.6 });
    if (this.sam('dryfire', d, t, 0.6)) return;
    this.noise(d, t, { type: 'highpass', freq: 3000, gain: 0.4, decay: 0.01 });
    this.tone(d, t, { type: 'square', f0: 1400, dur: 0.012, gain: 0.08 });
  }

  click(dest, t, freq, gain = 0.35, decay = 0.02) {
    this.noise(dest, t, { type: 'bandpass', freq, q: 3, gain, decay });
    this.tone(dest, t, { type: 'square', f0: freq * 0.25, dur: decay * 0.6, gain: gain * 0.15 });
  }

  reload(w, dur, pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, { gain: pos ? 0.7 : 0.55, ref: 2, roll: 1.5, maxDist: 30 });
    if (!d) return;
    if (w.shellReload) return;
    if (this.sam('reload', d, t, 0.8, 0.02)) return;
    const type = w.type;
    const marks = type === 'pistol' ? [[0.22, 1800], [0.6, 1300], [0.85, 2600]] : type === 'sniper' ? [[0.28, 1500], [0.6, 1100], [0.83, 900], [0.88, 1400]] : [[0.25, 1400], [0.62, 1000], [0.8, 2200], [0.85, 1700]];
    for (const [f, freq] of marks) this.click(d, t + dur * f, freq * (0.95 + Math.random() * 0.1));
    this.noise(d, t + dur * 0.1, { type: 'bandpass', freq: 500, q: 0.6, gain: 0.08, decay: 0.15, attack: 0.05 });
  }
  shell(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 0.5, ref: 2, maxDist: 25 });
    if (d && !this.sam('shell', d, t, 0.5)) { this.click(d, t, 1600, 0.3); this.click(d, t + 0.12, 1200, 0.2); }
  }
  shellInsert(last) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.5 });
    this.click(d, t, last ? 1700 : 1100, 0.3); this.click(d, t + 0.05, 700, 0.18);
  }
  bolt(delay = 0.2) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay, d = this.out(null, { gain: 0.5 });
    if (this.sam('bolt', d, t, 0.7, 0.02)) return;
    this.click(d, t, 1300, 0.3, 0.02); this.click(d, t + 0.18, 900, 0.3, 0.025); this.click(d, t + 0.36, 1500, 0.3, 0.02);
  }
  deploy(w) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.45 });
    if (this.sam('deploy', d, t, 0.6)) return;
    this.noise(d, t, { type: 'bandpass', freq: 700, q: 0.6, gain: 0.12, decay: 0.08, attack: 0.03 });
    if (w.type !== 'melee' && w.type !== 'grenade') this.click(d, t + 0.18, 1800, 0.25);
    else if (w.type === 'melee') this.noise(d, t + 0.05, { type: 'highpass', freq: 5000, q: 2, gain: 0.15, decay: 0.12 });
  }
  scope() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.5 });
    if (this.sam('scope', d, t, 0.5)) return;
    this.click(d, t, 3500, 0.25, 0.015);
  }

  // ------------------------------------------------------------- movimento
  footstep(pos, local, loud = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const d = this.out(local ? null : pos, { gain: (local ? 0.28 : 0.85) * loud, ref: 2.5, roll: 1.6, maxDist: 32 });
    if (!d) return;
    if (this.sam('footstep', d, t, 0.7, 0.15)) return;
    const p = 0.85 + Math.random() * 0.3;
    this.noise(d, t, { type: 'lowpass', freq: 650 * p, q: 0.8, gain: 0.55, decay: 0.05 });
    this.noise(d, t + 0.012, { type: 'bandpass', freq: 2200 * p, q: 1.2, gain: 0.12, decay: 0.03 });
  }
  land(pos, local, speed) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const d = this.out(local ? null : pos, { gain: Math.min(1, speed / 9) * (local ? 0.4 : 0.9), ref: 2.5, roll: 1.5, maxDist: 30 });
    if (!d) return;
    if (this.sam('land', d, t, 0.9)) return;
    this.noise(d, t, { type: 'lowpass', freq: 380, q: 0.7, gain: 0.8, decay: 0.08 });
    this.noise(d, t, { type: 'bandpass', freq: 1800, q: 1, gain: 0.15, decay: 0.04 });
  }

  // ------------------------------------------------------------- combate
  hitmarker(kill) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.5 });
    if (this.sam('hitmarker', d, t, 0.6)) return;
    this.tone(d, t, { type: 'sine', f0: kill ? 1500 : 1950, dur: 0.045, gain: 0.25 });
    this.tone(d, t + 0.005, { type: 'sine', f0: kill ? 2250 : 2600, dur: 0.035, gain: 0.12 });
  }
  headshot(helmet) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.6 });
    if (this.sam('headshot', d, t, 0.8)) return;
    if (helmet) {
      this.tone(d, t, { type: 'sine', f0: 3150, dur: 0.28, gain: 0.25 });
      this.tone(d, t, { type: 'sine', f0: 4730, dur: 0.18, gain: 0.12 });
      this.noise(d, t, { type: 'highpass', freq: 6000, gain: 0.25, decay: 0.02 });
    } else {
      this.noise(d, t, { type: 'lowpass', freq: 900, gain: 0.6, decay: 0.06 });
      this.tone(d, t, { type: 'sine', f0: 2600, dur: 0.06, gain: 0.15 });
    }
  }
  kill() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.5 });
    if (this.sam('kill', d, t, 0.9)) return;
    this.tone(d, t, { type: 'triangle', f0: 880, dur: 0.14, gain: 0.25 });
    this.tone(d, t + 0.07, { type: 'triangle', f0: 1320, dur: 0.2, gain: 0.22 });
  }
  // abate com tiro na cabeça: "ding" metálico agudo + estalo
  headshotKill() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.55, rev: 0.25 });
    if (this.sam('headshotkill', d, t, 1) || this.sam('kill', d, t, 0.9)) return;
    this.noise(d, t, { type: 'highpass', freq: 5000, gain: 0.35, decay: 0.03 });
    this.tone(d, t, { type: 'sine', f0: 2093, dur: 0.35, gain: 0.22 });
    this.tone(d, t + 0.03, { type: 'sine', f0: 3136, dur: 0.3, gain: 0.14 });
    this.tone(d, t + 0.09, { type: 'triangle', f0: 1568, f1: 1760, dur: 0.22, gain: 0.12 });
  }
  radio() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { ui: true });
    if (this.sam('radio', d, t, 0.5)) return;
    this.noise(d, t, { type: 'bandpass', freq: 2400, q: 1.5, gain: 0.08, decay: 0.06 });
    this.tone(d, t + 0.02, { type: 'square', f0: 1250, dur: 0.06, gain: 0.035 });
    this.tone(d, t + 0.1, { type: 'square', f0: 1650, dur: 0.07, gain: 0.03 });
  }
  heal() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { ui: true });
    if (this.sam('heal', d, t, 0.6)) return;
    this.tone(d, t, { type: 'sine', f0: 520, f1: 780, dur: 0.18, gain: 0.08 });
  }
  levelUp() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { ui: true, rev: 0.2 });
    if (this.sam('levelup', d, t, 0.8)) return;
    [587, 740, 880].forEach((f, i) => this.tone(d, t + i * 0.06, { type: 'square', f0: f, dur: 0.12, gain: 0.05 }));
  }
  hurt(dmg) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.7 });
    if (this.sam('hurt', d, t, Math.min(1, 0.6 + dmg / 100), 0.12)) return;
    this.noise(d, t, { type: 'lowpass', freq: 320, gain: Math.min(1, 0.3 + dmg / 60), decay: 0.09 });
    this.tone(d, t, { type: 'sine', f0: 110, f1: 60, dur: 0.12, gain: 0.35 });
  }
  death() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.6, rev: 0.4 });
    if (this.sam('death', d, t, 1)) return;
    this.tone(d, t, { type: 'sine', f0: 220, f1: 70, dur: 0.6, gain: 0.3 });
    this.noise(d, t, { type: 'lowpass', freq: 400, gain: 0.4, decay: 0.15 });
  }
  knifeSwing(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 0.5, ref: 2, roll: 1.5, maxDist: 25 });
    if (d && !this.sam('knife', d, t, 0.7)) this.noise(d, t, { type: 'bandpass', freq: 600, sweep: 2600, q: 1.5, gain: 0.35, decay: 0.06, attack: 0.04 });
  }
  knifeHit(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 0.8, ref: 2, maxDist: 25 });
    if (d && !this.sam('knifehit', d, t, 0.9)) { this.noise(d, t, { type: 'lowpass', freq: 700, gain: 0.7, decay: 0.07 }); this.noise(d, t, { type: 'highpass', freq: 4000, gain: 0.2, decay: 0.03 }); }
  }

  // ------------------------------------------------------------- granadas
  pin() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 0.5 });
    if (this.sam('pin', d, t, 0.6)) return;
    this.click(d, t, 2400, 0.25); this.tone(d, t + 0.03, { type: 'sine', f0: 3800, dur: 0.12, gain: 0.05 });
  }
  throwSound(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 0.45, ref: 2, maxDist: 25 });
    if (d && !this.sam('throw', d, t, 0.6)) this.noise(d, t, { type: 'bandpass', freq: 400, sweep: 1500, q: 1, gain: 0.3, decay: 0.06, attack: 0.04 });
  }
  bounce(pos, kind) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 0.6, ref: 2.5, roll: 1.3, maxDist: 40 });
    if (!d) return;
    if (this.sam('bounce', d, t, 0.6, 0.15)) return;
    const f = kind === 'he' ? 1500 : 1900;
    this.tone(d, t, { type: 'triangle', f0: f, dur: 0.06, gain: 0.25 });
    this.noise(d, t, { type: 'bandpass', freq: 2600, q: 2, gain: 0.25, decay: 0.02 });
  }
  // big = mina terrestre (mais grave e com mais terra voando)
  explosion(pos, dist, big = false) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const d = this.out(pos, { gain: big ? 1.9 : 1.6, ref: 9, roll: 0.75, rev: 1.2, maxDist: 260 });
    if (!d) return;
    const real = this.samples[big ? 'mine' : 'explosion'] || (big && this.samples.explosion);
    const delay = Math.min(0.5, dist / SOUND_OF_SPEED);
    if (real) this.play(real[Math.floor(Math.random() * real.length)], d, t + delay, 1, 0.96 + Math.random() * 0.08);
    else {
      const set = this.explosionSet(big);
      const nearW = Math.max(0, Math.min(1, 1 - (dist - 15) / 60));
      if (nearW > 0.02) this.play(set.near[0], d, t + delay, nearW);
      if (nearW < 0.98) this.play(set.far[0], d, t + delay, (1 - nearW) * 1.3);
    }
    if (dist < (big ? 14 : 12)) this.duck(big ? 0.6 : 0.5, big ? 1.5 : 1.2);
  }
  flashbang(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 1.3, ref: 7, roll: 0.8, rev: 1, maxDist: 160 });
    if (!d) return;
    if (this.sam('flashbang', d, t + Math.min(0.4, this.distTo(pos) / SOUND_OF_SPEED), 1, 0.04)) return;
    this.noise(d, t, { type: 'bandpass', freq: 2100, q: 0.6, gain: 1.1, decay: 0.12 });
    this.noise(d, t, { type: 'highpass', freq: 3000, q: 0.5, gain: 0.7, decay: 0.05 });
    this.tone(d, t, { type: 'sine', f0: 90, f1: 40, dur: 0.3, gain: 0.7 });
  }
  tinnitus(amount, dur) {
    if (!this.ready() || amount < 0.15) return;
    const t = this.ctx.currentTime, d = this.out(null, { gain: 1 });
    this.tone(d, t, { type: 'sine', f0: 3400, dur: dur, gain: 0.07 * amount, attack: 0.05 });
    this.duck(amount, dur);
  }
  duck(amount, dur) {
    const f = this.muffle.frequency, t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(350, 20000 * (1 - amount * 0.97)), t);
    f.exponentialRampToValueAtTime(20000, t + dur);
  }
  smokePop(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 0.8, ref: 4, roll: 1, maxDist: 60 });
    if (!d) return;
    if (this.sam('smoke', d, t, 0.8)) return;
    this.noise(d, t, { type: 'lowpass', freq: 500, gain: 0.5, decay: 0.05 });
    this.noise(d, t + 0.05, { type: 'highpass', freq: 2500, q: 0.4, gain: 0.25, decay: 0.9, attack: 0.15 });
  }

  // ------------------------------------------------------------- mina terrestre
  minePlace(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: pos ? 0.8 : 0.55, ref: 2, roll: 1.5, maxDist: 22 });
    if (!d) return;
    if (this.sam('mineplace', d, t, 0.7)) return;
    this.noise(d, t, { type: 'lowpass', freq: 900, q: 0.6, gain: 0.25, decay: 0.08, attack: 0.03 }); // terra sendo afastada
    this.click(d, t + 0.16, 1500, 0.35, 0.02);
    this.click(d, t + 0.24, 2600, 0.2, 0.015);
  }
  // dois bipes curtos quando arma
  mineArm(pos, armIn) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + Math.max(0, armIn || 0), d = this.out(pos, { gain: 0.6, ref: 1.5, roll: 1.8, maxDist: 16 });
    if (!d) return;
    this.tone(d, t, { type: 'square', f0: 2350, dur: 0.05, gain: 0.05 });
    this.tone(d, t + 0.11, { type: 'square', f0: 2350, dur: 0.05, gain: 0.05 });
  }
  // o "clique" de quem pisou: dá para ouvir, não dá para fugir
  mineClick(pos) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(pos, { gain: 1.1, ref: 3, roll: 1.2, maxDist: 35 });
    if (!d) return;
    if (this.sam('mineclick', d, t, 1)) return;
    this.click(d, t, 1300, 0.6, 0.025);
    this.tone(d, t, { type: 'triangle', f0: 880, f1: 620, dur: 0.06, gain: 0.25 });
    this.click(d, t + 0.05, 2200, 0.3, 0.015);
  }

  // ------------------------------------------------------------- interface
  ui(kind) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { ui: true });
    if (['start', 'end', 'spawn', 'chat'].includes(kind) && this.sam('ui_' + kind, d, t, 0.8, 0)) return;
    if (kind === 'hover') this.tone(d, t, { type: 'sine', f0: 1500, dur: 0.025, gain: 0.04 });
    else if (kind === 'chat') { this.tone(d, t, { type: 'sine', f0: 1200, dur: 0.05, gain: 0.08 }); this.tone(d, t + 0.05, { type: 'sine', f0: 1600, dur: 0.06, gain: 0.07 }); }
    else if (kind === 'start') { [523, 659, 784].forEach((f, i) => this.tone(d, t + i * 0.12, { type: 'triangle', f0: f, dur: 0.22, gain: 0.15 })); }
    else if (kind === 'end') { [784, 659, 523, 392].forEach((f, i) => this.tone(d, t + i * 0.16, { type: 'triangle', f0: f, dur: 0.3, gain: 0.15 })); }
    else if (kind === 'spawn') this.tone(d, t, { type: 'sine', f0: 600, f1: 900, dur: 0.15, gain: 0.08 });
    else this.tone(d, t, { type: 'sine', f0: 900, dur: 0.04, gain: 0.1 });
  }
  // Capture a Bandeira: good = boa notícia para a minha equipe
  flag(kind, good) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { ui: true, rev: 0.3 });
    const seq = {
      take: good ? [523, 659, 784] : [392, 370, 349],
      cap: good ? [523, 659, 784, 1047, 1319] : [494, 440, 392, 330],
      drop: [784, 587, 440],
      return: [659, 880],
    }[kind] || [880];
    seq.forEach((f, i) => this.tone(d, t + i * (kind === 'cap' ? 0.11 : 0.09), { type: kind === 'cap' ? 'square' : 'triangle', f0: f, dur: 0.22, gain: kind === 'cap' ? 0.07 : 0.12 }));
  }
  announce(level) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime, d = this.out(null, { ui: true, rev: 0.3 });
    if (this.sam('streak', d, t, 0.9, 0)) return;
    const base = [660, 784, 880, 988, 1175];
    for (let i = 0; i <= Math.min(4, level); i++) this.tone(d, t + i * 0.07, { type: 'triangle', f0: base[i], dur: 0.25, gain: 0.12 });
  }
}
