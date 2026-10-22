// Acesso ao PostgreSQL/PostGIS: conexão, migração e operações dos relatos.

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://temagua:temagua@localhost:5442/temagua';

// date e timestamp (sem fuso) chegam como texto: "2026-10-21", sem o Node convertê-los
// para meia-noite no fuso da máquina.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1114, (v) => v);

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

/** Conecta (com retentativas, o banco pode estar subindo) e aplica o schema.sql. */
export async function connect({ attempts = 30 } = {}) {
  for (let i = 1; ; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (i >= attempts) throw err;
      if (i === 1) console.log(`[api] aguardando o banco em ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const schema = await readFile(new URL('./db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}

const ms = (col) => `floor(extract(epoch FROM ${col}) * 1000)::float8`;
const RELATO_COLS = `id, lng, lat, bairro, status, ${ms('criado_em')} AS "createdAt",
  ${ms('confirmado_em')} AS "confirmedAt", ${ms('encerrado_em')} AS "closedAt"`;

/** Horas que um relato vale no mapa depois da última confirmação. Manter igual a DURACAO_MS em packages/contracts. */
export const DURACAO_HORAS = 12;
/** Depois disso o vínculo relato ↔ aparelho é apagado (LGPD); o relato fica, anônimo. */
export const DIAS_APARELHO = 30;
const ABERTO = `encerrado_em IS NULL AND coalesce(confirmado_em, criado_em) > now() - interval '${DURACAO_HORAS} hours'`;

/**
 * Relatos reais das últimas `horas` horas (padrão 24, máx. 168 = 7 dias), para o mapa ao vivo e o
 * ranking de bairros da home.
 */
export async function recentReports(horas = 24) {
  const { rows } = await pool.query(
    `SELECT ${RELATO_COLS} FROM relatos
      WHERE origem = 'app' AND criado_em > now() - make_interval(hours => $1)
      ORDER BY criado_em`,
    [horas],
  );
  return rows;
}

/**
 * Registra o relato de um aparelho, mantendo um relato ativo por aparelho:
 * - mesmo status de um relato ativo dele → renova esse relato (posição nova, confirmado_em = agora);
 * - status oposto → encerra o(s) ativo(s) e cria o novo;
 * - reenvio do mesmo id (retry) → devolve o existente sem mudar nada.
 * Sem aparelho (app antigo em cache), só insere.
 * @returns {Promise<{ report: object, mudou: boolean, criado: boolean, encerrados: object[] }>}
 */
export async function registrarRelato(input, aparelho) {
  if (!aparelho) {
    const { report, created } = await insertReport(input);
    return { report, mudou: created, criado: created, encerrados: [] };
  }
  const { id, lng, lat, bairro, status } = input;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Serializa os relatos do mesmo aparelho (dois toques rápidos não criam dois ativos).
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [aparelho]);
    const renovar = async (alvo) =>
      (
        await db.query(
          `UPDATE relatos SET lng = $2, lat = $3, bairro = $4, confirmado_em = now() WHERE id = $1 RETURNING ${RELATO_COLS}`,
          [alvo, lng, lat, bairro],
        )
      ).rows[0];

    let r;
    const existente = (await db.query(`SELECT aparelho, status, (${ABERTO}) AS aberto FROM relatos WHERE id = $1`, [id])).rows[0];
    if (existente) {
      // O app reaproveita o id ao renovar o próprio relato; qualquer outro caso é reenvio.
      if (existente.aparelho === aparelho && existente.status === status && existente.aberto) {
        r = { report: await renovar(id), mudou: true, criado: false, encerrados: [] };
      } else {
        const atual = (await db.query(`SELECT ${RELATO_COLS} FROM relatos WHERE id = $1`, [id])).rows[0];
        r = { report: atual, mudou: false, criado: false, encerrados: [] };
      }
    } else {
      const ativo = (
        await db.query(
          `SELECT id, status FROM relatos WHERE aparelho = $1 AND ${ABERTO} ORDER BY coalesce(confirmado_em, criado_em) DESC LIMIT 1`,
          [aparelho],
        )
      ).rows[0];
      if (ativo?.status === status) {
        r = { report: await renovar(ativo.id), mudou: true, criado: false, encerrados: [] };
      } else {
        const encerrados = ativo
          ? (await db.query(`UPDATE relatos SET encerrado_em = now() WHERE aparelho = $1 AND ${ABERTO} RETURNING ${RELATO_COLS}`, [aparelho])).rows
          : [];
        const novo = await db.query(
          `INSERT INTO relatos (id, lng, lat, bairro, status, aparelho) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${RELATO_COLS}`,
          [id, lng, lat, bairro, status, aparelho],
        );
        r = { report: novo.rows[0], mudou: true, criado: true, encerrados };
      }
    }
    await db.query('COMMIT');
    return r;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

/** Segredo do HMAC do aparelho: APARELHO_SEGREDO ou um gerado e guardado no banco na primeira subida. */
export async function segredoDoAparelho() {
  if (process.env.APARELHO_SEGREDO) return process.env.APARELHO_SEGREDO;
  await pool.query(
    `INSERT INTO configuracao (chave, valor) VALUES ('aparelho_segredo', $1) ON CONFLICT (chave) DO NOTHING`,
    [randomBytes(32).toString('hex')],
  );
  const { rows } = await pool.query(`SELECT valor FROM configuracao WHERE chave = 'aparelho_segredo'`);
  return rows[0].valor;
}

/** Apaga o vínculo com o aparelho dos relatos mais antigos que DIAS_APARELHO. Devolve quantos. */
export async function esquecerAparelhos() {
  const { rowCount } = await pool.query(
    `UPDATE relatos SET aparelho = NULL
      WHERE aparelho IS NOT NULL AND coalesce(confirmado_em, criado_em) < now() - make_interval(days => $1)`,
    [DIAS_APARELHO],
  );
  return rowCount;
}

/** Insere o relato; se o id já existe (reenvio), devolve o existente. */
async function insertReport({ id, lng, lat, bairro, status }) {
  const inserted = await pool.query(
    `INSERT INTO relatos (id, lng, lat, bairro, status) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${RELATO_COLS}`,
    [id, lng, lat, bairro, status],
  );
  if (inserted.rows[0]) return { report: inserted.rows[0], created: true };
  const existing = await pool.query(`SELECT ${RELATO_COLS} FROM relatos WHERE id = $1`, [id]);
  return { report: existing.rows[0], created: false };
}
