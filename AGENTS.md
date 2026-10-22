# AGENTS.md

Instruções para agentes de IA (Claude Code, Codex, Cursor, Copilot, Gemini…) neste repositório.

**Tem Água?** é um mapa colaborativo de falta d'água em Salto/SP. O app fica em `tem-agua/` (monorepo npm workspaces); `pesquisa-problemas-salto.md` é a pesquisa de mercado que motivou o produto. UI, mensagens e comentários de código são em **português (pt-BR)**.

## Comandos

Rode da raiz (`nova-startup/`) ou de `tem-agua/` — a raiz só repassa com `--prefix tem-agua`.

```bash
npm run dev          # banco (Docker) + API + mapa + painel + métricas + shell → http://localhost:4200 (métricas em /metricas)
npm run dev:ngrok    # + túnel HTTPS público via ngrok (token em tem-agua/.env.local: NGROK_AUTHTOKEN=)
npm run dev:tunnel   # + túnel HTTPS público via cloudflared (sem conta, link muda a cada execução)
npm run stop         # derruba tudo que os comandos acima subiram (portas 4200–4203/4300, túnel do script e o container db)
npm run db:psql      # abre o psql no banco
```

Dentro de `tem-agua/`:

```bash
npm run typecheck                          # tsc (mapa) + vue-tsc (painel, metricas) — NÃO cobre o shell
cd apps/shell && npx ng build              # type-check/build do shell (Angular)
npm run build                              # build de produção dos três front-ends
npm run dev -w apps/mapa                   # remoto isolado com HMR em :4201 (rode npm run stop antes)
npm run dev -w apps/painel                 # idem, :4202
npm run dev -w apps/metricas               # idem, :4203 (tem proxy /api próprio para a API em :4300)
```

Não há suíte de testes nem linter configurados. Valide com typecheck/build e rodando o app.

`npm run dev` (`scripts/dev.mjs`) recusa subir se alguma porta estiver ocupada e mostra o PID — use `npm run stop`. Ele só inicia o shell depois que os `remoteEntry.js` dos remotos respondem.

## Arquitetura

O `npm run dev` exige **Docker** (só para o banco). Os processos de app são todos servidos pela **mesma origem** (`localhost:4200`) através do proxy do Angular (`apps/shell/proxy.conf.json`):

| App | Stack | Porta | Caminho no shell |
|-----|-------|-------|------------------|
| `apps/shell` | Angular 21 (zoneless, signals) | 4200 | `/` |
| `apps/mapa` | React 19 + MapLibre GL 6 | 4201 | `/remotes/mapa/` |
| `apps/painel` | Vue 3 | 4202 | `/remotes/painel/` |
| `apps/metricas` | Vue 3 + ECharts + MapLibre | 4203 | `/remotes/metricas/` (rota `/metricas` do shell) |
| `apps/api` | Node + `pg` + `ws` | 4300 | `/api` (HTTP) e `/api/ws` (WebSocket) |
| `db` (compose) | PostgreSQL 18 + PostGIS 3.6 | 5442 (só localhost) | — |

Mesma origem é requisito: o GPS só funciona em HTTPS (um único túnel), o worker do MapLibre não pode vir de outra origem e não há CORS.

### Module Federation

- O shell **não** usa plugin de bundler: carrega os remotos com `createInstance` de `@module-federation/runtime` (`apps/shell/src/app/remotes.ts`), funcionando com o builder esbuild padrão do Angular. `RemoteSlot` monta cada remoto e isola falhas (mostra "Tentar de novo").
- Os remotos usam `@module-federation/vite` e expõem um único módulo `./mount` com o contrato `MountFn = (el) => unmount` — independente de framework. Para criar outro remoto, siga esse contrato, adicione em `REMOTES` e uma entrada no proxy.
- `base` dos remotos é `/remotes/<nome>/` em **build e preview** (`command === 'build' || isPreview` no `vite.config.ts`); só o `vite` dev standalone usa `/`.
- No `npm run dev` os remotos rodam `vite build --watch` + `vite preview` (não o dev server): alterações recompilam em ~1 s mas **exigem recarregar a página**; não há HMR no modo integrado.
- CSS dos remotos é importado com `?inline` e injetado por `mount()`. **Não use `<style>` em SFCs Vue** nem CSS importado normalmente: não chegaria ao host. Classes são prefixadas (`ta-mapa*`, `ta-pin*`, `ta-sheet*`, `ta-toast`, `ta-met*`…). Use `injectStyle`/`injectMaplibreStyle` de `contracts/src/styles.ts`: o CSS do MapLibre (usado por mapa e métricas) entra **uma vez, no início do `<head>`**. Se cada remoto injetar a própria cópia, a mais recente sobrescreve regras de mesma especificidade do outro remoto (já deixou o mapa em branco ao voltar de `/metricas`).
- `shared: {}`: cada remoto empacota seu próprio framework.

### Comunicação entre microfrontends

`packages/contracts` é a única dependência compartilhada, consumida como **código-fonte TS**: nos remotos via workspace (`exports` → `src/index.ts`); no shell via `paths` em `tsconfig.json` + `include` em `tsconfig.app.json`.

O barramento (`contracts/src/bus.ts`) guarda o estado em `window.__TEM_AGUA_BUS__` porque cada bundle tem sua própria cópia do módulo; `on()` entrega o último valor (replay) para quem monta depois. Eventos tipados em `BusEvents` (`types.ts`) — adicione lá antes de emitir algo novo:

- `reports` shell → todos (o painel de métricas usa como gatilho para recarregar) · `center` mapa → todos (posição do pin + bairro) · `report-submit` painel → shell
- `fly-to` shell/painel → mapa · `sheet-height` painel → shell · `map-padding` shell → mapa

### Indexação no Google (SEO)

- `apps/api/seo.mjs` renderiza no servidor `/bairros`, `/bairros/<slug>` (404 com `noindex` se não existir), `/sitemap.xml` e `/robots.txt`, com cache de 60 s. **Só `origem = 'app'`.** URLs absolutas: `SITE_URL` ou a origem da requisição (`X-Forwarded-Proto` + `Host`).
- A lista de bairros é `packages/contracts/src/bairros.json` (fonte única: o `bairros.ts` importa o JSON; a imagem da API copia o arquivo). `slugBairro`/`bairroPorSlug` em `geo.ts`; a API tem a mesma função de slug — mantenha iguais.
- `/?bairro=<slug>`: a `MapaPage` voa até o bairro no `map-ready` e remove o parâmetro da URL.
- `index.html` tem marcadores `__SITE_URL__` e `__GOOGLE_SITE_VERIFICATION__` trocados pelo Nginx (`sub_filter`). O Nginx agora é **template** (`docker/nginx.conf.template` → `/etc/nginx/templates/`), com `NGINX_ENVSUBST_FILTER` restrito a essas duas variáveis; use `$http_host` (mantém a porta), não `$host`. Dev: `proxy.conf.json` repassa `/bairros`, `/sitemap.xml` e `/robots.txt` para a API.
- Sem JavaScript, um `<noscript><style>` esconde a splash (o script que a fecha não roda).

### Painel de métricas só em tela grande

`/metricas` (inclusive o monitoramento) só abre com a janela de pelo menos 1024 px (`TELA_GRANDE` em `apps/shell/src/app/tela-grande.ts`, signal `telaGrande()` que acompanha redimensionar/girar). Abaixo disso a `MetricasPage` mostra um aviso ("Voltar ao mapa" / "Copiar link para o computador"), **não carrega o remoto** e fecha a splash ela mesma; o selo "Métricas" some da home. Os atalhos do PWA continuam apontando para `/metricas` (caem no aviso no celular).

### Splash screen e PWA

- Splash inline em `apps/shell/src/index.html` (HTML+CSS+script, aparece antes do JS). Fecha com `window.temAguaSplash.fechar()` (`splash.ts`): na home quando o mapa emite `map-ready` (primeiro `idle` do MapLibre); em `/metricas` via `<ta-remote-slot [fechaSplash]="true">`; em erro de remoto sempre. Mínimo de 700 ms na tela, limite de 10 s.
- PWA: `public/manifest.webmanifest` (atalhos para Métricas e Monitoramento) + `public/icons/` (SVG, 192, 512, maskable 512, apple-touch 180). Os PNGs são gerados do mesmo desenho da gota (Chrome headless). O Nginx precisa servir o manifest como `application/manifest+json` (regra própria no `nginx.conf`).

### Barra lateral e busca da home

- Desktop (≥768px): `<aside class="lateral">` na `MapaPage` reúne busca + selos + painel numa coluna de 400 px (`LARGURA_LATERAL` = padding esquerdo do mapa), com uma rolagem só e cabeçalho sticky. Celular: `display: contents` e tudo volta a flutuar sobre o mapa. **Atenção ao z-index:** dentro da coluna flex o `ta-remote-slot.sheet` é item de flex, e em item de flex o `z-index` vale mesmo com `position: static` — por isso ele é `auto` no desktop (com 10 o painel cobria sugestões e selos). No celular a busca fica em z 20 acima do sheet (z 10), e o shell passa `--ta-sheet-max` para o sheet nunca subir por baixo da busca.
- Autocompletar (`search-bar.ts`): vazio → "Sua localização" (emite `locate`) + buscas recentes (`localStorage` `tem-agua:buscas-recentes`); digitando → bairros locais na hora + `GET /api/geocode?q=` com debounce de 250 ms; setas/Enter/Esc, trecho casado em negrito (o `@for` do título fica numa linha só: quebra de linha vira espaço entre os trechos). Endereço/lugar → zoom 17; bairro → 15,5.
- `apps/api/geocode.mjs`: proxy com cache (1 dia, 1000 entradas) e limite de 60/min por IP para o **Photon** (komoot, OSM) — o Nominatim proíbe autocompletar. Filtra `city = Salto` (o recorte pega Itu/Indaiatuba) e também busca a variante com algarismos ("nove de julho" → "9 de julho", como as ruas estão no OSM). `PHOTON_URL` troca o servidor.

### Ranking de bairros da home (`apps/painel`)

Filtro 1 h / 6 h / 24 h / 7 dias (calculado no cliente a partir de `reports`; escolha em `localStorage` `tem-agua:ranking-periodo`). Ranking só com bairros que tiveram falta; os que só tiveram "água voltou" (último relato do período = volta) aparecem em "Água voltando" como etiquetas. Visual diferente por `matchMedia('(min-width: 768px)')`: desktop = lista sempre visível (sem alça), top 10, barra empilhada falta/volta + números + último relato; celular = dentro do sheet expandido, top 5, barra só de falta + contagem; ambos com "Ver todos". O status "Provável falta de água" do topo continua usando 6 h, independente do filtro.

Abrir/fechar no celular (alça `ta-sheet__grip`, arrastar ou tocar no fundo escurecido `.ta-fundo`): `<Transition :css="false">` com Web Animations API em `Painel.vue`. A altura vai só até o que cabe no `max-height` do sheet (senão parece um salto) e padding/borda de `.ta-sheet__more` animam junto (com `border-box`, zerar só a altura deixa ~30 px e dá um salto no fim). Sem animação no desktop e com `prefers-reduced-motion`.

### Layout e posição do pin

O shell tem duas rotas (`app.routes.ts`): `/` (`MapaPage`) e `/metricas` (`MetricasPage`, lazy). O `ReportsService` é injetado no `App` raiz para o WebSocket ficar vivo nas duas.

A `MapaPage` é dona do layout do mapa e emite `map-padding`: desktop (≥768px) `{ left: 432 }` (painel flutuante à esquerda); celular `{ top: 88, bottom: <sheet-height> }`. O mapa aplica esse padding e posiciona o pin no centro da área livre — portanto **`map.getCenter()` é exatamente a posição do pin**. Se mudar a altura da busca ou a largura do painel, atualize esses números em `mapa-page.ts`.

Arrastar o pin (`MapaApp.tsx`) faz `map.panBy(offset)` enquanto o pin volta ao centro na mesma animação (`flushSync` + reflow forçado antes de zerar o deslocamento, para a transição CSS disparar).

O MapLibre procuraria o worker ao lado do próprio módulo (que foi empacotado no chunk do remoto); por isso o worker é importado com `?url` e passado em `setWorkerUrl`.

### Dados, tempo real e privacidade

- `ReportsService` (shell) junta duas fontes: os relatos do **servidor** (de todos os aparelhos) e os **deste aparelho** (`mine`, posição exata, `localStorage` `tem-agua:my-reports:v2`, com `synced` para reenvio ao reconectar). Atualizações chegam por WebSocket; ao (re)conectar faz `GET /api/reports`.
- A posição exata nunca sai do aparelho: `toPublicReport()` arredonda antes do POST e a API arredonda de novo. Precisão = `PUBLIC_DECIMALS = 4` (~11 m) — **mantenha igual em `packages/contracts/src/geo.ts` e `apps/api/server.mjs`**. Com 3 casas (~110 m) o mesmo ponto ficava ~90 px deslocado entre aparelhos.
- A API (`apps/api/server.mjs`) valida campos, só aceita pontos dentro de `SALTO_BOUNDS`, limita relatos por minuto (10 por aparelho, 30 por IP — `cf-connecting-ip`/`x-forwarded-for`) e trata reenvio do mesmo `id` sem duplicar. Conecta com retentativas e aplica `apps/api/db/schema.sql` (idempotente) a cada inicialização; `DATABASE_URL` padrão é `postgres://temagua:temagua@localhost:5442/temagua` (no Docker, `@db:5432`). Na primeira subida importa e renomeia o antigo `apps/api/data/reports.json`, se existir.
- Banco (`db/schema.sql`): tabela `relatos` com `criado_em timestamptz` e colunas **geradas** `dia`/`hora` (fuso `America/Sao_Paulo`) e `geom geography(Point)`; índices em (dia, hora), criado_em, bairro e GiST em geom. `origem` só aceita `'app'` (a coluna fica para outras fontes no futuro). **O projeto não tem dados de demonstração:** o `schema.sql` apaga relatos de outra origem que sobrarem em bancos antigos; todas as consultas filtram `origem = 'app'`. `/api/reports?horas=1..168` (padrão 24 h); o shell pede 168 h (7 dias) para o ranking da home, e o mapa filtra 24 h.
- Métricas (`apps/api/metricas.mjs`): `GET /api/metricas?de&ate&bairro` devolve tudo do painel numa resposta (resumo + comparação com o período anterior, série com zeros preenchidos — por hora até 2 dias, por dia acima —, dia da semana × hora, bairros, grade de ~200 m via `ST_SnapToGrid`, 50 recentes); `GET /api/relatorios/relatos.csv` (`;` + BOM para Excel pt-BR); `GET /api/metricas/bairros`. Datas são validadas (calendário real, máx. 366 dias).
- Painel (`apps/metricas`): ECharts com renderer SVG (impressão nítida). "Sem água"/"água voltou" são cores de **status** cujo par vermelho/verde fica na faixa de daltonismo (ΔE deutan 6,8) — por isso legenda sempre visível, posição fixa na pilha, gap de 2 px, tooltip e "Ver tabela"; o heatmap usa rampa sequencial de um tom (`RAMPA` em `charts.ts`). O mapa usa `preserveDrawingBuffer` para sair no "Imprimir / PDF". Atualiza ao receber `reports` no barramento (debounce 1,5 s) e a cada 60 s; ao recarregar mantém o quadro anterior esmaecido.
- Relatório PDF (`components/Relatorio.vue` + `MapaImagem.vue`): botão "Relatório PDF" monta um layout A4 próprio fora da tela (3 páginas: resumo escrito a partir dos dados + indicadores + série + mapa; dia×hora + ranking + "Sobre os dados"; tabelas), gráficos sem animação, mapa convertido em PNG (`preserveDrawingBuffer`, `pixelRatio: 2`), espera "pronto" e chama `window.print()`. `@page` com margin boxes ("Página X de Y"). Ctrl+P sem isso imprime a tela.
- Modo monitoramento (`components/MonitorMapa.vue`, botão "Monitoramento" ou URL `/metricas?modo=monitor`): só o mapa de calor da falta d'água, em tela cheia (Fullscreen API + overlay via `<Teleport to="body">`), usando `GET /api/monitor?horas=1..72`. Duas camadas de calor — falta (vermelho, `RAMPA`) por cima de água voltou (verde, `RAMPA_VOLTOU`) — que **pulsam continuamente em contrafase** (rAF ~20 fps mexendo em `heatmap-intensity`/`heatmap-opacity`; o ritmo diferencia as cores para daltonismo; estático com `prefers-reduced-motion`). Peso no calor decai com a idade do relato; anéis só para relatos criados depois da carga anterior (trocar a janela não dispara anéis); relato novo vira um `Marker` com anel pulsante — a animação fica num **filho** do elemento do marker, porque o MapLibre posiciona o marker com `transform` e um `transform` animado no próprio elemento o joga para (0,0). Wake Lock, cursor oculto após 3 s, Esc fecha. Enquanto aberto, o painel por baixo não recarrega.
- Tempo real é **WebSocket, não SSE**: os Quick Tunnels da Cloudflare seguram streams SSE.
- A API lê `API_PORT` (não `PORT`): ferramentas de dev definem `PORT=4200` para o app principal.

### Duração do relato e aparelho

- **Prazo:** `packages/contracts/src/relatos.ts` — o relato vale **12 h no mapa desde a última confirmação** (`DURACAO_MS`; `DURACAO_HORAS` em `apps/api/db.mjs` — mantenha iguais), com peso caindo pela metade a cada 3 h (`frescor`). Use `relatoAtivo`/`ultimaConfirmacao` em vez de olhar `createdAt`. O status de 6 h do painel e das páginas de bairro só conta relatos ativos; o ranking e as métricas contam todos (histórico). O mapa redesenha a cada minuto para os relatos expirarem sem precisar de relato novo.
- **Aparelho:** UUID aleatório em `localStorage` (`tem-agua:aparelho:v1`, `idDoAparelho()`), enviado só no cabeçalho `X-Aparelho` do POST. A API guarda `aparelho = HMAC-SHA256(uuid)` (segredo em `APARELHO_SEGREDO` ou gerado na tabela `configuracao`), **nunca o devolve** (não está em `RELATO_COLS`) e o apaga após 30 dias (`esquecerAparelhos`, de hora em hora).
- **Um relato ativo por aparelho** (`registrarRelato`, transação com `pg_advisory_xact_lock`): mesmo status de um ativo → renova (`confirmado_em`, posição nova, **mesmo id** — o app já reaproveita o id ao renovar e, se o servidor renovar outro, troca o id local pela resposta); status oposto → `encerrado_em` nos ativos e cria o novo. Resposta `{ report, encerrados }`; o WebSocket manda cada relato alterado e o shell faz *upsert* por id.
- **"Ainda sem água?"** (`Painel.vue`): relato `mine` de falta ativo há mais de 4 h (`RECONFIRMAR_MS`) mostra o cartão; a resposta emite `report-submit` com `reconfirmar: id`, e o shell usa a posição daquele relato.

### Setores de abastecimento (reservatórios)

- Fonte: mapa "Regiões x Reservatórios" (Google My Maps). `npm run abastecimento:importar` (`scripts/importar-abastecimento.mjs`) baixa o KML e gera `packages/contracts/src/abastecimento.json` (26 setores, ~120 áreas, ~40 estruturas), que vai para o git — nada depende do Google em tempo de execução. Nomes de exibição em `NOMES` no script (rótulo novo sem nome gera aviso).
- **Cores:** o importador colore os setores (DSATUR) com a `PALETA` de 8 cores sem vermelho/verde (status), de modo que setores a menos de 400 m nunca tenham a mesma cor nem um par de `CONFUNDEM` (pares reprovados pelo validador de paletas para daltonismo/visão normal). Ao mudar a paleta, revalide os pares.
- `contracts/src/abastecimento.ts`: `abastecimentoDoPonto` (ponto no polígono; em sobreposição vale a menor área) e `abastecimentoProximo` (aceita a área mais próxima até 300 m: os contornos desenhados à mão deixam vãos nas ruas). **Não leia propriedades do JSON no topo do módulo** (`ABASTECIMENTO.setores` só dentro de funções): senão o shell, que não usa, empacota os 50 KB.
- Mapa (`apps/mapa/src/abastecimento.ts`): camadas `abast-*` ocultas por padrão, abaixo de `reports-heat`, ligadas pelo evento `camadas` (selo "Reservatórios" do shell, guardado em `tem-agua:camada-abastecimento`; o painel também liga). O setor do pin é realçado e vai no evento `center` (`setor`, `area`, `distanciaArea`).
- Filtro de setores (`apps/shell/src/app/filtro-setores.ts`): o evento `camadas` leva `setores` (ids visíveis; `null` = todos, `[]` = nenhum) e `enquadrar` (o mapa faz `fitBounds` só quando a pessoa muda a seleção, nunca no replay ao montar). O shell guarda em `tem-agua:setores-visiveis` e usa `SETORES_RESUMO` (`abastecimento-setores.json`, também gerado pelo importador) para não empacotar os polígonos. Quem emite `camadas` deve repassar `setores` (o painel acrescenta o setor do pin à seleção em "Ver o setor no mapa").
- Monitoramento (`apps/metricas/src/setores.ts` + `components/FiltroSetores.vue`): camadas `setores-*` (preenchimento/contorno abaixo de `voltou-calor`; reservatórios/boosters em pontos na cor do setor e os nomes **por cima** do calor, senão somem embaixo da mancha); com setores escolhidos, `visiveis` filtra os relatos por `setorDoRelato` (calor, números e pulsos). Estado na URL `?setores=` (lido ao abrir; `Metricas.vue` apaga ao fechar o monitoramento) e em `tem-agua:monitor-setores`. Mudar a seleção enquadra o mapa nos setores; "Todos" (null) volta à cidade inteira (na home também). Esc com a lista aberta fecha só a lista.
- Painel: cartão do setor do pin (falta no setor agora; sugere "pode ser no reservatório" com falta em 2+ áreas e ≥ 30% delas) e ranking "Bairros | Reservatórios" (`tem-agua:ranking-agrupar`).
- API (`apps/api/abastecimento.mjs`): recarrega a tabela `areas_abastecimento` (PostGIS) a cada subida; `/api/metricas` traz `setores` (cada relato na menor área que o contém; fora das áreas não conta); as páginas de bairro dizem qual setor abastece o bairro. A imagem da API copia o JSON (`api.Dockerfile`).

### Túneis (`scripts/tunnel.mjs`)

- ngrok via SDK `@ngrok/ngrok` (sem instalar nada no sistema); token em `NGROK_AUTHTOKEN` (env, `tem-agua/.env.local` ou config do ngrok); `NGROK_DOMAIN` opcional para link fixo.
- cloudflared via Quick Tunnel (`*.trycloudflare.com`).
- O link fica em `tem-agua/.tunnel-url`; o `stop` encerra só o PID em `.tunnel-pid` (não mexe em outros túneis do usuário).
- Hosts dos túneis precisam estar em `allowedHosts` no `angular.json`.

### Mapa e geografia

- Estilo `positron` da OpenFreeMap (sem chave, uso comercial liberado).
- `contracts/src/bairros.ts`: 91 centroides de bairros extraídos do OpenStreetMap; `nearestBairro()` dá o bairro do pin. `SALTO_BOUNDS` limita o mapa, o GPS ("fora de Salto") e a API.

## Docker

`compose.yaml` (raiz) + `tem-agua/docker/`. Contexto de build é `tem-agua/` (ver `tem-agua/.dockerignore`).

```bash
npm run docker:up      # web (Nginx) + api → http://localhost:8080
npm run docker:down    # inclui os perfis ngrok/cloudflared; "docker compose down" puro não derruba os túneis
```

- `db`: `postgis/postgis:18-3.6-alpine`, volume `banco` em `/var/lib/postgresql` (layout do PG 18), porta `127.0.0.1:5442` (a 5433 é de outro projeto do usuário). O `npm run dev` sobe **este mesmo serviço**: dev e Docker compartilham os dados.
- `web`: build multi-stage (`npm ci` + `npm run build` em node:22-alpine) → nginx:1.30-alpine. `docker/nginx.conf` faz o papel do `proxy.conf.json` do dev: `/remotes/<nome>/` estático, `^~ /api/` e `= /api/ws` (upgrade) para `api:4300`, SPA fallback no `/`.
- `api`: sem estado; `DATABASE_URL` aponta para `db`; trata SIGTERM (fecha WebSockets e o pool).
- Ao adicionar um remoto novo, além do `REMOTES`/`proxy.conf.json`, copie o `dist` dele em `web.Dockerfile` e inclua o `package.json` dele no estágio de `npm ci`.
- No Git Bash do Windows, use `MSYS_NO_PATHCONV=1` em `docker run` com caminhos como `/bin/sh`.

## Restrições do ambiente

- Node local é 20.x → **Angular 21** (o 22 exige Node 22+) e `concurrently` ^9 (o 10 exige Node 22).
- `tem-agua/.npmrc` tem `legacy-peer-deps=true`: sem ele o `npm install` falha com um bug do npm 10 (`Cannot read properties of null (reading 'edgesOut')`).
- Repositório: https://github.com/victorandrad/temagua.app (público, branch `main`, raiz do git = `nova-startup/`).
