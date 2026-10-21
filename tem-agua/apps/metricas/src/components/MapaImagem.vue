<script setup lang="ts">
// Mapa para o relatório impresso: desenha o MapLibre fora da tela, espera terminar de carregar
// e troca por uma imagem estática (sai nítido no PDF e não depende de WebGL na impressão).

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { LngLatBounds, Map as MlMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { SALTO_BOUNDS, SALTO_CENTER } from '@tem-agua/contracts';
import type { Metricas } from '../api';
import { COR } from '../charts';

setWorkerUrl(new URL(workerUrl, import.meta.url).href);

const props = defineProps<{ pontos: Metricas['pontos']; largura: number; altura: number }>();
const emit = defineEmits<{ pronto: [] }>();

const el = ref<HTMLDivElement | null>(null);
const imagem = ref<string | null>(null);
let map: MlMap | undefined;
let avisado = false;

function pronto() {
  if (avisado) return;
  avisado = true;
  emit('pronto');
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
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: 2, // imagem em alta resolução para impressão
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  map.on('load', () => {
    map!.addSource('pontos', { type: 'geojson', data: props.pontos });
    map!.addLayer({
      id: 'pontos',
      type: 'circle',
      source: 'pontos',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 1, 3, 6, 12, 12, 22],
        'circle-color': COR.semAgua,
        'circle-opacity': 0.55,
        'circle-stroke-color': COR.superficie,
        'circle-stroke-width': 1.5,
      },
    });
    const feats = props.pontos.features;
    if (feats.length) {
      const b = new LngLatBounds();
      for (const f of feats) b.extend(f.geometry.coordinates as [number, number]);
      map!.fitBounds(b, { padding: 30, maxZoom: 15, duration: 0 });
    }
    map!.once('idle', () => {
      imagem.value = map!.getCanvas().toDataURL('image/png');
      map!.remove();
      map = undefined;
      pronto();
    });
  });

  // Sem rede para os tiles: não trava a impressão.
  setTimeout(pronto, 12_000);
});

onBeforeUnmount(() => map?.remove());
</script>

<template>
  <img v-if="imagem" :src="imagem" class="ta-rel__mapa" :width="largura" :height="altura" alt="Mapa com a concentração de relatos por área" />
  <div v-else ref="el" :style="{ width: `${largura}px`, height: `${altura}px` }"></div>
</template>
