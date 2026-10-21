// Setores de abastecimento no mapa de calor do monitoramento: contorno e preenchimento leve na cor
// de cada setor (a mesma da home) por baixo do calor; por cima dele, os reservatórios (pontos na cor
// do setor; boosters vazados) e o nome de cada setor, para a TV mostrar onde fica cada um.
import type { ExpressionSpecification, FilterSpecification, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { abastecimentoDoPonto, ABASTECIMENTO, centroDoSetor } from '@tem-agua/contracts';

const CAMADAS = ['setores-fill', 'setores-line', 'setores-estrutura', 'setores-estrutura-nome', 'setores-nome'] as const;
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
      // Reservatórios, boosters e o sistema pressurizado (tipo da estrutura).
      ...s.estruturas.map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] },
        properties: { setor: s.id, cor: s.cor, nome: e.nome, tipo: e.tipo },
      })),
    ]),
  };
}

const ROTULO: ExpressionSpecification = ['==', ['get', 'tipo'], 'rotulo'];
const ESTRUTURA: ExpressionSpecification = ['!=', ['get', 'tipo'], 'rotulo'];

/** Adiciona as camadas (ocultas): áreas abaixo de `antesDe` (o calor), pontos e nomes por cima de tudo. */
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
  // Daqui para baixo, por cima do calor: os reservatórios não podem sumir embaixo da mancha de falta.
  map.addLayer({
    id: 'setores-estrutura',
    type: 'circle',
    source: 'setores-pontos',
    filter: ESTRUTURA,
    layout: oculta,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'tipo'], 'booster', 4, 6], 13, ['match', ['get', 'tipo'], 'booster', 5.5, 8.5], 16, ['match', ['get', 'tipo'], 'booster', 7, 11]],
      // Reservatório: cheio na cor do setor com borda branca; booster: vazado, borda na cor do setor.
      'circle-color': ['match', ['get', 'tipo'], 'booster', '#ffffff', ['get', 'cor']],
      'circle-stroke-color': ['match', ['get', 'tipo'], 'booster', ['get', 'cor'], '#ffffff'],
      'circle-stroke-width': ['match', ['get', 'tipo'], 'booster', 3, 2.5],
    },
  });
  map.addLayer({
    id: 'setores-estrutura-nome',
    type: 'symbol',
    source: 'setores-pontos',
    filter: ESTRUTURA,
    minzoom: 13.5,
    layout: {
      ...oculta,
      'text-field': ['get', 'nome'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, 1],
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: { 'text-color': TEXTO, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
  // Nome do setor logo acima dos reservatórios: na TV, é o que diz de que região se trata.
  map.addLayer({
    id: 'setores-nome',
    type: 'symbol',
    source: 'setores-pontos',
    filter: ROTULO,
    layout: {
      ...oculta,
      'text-field': ['get', 'nome'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-max-width': 9,
      'text-anchor': 'bottom',
      'text-offset': [0, -0.9],
    },
    paint: { 'text-color': TEXTO, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  });
}

/** Liga/desliga e aplica o filtro de setores (null = todos). */
export function mostrarSetores(map: MlMap, visivel: boolean, setores: string[] | null): void {
  const filtros: ExpressionSpecification[] = setores ? [['in', ['get', 'setor'], ['literal', setores]]] : [];
  for (const id of CAMADAS) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, 'visibility', visivel ? 'visible' : 'none');
    // Pontos: rótulo do setor e estruturas dividem a mesma fonte.
    const tipo: ExpressionSpecification[] = id === 'setores-nome' ? [ROTULO] : id.startsWith('setores-estrutura') ? [ESTRUTURA] : [];
    const todos = [...tipo, ...filtros];
    map.setFilter(id, todos.length ? (['all', ...todos] as FilterSpecification) : null);
  }
}

/** Enquadra o mapa nas áreas dos setores (null = todos, a cidade inteira). */
export function enquadrarSetores(map: MlMap, setores: string[] | null, duracao = 900): void {
  const anel = ABASTECIMENTO.setores.filter((s) => !setores || setores.includes(s.id)).flatMap((s) => s.areas.flatMap((a) => a.anel));
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
