import { createApp } from 'vue';
import { injectMaplibreStyle, injectStyle, type MountFn } from '@tem-agua/contracts';
import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?inline';
import css from './metricas.css?inline';
import Metricas from './Metricas.vue';

export const mount: MountFn = (el) => {
  // O CSS vai embutido no JS para funcionar igual quando carregado dentro de outro app.
  // O do MapLibre é compartilhado com o remoto do mapa (ver injectMaplibreStyle).
  injectMaplibreStyle(maplibreCss);
  injectStyle('ta-metricas-styles', css);
  const app = createApp(Metricas);
  app.mount(el);
  return () => app.unmount();
};
