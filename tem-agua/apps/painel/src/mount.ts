import { createApp } from 'vue';
import type { MountFn } from '@tem-agua/contracts';
import css from './painel.css?inline';
import Painel from './Painel.vue';

// O CSS vai embutido no JS para funcionar igual quando carregado dentro de outro app.
function injectStyles() {
  if (document.getElementById('ta-painel-styles')) return;
  const style = document.createElement('style');
  style.id = 'ta-painel-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

export const mount: MountFn = (el) => {
  injectStyles();
  const app = createApp(Painel);
  app.mount(el);
  return () => app.unmount();
};
