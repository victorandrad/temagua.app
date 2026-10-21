// A splash screen mora no index.html (aparece antes do JavaScript); aqui só pedimos para fechar.

declare global {
  interface Window {
    temAguaSplash?: { fechar(): void };
  }
}

export function fecharSplash(): void {
  window.temAguaSplash?.fechar();
}
