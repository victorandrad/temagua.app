# AGENTS.md

Instruções para agentes de IA (Claude Code, Codex, Cursor, Copilot, Gemini…) neste repositório.

**Tem Água?** é um mapa colaborativo de falta d'água em Salto/SP. O app fica em `tem-agua/` (monorepo npm workspaces); `pesquisa-problemas-salto.md` é a pesquisa de mercado que motivou o produto. UI, mensagens e comentários de código são em **português (pt-BR)**.

## Comandos

Rode da raiz (`nova-startup/`) ou de `tem-agua/` — a raiz só repassa com `--prefix tem-agua`.

```bash
npm run dev          # API + mapa + painel + shell → http://localhost:4200
npm run dev:ngrok    # + túnel HTTPS público via ngrok (token em tem-agua/.env.local: NGROK_AUTHTOKEN=)
npm run dev:tunnel   # + túnel HTTPS público via cloudflared (sem conta, link muda a cada execução)
npm run stop         # derruba tudo que os comandos acima subiram (portas 4200/4201/4202/4300 + túnel do script)
```

Dentro de `tem-agua/`:

```bash
npm run typecheck                          # tsc (mapa) + vue-tsc (painel) — NÃO cobre o shell
cd apps/shell && npx ng build              # type-check/build do shell (Angular)
npm run build                              # build de produção dos três front-ends
npm run dev -w apps/mapa                   # remoto isolado com HMR em :4201 (rode npm run stop antes)
npm run dev -w apps/painel                 # idem, :4202
```

Não há suíte de testes nem linter configurados. Valide com typecheck/build e rodando o app.

`npm run dev` (`scripts/dev.mjs`) recusa subir se alguma porta estiver ocupada e mostra o PID — use `npm run stop`. Ele só inicia o shell depois que os `remoteEntry.js` dos remotos respondem.

## Arquitetura

Quatro processos, todos servidos pela **mesma origem** (`localhost:4200`) através do proxy do Angular (`apps/shell/proxy.conf.json`):

| App | Stack | Porta | Caminho no shell |
|-----|-------|-------|------------------|
| `apps/shell` | Angular 21 (zoneless, signals) | 4200 | `/` |
| `apps/mapa` | React 19 + MapLibre GL 6 | 4201 | `/remotes/mapa/` |
| `apps/painel` | Vue 3 | 4202 | `/remotes/painel/` |
| `apps/api` | Node + `ws` | 4300 | `/api` (HTTP) e `/api/ws` (WebSocket) |

Mesma origem é requisito: o GPS só funciona em HTTPS (um único túnel), o worker do MapLibre não pode vir de outra origem e não há CORS.

### Module Federation

- O shell **não** usa plugin de bundler: carrega os remotos com `createInstance` de `@module-federation/runtime` (`apps/shell/src/app/remotes.ts`), funcionando com o builder esbuild padrão do Angular. `RemoteSlot` monta cada remoto e isola falhas (mostra "Tentar de novo").
- Os remotos usam `@module-federation/vite` e expõem um único módulo `./mount` com o contrato `MountFn = (el) => unmount` — independente de framework. Para criar outro remoto, siga esse contrato, adicione em `REMOTES` e uma entrada no proxy.
- `base` dos remotos é `/remotes/<nome>/` em **build e preview** (`command === 'build' || isPreview` no `vite.config.ts`); só o `vite` dev standalone usa `/`.
- No `npm run dev` os remotos rodam `vite build --watch` + `vite preview` (não o dev server): alterações recompilam em ~1 s mas **exigem recarregar a página**; não há HMR no modo integrado.
- CSS dos remotos é importado com `?inline` e injetado por `mount()`. **Não use `<style>` em SFCs Vue** nem CSS importado normalmente: não chegaria ao host. Classes são prefixadas (`ta-mapa*`, `ta-pin*`, `ta-sheet*`, `ta-toast`…).
- `shared: {}`: cada remoto empacota seu próprio framework.

### Comunicação entre microfrontends

`packages/contracts` é a única dependência compartilhada, consumida como **código-fonte TS**: nos remotos via workspace (`exports` → `src/index.ts`); no shell via `paths` em `tsconfig.json` + `include` em `tsconfig.app.json`.

O barramento (`contracts/src/bus.ts`) guarda o estado em `window.__TEM_AGUA_BUS__` porque cada bundle tem sua própria cópia do módulo; `on()` entrega o último valor (replay) para quem monta depois. Eventos tipados em `BusEvents` (`types.ts`) — adicione lá antes de emitir algo novo:

- `reports` shell → todos · `center` mapa → todos (posição do pin + bairro) · `report-submit` painel → shell
- `fly-to` shell/painel → mapa · `sheet-height` painel → shell · `map-padding` shell → mapa

### Layout e posição do pin

O shell é dono do layout (`app.ts`) e emite `map-padding`: desktop (≥768px) `{ left: 432 }` (painel flutuante à esquerda); celular `{ top: 88, bottom: <sheet-height> }`. O mapa aplica esse padding e posiciona o pin no centro da área livre — portanto **`map.getCenter()` é exatamente a posição do pin**. Se mudar a altura da busca ou a largura do painel, atualize esses números em `app.ts`.

Arrastar o pin (`MapaApp.tsx`) faz `map.panBy(offset)` enquanto o pin volta ao centro na mesma animação (`flushSync` + reflow forçado antes de zerar o deslocamento, para a transição CSS disparar).

O MapLibre procuraria o worker ao lado do próprio módulo (que foi empacotado no chunk do remoto); por isso o worker é importado com `?url` e passado em `setWorkerUrl`.

### Dados, tempo real e privacidade

- `ReportsService` (shell) junta três fontes: relatos de **demonstração** (gerados no cliente, `demo: true`), do **servidor** (de todos os aparelhos) e os **deste aparelho** (`mine`, posição exata, `localStorage` `tem-agua:my-reports:v2`, com `synced` para reenvio ao reconectar). Atualizações chegam por WebSocket; ao (re)conectar faz `GET /api/reports`.
- A posição exata nunca sai do aparelho: `toPublicReport()` arredonda antes do POST e a API arredonda de novo. Precisão = `PUBLIC_DECIMALS = 4` (~11 m) — **mantenha igual em `packages/contracts/src/geo.ts` e `apps/api/server.mjs`**. Com 3 casas (~110 m) o mesmo ponto ficava ~90 px deslocado entre aparelhos.
- A API (`apps/api/server.mjs`) valida campos, só aceita pontos dentro de `SALTO_BOUNDS`, limita 10 relatos/min por IP (`cf-connecting-ip`/`x-forwarded-for`), guarda 7 dias em `apps/api/data/reports.json` (gitignored) e deduplica por `id`. É protótipo: o plano é trocar o JSON por banco (ex.: Postgres/PostGIS, Supabase) sem mudar os remotos.
- Tempo real é **WebSocket, não SSE**: os Quick Tunnels da Cloudflare seguram streams SSE.
- A API lê `API_PORT` (não `PORT`): ferramentas de dev definem `PORT=4200` para o app principal.

### Túneis (`scripts/tunnel.mjs`)

- ngrok via SDK `@ngrok/ngrok` (sem instalar nada no sistema); token em `NGROK_AUTHTOKEN` (env, `tem-agua/.env.local` ou config do ngrok); `NGROK_DOMAIN` opcional para link fixo.
- cloudflared via Quick Tunnel (`*.trycloudflare.com`).
- O link fica em `tem-agua/.tunnel-url`; o `stop` encerra só o PID em `.tunnel-pid` (não mexe em outros túneis do usuário).
- Hosts dos túneis precisam estar em `allowedHosts` no `angular.json`.

### Mapa e geografia

- Estilo `positron` da OpenFreeMap (sem chave, uso comercial liberado).
- `contracts/src/bairros.ts`: 91 centroides de bairros extraídos do OpenStreetMap; `nearestBairro()` dá o bairro do pin. `SALTO_BOUNDS` limita o mapa, o GPS ("fora de Salto") e a API.

## Restrições do ambiente

- Node local é 20.x → **Angular 21** (o 22 exige Node 22+) e `concurrently` ^9 (o 10 exige Node 22).
- `tem-agua/.npmrc` tem `legacy-peer-deps=true`: sem ele o `npm install` falha com um bug do npm 10 (`Cannot read properties of null (reading 'edgesOut')`).
- Repositório: https://github.com/victorandrad/temagua.app (público, branch `main`, raiz do git = `nova-startup/`).
