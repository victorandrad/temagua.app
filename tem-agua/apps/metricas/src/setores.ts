// Setores de abastecimento no mapa de calor do monitoramento: contorno e preenchimento leve na cor
// de cada setor (a mesma da home), nome do setor no centro e os reservatórios. Ficam por baixo do
// calor, para a falta continuar em primeiro plano.
import type { ExpressionSpecification, FilterSpecification, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { abastecimentoDoPonto, ABASTECIMENTO, centroDoSetor } from '@tem-agua/contracts';

const CAMADAS = ['setores-fill', 'setores-line', 'setores-reservatorio', 'setores-nome'] as const;
const TEXTO = '#2b2b2b';

function areas(): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: ABASTECIMENTO.setores.flatMap((s) =>
      s.areas.map((a) => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [a.anel] },
        properties: { setor: s.id, cor: s.cor },
      })),
    ),
  };
}

function pontos(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: ABASTECIMENTO.setores.flatMap((s) => [
      // Um rótulo por setor, no centro das estruturas.
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: Object.values(centroDoSetor(s)) },
        properties: { setor: s.id, cor: s.cor, nome: s.nome, tipo: 'rotulo' },
      },
      ...s.estruturas
        .filter((e) => e.tipo !== 'booster')
        .map((e) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] },
          properties: { setor: s.id, cor: s.cor, nome: e.nome, tipo: 'reservatorio' },
        })),
    ]),
  };
}

/** Adiciona as camadas (ocultas) abaixo de `antesDe`. */
export function adicionarSetores(map: MlMap, antesDe: string): void {
  map.addSource('setores-areas', { type: 'geojson', data: areas() });
  map.addSource('setores-pontos', { type: 'geojson', data: pontos() });
  const oculta = { visibility: 'none' } as const;
  map.addLayer({ id: 'setores-fill', type: 'fill', source: 'setores-areas', layout: oculta, paint: { 'fill-color': ['get', 'cor'], 'fill-opacity': 0.1 } }, antesDe);
  map.addLayer(
    {
      id: 'setores-line',
      type: 'line',
      source: 'setores-areas',
      layout: { ...oculta, 'line-join': 'round' },
      paint: { 'line-color': ['get', 'cor'], 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 2] },
    },
    antesDe,
  );
  map.addLayer(
    {
      id: 'setores-reservatorio',
      type: 'circle',
      source: 'setores-pontos',
      filter: ['==', ['get', 'tipo'], 'reservatorio'],
      layout: oculta,
      paint: { 'circle-radius': 4.5, 'circle-color': ['get', 'cor'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
    },
    antesDe,
  );
  // Nomes por cima do calor: na TV, é o que diz de que região se trata.
  map.addLayer({
    id: 'setores-nome',
    type: 'symbol',
    source: 'setores-pontos',
    filter: ['==', ['get', 'tipo'], 'rotulo'],
    layout: { ...oculta, 'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-max-width': 9 },
    paint: { 'text-color': TEXTO, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  });
}

/** Liga/desliga e aplica o filtro de setores (null = todos). */
export function mostrarSetores(map: MlMap, visivel: boolean, setores: string[] | null): void {
  const filtros: ExpressionSpecification[] = setores ? [['in', ['get', 'setor'], ['literal', setores]]] : [];
  for (const id of CAMADAS) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, 'visibility', visivel ? 'visible' : 'none');
    // Pontos: rótulo e reservatório dividem a mesma fonte.
    const tipo: ExpressionSpecification[] =
      id === 'setores-nome' ? [['==', ['get', 'tipo'], 'rotulo']] : id === 'setores-reservatorio' ? [['==', ['get', 'tipo'], 'reservatorio']] : [];
    const todos = [...tipo, ...filtros];
    map.setFilter(id, todos.length ? (['all', ...todos] as FilterSpecification) : null);
  }
}

/** Enquadra o mapa nas áreas dos setores. */
export function enquadrarSetores(map: MlMap, setores: string[], duracao = 900): void {
  const anel = ABASTECIMENTO.setores.filter((s) => setores.includes(s.id)).flatMap((s) => s.areas.flatMap((a) => a.anel));
  if (!anel.length) return;
  const lngs = anel.map((p) => p[0]);
  const lats = anel.map((p) => p[1]);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    // Espaço para os painéis do monitoramento (título/números à esquerda, legenda embaixo).
    { padding: { top: 90, bottom: 60, left: 300, right: 60 }, maxZoom: 15, duration: duracao },
  );
}

const cache = new Map<string, string | null>();
/** Setor de um relato (calculado uma vez por id). */
export function setorDoRelato(r: { id: string; lng: number; lat: number }): string | null {
  if (!cache.has(r.id)) cache.set(r.id, abastecimentoDoPonto(r.lng, r.lat)?.setor.id ?? null);
  return cache.get(r.id)!;
}
