import { createRoot } from 'react-dom/client';
import { injectMaplibreStyle, injectStyle, type MountFn } from '@tem-agua/contracts';
import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?inline';
import css from './mapa.css?inline';
import { MapaApp } from './MapaApp';

export const mount: MountFn = (el) => {
  // O CSS vai embutido no JS para funcionar igual quando carregado dentro de outro app.
  injectMaplibreStyle(maplibreCss);
  injectStyle('ta-mapa-styles', css);
  const root = createRoot(el);
  root.render(<MapaApp />);
  return () => root.unmount();
};
