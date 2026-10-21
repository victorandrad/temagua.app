// Camada opcional "Reservatórios": áreas atendidas por cada setor de abastecimento e as
// estruturas (reservatórios, boosters). O setor do pin fica destacado.
import type { ExpressionSpecification, FilterSpecification, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { ABASTECIMENTO, NOME_ESTRUTURA } from '@tem-agua/contracts';

// Cada setor tem a sua cor (abastecimento.json); textos ficam em cinza-escuro para serem legíveis.
const TEXTO = '#2b2b2b';
const CAMADAS = ['abast-fill', 'abast-line', 'abast-area-nome', 'abast-estrutura', 'abast-estrutura-nome'] as const;

function areasGeoJSON(): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: ABASTECIMENTO.setores.flatMap((s) =>
      s.areas.map((a) => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [a.anel] },
        properties: { setor: s.id, setorNome: s.nome, area: a.nome, cor: s.cor },
      })),
    ),
  };
}

function estruturasGeoJSON(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: ABASTECIMENTO.setores.flatMap((s) =>
      s.estruturas.map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] },
        properties: { setor: s.id, setorNome: s.nome, nome: e.nome, tipo: e.tipo, tipoNome: NOME_ESTRUTURA[e.tipo], cor: s.cor },
      })),
    ),
  };
}

/** Destaque do setor do pin: [valor no setor, valor fora]. */
const noSetor = (setor: string, dentro: number, fora: number): ExpressionSpecification => [
  'case',
  ['==', ['get', 'setor'], setor],
  dentro,
  fora,
];

/** Adiciona as camadas (escondidas) abaixo de `antesDe`, para os relatos ficarem por cima. */
export function adicionarCamadaAbastecimento(map: MlMap, antesDe: string): void {
  map.addSource('abast-areas', { type: 'geojson', data: areasGeoJSON() });
  map.addSource('abast-estruturas', { type: 'geojson', data: estruturasGeoJSON() });
  const oculta = { visibility: 'none' } as const;

  map.addLayer(
    { id: 'abast-fill', type: 'fill', source: 'abast-areas', layout: oculta, paint: { 'fill-color': ['get', 'cor'], 'fill-opacity': 0.12 } },
    antesDe,
  );
  map.addLayer(
    {
      id: 'abast-line',
      type: 'line',
      source: 'abast-areas',
      layout: { ...oculta, 'line-join': 'round' },
      paint: { 'line-color': ['get', 'cor'], 'line-opacity': 0.6, 'line-width': 1.2 },
    },
    antesDe,
  );
  map.addLayer(
    {
      id: 'abast-area-nome',
      type: 'symbol',
      source: 'abast-areas',
      minzoom: 14.5,
      layout: {
        ...oculta,
        'text-field': ['get', 'area'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-max-width': 8,
      },
      paint: { 'text-color': TEXTO, 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    },
    antesDe,
  );
  map.addLayer(
    {
      id: 'abast-estrutura',
      type: 'circle',
      source: 'abast-estruturas',
      layout: oculta,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, ['match', ['get', 'tipo'], 'booster', 5, 7]],
        // Reservatório: cheio na cor do setor; booster: vazado.
        'circle-color': ['match', ['get', 'tipo'], 'booster', '#ffffff', ['get', 'cor']],
        'circle-stroke-color': ['match', ['get', 'tipo'], 'booster', ['get', 'cor'], '#ffffff'],
        'circle-stroke-width': 2,
      },
    },
    antesDe,
  );
  map.addLayer(
    {
      id: 'abast-estrutura-nome',
      type: 'symbol',
      source: 'abast-estruturas',
      minzoom: 14,
      layout: {
        ...oculta,
        'text-field': ['get', 'nome'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: { 'text-color': TEXTO, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
    antesDe,
  );
}

export function mostrarAbastecimento(map: MlMap, visivel: boolean): void {
  for (const id of CAMADAS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visivel ? 'visible' : 'none');
}

/** Realça o setor do pin (ou nenhum, com null). */
export function destacarSetor(map: MlMap, setor: string | null): void {
  if (!map.getLayer('abast-fill')) return;
  const id = setor ?? '';
  map.setPaintProperty('abast-fill', 'fill-opacity', noSetor(id, 0.26, 0.1));
  map.setPaintProperty('abast-line', 'line-width', noSetor(id, 2.6, 1.2));
  map.setPaintProperty('abast-line', 'line-opacity', noSetor(id, 1, 0.6));
}

/** Mostra só os setores escolhidos (null = todos). */
export function filtrarSetores(map: MlMap, setores: string[] | null): void {
  const filtro: FilterSpecification | null = setores ? ['in', ['get', 'setor'], ['literal', setores]] : null;
  for (const id of CAMADAS) if (map.getLayer(id)) map.setFilter(id, filtro);
}

/** Enquadra o mapa nas áreas dos setores escolhidos (null = todos). */
export function enquadrarSetores(map: MlMap, setores: string[] | null): void {
  const pontos = ABASTECIMENTO.setores.filter((s) => !setores || setores.includes(s.id)).flatMap((s) => s.areas.flatMap((a) => a.anel));
  if (!pontos.length) return;
  const lngs = pontos.map((p) => p[0]);
  const lats = pontos.map((p) => p[1]);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 32, maxZoom: 15.5, duration: 900 },
  );
}
