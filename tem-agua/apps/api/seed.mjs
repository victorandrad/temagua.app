// Dados de demonstração para o painel de métricas (origem = 'demo', nunca se misturam aos reais).
//
//   npm run db:seed              → (re)gera 30 dias de histórico de demonstração
//   npm run db:seed -- --dias=60 → outro período
//   npm run db:seed -- --limpar  → só apaga a demonstração

import { connect, pool } from './db.mjs';

const args = process.argv.slice(2);
const limpar = args.includes('--limpar');
const dias = Number(args.find((a) => a.startsWith('--dias='))?.split('=')[1] ?? 30);

// Bairros com mais queixas na pesquisa (peso maior) e alguns de controle. Centroides do OSM.
const BAIRROS = [
  { nome: 'Jardim Nair Maria', lng: -47.26401, lat: -23.18203, peso: 1.0, grupo: 'A' },
  { nome: 'Residencial Santa Madre Paulina', lng: -47.32032, lat: -23.2065, peso: 0.9, grupo: 'B' },
  { nome: 'Jardim Monte Paschoal', lng: -47.26315, lat: -23.22392, peso: 0.7, grupo: 'B' },
  { nome: 'Vila Nova', lng: -47.28648, lat: -23.19464, peso: 0.55, grupo: 'A' },
  { nome: 'Jardim das Nações I', lng: -47.27144, lat: -23.19283, peso: 0.5, grupo: 'A' },
  { nome: 'Jardim Santa Marta', lng: -47.26641, lat: -23.2089, peso: 0.45, grupo: 'B' },
  { nome: 'Jardim CECAP III', lng: -47.27048, lat: -23.20742, peso: 0.4, grupo: 'B' },
  { nome: 'Jardim Planalto', lng: -47.27695, lat: -23.19001, peso: 0.35, grupo: 'A' },
  { nome: 'Residencial Primavera', lng: -47.27025, lat: -23.163, peso: 0.3, grupo: 'A' },
  { nome: 'Jardim Guarujá', lng: -47.26335, lat: -23.20247, peso: 0.25, grupo: 'B' },
  { nome: 'Bairro da Estação', lng: -47.28915, lat: -23.2117, peso: 0.15, grupo: 'A' },
  { nome: 'Centro', lng: -47.2869, lat: -23.2003, peso: 0.1, grupo: 'B' },
];

// PRNG determinístico: a mesma demonstração a cada execução.
let seed = 20261021;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a, b) => a + rand() * (b - a);
const coarsen = (v) => Math.round(v * 1e4) / 1e4;

/** Hora de início de uma falta: picos de manhã (consumo) e no fim da tarde/noite. */
function horaInicio() {
  const r = rand();
  if (r < 0.4) return between(6, 10);
  if (r < 0.85) return between(17, 22);
  return between(0, 24);
}

function gerar() {
  const agora = Date.now();
  const linhas = [];
  for (let d = dias - 1; d >= 0; d--) {
    const meiaNoite = new Date();
    meiaNoite.setHours(0, 0, 0, 0);
    const base = meiaNoite.getTime() - d * 86_400_000;
    // Onda de calor nas últimas duas semanas: mais faltas.
    const calor = d < 14 ? 1.6 : 1;
    // Rodízio: grupo A fica sem água nos dias pares, grupo B nos ímpares.
    const grupoDoDia = Math.floor(base / 86_400_000) % 2 === 0 ? 'A' : 'B';

    for (const b of BAIRROS) {
      const chance = Math.min(0.95, b.peso * calor * (b.grupo === grupoDoDia ? 0.9 : 0.25));
      if (rand() > chance) continue;

      const inicio = base + horaInicio() * 3_600_000;
      const relatosFalta = Math.max(1, Math.round(b.peso * calor * between(4, 14)));
      for (let i = 0; i < relatosFalta; i++) {
        const t = inicio + between(0, 3) * 3_600_000;
        if (t > agora) continue;
        linhas.push(relato(b, 'sem-agua', t));
      }
      // A água volta de 4 a 20 horas depois; menos gente avisa que voltou.
      const volta = inicio + between(4, 20) * 3_600_000;
      const relatosVolta = Math.max(1, Math.round(relatosFalta * between(0.25, 0.5)));
      for (let i = 0; i < relatosVolta; i++) {
        const t = volta + between(0, 1.5) * 3_600_000;
        if (t > agora) continue;
        linhas.push(relato(b, 'voltou', t));
      }
    }
  }
  return linhas;
}

function relato(b, status, t) {
  return {
    id: `demo-${Math.floor(rand() * 1e12).toString(36)}-${Math.floor(t / 1000).toString(36)}`,
    lng: coarsen(b.lng + between(-0.004, 0.004)),
    lat: coarsen(b.lat + between(-0.004, 0.004)),
    bairro: b.nome,
    status,
    criadoEm: new Date(t).toISOString(),
  };
}

await connect({ attempts: 10 });
const apagados = await pool.query(`DELETE FROM relatos WHERE origem = 'demo'`);
console.log(`${apagados.rowCount} relato(s) de demonstração apagado(s).`);

if (!limpar) {
  const linhas = gerar();
  for (let i = 0; i < linhas.length; i += 1000) {
    const lote = linhas.slice(i, i + 1000);
    await pool.query(
      `INSERT INTO relatos (id, lng, lat, bairro, status, criado_em, origem)
       SELECT *, 'demo' FROM unnest($1::text[], $2::float8[], $3::float8[], $4::text[], $5::text[], $6::timestamptz[])
       ON CONFLICT (id) DO NOTHING`,
      [
        lote.map((r) => r.id),
        lote.map((r) => r.lng),
        lote.map((r) => r.lat),
        lote.map((r) => r.bairro),
        lote.map((r) => r.status),
        lote.map((r) => r.criadoEm),
      ],
    );
  }
  console.log(`${linhas.length} relato(s) de demonstração criados (${dias} dias, origem = 'demo').`);
}
await pool.end();
