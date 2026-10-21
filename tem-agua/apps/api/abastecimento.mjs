// Setores de abastecimento (mapa "Regiões x Reservatórios"), os mesmos do app:
// packages/contracts/src/abastecimento.json. A API carrega as áreas no PostGIS a cada subida
// (tabela areas_abastecimento) para as métricas por setor, e responde "qual setor" para as
// páginas de bairro.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './db.mjs';

const CANDIDATOS = [
  process.env.ABASTECIMENTO_FILE,
  fileURLToPath(new URL('./abastecimento.json', import.meta.url)), // imagem Docker
  fileURLToPath(new URL('../../packages/contracts/src/abastecimento.json', import.meta.url)), // dev
].filter(Boolean);
const arquivo = CANDIDATOS.find((c) => existsSync(c));
if (!arquivo) throw new Error('abastecimento.json não encontrado (defina ABASTECIMENTO_FILE).');

/** @type {{ fonte: { titulo: string, url: string }, setores: Array<{ id: string, nome: string, estruturas: Array<{ nome: string, tipo: string }>, areas: Array<{ nome: string, anel: number[][] }> }> }} */
export const ABASTECIMENTO = JSON.parse(readFileSync(arquivo, 'utf8'));

/** Substitui as áreas no banco pelas do JSON (cerca de 120 polígonos; roda em milissegundos). */
export async function carregarAreas() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('TRUNCATE areas_abastecimento');
    for (const s of ABASTECIMENTO.setores) {
      for (const a of s.areas) {
        // ST_MakeValid: alguns contornos desenhados à mão se cruzam.
        await db.query(
          `INSERT INTO areas_abastecimento (setor_id, setor, area, geom)
           VALUES ($1, $2, $3, ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), 3))`,
          [s.id, s.nome, a.nome, JSON.stringify({ type: 'Polygon', coordinates: [a.anel] })],
        );
      }
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

function dentro(lng, lat, anel) {
  let fora = true;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) fora = !fora;
  }
  return !fora;
}

/** Setor e área de um ponto (mesma regra do app: em sobreposição, a menor área). */
export function abastecimentoDoPonto(lng, lat) {
  let melhor = null;
  for (const setor of ABASTECIMENTO.setores) {
    for (const area of setor.areas) {
      if (!dentro(lng, lat, area.anel)) continue;
      const lngs = area.anel.map((p) => p[0]);
      const lats = area.anel.map((p) => p[1]);
      const tamanho = (Math.max(...lngs) - Math.min(...lngs)) * (Math.max(...lats) - Math.min(...lats));
      if (!melhor || tamanho < melhor.tamanho) melhor = { setor, area, tamanho };
    }
  }
  return melhor && { setor: melhor.setor, area: melhor.area };
}
