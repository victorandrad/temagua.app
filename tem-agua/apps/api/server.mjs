// API do Tem Água? (Node + PostgreSQL/PostGIS + ws).
//
//   GET  /api/reports              → relatos reais das últimas N horas (horas=1..168, padrão 24)
//   POST /api/reports              → relato { id, lng, lat, bairro, status } + cabeçalho X-Aparelho (opcional)
//                                    → { report, encerrados } (um relato ativo por aparelho, ver registrarRelato)
//   WS   /api/ws                   → { type: 'report', report } a cada relato novo, renovado ou encerrado
//   GET  /api/metricas             → tudo do painel de métricas (filtros: de, ate, bairro, demo)
//   GET  /api/metricas/bairros     → bairros com relatos (para o filtro)
//   GET  /bairros, /bairros/<slug> → páginas HTML para o Google (situação por bairro, só relatos reais)
//   GET  /sitemap.xml, /robots.txt → indexação
//   GET  /api/geocode?q=           → autocompletar de endereços de Salto (proxy com cache para o Photon/OSM)
//   GET  /api/monitor              → relatos das últimas N horas (horas=1..72, demo) para o modo monitoramento
//   GET  /api/relatorios/relatos.csv → relatório em CSV com os mesmos filtros
//
// No dev, o shell (Angular) repassa /api para cá via proxy.conf.json; no Docker, o Nginx.
// WebSocket e não Server-Sent Events porque os Quick Tunnels da Cloudflare seguram o stream SSE.

import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { connect, esquecerAparelhos, pool, recentReports, registrarRelato, segredoDoAparelho } from './db.mjs';
import { carregarAreas } from './abastecimento.mjs';
import { geocode } from './geocode.mjs';
import { paginaBairro, paginaIndice, robots, sitemap } from './seo.mjs';
import { listaBairros, metricas, monitor, parseFiltros, relatoriosCsv } from './metricas.mjs';

// API_PORT e não PORT: ferramentas de dev costumam definir PORT para o app principal.
const PORT = Number(process.env.API_PORT ?? 4300);

const SALTO_BOUNDS = { west: -47.42, south: -23.27, east: -47.2, north: -23.08 };
const STATUSES = new Set(['sem-agua', 'voltou']);
const MAX_BODY_BYTES = 2048;
const RATE_LIMIT = { windowMs: 60_000, max: 10 };

/** Casas decimais da posição pública (≈ 11 m). Manter igual a PUBLIC_DECIMALS em packages/contracts. */
const PUBLIC_DECIMALS = 4;
/** Arredonda feito aqui também: o servidor nunca guarda a posição exata. */
const coarsen = (v) => Math.round(v * 10 ** PUBLIC_DECIMALS) / 10 ** PUBLIC_DECIMALS;

/** @type {Map<string, number[]>} */
const hits = new Map();

function clientIp(req) {
  // Atrás do cloudflared o IP real vem neste cabeçalho.
  return String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
    .split(',')[0]
    .trim();
}

function rateLimited(ip, max = RATE_LIMIT.max) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let segredoAparelho = '';

/** HMAC do UUID do aparelho (cabeçalho X-Aparelho). O UUID em si nunca é guardado. */
function aparelhoDe(req) {
  const id = String(req.headers['x-aparelho'] ?? '').trim();
  if (!UUID_RE.test(id)) return null;
  return createHmac('sha256', segredoAparelho).update(id.toLowerCase()).digest('hex');
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
  return { id, lng: coarsen(lng), lat: coarsen(lat), bairro, status };
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

function sendTexto(res, code, tipo, corpo, cacheSeg = 300) {
  res.writeHead(code, { 'Content-Type': `${tipo}; charset=utf-8`, 'Cache-Control': `public, max-age=${cacheSeg}` });
  res.end(corpo);
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // ---- Indexação (HTML/XML/texto, não JSON) ----
  if (req.method === 'GET' && url.pathname === '/robots.txt') return sendTexto(res, 200, 'text/plain', robots(req), 3600);
  if (req.method === 'GET' && url.pathname === '/sitemap.xml') return sendTexto(res, 200, 'application/xml', await sitemap(req), 600);
  if (req.method === 'GET' && (url.pathname === '/bairros' || url.pathname === '/bairros/')) {
    return sendTexto(res, 200, 'text/html', await paginaIndice(req), 120);
  }
  const bairro = url.pathname.match(/^\/bairros\/([a-z0-9-]+)\/?$/);
  if (req.method === 'GET' && bairro) {
    const { status, html } = await paginaBairro(req, bairro[1]);
    return sendTexto(res, status, 'text/html', html, status === 200 ? 120 : 60);
  }

  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const horas = Number(url.searchParams.get('horas') ?? 24);
    if (!Number.isInteger(horas) || horas < 1 || horas > 168) return sendJson(res, 400, { error: 'horas entre 1 e 168.' });
    return sendJson(res, 200, await recentReports(horas));
  }

  if (url.pathname === '/api/reports' && req.method === 'POST') {
    const aparelho = aparelhoDe(req);
    // Por IP e por aparelho: numa rede de operadora muita gente sai pelo mesmo IP.
    if (rateLimited(clientIp(req), RATE_LIMIT.max * 3) || (aparelho && rateLimited(`ap:${aparelho}`))) {
      return sendJson(res, 429, { error: 'Muitos relatos em pouco tempo. Tente daqui a pouco.' });
    }
    let input;
    try {
      input = parseReport(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Corpo inválido.' });
    }
    if (!input) return sendJson(res, 422, { error: 'Relato inválido.' });

    // Reenvio do mesmo relato (ex.: retry depois de cair a conexão) não duplica.
    const { report, mudou, criado, encerrados } = await registrarRelato(input, aparelho);
    if (mudou) broadcast(report);
    for (const r of encerrados) broadcast(r);
    return sendJson(res, criado ? 201 : 200, { report, encerrados });
  }

  if (url.pathname === '/api/metricas' && req.method === 'GET') {
    let filtros;
    try {
      filtros = parseFiltros(url.searchParams);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    return sendJson(res, 200, await metricas(filtros));
  }

  if (url.pathname === '/api/geocode' && req.method === 'GET') {
    // Limite próprio, mais folgado que o de relatos: cada tecla pode virar uma busca.
    if (rateLimited(`geo:${clientIp(req)}`, 60)) return sendJson(res, 429, { error: 'Muitas buscas. Aguarde um instante.' });
    try {
      return sendJson(res, 200, await geocode(url.searchParams.get('q')));
    } catch (err) {
      return sendJson(res, 502, { error: err.message.startsWith('Busca') ? err.message : 'Busca de endereços indisponível no momento.' });
    }
  }

  if (url.pathname === '/api/monitor' && req.method === 'GET') {
    try {
      return sendJson(res, 200, await monitor(url.searchParams));
    } catch (err) {
      if (err.message.startsWith('Janela')) return sendJson(res, 400, { error: err.message });
      throw err;
    }
  }

  if (url.pathname === '/api/metricas/bairros' && req.method === 'GET') {
    return sendJson(res, 200, await listaBairros());
  }

  if (url.pathname === '/api/relatorios/relatos.csv' && req.method === 'GET') {
    let filtros;
    try {
      filtros = parseFiltros(url.searchParams);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const nome = `tem-agua-relatos_${filtros.de}_a_${filtros.ate}${filtros.bairro ? `_${filtros.bairro.replace(/\W+/g, '-')}` : ''}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    });
    return res.end(await relatoriosCsv(filtros));
  }

  sendJson(res, 404, { error: 'Não encontrado.' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[api] erro', req.method, req.url, err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno. Tente de novo.' });
    else res.end();
  });
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

// ---- Migração única do protótipo anterior (relatos em apps/api/data/reports.json) ----

async function importLegacyJson() {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'data', 'reports.json');
  let list;
  try {
    list = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return;
  }
  let n = 0;
  for (const r of list) {
    const res = await pool.query(
      `INSERT INTO relatos (id, lng, lat, bairro, status, criado_em)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0)) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.lng, r.lat, r.bairro, r.status, r.createdAt],
    );
    n += res.rowCount;
  }
  await rename(file, `${file}.importado`);
  console.log(`[api] ${n} relato(s) importado(s) do arquivo JSON antigo`);
}

// ---- Ciclo de vida ----

async function shutdown(signal) {
  console.log(`[api] ${signal} recebido, encerrando…`);
  for (const ws of wss.clients) ws.close(1001, 'servidor reiniciando');
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

await connect();
await importLegacyJson();
segredoAparelho = await segredoDoAparelho();
await carregarAreas();

// LGPD: o vínculo relato ↔ aparelho só vale 30 dias.
const esquecer = () =>
  esquecerAparelhos()
    .then((n) => n && console.log(`[api] vínculo com o aparelho apagado de ${n} relato(s) antigo(s)`))
    .catch((err) => console.error('[api] falha ao apagar vínculos de aparelho', err));
await esquecer();
setInterval(esquecer, 60 * 60 * 1000).unref();
const { rows } = await pool.query(`SELECT count(*)::int AS n FROM relatos`);
server.listen(PORT, () => console.log(`[api] ouvindo em http://localhost:${PORT} · ${rows[0].n} relatos no banco`));
