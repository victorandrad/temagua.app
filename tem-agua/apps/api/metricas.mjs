// Consultas do painel de métricas e do relatório CSV.
// Filtros (query string): de, ate (AAAA-MM-DD, inclusive, no fuso de Salto), bairro, demo=0|1.

import { pool } from './db.mjs';

const TZ = 'America/Sao_Paulo';
const MAX_DIAS = 366;
const BOM = String.fromCharCode(0xfeff); // Excel só reconhece UTF-8 com BOM
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-DD e uma data que existe (rejeita 2026-13-01, 2026-02-30…). */
function dataValida(s) {
  if (!DATA_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function hojeEmSalto() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function somaDias(data, n) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasEntre(de, ate) {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Lê e valida os filtros. Lança Error com mensagem amigável se inválidos. */
export function parseFiltros(params) {
  const hoje = hojeEmSalto();
  const ate = params.get('ate') || hoje;
  const de = params.get('de') || somaDias(ate, -6);
  if (!dataValida(de) || !dataValida(ate)) throw new Error('Datas no formato AAAA-MM-DD.');
  const dias = diasEntre(de, ate);
  if (dias < 1) throw new Error('A data inicial deve ser anterior à final.');
  if (dias > MAX_DIAS) throw new Error(`Período máximo de ${MAX_DIAS} dias.`);
  const bairro = params.get('bairro')?.trim() || null;
  if (bairro && bairro.length > 80) throw new Error('Bairro inválido.');
  return { de, ate, dias, bairro, demo: params.get('demo') !== '0' };
}

/** WHERE comum a todas as consultas. `dataCols` = false ignora o período (ex.: "última hora"). */
function where(f, { periodo = true, de = f.de, ate = f.ate } = {}) {
  const conds = [];
  const vals = [];
  if (periodo) {
    vals.push(de, ate);
    conds.push(`dia BETWEEN $${vals.length - 1} AND $${vals.length}`);
  }
  if (f.bairro) {
    vals.push(f.bairro);
    conds.push(`bairro = $${vals.length}`);
  }
  if (!f.demo) conds.push(`origem = 'app'`);
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', vals };
}

const CONTAGENS = `
  count(*)::int AS total,
  count(*) FILTER (WHERE status = 'sem-agua')::int AS "semAgua",
  count(*) FILTER (WHERE status = 'voltou')::int AS voltou`;

async function resumo(f) {
  const atual = where(f);
  const anteriorDe = somaDias(f.de, -f.dias);
  const anteriorAte = somaDias(f.de, -1);
  const anterior = where(f, { de: anteriorDe, ate: anteriorAte });
  const agora = where(f, { periodo: false });

  const [a, p, h] = await Promise.all([
    pool.query(
      `SELECT ${CONTAGENS},
         count(DISTINCT bairro) FILTER (WHERE status = 'sem-agua')::int AS "bairrosAfetados",
         -- Aparelhos diferentes que relataram falta (o vínculo some após 30 dias: períodos antigos contam menos).
         count(DISTINCT aparelho) FILTER (WHERE status = 'sem-agua')::int AS aparelhos,
         mode() WITHIN GROUP (ORDER BY hora) FILTER (WHERE status = 'sem-agua') AS "horaPico",
         bool_or(origem = 'demo') AS "temDemo"
       FROM relatos ${atual.sql}`,
      atual.vals,
    ),
    pool.query(`SELECT ${CONTAGENS} FROM relatos ${anterior.sql}`, anterior.vals),
    pool.query(
      `SELECT ${CONTAGENS} FROM relatos ${agora.sql ? `${agora.sql} AND` : 'WHERE'} criado_em > now() - interval '1 hour'`,
      agora.vals,
    ),
  ]);
  return {
    ...a.rows[0],
    temDemo: Boolean(a.rows[0].temDemo),
    anterior: { de: anteriorDe, ate: anteriorAte, ...p.rows[0] },
    ultimaHora: h.rows[0],
  };
}

/** Série temporal com zeros preenchidos: por hora até 2 dias, por dia acima disso. */
async function serie(f) {
  const porHora = f.dias <= 2;
  const w = where(f);
  const passo = porHora ? 'hour' : 'day';
  const n = w.vals.length;
  const { rows } = await pool.query(
    `WITH contagem AS (
       SELECT date_trunc('${passo}', criado_em AT TIME ZONE '${TZ}') AS t, ${CONTAGENS}
         FROM relatos ${w.sql} GROUP BY 1
     ),
     eixo AS (
       SELECT generate_series($${n + 1}::date::timestamp,
                              ($${n + 2}::date + 1)::timestamp - interval '1 ${passo}',
                              interval '1 ${passo}') AS t
     )
     SELECT to_char(eixo.t, '${porHora ? 'YYYY-MM-DD"T"HH24:00' : 'YYYY-MM-DD'}') AS t,
            coalesce(c."semAgua", 0) AS "semAgua", coalesce(c.voltou, 0) AS voltou
       FROM eixo LEFT JOIN contagem c USING (t)
      WHERE eixo.t <= (now() AT TIME ZONE '${TZ}')
      ORDER BY eixo.t`,
    [...w.vals, f.de, f.ate],
  );
  return { granularidade: porHora ? 'hora' : 'dia', pontos: rows };
}

/** Falta d'água por dia da semana (1 = segunda) × hora. */
async function semanaHora(f) {
  const w = where(f);
  const { rows } = await pool.query(
    `SELECT extract(isodow FROM dia)::int AS dow, hora, count(*)::int AS "semAgua"
       FROM relatos ${w.sql} ${w.sql ? 'AND' : 'WHERE'} status = 'sem-agua'
      GROUP BY 1, 2`,
    w.vals,
  );
  return rows;
}

async function bairros(f) {
  const w = where({ ...f, bairro: null });
  const { rows } = await pool.query(
    `SELECT bairro, ${CONTAGENS}, max(criado_em) AS ultimo
       FROM relatos ${w.sql}
      GROUP BY bairro
      ORDER BY "semAgua" DESC, total DESC
      LIMIT 30`,
    w.vals,
  );
  return rows.map((r) => ({ ...r, ultimo: r.ultimo?.toISOString() }));
}

/** Pontos agregados numa grade de ~200 m (PostGIS), para o mapa do relatório. */
async function pontos(f) {
  const w = where(f);
  const { rows } = await pool.query(
    `SELECT ST_X(c) AS lng, ST_Y(c) AS lat, total, "semAgua", voltou
       FROM (
         SELECT ST_Centroid(ST_Collect(geom::geometry)) AS c, ${CONTAGENS}
           FROM relatos ${w.sql}
          GROUP BY ST_SnapToGrid(geom::geometry, 0.002)
       ) g`,
    w.vals,
  );
  return {
    type: 'FeatureCollection',
    features: rows.map(({ lng, lat, ...props }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: props,
    })),
  };
}

async function recentes(f) {
  const w = where(f);
  const { rows } = await pool.query(
    `SELECT id, to_char(dia, 'YYYY-MM-DD') AS dia, hora, criado_em AS "criadoEm", bairro, status, lng, lat, origem
       FROM relatos ${w.sql}
      ORDER BY criado_em DESC
      LIMIT 50`,
    w.vals,
  );
  return rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() }));
}

/** Tudo que o painel precisa numa resposta só (os números sempre batem entre si). */
export async function metricas(f) {
  const [r, s, sh, b, p, rec] = await Promise.all([
    resumo(f),
    serie(f),
    semanaHora(f),
    bairros(f),
    pontos(f),
    recentes(f),
  ]);
  return { filtros: f, geradoEm: new Date().toISOString(), resumo: r, serie: s, semanaHora: sh, bairros: b, pontos: p, recentes: rec };
}

/**
 * Modo monitoramento: relatos individuais das últimas N horas (1–72), com posição e horário,
 * para o mapa de calor em tempo real. `demo=0` deixa só os reais.
 */
export async function monitor(params) {
  const horas = Number(params.get('horas') ?? 6);
  if (!Number.isInteger(horas) || horas < 1 || horas > 72) throw new Error('Janela entre 1 e 72 horas.');
  const demo = params.get('demo') !== '0';
  const { rows } = await pool.query(
    `SELECT id, lng, lat, bairro, status, floor(extract(epoch FROM criado_em) * 1000)::float8 AS "createdAt"
       FROM relatos
      WHERE criado_em > now() - make_interval(hours => $1) ${demo ? '' : `AND origem = 'app'`}
      ORDER BY criado_em
      LIMIT 10000`,
    [horas],
  );
  return { geradoEm: new Date().toISOString(), horas, relatos: rows };
}

/** Lista de bairros com relatos (para o filtro do painel). */
export async function listaBairros() {
  const { rows } = await pool.query(`SELECT DISTINCT bairro FROM relatos ORDER BY bairro`);
  return rows.map((r) => r.bairro);
}

/** CSV para Excel em pt-BR: separador ";", BOM UTF-8, data/hora no fuso de Salto. */
export async function relatoriosCsv(f) {
  const w = where(f);
  const { rows } = await pool.query(
    `SELECT to_char(dia, 'DD/MM/YYYY') AS dia, hora,
            to_char(criado_em AT TIME ZONE '${TZ}', 'DD/MM/YYYY HH24:MI:SS') AS data_hora,
            bairro, status, lat, lng, origem
       FROM relatos ${w.sql}
      ORDER BY criado_em`,
    w.vals,
  );
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const header = ['dia', 'hora', 'data_hora', 'bairro', 'status', 'latitude', 'longitude', 'origem'];
  const lines = rows.map((r) => [r.dia, r.hora, r.data_hora, r.bairro, r.status, r.lat, r.lng, r.origem].map(esc).join(';'));
  return BOM + [header.join(';'), ...lines].join('\r\n') + '\r\n';
}
