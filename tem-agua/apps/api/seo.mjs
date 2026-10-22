// Indexação no Google: páginas de bairro renderizadas no servidor, índice de bairros, sitemap.xml
// e robots.txt. O app em si é uma SPA (microfrontends por JavaScript); estas páginas dão ao Google
// conteúdo em HTML puro para as buscas que importam ("falta de água <bairro> salto") e levam
// para o mapa ao vivo em /?bairro=<slug>.
//
// Só usam relatos de origem = 'app'.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ABASTECIMENTO, abastecimentoDoPonto } from './abastecimento.mjs';
import { pool } from './db.mjs';

// ---- Bairros: mesma lista do app (packages/contracts/src/bairros.json) ----

const CANDIDATOS = [
  process.env.BAIRROS_FILE,
  fileURLToPath(new URL('./bairros.json', import.meta.url)), // imagem Docker
  fileURLToPath(new URL('../../packages/contracts/src/bairros.json', import.meta.url)), // dev
].filter(Boolean);
const arquivo = CANDIDATOS.find((c) => existsSync(c));
if (!arquivo) throw new Error('bairros.json não encontrado (defina BAIRROS_FILE).');

const slug = (nome) =>
  nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // Depois da troca acima só sobra um traço em cada ponta (e /^-|-$/ não tem retrocesso caro).
    .replace(/^-|-$/g, '');

/** @type {Array<{ nome: string, lng: number, lat: number, slug: string }>} */
export const BAIRROS = JSON.parse(readFileSync(arquivo, 'utf8')).map((b) => ({ ...b, slug: slug(b.nome) }));
const PORSLUG = new Map(BAIRROS.map((b) => [b.slug, b]));

// ---- Utilitários ----

const TZ = 'America/Sao_Paulo';
const SEIS_HORAS = 6 * 60 * 60 * 1000;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** URL pública: SITE_URL (produção) ou a origem da requisição (dev/túnel), sem barra no fim. */
export function siteUrl(req) {
  if (process.env.SITE_URL) {
    let url = process.env.SITE_URL;
    while (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
  return `${proto}://${req.headers.host}`;
}

function distanciaKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "21/10 às 15:00" */
function quando(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

function ha(d) {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

// Cache curto: o Google (e os curiosos) não precisam de uma consulta ao banco por visita.
const CACHE_MS = 60_000;
/** @type {Map<string, { em: number, valor: unknown }>} */
const cache = new Map();
async function emCache(chave, gerar) {
  const c = cache.get(chave);
  if (c && Date.now() - c.em < CACHE_MS) return c.valor;
  const valor = await gerar();
  cache.set(chave, { em: Date.now(), valor });
  return valor;
}

// ---- Dados ----

async function resumoBairro(nome) {
  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE status = 'sem-agua' AND criado_em > now() - interval '24 hours')::int AS falta24,
       count(*) FILTER (WHERE status = 'voltou'   AND criado_em > now() - interval '24 hours')::int AS volta24,
       count(*) FILTER (WHERE status = 'sem-agua' AND criado_em > now() - interval '7 days')::int  AS falta7,
       count(*) FILTER (WHERE status = 'sem-agua' AND criado_em > now() - interval '30 days')::int AS falta30,
       max(coalesce(confirmado_em, criado_em)) FILTER (WHERE status = 'sem-agua' AND encerrado_em IS NULL) AS "ultimaFalta",
       max(coalesce(confirmado_em, criado_em)) FILTER (WHERE status = 'voltou'   AND encerrado_em IS NULL) AS "ultimaVolta"
     FROM relatos WHERE origem = 'app' AND bairro = $1`,
    [nome],
  );
  return rows[0];
}

async function resumoTodos() {
  const { rows } = await pool.query(
    `SELECT bairro,
       count(*) FILTER (WHERE status = 'sem-agua' AND criado_em > now() - interval '24 hours')::int AS falta24,
       max(coalesce(confirmado_em, criado_em)) FILTER (WHERE status = 'sem-agua' AND encerrado_em IS NULL) AS "ultimaFalta",
       max(coalesce(confirmado_em, criado_em)) FILTER (WHERE status = 'voltou'   AND encerrado_em IS NULL) AS "ultimaVolta",
       max(criado_em) AS ultimo
     FROM relatos WHERE origem = 'app' GROUP BY bairro`,
  );
  return new Map(rows.map((r) => [r.bairro, r]));
}

/**
 * Situação agora, pelos relatos das últimas 6 h (contadas da última confirmação). Relatos encerrados
 * (quem avisou a falta avisou depois que voltou) não contam.
 */
function situacao(r) {
  const agora = Date.now();
  const falta = r?.ultimaFalta?.getTime() ?? 0;
  const volta = r?.ultimaVolta?.getTime() ?? 0;
  if (falta > volta && agora - falta < SEIS_HORAS) {
    return { tipo: 'sem-agua', titulo: 'Provável falta de água agora', texto: `Último relato de falta ${ha(r.ultimaFalta)}.` };
  }
  if (volta >= falta && agora - volta < SEIS_HORAS) {
    return { tipo: 'voltou', titulo: 'Água voltando', texto: `Último aviso de que a água voltou ${ha(r.ultimaVolta)}.` };
  }
  return { tipo: 'sem-dados', titulo: 'Sem relatos de falta nas últimas 6 horas', texto: 'Ninguém avisou falta de água por aqui recentemente.' };
}

// ---- HTML ----

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#f6f6f6;color:#000;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
a{color:inherit}.topo{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#000;color:#fff;text-decoration:none}
.gota{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#fff;color:#000}
main{max-width:760px;margin:0 auto;padding:20px 16px 48px}nav.trilha{font-size:13px;color:#5e5e5e}nav.trilha a{color:#5e5e5e}
h1{margin:10px 0 4px;font-size:28px;line-height:1.2;letter-spacing:-.02em}.sub{margin:0;color:#5e5e5e;font-size:14px}
.card{margin-top:18px;padding:16px;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.status{display:flex;gap:12px;align-items:flex-start}.dot{flex:none;width:14px;height:14px;margin-top:5px;border-radius:50%;background:#afafaf}
.dot.sem-agua{background:#e11900;box-shadow:0 0 0 4px rgba(225,25,0,.18)}.dot.voltou{background:#05a357;box-shadow:0 0 0 4px rgba(5,163,87,.18)}
.status b{display:block;font-size:18px}.status span{color:#5e5e5e;font-size:14px}
.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.num{padding:12px;border-radius:10px;background:#f6f6f6}
.num strong{display:block;font-size:24px;line-height:1.1}.num small{color:#5e5e5e;font-size:12px}
.acoes{display:grid;gap:8px;margin-top:16px}.btn{display:block;padding:14px;border-radius:10px;background:#000;color:#fff;font-weight:600;text-align:center;text-decoration:none}
.btn.sec{background:#eee;color:#000}h2{margin:28px 0 8px;font-size:18px}p{margin:8px 0}
ul.bairros{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;padding:0;list-style:none}
ul.bairros a{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:#fff;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,.06)}
ul.bairros a:hover{background:#f0f0f0}ul.bairros .dot{margin-top:0;width:10px;height:10px}ul.bairros small{margin-left:auto;color:#5e5e5e;font-size:12px}
footer{max-width:760px;margin:0 auto;padding:0 16px 32px;color:#5e5e5e;font-size:12px}
@media(max-width:560px){.nums{grid-template-columns:repeat(2,1fr)}h1{font-size:24px}}`;

function pagina({ base, caminho, titulo, descricao, jsonLd, corpo, indexar = true }) {
  const url = `${base}${caminho}`;
  const verificacao = process.env.GOOGLE_SITE_VERIFICATION
    ? `\n  <meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(descricao)}">
  <meta name="robots" content="${indexar ? 'index,follow' : 'noindex,follow'}">${verificacao}
  <link rel="canonical" href="${esc(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Tem Água?">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${esc(titulo)}">
  <meta property="og:description" content="${esc(descricao)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(base)}/icons/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#000000">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <style>${CSS}</style>
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
  <a class="topo" href="/"><span class="gota" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" fill="currentColor"/></svg></span><b>Tem Água?</b></a>
  <main>${corpo}</main>
  <footer>Dados colaborativos enviados por moradores pelo app Tem Água? — não são dados oficiais da prefeitura nem do SAAE. As posições são arredondadas para cerca de 10 m e nenhum endereço é publicado.</footer>
</body>
</html>`;
}

function trilha(base, itens) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: itens.map(([nome, caminho], i) => ({ '@type': 'ListItem', position: i + 1, name: nome, item: `${base}${caminho}` })),
  };
}

export async function paginaBairro(req, s) {
  const b = PORSLUG.get(s);
  const base = siteUrl(req);
  if (!b) {
    return {
      status: 404,
      html: pagina({
        base,
        caminho: `/bairros/${encodeURIComponent(s)}`,
        titulo: 'Bairro não encontrado · Tem Água?',
        descricao: 'Este bairro não está na lista do Tem Água? em Salto/SP.',
        indexar: false,
        corpo: `<h1>Bairro não encontrado</h1><p>Veja a <a href="/bairros">lista de bairros de Salto</a> ou abra o <a href="/">mapa ao vivo</a>.</p>`,
      }),
    };
  }

  const r = await emCache(`b:${b.nome}`, () => resumoBairro(b.nome));
  const st = situacao(r);
  const vizinhos = BAIRROS.filter((x) => x !== b)
    .map((x) => ({ ...x, d: distanciaKm(b, x) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 8);
  const mapa = `/?bairro=${b.slug}`;
  const abast = abastecimentoDoPonto(b.lng, b.lat);
  const reservatorios = abast?.setor.estruturas.filter((e) => e.tipo !== 'booster').map((e) => e.nome) ?? [];
  const mesmoSetor = abast?.setor.areas.map((a) => a.nome).filter((n) => n !== abast.area.nome) ?? [];
  const atualizado = quando(new Date());

  const titulo = `Falta de água no ${b.nome}, Salto/SP — situação agora | Tem Água?`;
  const descricao =
    r.falta24 > 0
      ? `${r.falta24} ${r.falta24 === 1 ? 'relato' : 'relatos'} de falta de água no ${b.nome} nas últimas 24 horas. Veja no mapa ao vivo e avise seus vizinhos.`
      : `Está faltando água no ${b.nome}, em Salto/SP? Veja os relatos dos vizinhos no mapa ao vivo e avise quando faltar ou voltar.`;

  const corpo = `
    <nav class="trilha" aria-label="Você está em"><a href="/">Início</a> › <a href="/bairros">Bairros</a> › ${esc(b.nome)}</nav>
    <h1>Falta de água no ${esc(b.nome)}</h1>
    <p class="sub">Salto/SP · atualizado em ${esc(atualizado)}</p>

    <section class="card" aria-label="Situação agora">
      <div class="status"><span class="dot ${st.tipo}" aria-hidden="true"></span><div><b>${esc(st.titulo)}</b><span>${esc(st.texto)}</span></div></div>
      <div class="nums">
        <div class="num"><strong>${r.falta24}</strong><small>relatos de falta em 24 h</small></div>
        <div class="num"><strong>${r.volta24}</strong><small>avisos de volta em 24 h</small></div>
        <div class="num"><strong>${r.falta7}</strong><small>faltas em 7 dias</small></div>
        <div class="num"><strong>${r.falta30}</strong><small>faltas em 30 dias</small></div>
      </div>
      <div class="acoes">
        <a class="btn" href="${esc(mapa)}">Ver o ${esc(b.nome)} no mapa ao vivo</a>
        <a class="btn sec" href="${esc(mapa)}">Estou sem água: avisar os vizinhos</a>
      </div>
    </section>

${
      abast
        ? `<h2>Qual reservatório abastece o ${esc(b.nome)}</h2>
    <p>O ${esc(b.nome)} fica na área <b>${esc(abast.area.nome)}</b>, do setor de abastecimento <b>${esc(abast.setor.nome)}</b>${
      reservatorios.length ? ` (${esc(reservatorios.join(', '))})` : ''
    }.${mesmoSetor.length ? ` O mesmo setor abastece: ${esc(mesmoSetor.join(', '))}. Se a falta aparece em várias dessas áreas ao mesmo tempo, o problema provavelmente é no reservatório.` : ''}</p>
    <p class="sub">Fonte dos setores: mapa <a href="${esc(ABASTECIMENTO.fonte.url)}" rel="noopener">${esc(ABASTECIMENTO.fonte.titulo)}</a>.</p>`
        : ''
    }

    <h2>Como funciona</h2>
    <p>O Tem Água? é um mapa colaborativo: quando a água acaba ou volta, os moradores do ${esc(b.nome)} e de outros bairros de Salto marcam no mapa, e todo mundo vê em tempo real. Assim dá para saber se a falta é só na sua casa ou no bairro inteiro — sem cadastro.</p>

    <h2>Bairros próximos</h2>
    <ul class="bairros">${vizinhos
      .map((v) => `<li><a href="/bairros/${v.slug}">${esc(v.nome)}<small>${v.d.toFixed(1).replace('.', ',')} km</small></a></li>`)
      .join('')}</ul>
    <p><a href="/bairros">Ver todos os bairros de Salto</a></p>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: titulo,
        description: descricao,
        url: `${base}/bairros/${b.slug}`,
        inLanguage: 'pt-BR',
        dateModified: new Date().toISOString(),
        about: {
          '@type': 'Place',
          name: `${b.nome}, Salto - SP`,
          geo: { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng },
          containedInPlace: { '@type': 'City', name: 'Salto', address: { '@type': 'PostalAddress', addressRegion: 'SP', addressCountry: 'BR' } },
        },
      },
      trilha(base, [
        ['Início', '/'],
        ['Bairros', '/bairros'],
        [b.nome, `/bairros/${b.slug}`],
      ]),
    ],
  };

  return { status: 200, html: pagina({ base, caminho: `/bairros/${b.slug}`, titulo, descricao, jsonLd, corpo }) };
}

export async function paginaIndice(req) {
  const base = siteUrl(req);
  const dados = await emCache('todos', resumoTodos);
  const comFalta = BAIRROS.filter((b) => situacao(dados.get(b.nome)).tipo === 'sem-agua');
  const linhas = [...BAIRROS]
    .sort((a, b) => (dados.get(b.nome)?.falta24 ?? 0) - (dados.get(a.nome)?.falta24 ?? 0) || a.nome.localeCompare(b.nome, 'pt'))
    .map((b) => {
      const st = situacao(dados.get(b.nome));
      const n = dados.get(b.nome)?.falta24 ?? 0;
      return `<li><a href="/bairros/${b.slug}"><span class="dot ${st.tipo}" aria-hidden="true"></span>${esc(b.nome)}${n ? `<small>${n} em 24 h</small>` : ''}</a></li>`;
    })
    .join('');

  const titulo = 'Falta de água em Salto/SP por bairro — situação agora | Tem Água?';
  const descricao = comFalta.length
    ? `Agora há relatos de falta de água em ${comFalta.length} ${comFalta.length === 1 ? 'bairro' : 'bairros'} de Salto/SP. Veja a situação de cada bairro no mapa colaborativo.`
    : 'Veja a situação da água em cada bairro de Salto/SP, com relatos de moradores em tempo real no mapa colaborativo.';
  const corpo = `
    <nav class="trilha" aria-label="Você está em"><a href="/">Início</a> › Bairros</nav>
    <h1>Falta de água em Salto/SP por bairro</h1>
    <p class="sub">${BAIRROS.length} bairros · atualizado em ${esc(quando(new Date()))}</p>
    <div class="acoes"><a class="btn" href="/">Abrir o mapa ao vivo</a></div>
    <h2>${comFalta.length ? `Com provável falta de água agora (${comFalta.length})` : 'Nenhum bairro com relatos de falta nas últimas 6 horas'}</h2>
    <ul class="bairros">${linhas}</ul>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', name: titulo, description: descricao, url: `${base}/bairros`, inLanguage: 'pt-BR' },
      trilha(base, [
        ['Início', '/'],
        ['Bairros', '/bairros'],
      ]),
    ],
  };
  return pagina({ base, caminho: '/bairros', titulo, descricao, jsonLd, corpo });
}

export async function sitemap(req) {
  const base = siteUrl(req);
  const dados = await emCache('todos', resumoTodos);
  const url = (loc, lastmod) => `  <url><loc>${esc(base + loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`;
  const ultimoGeral = [...dados.values()].reduce((m, r) => (r.ultimo > m ? r.ultimo : m), null);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[url('/', ultimoGeral), url('/bairros', ultimoGeral), url('/metricas', ultimoGeral), ...BAIRROS.map((b) => url(`/bairros/${b.slug}`, dados.get(b.nome)?.ultimo))].join('\n')}
</urlset>
`;
}

export function robots(req) {
  return `# Tem Água? — mapa colaborativo da falta d'água em Salto/SP
User-agent: *
Allow: /
# Relatório em CSV, autocompletar de endereço e o modo TV não são páginas para busca.
Disallow: /api/relatorios/
Disallow: /api/geocode
Disallow: /*?modo=monitor

Sitemap: ${siteUrl(req)}/sitemap.xml
`;
}
