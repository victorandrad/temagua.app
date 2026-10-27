// Consultas do painel de métricas e do relatório CSV.
// Filtros (query string): de, ate (AAAA-MM-DD, inclusive, no fuso de Salto) e bairro, que pode se
// repetir (?bairro=Centro&bairro=Vila%20Nova); sem nenhum = todos os bairros.

import { pool } from './db.mjs';

const TZ = 'America/Sao_Paulo';
const MAX_DIAS = 366;
const BOM = String.fromCharCode(0xfeff); // Excel só reconhece UTF-8 com BOM
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BAIRROS = 100;

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
  const bairros = [...new Set(params.getAll('bairro').map((b) => b.trim()).filter(Boolean))];
  if (bairros.length > MAX_BAIRROS || bairros.some((b) => b.length > 80)) throw new Error('Bairro inválido.');
  return { de, ate, dias, bairros };
}

/** WHERE comum a todas as consultas. `dataCols` = false ignora o período (ex.: "última hora"). */
function where(f, { periodo = true, de = f.de, ate = f.ate } = {}) {
  const conds = [];
  const vals = [];
  if (periodo) {
    vals.push(de, ate);
    conds.push(`dia BETWEEN $${vals.length - 1} AND $${vals.length}`);
  }
  if (f.bairros.length) {
    vals.push(f.bairros);
    conds.push(`bairro = ANY($${vals.length}::text[])`);
  }
  conds.push(`origem = 'app'`);
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', vals };
}

const CONTAGENS = `
  count(*)::int AS total,
  count(*) FILTER (WHERE status = 'sem-agua')::int AS "semAgua",
  count(*) FILTER (WHERE status = 'voltou')::int AS voltou`;

// Duração da falta: do relato "sem água" até o mesmo aparelho avisar que a água voltou (encerrado_em).
// É um piso: a falta pode ter começado antes do primeiro aviso. Faltas sem "voltou" (expiraram no mapa
// ou ainda abertas) não entram; menos de 5 min é tratado como engano (tocou no botão errado).
export const MEDIDA = `status = 'sem-agua' AND encerrado_em IS NOT NULL AND encerrado_em - criado_em >= interval '5 minutes'`;
export const SEG = `extract(epoch FROM encerrado_em - criado_em)`;
export const DURACOES = `
  count(*) FILTER (WHERE ${MEDIDA})::int AS "faltasMedidas",
  round(avg(${SEG}) FILTER (WHERE ${MEDIDA}) / 60)::int AS "duracaoMediaMin",
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${SEG}) FILTER (WHERE ${MEDIDA}) / 60)::int AS "duracaoMedianaMin",
  round(max(${SEG}) FILTER (WHERE ${MEDIDA}) / 60)::int AS "duracaoMaxMin"`;

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
         ${DURACOES}
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

/**
 * Com 2+ bairros escolhidos, a falta de cada um no mesmo eixo da série (para comparar em linhas).
 * `pontos[i]` corresponde a `serie.pontos[i]`. Ordenado pelo total de faltas.
 */
async function serieBairros(f) {
  if (f.bairros.length < 2) return [];
  const porHora = f.dias <= 2;
  const w = where(f);
  const passo = porHora ? 'hour' : 'day';
  const n = w.vals.length;
  const { rows } = await pool.query(
    `WITH contagem AS (
       SELECT bairro, date_trunc('${passo}', criado_em AT TIME ZONE '${TZ}') AS t, count(*)::int AS n
         FROM relatos ${w.sql} AND status = 'sem-agua' GROUP BY 1, 2
     ),
     eixo AS (
       SELECT generate_series($${n + 1}::date::timestamp,
                              ($${n + 2}::date + 1)::timestamp - interval '1 ${passo}',
                              interval '1 ${passo}') AS t
     )
     SELECT b.bairro, array_agg(coalesce(c.n, 0) ORDER BY eixo.t) AS pontos, sum(coalesce(c.n, 0))::int AS total
       FROM eixo
       CROSS JOIN unnest($${n + 3}::text[]) AS b(bairro)
       LEFT JOIN contagem c ON c.t = eixo.t AND c.bairro = b.bairro
      WHERE eixo.t <= (now() AT TIME ZONE '${TZ}')
      GROUP BY b.bairro
      ORDER BY total DESC, b.bairro`,
    [...w.vals, f.de, f.ate, f.bairros],
  );
  return rows;
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
  const w = where({ ...f, bairros: [] });
  const { rows } = await pool.query(
    `SELECT bairro, ${CONTAGENS}, ${DURACOES}, max(criado_em) AS ultimo
       FROM relatos ${w.sql}
      GROUP BY bairro
      ORDER BY "semAgua" DESC, total DESC
      LIMIT 30`,
    w.vals,
  );
  return rows.map((r) => ({ ...r, ultimo: r.ultimo?.toISOString() }));
}

/**
 * Relatos por setor de abastecimento (reservatório): cada relato cai na menor área que o contém.
 * Relatos fora das áreas do mapa (chácaras, zona rural) ficam de fora.
 */
async function setores(f) {
  const w = where(f);
  const { rows } = await pool.query(
    `SELECT a.setor_id AS id, a.setor AS nome, ${CONTAGENS},
            count(DISTINCT a.area) FILTER (WHERE status = 'sem-agua')::int AS "areasComFalta",
            ${DURACOES},
            (SELECT count(*)::int FROM areas_abastecimento x WHERE x.setor_id = a.setor_id) AS areas
       FROM relatos r
       JOIN LATERAL (
         SELECT setor_id, setor, area FROM areas_abastecimento a
          WHERE ST_Covers(a.geom, r.geom::geometry)
          ORDER BY ST_Area(a.geom) LIMIT 1
       ) a ON true
       ${w.sql}
      GROUP BY a.setor_id, a.setor
      ORDER BY "semAgua" DESC, total DESC`,
    w.vals,
  );
  return rows;
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
    `SELECT id, to_char(dia, 'YYYY-MM-DD') AS dia, hora, criado_em AS "criadoEm", bairro, status, lng, lat
       FROM relatos ${w.sql}
      ORDER BY criado_em DESC
      LIMIT 50`,
    w.vals,
  );
  return rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() }));
}

/** Tudo que o painel precisa numa resposta só (os números sempre batem entre si). */
export async function metricas(f) {
  const [r, s, sb, sh, b, p, rec, st] = await Promise.all([
    resumo(f),
    serie(f),
    serieBairros(f),
    semanaHora(f),
    bairros(f),
    pontos(f),
    recentes(f),
    setores(f),
  ]);
  return {
    filtros: f,
    geradoEm: new Date().toISOString(),
    resumo: r,
    serie: { ...s, bairros: sb },
    semanaHora: sh,
    bairros: b,
    setores: st,
    pontos: p,
    recentes: rec,
  };
}

/**
 * Modo monitoramento: relatos individuais das últimas N horas (1–72), com posição e horário,
 * para o mapa de calor em tempo real.
 */
export async function monitor(params) {
  const horas = Number(params.get('horas') ?? 6);
  if (!Number.isInteger(horas) || horas < 1 || horas > 72) throw new Error('Janela entre 1 e 72 horas.');
  const { rows } = await pool.query(
    `SELECT id, lng, lat, bairro, status, floor(extract(epoch FROM criado_em) * 1000)::float8 AS "createdAt"
       FROM relatos
      WHERE origem = 'app' AND criado_em > now() - make_interval(hours => $1)
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
            bairro, status, lat, lng,
            CASE WHEN ${MEDIDA} THEN round(${SEG} / 60)::int END AS duracao
       FROM relatos ${w.sql}
      ORDER BY criado_em`,
    w.vals,
  );
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  // duracao_falta_min: só nos relatos de falta encerrados por um "água voltou" do mesmo aparelho.
  const header = ['dia', 'hora', 'data_hora', 'bairro', 'status', 'latitude', 'longitude', 'duracao_falta_min'];
  const lines = rows.map((r) => [r.dia, r.hora, r.data_hora, r.bairro, r.status, r.lat, r.lng, r.duracao].map(esc).join(';'));
  return BOM + [header.join(';'), ...lines].join('\r\n') + '\r\n';
}
