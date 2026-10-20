// API de relatos em tempo real (Node + ws).
//
//   GET  /api/reports  → relatos das últimas 24 h
//   POST /api/reports  → novo relato { id, lng, lat, bairro, status }
//   WS   /api/ws       → mensagem { type: 'report', report } a cada relato novo
//
// No dev, o shell (Angular) repassa /api para cá via proxy.conf.json, então funciona
// também pelo túnel HTTPS do cloudflared. WebSocket e não Server-Sent Events porque os
// Quick Tunnels da Cloudflare (trycloudflare.com) seguram o stream SSE.

import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// API_PORT e não PORT: ferramentas de dev costumam definir PORT para o app principal.
const PORT = Number(process.env.API_PORT ?? 4300);
const DATA_FILE = process.env.DATA_FILE ?? join(dirname(fileURLToPath(import.meta.url)), 'data', 'reports.json');

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 7 * DAY_MS;
const SALTO_BOUNDS = { west: -47.42, south: -23.27, east: -47.2, north: -23.08 };
const STATUSES = new Set(['sem-agua', 'voltou']);
const MAX_BODY_BYTES = 2048;
const RATE_LIMIT = { windowMs: 60_000, max: 10 };

/** Casas decimais da posição pública (≈ 11 m). Manter igual a PUBLIC_DECIMALS em packages/contracts. */
const PUBLIC_DECIMALS = 4;
/** Arredonda feito aqui também: o servidor nunca guarda a posição exata. */
const coarsen = (v) => Math.round(v * 10 ** PUBLIC_DECIMALS) / 10 ** PUBLIC_DECIMALS;

/** @type {Array<{id: string, lng: number, lat: number, bairro: string, status: string, createdAt: number}>} */
let reports = [];
/** @type {Map<string, number[]>} */
const hits = new Map();

async function load() {
  try {
    reports = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } catch {
    reports = [];
  }
  prune();
}

let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(reports));
    await rename(tmp, DATA_FILE);
  }, 300);
}

function prune() {
  const cutoff = Date.now() - KEEP_MS;
  reports = reports.filter((r) => r.createdAt >= cutoff);
}

function clientIp(req) {
  // Atrás do cloudflared o IP real vem neste cabeçalho.
  return String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
    .split(',')[0]
    .trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT.max;
}

/** Valida e normaliza o relato vindo do cliente. Retorna null se inválido. */
function parseReport(body) {
  if (!body || typeof body !== 'object') return null;
  const { id, lng, lat, bairro, status } = body;
  if (typeof id !== 'string' || !/^[\w-]{8,64}$/.test(id)) return null;
  if (!STATUSES.has(status)) return null;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (lng < SALTO_BOUNDS.west || lng > SALTO_BOUNDS.east || lat < SALTO_BOUNDS.south || lat > SALTO_BOUNDS.north) {
    return null;
  }
  if (typeof bairro !== 'string' || bairro.length > 80) return null;
  return { id, lng: coarsen(lng), lat: coarsen(lat), bairro, status, createdAt: Date.now() };
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const cutoff = Date.now() - DAY_MS;
    return sendJson(res, 200, reports.filter((r) => r.createdAt >= cutoff));
  }

  if (url.pathname === '/api/reports' && req.method === 'POST') {
    if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: 'Muitos relatos em pouco tempo. Tente daqui a pouco.' });
    let report;
    try {
      report = parseReport(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Corpo inválido.' });
    }
    if (!report) return sendJson(res, 422, { error: 'Relato inválido.' });

    // Reenvio do mesmo relato (ex.: retry depois de cair a conexão) não duplica.
    const existing = reports.find((r) => r.id === report.id);
    if (existing) return sendJson(res, 200, existing);

    reports.push(report);
    prune();
    scheduleSave();
    broadcast(report);
    return sendJson(res, 201, report);
  }

  sendJson(res, 404, { error: 'Não encontrado.' });
});

// ---- Tempo real ----

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
  });
});

function broadcast(report) {
  const msg = JSON.stringify({ type: 'report', report });
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
}

// Ping periódico: mantém a conexão aberta no túnel/proxies e derruba clientes que sumiram.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25_000).unref();

await load();
server.listen(PORT, () => console.log(`[api] ouvindo em http://localhost:${PORT} · ${reports.length} relatos carregados`));
