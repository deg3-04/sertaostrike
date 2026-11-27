// Servidor do Sertão Strike: serve o jogo (HTTP) e a partida (WebSocket)
// na mesma porta. Uso: node server/index.js   (ou: npm start)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { GAME_NAME, VERSION, DEFAULT_MATCH } from '../shared/constants.js';
import { SOUND_PACK_IDS, soundPackDir, SOUND_SLOT_IDS, MAX_VARIATIONS, SLOT_DIR, SOUND_DIRS } from '../shared/sounds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

const DEFAULT_CONFIG = {
  port: 3000,
  serverName: 'Sertão Strike - LAN',
  maxPlayers: 16,
  adminPassword: '',
  warmupTime: 30,
  snapshotRate: 32,
  match: { ...DEFAULT_MATCH },
};

function loadConfig() {
  let cfg = { ...DEFAULT_CONFIG };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, '');
      const user = JSON.parse(raw);
      cfg = { ...cfg, ...user, match: { ...DEFAULT_CONFIG.match, ...(user.match || {}) } };
    } else {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
  } catch (e) {
    console.error('Erro lendo config.json (usando padrões):', e.message);
  }
  const envPort = parseInt(process.env.PORT || process.argv[2], 10);
  if (envPort) cfg.port = envPort;
  return cfg;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.webm': 'audio/webm', '.flac': 'audio/flac',
};
const STATIC = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/', path.join(ROOT, 'public')],
];

const AUDIO_RE = /\.(ogg|mp3|wav|m4a|webm|flac)$/i;
const SOUNDS_DIR = path.join(ROOT, 'public', 'sounds');
const ZOEIRA_DIR = path.join(SOUNDS_DIR, soundPackDir('zoeira'));
const MAX_UPLOAD = 3 * 1024 * 1024;

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(obj));
}
// nome do espaço de som a partir do arquivo: "ak47_2.wav" -> "ak47"
function slotOf(file) { return file.replace(AUDIO_RE, '').replace(/[_-]\d+$/, '').toLowerCase(); }
// arquivos de áudio da pasta e das subpastas (um nível):
// "glock_1.wav", "01-tiros-pistolas/glock_2.wav"
function listSounds(dir) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isFile() && AUDIO_RE.test(e.name)) out.push(e.name);
    else if (e.isDirectory() && !e.name.startsWith('.')) {
      try {
        for (const f of fs.readdirSync(path.join(dir, e.name), { withFileTypes: true })) if (f.isFile() && AUDIO_RE.test(f.name)) out.push(`${e.name}/${f.name}`);
      } catch {}
    }
  }
  return out;
}
// gravações do modo zoeira: se houver senha de administrador no config.json,
// ela é exigida (cabeçalho x-admin) para gravar ou apagar
function uploadAllowed(req) {
  if (config.soundUploads === false) return false;
  return !config.adminPassword || req.headers['x-admin'] === config.adminPassword;
}

function handleZoeira(req, res, name) {
  if (!uploadAllowed(req)) { sendJson(res, 403, { erro: config.soundUploads === false ? 'Gravação desativada no config.json' : 'Senha de administrador incorreta' }); return; }
  if (req.method === 'DELETE') {
    // "glock_1.wav" ou "01-tiros-pistolas/glock_1.wav" (só subpastas conhecidas)
    const m = /^(?:([a-z0-9-]+)\/)?([a-z0-9_]+\.(?:ogg|mp3|wav|m4a|webm|flac))$/i.exec(name);
    if (!m || (m[1] && !SOUND_DIRS.includes(m[1])) || !SOUND_SLOT_IDS.includes(slotOf(m[2]))) { sendJson(res, 400, { erro: 'Arquivo inválido' }); return; }
    fs.rm(m[1] ? path.join(ZOEIRA_DIR, m[1], m[2]) : path.join(ZOEIRA_DIR, m[2]), { force: true }, () => sendJson(res, 200, { ok: true }));
    return;
  }
  if (req.method !== 'POST' || !SOUND_SLOT_IDS.includes(name)) { sendJson(res, 400, { erro: 'Som inválido' }); return; }
  const parts = [];
  let size = 0, aborted = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) { aborted = true; sendJson(res, 413, { erro: 'Arquivo grande demais (máx. 3 MB)' }); req.destroy(); return; }
    parts.push(c);
  });
  req.on('end', () => {
    if (aborted) return;
    const buf = Buffer.concat(parts);
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') { sendJson(res, 400, { erro: 'Envie um WAV' }); return; }
    // salva na subpasta do grupo (ex.: 01-tiros-pistolas/glock_2.wav); a
    // numeração também conta arquivos soltos na raiz da pasta zoeira
    const sub = SLOT_DIR[name];
    fs.mkdirSync(path.join(ZOEIRA_DIR, sub), { recursive: true });
    const used = listSounds(ZOEIRA_DIR).map((f) => f.split('/').pop().toLowerCase()).filter((f) => slotOf(f) === name);
    if (used.length >= MAX_VARIATIONS) { sendJson(res, 409, { erro: `Já tem ${MAX_VARIATIONS} variações; apague uma antes` }); return; }
    let n = 1;
    while (used.some((f) => f.startsWith(`${name}_${n}.`))) n++;
    const base = `${name}_${n}.wav`;
    fs.writeFile(path.join(ZOEIRA_DIR, sub, base), buf, (err) => (err ? sendJson(res, 500, { erro: 'Não consegui salvar' }) : sendJson(res, 200, { ok: true, file: `${sub}/${base}` })));
  });
}

function serveStatic(req, res) {
  let url, query;
  try { const u = new URL(req.url, 'http://x'); url = decodeURIComponent(u.pathname); query = u.searchParams; } catch { res.writeHead(400); res.end(); return; }
  if (url === '/') url = '/index.html';
  // lista dos sons de um pacote (public/sounds/ ou public/sounds/<pacote>/)
  if (url === '/sounds/index.json') {
    const pack = SOUND_PACK_IDS.includes(query.get('pack')) ? query.get('pack') : 'padrao';
    const dir = soundPackDir(pack);
    sendJson(res, 200, listSounds(path.join(SOUNDS_DIR, dir)).map((f) => (dir ? `${dir}/${f}` : f)));
    return;
  }
  if (url.startsWith('/sounds/zoeira/') && (req.method === 'POST' || req.method === 'DELETE')) {
    handleZoeira(req, res, url.slice('/sounds/zoeira/'.length));
    return;
  }
  if (url === '/sounds/zoeira/can-upload') { sendJson(res, 200, { ok: config.soundUploads !== false, senha: !!config.adminPassword }); return; }
  for (const [prefix, dir] of STATIC) {
    if (!url.startsWith(prefix)) continue;
    const file = path.join(dir, url.slice(prefix.length));
    if (!file.startsWith(dir)) break;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': file.includes(`${path.sep}lib${path.sep}`) ? 'public, max-age=86400' : 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404); res.end();
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

const config = loadConfig();
config.ips = lanAddresses().map((a) => a.address);
const game = new Game(config);
const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024, perMessageDeflate: false });

wss.on('error', () => {}); // erros da porta são tratados no servidor HTTP
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  game.onConnection(ws);
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    try { game.onMessage(ws, msg); } catch (e) { console.error('Erro processando mensagem:', e); }
  });
  ws.on('close', () => game.onClose(ws));
  ws.on('error', () => {});
});

// derruba conexões mortas
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 10000);

let triedPorts = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && triedPorts < 10) {
    console.log(`  A porta ${config.port} está em uso; tentando ${config.port + 1}...`);
    triedPorts++;
    config.port++;
    setTimeout(() => server.listen(config.port, '0.0.0.0'), 100);
    return;
  }
  if (e.code === 'EADDRINUSE') console.error('\n  Nenhuma porta livre encontrada. Mude "port" no config.json.\n');
  else if (e.code === 'EACCES') console.error(`\n  Sem permissão para usar a porta ${config.port}. Mude "port" no config.json.\n`);
  else console.error(e);
  process.exit(1);
});

let started = false;
server.on('listening', () => {
  if (started) return;
  started = true;
  config.ips = lanAddresses().map((a) => a.address);
  game.start();
  const ips = lanAddresses();
  const line = '='.repeat(60);
  console.log(`\n${line}\n  ${GAME_NAME} v${VERSION} — servidor no ar!\n${line}`);
  console.log(`  Neste computador:   http://localhost:${config.port}`);
  if (ips.length) {
    console.log('  Na rede local (passe para os amigos):');
    for (const ip of ips) console.log(`     http://${ip.address}:${config.port}    (${ip.name})`);
  } else {
    console.log('  Nenhuma rede local detectada. Verifique o Wi-Fi/cabo.');
  }
  console.log('\n  Abra o endereço acima no Chrome ou Edge (NÃO abra o index.html direto).');
  console.log(`  Configurações: config.json  |  Para encerrar: feche esta janela\n${line}\n`);
});
server.listen(config.port, '0.0.0.0');

process.on('uncaughtException', (e) => { console.error('Erro inesperado:', e); });
process.on('SIGINT', () => { console.log('\nEncerrando servidor...'); process.exit(0); });
