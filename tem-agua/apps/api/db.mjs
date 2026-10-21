// Acesso ao PostgreSQL/PostGIS: conexão, migração e operações dos relatos.

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

const RELATO_COLS = `id, lng, lat, bairro, status, floor(extract(epoch FROM criado_em) * 1000)::float8 AS "createdAt"`;

/**
 * Relatos reais das últimas `horas` horas (padrão 24, máx. 168 = 7 dias), para o mapa ao vivo e o
 * ranking de bairros da home. A demonstração do mapa é gerada no app.
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

/** Insere o relato; se o id já existe (reenvio), devolve o existente. */
export async function insertReport({ id, lng, lat, bairro, status }) {
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
