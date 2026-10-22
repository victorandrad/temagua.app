# Tem Água? · Salto

Mapa colaborativo de falta d'água em Salto/SP, com interface inspirada no app da Uber: mapa em tela cheia, pin central e bottom sheet.

Cada parte é um **microfrontend em um framework diferente**, ligado por **Module Federation**:

| App | Framework | Porta | Responsabilidade |
|-----|-----------|-------|------------------|
| `apps/shell` | Angular 21 | 4200 | Layout, busca de bairro, dono dos relatos (`ReportsService`), carrega os remotos |
| `apps/mapa` | React 19 + MapLibre | 4201 | Mapa, pin arrastável, mapa de calor dos relatos, botão "minha localização" |
| `apps/metricas` | Vue 3 + ECharts + MapLibre | 4203 | Painel de métricas e relatórios em `/metricas`: indicadores, série por hora/dia, dia da semana × hora, ranking e mapa por área, CSV e PDF — em tempo real |
| `apps/painel` | Vue 3 | 4202 | Bottom sheet: status da região, "Estou sem água" / "A água voltou", ranking de bairros |
| `apps/api` | Node + PostgreSQL + ws | 4300 | Recebe os relatos, grava no banco e avisa todos os aparelhos em tempo real (WebSocket); serve as métricas e o CSV |
| `db` | PostgreSQL 18 + PostGIS | 5442 | Relatos por dia, hora e coordenadas (serviço do `compose.yaml`; sobe sozinho no `npm run dev`) |
| `packages/contracts` | TypeScript | — | Tipos, barramento de eventos e dados dos bairros, compartilhados por todos |

## Rodando

Requer Node 20.19+ e **Docker** (o banco de dados roda num container, mesmo no `npm run dev`). Os comandos funcionam tanto na pasta `tem-agua` quanto na raiz `nova-startup`.

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe banco, API, mapa, painel, métricas e shell em http://localhost:4200 |
| `npm run dev:ngrok` | O mesmo + túnel HTTPS do **ngrok**, com o link público em destaque (para o celular/GPS) |
| `npm run dev:tunnel` | O mesmo, mas com o túnel do **cloudflared** (sem conta) |
| `npm run stop` | Derruba tudo que os comandos acima subiram (inclusive o túnel e o container do banco; os dados ficam) |
| `npm run db:psql` | Abre o `psql` no banco |

No Windows também dá para dar dois cliques em `iniciar.cmd` (usa o ngrok) / `parar.cmd`, na raiz `nova-startup`.

O que o `scripts/dev.mjs` faz:
1. Confere a versão do Node e instala as dependências se faltar `node_modules`.
2. Sobe o container do banco (`db`) e confere se as portas 4200–4203 e 4300 estão livres. Se não estiverem, mostra o PID e o processo de cada uma e sugere o `npm run stop`.
3. Sobe a API e os remotos; o shell só sobe depois que os `remoteEntry.js` respondem (sem "falha ao carregar" na primeira abertura).
4. Com `--tunnel=ngrok` ou `--tunnel=cloudflared`, espera o shell e abre o túnel. O link também fica salvo em `tem-agua/.tunnel-url`.

Se um processo cair, os outros são derrubados; Ctrl+C para tudo. Os remotos rodam em `vite build --watch` + `vite preview`: cada alteração recompila em ~1 s, recarregue a página para ver.

Para desenvolver um remoto isolado com hot reload: `npm run stop`, depois `npm run dev -w apps/mapa` (http://localhost:4201) `npm run dev -w apps/painel` (http://localhost:4202) ou `npm run dev -w apps/metricas` (http://localhost:4203, com proxy próprio de `/api`).

### Testar no celular (com GPS)

O navegador só libera o GPS em HTTPS: use `npm run dev:ngrok` (ou `iniciar.cmd`) e abra no celular o link que aparece em destaque. O link é **público** enquanto o túnel estiver aberto.

**ngrok** (usa o SDK oficial `@ngrok/ngrok`, já instalado no projeto; nada para instalar no sistema):
1. Crie uma conta gratuita em https://dashboard.ngrok.com/signup e copie o token em https://dashboard.ngrok.com/get-started/your-authtoken.
2. Cole em `tem-agua/.env.local` (fora do git): `NGROK_AUTHTOKEN=seu_token`. O script também aceita a variável de ambiente ou o token do `ngrok config add-authtoken`.
3. Opcional: o plano gratuito dá **um domínio fixo** (https://dashboard.ngrok.com/domains). Coloque em `NGROK_DOMAIN=algo.ngrok-free.app` e o link deixa de mudar.
4. No plano gratuito, a primeira visita mostra uma tela de aviso do ngrok: toque em "Visit Site".

**cloudflared** (`npm run dev:tunnel`): não precisa de conta, mas o link `*.trycloudflare.com` muda a cada execução e o cloudflared precisa estar instalado.

Sem token/cloudflared, o app sobe normalmente em localhost e o terminal mostra o que fazer.

Isso funciona porque o shell serve tudo pela mesma origem: o `proxy.conf.json` do Angular repassa `/remotes/mapa` → porta 4201, `/remotes/painel` → porta 4202, `/remotes/metricas` → porta 4203 e `/api` (HTTP e WebSocket) → porta 4300. O `angular.json` libera os hosts do cloudflared e do ngrok.

## Como os microfrontends se integram

- **Carregamento**: o shell usa só o runtime do Module Federation (`@module-federation/runtime`), sem plugin de bundler. Assim ele funciona com o builder esbuild padrão do Angular. Os remotos usam `@module-federation/vite` e expõem `./mount`.
- **Contrato de montagem**: cada remoto expõe `mount(el) => unmount`, independente de framework. O shell não sabe se do outro lado tem React ou Vue.
- **Mesma origem**: o shell carrega os remotos de `/remotes/mapa/` e `/remotes/painel/`. Sem CORS, worker do MapLibre liberado e um único endereço HTTPS.
- **Comunicação**: um barramento de eventos (`packages/contracts/src/bus.ts`) guardado no `window` com *replay* do último valor, para que um app que monta depois não perca o estado. Eventos e payloads estão tipados em `BusEvents` (`types.ts`):
  - `reports`: shell → todos (lista de relatos)
  - `center`: mapa → todos (posição do pin + bairro mais próximo)
  - `report-submit`: painel → shell
  - `fly-to`: shell/painel → mapa
  - `sheet-height`: painel → shell
  - `map-padding`: shell → mapa (área coberta pelo layout, para centralizar o pin)
- **Isolamento de falhas**: se um remoto não carregar, só aquela área mostra erro com "Tentar de novo" (`remote-slot.ts`).
- **CSS**: cada remoto injeta o próprio CSS (importado com `?inline`), com classes prefixadas (`ta-mapa-*`, `ta-pin*`, `ta-sheet*`).

## Decisões e detalhes

- **Mapa**: estilo `positron` da [OpenFreeMap](https://openfreemap.org), gratuito, sem chave de API e com uso comercial liberado.
- **Worker do MapLibre**: o MapLibre procuraria o worker ao lado do chunk empacotado, onde ele não existe. Por isso o worker é publicado como asset e configurado com `setWorkerUrl` (`MapaApp.tsx`).
- **GPS**: o botão de localização usa alta precisão, mostra o ponto azul com o círculo de precisão e avisa quando a permissão é negada, o GPS falha, a precisão é ruim (> 50 m) ou a pessoa está fora de Salto.
- **Pin**: dá para arrastar o mapa (o pin fica fixo no centro) **ou** o próprio pin. Ao soltar o pin, o mapa desliza até o ponto escolhido e o pin volta ao centro na mesma animação.
- **Privacidade (LGPD)**: a posição exata fica só no aparelho, para o ponto aparecer onde o pin estava. O que vai para o servidor passa por `toPublicReport()` e é arredondado de novo na API, para ~11 m (`PUBLIC_DECIMALS = 4`). Com ~110 m (3 casas) o ponto ficava ~90 px deslocado entre aparelhos.
- **Bairros**: 91 centroides aproximados extraídos do OpenStreetMap (`packages/contracts/src/bairros.json`, fonte única para o front e a API).
- **Tempo real**: um relato feito em qualquer aparelho aparece nos outros em ~1 s. O `ReportsService` (shell) junta duas fontes: os relatos do servidor (posição arredondada) e os deste aparelho (posição exata, no `localStorage`). Se a conexão cair, o indicador vira "Reconectando…", o relato fica pendente e é reenviado ao reconectar.
- **Por que WebSocket e não SSE**: os Quick Tunnels da Cloudflare (`trycloudflare.com`) seguram streams de Server-Sent Events; WebSocket passa normalmente.
- **API**: valida os dados, aceita só posições dentro de Salto, arredonda a posição no servidor (nunca guarda a exata), limita relatos por minuto (10 por aparelho, 30 por IP) e ignora relatos repetidos (mesmo `id`). Grava no PostgreSQL + PostGIS (ver abaixo).
- **Duração do relato**: 12 h no mapa desde a última confirmação, com o peso caindo pela metade a cada 3 h. O rodízio de Salto é de 24 h com e 24 h sem água: com 24 h, a falta de ontem aparecia no dia em que a água volta. Depois de 4 h, quem avisou vê "Ainda sem água?" e pode renovar ou encerrar.
- **Um relato ativo por aparelho**: o app cria um UUID aleatório na primeira visita (o navegador não dá acesso a IMEI ou ID de hardware) e o envia no cabeçalho `X-Aparelho`. A API guarda só um HMAC dele, nunca o devolve e apaga o vínculo após 30 dias. Relatar de novo o mesmo status renova o relato; o status oposto encerra o anterior. Não é antifraude (dá para gerar outro UUID limpando os dados), mas impede que alguém infle o ranking apertando o botão várias vezes. Em produção, defina `APARELHO_SEGREDO`; sem ele, a API gera um e guarda na tabela `configuracao`.
- **Busca de endereço**: autocompletar pelo [Photon](https://photon.komoot.io) (OpenStreetMap), passando pela API (`/api/geocode`, com cache e limite por IP) e filtrado para Salto. O Nominatim proíbe uso como autocompletar.
- **Angular 21 em vez de 22**: o Angular 22 exige Node 22+. Com Node 22+ instalado, dá para atualizar com `ng update`.

## Banco de dados e métricas

> O painel de métricas (e o modo monitoramento) só abre em tela grande, com pelo menos 1024 px de largura: computador, notebook, TV ou tablet deitado. No celular, `/metricas` mostra um aviso com "Voltar ao mapa" e "Copiar link para o computador", e o selo "Métricas" não aparece na home.


Cada relato é uma linha da tabela `relatos` (`apps/api/db/schema.sql`, aplicado pela API ao subir): `id`, `status`, `bairro`, `lat`/`lng` (já arredondados para ~11 m), `origem` e `criado_em`, mais colunas calculadas pelo próprio PostgreSQL — **`dia`** e **`hora`** no fuso de Salto e **`geom`** (ponto PostGIS, com índice espacial).

O painel em **`/metricas`** consulta `GET /api/metricas?de=AAAA-MM-DD&ate=AAAA-MM-DD&bairro=...` (uma resposta com tudo) e se atualiza sozinho quando chega um relato novo. "Exportar CSV" baixa `/api/relatorios/relatos.csv` com os mesmos filtros (dia, hora, data/hora, bairro, status, latitude, longitude; separador `;` para o Excel em português). "Imprimir / PDF" gera o relatório pelo navegador, sem os controles.

**Modo monitoramento:** o botão "Monitoramento" (ou o link direto `/metricas?modo=monitor`, para deixar numa TV) mostra só o mapa de calor da falta d'água em tela cheia, atualizando em tempo real: cada relato novo pisca no mapa no instante em que chega, os mais antigos esfriam com o tempo e dá para escolher a janela (1 h, 6 h ou 24 h). A tela não apaga sozinha, o cursor some quando parado e Esc sai.

O projeto não tem dados de demonstração: o mapa, o ranking, as métricas e o monitoramento mostram só relatos reais feitos no app.

## Setores de abastecimento (reservatórios)

Os setores vêm do mapa [Regiões x Reservatórios](https://www.google.com/maps/d/viewer?mid=1AOlAX-928WBFPFp75o7oMY4K_aIG6bk): 26 centros de reservação, as ~120 áreas que cada um atende e os reservatórios/boosters. `npm run abastecimento:importar` baixa o mapa de novo e regrava `packages/contracts/src/abastecimento.json`.

- **Escolher setores:** com a camada ligada, o selo "Todos os setores ▾" abre a lista dos setores com caixas de marcar, "só este", "Todos" e "Nenhum". O mapa mostra só os escolhidos e se enquadra neles; a escolha fica no aparelho (`tem-agua:setores-visiveis`).
- **No mapa:** o selo "Reservatórios" liga as áreas, uma cor por setor; setores vizinhos nunca repetem cor nem usam cores que se confundem. Vermelho e verde ficam de fora porque já significam "sem água" e "água voltou". O setor do pin fica realçado; tocar num reservatório mostra o nome.
- **No painel:** o cartão "Abastecimento" diz qual setor atende o ponto. Se o pin cair num vão entre áreas, mostra a área mais próxima, até 300 m. Também mostra quantos relatos de falta há no setor agora. Com falta em várias áreas do mesmo setor, avisa que o problema pode ser no reservatório. O ranking agrupa por bairro ou por reservatório.
- **No monitoramento:** o botão "Setores" mostra o contorno e o nome dos setores por baixo do calor, com a mesma lista de escolha da home. Com setores escolhidos, o calor, os números e os pulsos de relato novo contam só os relatos desses setores. A escolha fica na URL (`?modo=monitor&setores=todos` ou `&setores=panorama,santa-cruz`) e no aparelho (`tem-agua:monitor-setores`).
- **Nas métricas:** "Por reservatório" mostra os relatos de falta por setor e em quantas áreas apareceram (PostGIS: cada relato cai na menor área que o contém).
- **Nas páginas de bairro:** "Qual reservatório abastece o <bairro>" lista o setor, os reservatórios e as outras áreas atendidas.
- **Fora do mapa:** chácaras e áreas rurais ficam de fora (22 dos 91 bairros não caem em nenhuma área).

## Indexação no Google (SEO)

O app é uma SPA (microfrontends carregados por JavaScript), então a API também serve **páginas HTML prontas** para o Google:

| URL | O que é |
|-----|---------|
| `/bairros/<bairro>` (ex.: `/bairros/jardim-nair-maria`) | Situação da água no bairro agora, contagens de 24 h / 7 dias / 30 dias, bairros próximos e botão para o mapa já no bairro. Título e descrição próprios para buscas como "falta de água jardim nair maria salto" |
| `/bairros` | Índice com os 91 bairros, os com falta primeiro |
| `/sitemap.xml` | Home, métricas, índice e todas as páginas de bairro (com `lastmod` do último relato) |
| `/robots.txt` | Libera o site; bloqueia CSV, autocompletar e o modo TV; aponta o sitemap |

- As páginas usam os relatos reais do app.
- A home tem título/descrição de busca, `canonical`, Open Graph com imagem (`icons/og.png`, para links no WhatsApp/redes), JSON-LD (`WebApplication`) e conteúdo em `<noscript>`.
- `/?bairro=<bairro>` abre o mapa direto no bairro (é o destino dos botões das páginas de bairro).

**Para colocar no ar** (no `.env` da raiz ou no ambiente do `docker compose`):

```bash
SITE_URL=https://seu-dominio.com.br           # vira o canonical, o sitemap e o Open Graph
GOOGLE_SITE_VERIFICATION=codigo-do-search-console
```

Sem `SITE_URL`, as URLs usam a origem da requisição (útil no dev e no túnel). Depois, no [Google Search Console](https://search.google.com/search-console): adicione o domínio (verificação por meta tag usa o código acima; por DNS não precisa de nada aqui) e envie `https://seu-dominio.com.br/sitemap.xml`. O Google não aceita mais "ping" de sitemap — o envio é pelo Search Console.

## Docker

Infra de produção em containers, definida em `compose.yaml` (raiz do repositório):

| Container | Imagem | O que faz |
|-----------|--------|-----------|
| `web` | `docker/web.Dockerfile` — build em `node:22-alpine`, runtime `nginx:1.30-alpine` | Compila os três front-ends e serve tudo na mesma origem: shell em `/`, remotos em `/remotes/<nome>/`, proxy de `/api` e do WebSocket `/api/ws` para a API (`docker/nginx.conf`) |
| `db` | `postgis/postgis:18-3.6-alpine` | Banco; dados no volume `banco`. Porta `127.0.0.1:5442` para ferramentas de BD |
| `api` | `docker/api.Dockerfile` — `node:22-alpine`, usuário sem root | API de relatos e métricas (sem estado; usa o `db`) |
| `ngrok` | `ngrok/ngrok:3` (perfil `ngrok`) | Link público; lê `NGROK_AUTHTOKEN`/`NGROK_DOMAIN` de `tem-agua/.env.local`; painel com o link em http://localhost:4040 |
| `cloudflared` | `cloudflare/cloudflared` (perfil `cloudflared`) | Link público sem conta; o link aparece em `docker compose logs cloudflared` |

Da raiz do repositório:

```bash
npm run docker:up       # build + sobe web e api → http://localhost:8080 (porta: WEB_PORT=xxxx)
npm run docker:ngrok    # + túnel ngrok
npm run docker:tunnel   # + túnel cloudflared
npm run docker:logs     # acompanha os logs
npm run docker:down     # para tudo (inclusive os túneis); os relatos ficam no volume
```

Para apagar também os relatos salvos: `docker compose down -v`. O `npm run dev` usa o mesmo serviço `db`, então dev e Docker enxergam os mesmos dados.

Detalhes do Nginx: `remoteEntry.js` e `index.html` sempre revalidam (deploy novo aparece sem limpar cache); arquivos com hash têm cache de 1 ano; o worker `.mjs` do MapLibre sai com MIME de JavaScript; gzip ligado; `/healthz` para healthcheck. A API recebe `SIGTERM` e fecha as conexões antes de sair.

## Deploy

### Produção: VPS da Hostinger (https://saltotemagua.victorandra.de)

O app roda no VPS em `/opt/tem-agua`, atrás do **Traefik** que já existe no servidor (HTTPS automático com Let's Encrypt):

- **O VPS não tem o código** (nada de `git clone`): a pasta guarda só `.env`, `compose.yaml` e `compose.producao.yaml`. A cada deploy o workflow manda os dois arquivos de compose do commit, e as imagens vêm prontas do registro do GitHub.
- `compose.producao.yaml` (raiz) completa o `compose.yaml`: tira as portas publicadas e o `build` e põe os labels do Traefik para `${DOMINIO}`. Só o Traefik chega ao `web`, pela rede `tem-agua_default`.
- `/opt/tem-agua/.env` (fora do git, só root lê): `DOMINIO`, `SITE_URL`, `POSTGRES_PASSWORD` e `APARELHO_SEGREDO`, gerados no próprio servidor.
- DNS: registro **A** `saltotemagua` → `177.7.36.12` (e AAAA para o IPv6) no DNS de `victorandra.de` (GoDaddy).

**Deploy automático, backend e frontend separados.** Cada push no `main` dispara só o que mudou (ou manual, em *Actions → Backend/Frontend → Run workflow*):

Os dois workflows têm as mesmas 6 etapas, uma depois da outra. Cada etapa é um workflow reutilizável (`.github/workflows/etapa-*.yml`), que o GitHub mostra como uma caixa com os jobs dentro:

| Etapa | Jobs | O que faz |
|---|---|---|
| **install** | `npm ci` | a primeira de todas: instala as dependências do monorepo e guarda o `node_modules` no cache; as outras etapas só restauram |
| **security** | `osv-scanning`, `report-security-issues` | procura vulnerabilidades conhecidas nas dependências (`package-lock.json`, base OSV.dev) e publica em *Security → Code scanning*, no resumo do run e em **issues** (uma por vulnerabilidade, label `segurança`; fecha sozinha quando a dependência é atualizada); avisa, mas não bloqueia |
| **code-analyzing** | `linting`, `typecheck` | ESLint da parte; TypeScript/vue-tsc no frontend e checagem de sintaxe dos módulos da API |
| **build-app** | `build-app:producao` | frontend: `npm run build` (os `dist` seguem como artefato); backend: a API sobe contra um PostGIS de teste e precisa responder relatos, métricas, sitemap e páginas de bairro |
| **build-image** | `build-image:producao` | gera a imagem Docker e publica no registro do GitHub com a tag do commit |
| **deploy** | `deploy:producao` | o VPS baixa a imagem e troca o container; no fim o workflow confere se o site responde |

O cache do `node_modules` tem como chave o hash do `package-lock.json`: com o lock igual, o `npm ci` da etapa install não precisa rodar de novo, e as outras etapas o restauram pela action `.github/actions/dependencias`.

| Workflow | Quando roda | Imagem (gerada uma vez, no GitHub) | Deploy no VPS |
|---|---|---|---|
| **Backend** (`.github/workflows/backend.yml`) | `apps/api`, `api.Dockerfile`, JSONs de bairros e abastecimento | `ghcr.io/victorandrad/temagua-api:<commit>` | baixa a imagem e troca a `api` |
| **Frontend** (`.github/workflows/frontend.yml`) | shell, mapa, painel, métricas, contracts, `web.dist.Dockerfile`, Nginx | `ghcr.io/victorandrad/temagua-web:<commit>` (só copia os `dist` para o Nginx) | baixa a imagem e troca o `web` |

**O VPS não compila nada:** ele só baixa a imagem pronta do registro do GitHub (GHCR) e troca o container. O token para baixar é o do próprio job (expira quando o job termina) e vai pela entrada do SSH, sem segredo guardado no servidor. A tag de cada imagem fica no `.env` do servidor (`API_TAG`, `WEB_TAG`); para voltar a uma versão anterior, rode no VPS `tem-agua-deploy frontend <commit>` (ou `backend`).

Mudanças no `compose*.yaml`, no `package.json`/`package-lock.json`, no `eslint.config.mjs`, nas etapas (`etapa-*.yml`) ou na action `dependencias` disparam os dois. O deploy (`.github/workflows/deploy-vps.yml`, reutilizado pelos dois) entra no VPS por SSH com a chave do secret `VPS_SSH_KEY`. No servidor essa chave só pode rodar `/usr/local/bin/tem-agua-deploy` (cópia de [`docker/deploy-vps.sh`](docker/deploy-vps.sh)), por causa de `restrict,command=...` no `authorized_keys`: nada de shell nem outros comandos. O script aceita só `backend`, `frontend` ou `tudo` (com o commit opcional), atualiza os arquivos de compose com os que o workflow manda junto, baixa a imagem e troca só aquele container (`--no-deps`); dois deploys do mesmo push esperam um pelo outro. Se qualquer etapa antes do deploy falhar no GitHub, o deploy nem roda e a versão anterior continua no ar. No fim, o workflow confere se o site responde.

O Nginx do `web` acha a API pelo DNS do Docker a cada 10 s, então o deploy só do backend não exige reiniciar o frontend.

Deploy à mão (no VPS): `tem-agua-deploy backend [commit]`, `tem-agua-deploy frontend [commit]` ou `tem-agua-deploy` (tudo, tag `latest`). Para rodar o compose de produção à mão, use sempre `--no-build`. Ao mudar `docker/deploy-vps.sh`, copie de novo para `/usr/local/bin/tem-agua-deploy` (o servidor não o atualiza sozinho, de propósito: o comando que a chave pode rodar não muda num push).

### Outros servidores

O jeito mais simples é a imagem `web` + `api` acima (qualquer servidor com Docker). Sem Docker, publique tudo no mesmo domínio: o build do shell (`apps/shell/dist/shell/browser`) na raiz, e o `dist` de cada remoto em `/remotes/mapa/`, `/remotes/painel/` e `/remotes/metricas/`. As rotas `/api`, `/bairros`, `/sitemap.xml` e `/robots.txt` vão para a API. Os builds já saem com esses caminhos.

Se um remoto precisar ficar em outro domínio, use `MAPA_PUBLIC_URL`/`PAINEL_PUBLIC_URL` no build dele, ajuste `REMOTES` em `apps/shell/src/app/remotes.ts` e libere CORS para o domínio do shell.
