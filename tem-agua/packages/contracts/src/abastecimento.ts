import dados from './abastecimento.json';

// Setores de abastecimento de Salto: cada centro de reservação (CR) atende um conjunto de áreas.
// Fonte: mapa "Regiões x Reservatórios" (Google My Maps), importado por
// scripts/importar-abastecimento.mjs para abastecimento.json. Áreas rurais e chácaras fora da rede
// não aparecem no mapa original: abastecimentoDoPonto() devolve null nelas.
// Sem ler propriedades do JSON no topo do módulo: assim quem não usa (o shell) não empacota os 50 KB.

export type TipoEstrutura = 'elevado' | 'apoiado' | 'booster' | 'pressurizado' | 'reservatorio';

export interface Estrutura {
  nome: string;
  tipo: TipoEstrutura;
  lng: number;
  lat: number;
}

export interface AreaAbastecimento {
  nome: string;
  /** Contorno [lng, lat], primeiro ponto = último. */
  anel: [number, number][];
}

export interface SetorAbastecimento {
  id: string;
  nome: string;
  /** Rótulo original do mapa, ex.: "CR SANTA CRUZ". */
  rotulo: string;
  /** Cor no mapa: setores vizinhos nunca têm cores que se confundem (ver o importador). */
  cor: string;
  estruturas: Estrutura[];
  areas: AreaAbastecimento[];
}

export const ABASTECIMENTO = dados as {
  fonte: { titulo: string; url: string; importadoEm: string };
  setores: SetorAbastecimento[];
};

export const NOME_ESTRUTURA: Record<TipoEstrutura, string> = {
  elevado: 'Reservatório elevado',
  apoiado: 'Reservatório apoiado',
  booster: 'Booster (bombeamento)',
  pressurizado: 'Sistema pressurizado',
  reservatorio: 'Reservatório',
};

export function setorPorId(id: string): SetorAbastecimento | undefined {
  return ABASTECIMENTO.setores.find((s) => s.id === id);
}

export interface LocalAbastecimento {
  setor: SetorAbastecimento;
  area: AreaAbastecimento;
}

interface Indice {
  setor: SetorAbastecimento;
  area: AreaAbastecimento;
  caixa: [number, number, number, number];
  tamanho: number;
}
let indice: Indice[] | undefined;

function montarIndice(): Indice[] {
  return ABASTECIMENTO.setores.flatMap((setor) =>
    setor.areas.map((area) => {
      const lngs = area.anel.map((p) => p[0]);
      const lats = area.anel.map((p) => p[1]);
      const caixa: Indice['caixa'] = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
      return { setor, area, caixa, tamanho: (caixa[2] - caixa[0]) * (caixa[3] - caixa[1]) };
    }),
  );
}

function dentro(lng: number, lat: number, anel: [number, number][]): boolean {
  let fora = true;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) fora = !fora;
  }
  return !fora;
}

/** Setor e área de abastecimento de um ponto; null fora das áreas do mapa. Em sobreposição, vale a menor área. */
export function abastecimentoDoPonto(lng: number, lat: number): LocalAbastecimento | null {
  indice ??= montarIndice();
  let melhor: Indice | undefined;
  for (const i of indice) {
    const [o, s, l, n] = i.caixa;
    if (lng < o || lng > l || lat < s || lat > n) continue;
    if ((!melhor || i.tamanho < melhor.tamanho) && dentro(lng, lat, i.area.anel)) melhor = i;
  }
  return melhor ? { setor: melhor.setor, area: melhor.area } : null;
}

/** Distância aproximada (m) de um ponto ao contorno de uma área. */
function distanciaAoContorno(lng: number, lat: number, anel: [number, number][]): number {
  const kx = 102_300; // metros por grau de longitude na latitude de Salto
  const ky = 111_320;
  let min = Infinity;
  for (let i = 0; i < anel.length - 1; i++) {
    const ax = (anel[i][0] - lng) * kx;
    const ay = (anel[i][1] - lat) * ky;
    const dx = (anel[i + 1][0] - anel[i][0]) * kx;
    const dy = (anel[i + 1][1] - anel[i][1]) * ky;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

/**
 * Como abastecimentoDoPonto, mas aceita a área mais próxima até `maxMetros` de distância: os contornos
 * foram desenhados à mão e deixam vãos nas ruas entre uma área e outra. `distancia` = 0 dentro da área.
 */
export function abastecimentoProximo(
  lng: number,
  lat: number,
  maxMetros = 300,
): (LocalAbastecimento & { distancia: number }) | null {
  const dentroDe = abastecimentoDoPonto(lng, lat);
  if (dentroDe) return { ...dentroDe, distancia: 0 };
  indice ??= montarIndice();
  const folga = maxMetros / 100_000; // graus, com sobra
  let melhor: (LocalAbastecimento & { distancia: number }) | null = null;
  for (const i of indice) {
    const [o, s, l, n] = i.caixa;
    if (lng < o - folga || lng > l + folga || lat < s - folga || lat > n + folga) continue;
    const d = distanciaAoContorno(lng, lat, i.area.anel);
    if (d <= maxMetros && (!melhor || d < melhor.distancia)) melhor = { setor: i.setor, area: i.area, distancia: d };
  }
  return melhor;
}

/** Centro aproximado do setor (média das estruturas; sem estruturas, das caixas das áreas). */
export function centroDoSetor(setor: SetorAbastecimento): { lng: number; lat: number } {
  const pontos = setor.estruturas.length
    ? setor.estruturas.map((e) => [e.lng, e.lat])
    : setor.areas.flatMap((a) => a.anel);
  return {
    lng: pontos.reduce((t, p) => t + p[0], 0) / pontos.length,
    lat: pontos.reduce((t, p) => t + p[1], 0) / pontos.length,
  };
}
