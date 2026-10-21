// Importa o mapa "Regiões x Reservatórios" (Google My Maps) para
// packages/contracts/src/abastecimento.json: setores de abastecimento (centros de reservação),
// as áreas (polígonos) que cada um atende e as estruturas (reservatórios, boosters).
//
//   node scripts/importar-abastecimento.mjs            # baixa o KML do My Maps
//   node scripts/importar-abastecimento.mjs mapa.kml   # usa um KML local
//
// O JSON gerado vai para o git: o app não depende do Google em tempo de execução.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MID = '1AOlAX-928WBFPFp75o7oMY4K_aIG6bk';
const URL_MAPA = `https://www.google.com/maps/d/viewer?mid=${MID}`;
const URL_KML = `https://www.google.com/maps/d/kml?mid=${MID}&forcekml=1`;
const SAIDA = fileURLToPath(new URL('../packages/contracts/src/abastecimento.json', import.meta.url));
// Lista leve (sem polígonos) para menus e legendas: o shell usa sem carregar os 50 KB das áreas.
const SAIDA_RESUMO = fileURLToPath(new URL('../packages/contracts/src/abastecimento-setores.json', import.meta.url));

/** Rótulo do KML ("CR SANTA CRUZ") → nome de exibição. Rótulo novo sem entrada aqui vira Title Case. */
const NOMES = {
  'CR SANTA CRUZ': 'Santa Cruz',
  'CR IMPERIAL': 'Imperial',
  'CR SANTA MARTA': 'Santa Marta',
  'CR SIEMENS CIDADE': 'Jardim Cidade (Siemens)',
  'BOOSTER ESTAÇÃO': 'Booster Estação',
  'CR JURUMIRIM': 'Jurumirim',
  'CR PAINERAS': 'Haras Paineiras',
  'CR MOUTONNEE': 'Moutonnée',
  'CR HOSPITAL': 'Hospital',
  'CR ICARAÍ': 'Icaraí',
  'CR MONTE SERRAT': 'Monte Serrat',
  'CR VILA MARTINS': 'Vila Martins',
  'CR BURU E SANTA IZABEL': 'Buru e Santa Izabel',
  'CR TAQUARAL': 'Taquaral',
  'CR PORTAL DOS BANDEIRANTES': 'Portal dos Bandeirantes',
  'CR CRISTO E JOÃO JABOUR': 'Cristo e João Jabour',
  'CR MORADAS SÃO LUIS': 'Moradas São Luís',
  'PRESSURIZADO NOVA ERA': 'Pressurizado Nova Era',
  'CR NOVA ERA': 'Nova Era',
  'CR NACOES': 'Jardim das Nações',
  'CR PANORAMA': 'Panorama',
  'CR BELA VISTA': 'Bela Vista',
  'CR SAAE': 'SAAE (Centro)',
  'CR AMERICA': 'Jardim América',
  'CR BARNABE': 'Barnabé',
  'CR NOVO SAO PEDRO': 'Novo São Pedro',
};

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const texto = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTIDADES[m])
    .replace(/\s+/g, ' ')
    .trim();
const tag = (bloco, nome) => texto(bloco.match(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`))?.[1]);
const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const r5 = (v) => Math.round(v * 1e5) / 1e5; // ~1 m

function tipoEstrutura(nome) {
  if (/elevado/i.test(nome)) return 'elevado';
  if (/apoiado/i.test(nome)) return 'apoiado';
  if (/booster/i.test(nome)) return 'booster';
  if (/pressurizado/i.test(nome)) return 'pressurizado';
  return 'reservatorio';
}

function nomeArea(nome) {
  const limpo = nome.replace(/^Bairros?\s+/i, '').replace(/\s*;\s*/g, '; ').replace(/[.;]\s*$/, '');
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

function coordenadas(bloco) {
  return tag(bloco, 'coordinates')
    .split(' ')
    .filter(Boolean)
    .map((c) => {
      const [lng, lat] = c.split(',').map(Number);
      return [r5(lng), r5(lat)];
    });
}

// ---- Cor de cada setor ----
// 26 cores únicas seriam impossíveis de distinguir; a regra é: setores vizinhos nunca têm a mesma
// cor nem cores que se confundem (com ou sem daltonismo). A identidade vem do nome no mapa.
// Sem vermelho e verde: no mapa eles já significam "sem água" e "água voltou".
// Paleta e pares que se confundem conferidos com o validador de paletas (ΔE OKLab, simulação de
// protan/deutan/tritan); ao trocar uma cor, confira de novo.
const PALETA = ['#276EF1', '#E8833A', '#7B5CD6', '#0096B7', '#D6409F', '#C9A100', '#A0561A', '#3FA9F5'];
const CONFUNDEM = [
  ['#276EF1', '#7B5CD6'],
  ['#E8833A', '#C9A100'],
  ['#0096B7', '#D6409F'],
  ['#0096B7', '#3FA9F5'],
];
const combinam = (a, b) => a !== b && !CONFUNDEM.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
// "Vizinhos" com folga: setores a poucas quadras também aparecem lado a lado no mapa.
const VIZINHOS_M = 400;

/** Distância aproximada (m) entre dois contornos, pelos segmentos. */
function distanciaContornos(A, B) {
  const m = ([lng, lat]) => [lng * 102_300, lat * 111_320]; // metros por grau na latitude de Salto
  const ponto = (p, a, b) => {
    const [px, py] = m(p);
    const [ax, ay] = m(a);
    const [bx, by] = m(b);
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  let min = Infinity;
  for (const [X, Y] of [[A, B], [B, A]]) {
    for (const p of X) for (let i = 0; i < Y.length - 1; i++) min = Math.min(min, ponto(p, Y[i], Y[i + 1]));
  }
  return min;
}

/** Coloração gulosa (DSATUR): o setor com mais vizinhos já coloridos escolhe primeiro. */
function colorir(lista) {
  const vizinhos = lista.map(() => new Set());
  lista.forEach((s, i) =>
    lista.slice(i + 1).forEach((t, k) => {
      const j = i + 1 + k;
      if (s.areas.some((a) => t.areas.some((b) => distanciaContornos(a.anel, b.anel) < VIZINHOS_M))) {
        vizinhos[i].add(j);
        vizinhos[j].add(i);
      }
    }),
  );
  const cor = lista.map(() => null);
  for (let n = 0; n < lista.length; n++) {
    const saturacao = (i) => new Set([...vizinhos[i]].map((j) => cor[j]).filter(Boolean)).size;
    const i = lista
      .map((_, i) => i)
      .filter((i) => !cor[i])
      .sort((a, b) => saturacao(b) - saturacao(a) || vizinhos[b].size - vizinhos[a].size)[0];
    const uso = (c) => cor.filter((x) => x === c).length;
    const livre = PALETA.filter((c) => [...vizinhos[i]].every((j) => !cor[j] || combinam(c, cor[j]))).sort((a, b) => uso(a) - uso(b));
    if (!livre.length) throw new Error(`Sem cor livre para o setor ${lista[i].nome}: aumente a PALETA.`);
    cor[i] = livre[0];
  }
  lista.forEach((s, i) => (s.cor = cor[i]));
}

const arquivo = process.argv[2];
const kml = arquivo
  ? await readFile(arquivo, 'utf8')
  : await fetch(URL_KML).then((r) => {
      if (!r.ok) throw new Error(`KML: HTTP ${r.status}`);
      return r.text();
    });

/** @type {Map<string, { id: string, nome: string, rotulo: string, estruturas: object[], areas: object[] }>} */
const setores = new Map();
const setor = (rotulo) => {
  if (!setores.has(rotulo)) {
    const nome = NOMES[rotulo] ?? titulo(rotulo.replace(/^CR\s+/, ''));
    if (!NOMES[rotulo]) console.warn(`[aviso] setor sem nome definido em NOMES: "${rotulo}" → "${nome}"`);
    setores.set(rotulo, { id: slug(nome), nome, rotulo, estruturas: [], areas: [] });
  }
  return setores.get(rotulo);
};

for (const [, bloco] of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
  const nome = tag(bloco, 'name');
  const rotulo = tag(bloco, 'description').toUpperCase();
  if (!rotulo) continue;
  const s = setor(rotulo);
  if (bloco.includes('<Polygon>')) {
    const externo = bloco.match(/<outerBoundaryIs>([\s\S]*?)<\/outerBoundaryIs>/)?.[1] ?? bloco;
    s.areas.push({ nome: nomeArea(nome), anel: coordenadas(externo) });
  } else if (bloco.includes('<Point>')) {
    const [[lng, lat]] = coordenadas(bloco);
    // No mapa original um ponto de reservatório ficou com o nome do bairro.
    const nomeEstrutura = /^Bairro\s/i.test(nome) ? `Reservatório ${nome.replace(/^Bairro\s+/i, '')}` : nome;
    s.estruturas.push({ nome: nomeEstrutura, tipo: tipoEstrutura(nomeEstrutura), lng, lat });
  }
}

const lista = [...setores.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
colorir(lista);
const dados = {
  fonte: { titulo: 'Regiões x Reservatórios', url: URL_MAPA, importadoEm: new Date().toISOString().slice(0, 10) },
  setores: lista,
};
await writeFile(SAIDA, `${JSON.stringify(dados)}\n`);
const resumo = lista.map((s) => ({
  id: s.id,
  nome: s.nome,
  cor: s.cor,
  areas: s.areas.length,
  reservatorios: s.estruturas.filter((e) => e.tipo !== 'booster').length,
}));
await writeFile(SAIDA_RESUMO, `${JSON.stringify(resumo, null, 2)}\n`);
const areas = lista.reduce((n, s) => n + s.areas.length, 0);
const estruturas = lista.reduce((n, s) => n + s.estruturas.length, 0);
console.log(`${lista.length} setores, ${areas} áreas, ${estruturas} estruturas → ${SAIDA}`);
