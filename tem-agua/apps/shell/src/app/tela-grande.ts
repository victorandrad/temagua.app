import { DestroyRef, inject, signal, type Signal } from '@angular/core';

/**
 * O painel de métricas só abre em tela grande (computador, notebook, TV, tablet deitado):
 * gráficos, tabelas e o relatório não cabem num celular. Mesmo valor no selo "Métricas" da home.
 */
export const TELA_GRANDE = '(min-width: 1024px)';

/** true enquanto a janela tiver ao menos 1024 px de largura; acompanha redimensionar/girar. */
export function telaGrande(): Signal<boolean> {
  const mq = window.matchMedia(TELA_GRANDE);
  const grande = signal(mq.matches);
  const mudou = (e: MediaQueryListEvent) => grande.set(e.matches);
  mq.addEventListener('change', mudou);
  inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', mudou));
  return grande.asReadonly();
}
