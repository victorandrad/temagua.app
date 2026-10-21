// Injeção de CSS dos remotos (que embutem o próprio CSS no JS para funcionar dentro do shell).

/** Injeta um <style> uma única vez por id, no fim do <head>. */
export function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * CSS do MapLibre, compartilhado por todos os remotos que têm mapa (mapa e métricas).
 * Entra uma vez só e no INÍCIO do <head>: assim o CSS de cada remoto vem sempre depois e vence
 * empates de especificidade. Se cada remoto injetasse a sua cópia, a cópia mais recente
 * (ex.: `.maplibregl-map { position: relative }`) passaria por cima das regras do remoto que
 * carregou antes — foi o que deixava o mapa em branco ao voltar do painel de métricas.
 */
export function injectMaplibreStyle(css: string): void {
  const id = 'tem-agua-maplibre-css';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.prepend(style);
}
