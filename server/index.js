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

function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (url === '/') url = '/index.html';
  // lista dos sons reais opcionais (public/sounds/)
  if (url === '/sounds/index.json') {
    let list = [];
    try { list = fs.readdirSync(path.join(ROOT, 'public', 'sounds')).filter((f) => /\.(ogg|mp3|wav|m4a|webm|flac)$/i.test(f)); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(list));
    return;
  }
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
