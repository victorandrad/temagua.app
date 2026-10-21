// Autocompletar de endereços (ruas, lugares, bairros) de Salto, via Photon (OpenStreetMap).
//
// O app não chama o Photon direto: passa por aqui, então o IP dos moradores não sai para terceiros,
// as respostas ficam em cache (bairros e ruas mudam pouco) e o uso do serviço público é contido.
// O Nominatim não serve para isso: a política de uso dele proíbe autocompletar enquanto se digita.

const PHOTON = process.env.PHOTON_URL ?? 'https://photon.komoot.io/api/';
const USER_AGENT = 'TemAgua/0.1 (+https://github.com/victorandrad/temagua.app)';
// Recorte de busca (mesmo SALTO_BOUNDS do app) e viés para o centro da cidade.
const BBOX = '-47.42,-23.27,-47.2,-23.08';
const CENTRO = { lat: -23.2003, lon: -47.2869 };

const CACHE_MAX = 1000;
const CACHE_TTL = 24 * 60 * 60 * 1000;
/** @type {Map<string, { em: number, resultados: object[] }>} */
const cache = new Map();

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Converte um resultado do Photon no formato do app. Retorna null se não for de Salto. */
function converter(f) {
  const p = f.properties ?? {};
  if (p.city !== 'Salto' && p.county !== 'Salto') return null;
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;

  const bairro = p.locality ?? p.district ?? null;
  const cidade = 'Salto - SP';
  const rua = p.street && p.housenumber ? `${p.street}, ${p.housenumber}` : p.street;

  if (p.type === 'street') {
    return { tipo: 'rua', titulo: p.name, subtitulo: [bairro, cidade].filter(Boolean).join(' · '), lng, lat };
  }
  if (['district', 'locality', 'suburb', 'neighbourhood', 'quarter'].includes(p.type) || p.osm_key === 'place') {
    return { tipo: 'bairro', titulo: p.name, subtitulo: cidade, lng, lat };
  }
  if (p.name) {
    return { tipo: 'lugar', titulo: p.name, subtitulo: [rua, bairro, cidade].filter(Boolean).join(' · '), lng, lat };
  }
  if (rua) {
    return { tipo: 'endereco', titulo: rua, subtitulo: [bairro, cidade].filter(Boolean).join(' · '), lng, lat };
  }
  return null;
}

// Ruas com datas aparecem com algarismos no mapa ("Rua 9 de Julho"), mas as pessoas digitam por
// extenso ("nove de julho"). Buscamos também a versão com algarismos.
const UNIDADES = { um: 1, uma: 1, primeiro: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const NUMEROS = {
  ...UNIDADES, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
};

function comAlgarismos(texto) {
  return norm(texto)
    .replace(/\b(vinte|trinta) e (\w+)\b/g, (m, d, u) => (u in UNIDADES ? String(NUMEROS[d] + UNIDADES[u]) : m))
    .replace(/\b\w+\b/g, (w) => (w in NUMEROS ? String(NUMEROS[w]) : w));
}

async function photon(texto) {
  const url = new URL(PHOTON);
  url.search = new URLSearchParams({ q: texto, bbox: BBOX, lat: String(CENTRO.lat), lon: String(CENTRO.lon), limit: '15' }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error('Busca de endereços indisponível no momento.');
  return (await res.json()).features ?? [];
}

/** Sugestões para o texto digitado (mín. 3 caracteres). Lança Error com mensagem amigável. */
export async function geocode(q) {
  const texto = String(q ?? '').trim();
  if (texto.length < 3) return [];
  if (texto.length > 80) throw new Error('Busca muito longa.');

  const chave = norm(texto);
  const emCache = cache.get(chave);
  if (emCache && Date.now() - emCache.em < CACHE_TTL) return emCache.resultados;

  const variante = comAlgarismos(texto);
  const [principal, alternativa] = await Promise.all([photon(texto), variante !== chave ? photon(variante) : []]);

  // Só Salto, sem repetir o mesmo nome no mesmo bairro (ruas longas vêm em vários trechos).
  const vistos = new Set();
  const resultados = [];
  for (const f of [...alternativa, ...principal]) {
    const r = converter(f);
    if (!r) continue;
    const id = norm(`${r.tipo}|${r.titulo}|${r.subtitulo}`);
    if (vistos.has(id)) continue;
    vistos.add(id);
    resultados.push({ id, ...r });
    if (resultados.length === 6) break;
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(chave, { em: Date.now(), resultados });
  return resultados;
}
