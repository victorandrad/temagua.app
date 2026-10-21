<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AttributionControl, LngLatBounds, Map as MlMap, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { SALTO_BOUNDS, SALTO_CENTER } from '@tem-agua/contracts';
import type { Metricas } from '../api';
import { COR } from '../charts';
import { esc, nf } from '../format';

// Mesmo motivo do remoto do mapa: o worker vai como asset e o MapLibre precisa da URL dele.
setWorkerUrl(new URL(workerUrl, import.meta.url).href);

const props = defineProps<{ pontos: Metricas['pontos'] }>();

const el = ref<HTMLDivElement | null>(null);
let map: MlMap | undefined;
let carregado = false;

function atualizar() {
  if (!map || !carregado) return;
  (map.getSource('pontos') as GeoJSONSource).setData(props.pontos);
  const feats = props.pontos.features;
  if (!feats.length) return;
  const bounds = new LngLatBounds();
  for (const f of feats) bounds.extend(f.geometry.coordinates as [number, number]);
  map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
}

onMounted(() => {
  map = new MlMap({
    container: el.value!,
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: [SALTO_CENTER.lng, SALTO_CENTER.lat],
    zoom: 12.3,
    maxBounds: [
      [SALTO_BOUNDS[0], SALTO_BOUNDS[1]],
      [SALTO_BOUNDS[2], SALTO_BOUNDS[3]],
    ],
    attributionControl: false,
    dragRotate: false,
    // Sem isso o mapa sai em branco ao imprimir o relatório.
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

  const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'ta-met-popup' });

  map.on('load', () => {
    el.value?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    map!.addSource('pontos', { type: 'geojson', data: props.pontos });
    map!.addLayer({
      id: 'pontos',
      type: 'circle',
      source: 'pontos',
      paint: {
        // Área do círculo proporcional ao número de relatos naquela célula (~200 m).
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 1, 4, 6, 16, 12, 28],
        'circle-color': COR.semAgua,
        'circle-opacity': 0.55,
        'circle-stroke-color': COR.superficie,
        'circle-stroke-width': 2,
      },
    });
    carregado = true;
    atualizar();

    map!.on('mousemove', 'pontos', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map!.getCanvas().style.cursor = 'pointer';
      const p = f.properties as { total: number; semAgua: number; voltou: number };
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<b>${esc(nf.format(p.total))}</b> relato(s) nesta área<br>` +
            `<span>${esc(nf.format(p.semAgua))} sem água · ${esc(nf.format(p.voltou))} água voltou</span>`,
        )
        .addTo(map!);
    });
    map!.on('mouseleave', 'pontos', () => {
      map!.getCanvas().style.cursor = '';
      popup.remove();
    });
  });
});

watch(() => props.pontos, atualizar);

onBeforeUnmount(() => map?.remove());
</script>

<template>
  <div ref="el" class="ta-met__mapa" role="img" aria-label="Mapa com a concentração de relatos por área"></div>
</template>
