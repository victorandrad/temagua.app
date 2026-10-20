import { createRoot } from 'react-dom/client';
import type { MountFn } from '@tem-agua/contracts';
import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?inline';
import css from './mapa.css?inline';
import { MapaApp } from './MapaApp';

// O CSS vai embutido no JS para funcionar igual quando carregado dentro de outro app.
function injectStyles() {
  if (document.getElementById('ta-mapa-styles')) return;
  const style = document.createElement('style');
  style.id = 'ta-mapa-styles';
  style.textContent = maplibreCss + css;
  document.head.appendChild(style);
}

export const mount: MountFn = (el) => {
  injectStyles();
  const root = createRoot(el);
  root.render(<MapaApp />);
  return () => root.unmount();
};
