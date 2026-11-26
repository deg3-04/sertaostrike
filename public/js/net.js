// Conexão WebSocket com o servidor + sincronização de relógio.
const handlers = {};
let ws = null;
let pingTimer = null;
const samples = [];

export const net = {
  connected: false,
  offset: 0,      // serverTime ≈ performance.now()/1000 + offset
  rtt: 0.02,
  jitter: 0,
  bytesIn: 0,
  lastPacket: 0,
  synced: false,
  autoReconnect: true,

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => {
      net.connected = true;
      emit('open');
      sendPing();
      let quick = 0;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        sendPing();
        if (++quick === 6) { clearInterval(pingTimer); pingTimer = setInterval(sendPing, 1500); }
      }, 200);
    };
    ws.onclose = () => {
      const was = net.connected;
      net.connected = false;
      clearInterval(pingTimer);
      emit('close', { was });
      // tenta reconectar enquanto ainda não entrou na partida
      if (net.autoReconnect) setTimeout(() => net.connect(), 2000);
    };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      net.bytesIn += ev.data.length;
      net.lastPacket = performance.now();
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') onPong(m);
      emit(m.t, m);
    };
  },
  on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
  send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
  serverTime() { return performance.now() / 1000 + net.offset; },
};

function emit(type, m) {
  const list = handlers[type];
  if (list) for (const fn of list) { try { fn(m); } catch (e) { console.error(`handler ${type}`, e); } }
}

function sendPing() {
  net.send({ t: 'ping', c: performance.now() / 1000, rtt: net.rtt });
}

function onPong(m) {
  const t = performance.now() / 1000;
  const rtt = t - m.c;
  if (rtt < 0 || rtt > 3) return;
  samples.push({ rtt, off: m.s + rtt / 2 - t });
  if (samples.length > 12) samples.shift();
  const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
  const best = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
  const off = best.reduce((s, x) => s + x.off, 0) / best.length;
  if (!net.synced) { net.offset = off; net.synced = true; }
  else net.offset += (off - net.offset) * 0.3;
  net.jitter = net.jitter * 0.8 + Math.abs(rtt - net.rtt) * 0.2;
  net.rtt = net.rtt * 0.7 + rtt * 0.3;
}
