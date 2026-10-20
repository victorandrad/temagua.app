# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

As instruções do projeto ficam em `AGENTS.md` (compartilhado com outras ferramentas de IA):

@AGENTS.md

## Específico do Claude Code

- O painel de navegador do app desktop sobe o projeto por `.claude/launch.json` (config `tem-agua` → `npm run dev:ngrok` na raiz). Mudanças em `proxy.conf.json`, `angular.json` ou `vite.config.ts` exigem reiniciar o servidor (`preview_stop` + `preview_start`); mudanças de código nos remotos só exigem recarregar a página.
- Com o painel do navegador oculto (`document.visibilityState === 'hidden'`), o `requestAnimationFrame` pausa: animações do MapLibre (`flyTo`, `panBy`, `easeTo`) não terminam e o `moveend` não dispara. Não interprete isso como bug; meça via JS (`window.__TEM_AGUA_BUS__.last`) ou teste com o painel visível.
- Sob emulação de viewport (mobile/custom), as capturas de tela saem reduzidas no canto; confie em medições via `getBoundingClientRect()` / `map.project()`.
- Domínios dos túneis (`*.trycloudflare.com`, `*.ngrok-free.app`) podem estar bloqueados no painel do navegador; verifique o link público com `curl` (o arquivo `tem-agua/.tunnel-url` tem o endereço atual).
