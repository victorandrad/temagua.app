import { BAIRROS } from './bairros';
import type { Bairro, Report } from './types';

export const SALTO_CENTER = { lng: -47.2869, lat: -23.2003 };

/** Limites aproximados do município de Salto/SP: [oeste, sul, leste, norte]. */
export const SALTO_BOUNDS: [number, number, number, number] = [-47.42, -23.27, -47.2, -23.08];

export function distanceKm(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestBairro(lng: number, lat: number): Bairro {
  let best = BAIRROS[0];
  let bestDist = Infinity;
  for (const b of BAIRROS) {
    const d = distanceKm(lng, lat, b.lng, b.lat);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Casas decimais da posição que sai do aparelho. 4 casas ≈ 11 m: o ponto aparece praticamente
 * no mesmo lugar em todos os aparelhos (~6 px no zoom 17), sem guardar a posição exata.
 * 3 casas (≈ 110 m) protegeria mais, mas desloca o ponto ~90 px entre aparelhos.
 * Manter igual a PUBLIC_DECIMALS em apps/api/server.mjs.
 */
export const PUBLIC_DECIMALS = 4;

/** Arredonda uma coordenada para a precisão pública (~11 m). */
export function coarsen(value: number): number {
  const f = 10 ** PUBLIC_DECIMALS;
  return Math.round(value * f) / f;
}

/**
 * Versão do relato que pode sair do aparelho (LGPD): posição arredondada para ~11 m, assim o
 * servidor e os outros moradores nunca recebem o endereço exato. No próprio aparelho o relato
 * fica onde o pin estava, para o ponto aparecer exatamente onde a pessoa marcou.
 */
export function toPublicReport(report: Report): Report {
  return { ...report, lng: coarsen(report.lng), lat: coarsen(report.lat) };
}

export function searchBairros(query: string, limit = 6): Bairro[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return [];
  return BAIRROS.filter((b) => norm(b.nome).includes(q)).slice(0, limit);
}

/** "Jardim São João" → "jardim-sao-joao" (URLs das páginas de bairro e do link /?bairro=). */
export function slugBairro(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function bairroPorSlug(slug: string): Bairro | undefined {
  return BAIRROS.find((b) => slugBairro(b.nome) === slug);
}
