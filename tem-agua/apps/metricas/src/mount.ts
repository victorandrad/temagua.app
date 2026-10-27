import { createApp } from 'vue';
import { injectMaplibreStyle, injectStyle, type MountFn } from '@tem-agua/contracts';
import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?inline';
import css from './metricas.css?inline';
import Metricas from './Metricas.vue';
import RelatoriosMensais from './RelatoriosMensais.vue';

export const mount: MountFn = (el) => {
  // O CSS vai embutido no JS para funcionar igual quando carregado dentro de outro app.
  // O do MapLibre é compartilhado com o remoto do mapa (ver injectMaplibreStyle).
  injectMaplibreStyle(maplibreCss);
  injectStyle('ta-metricas-styles', css);
  // /relatorios e /relatorios/AAAA-MM (rotas do shell): relatórios mensais; o resto, o painel.
  const app = createApp(/^\/relatorios(\/|$)/.test(location.pathname) ? RelatoriosMensais : Metricas);
  app.mount(el);
  return () => app.unmount();
};
