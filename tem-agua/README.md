# Tem Água? · Salto

Mapa colaborativo de falta d'água em Salto/SP, com interface inspirada no app da Uber: mapa em tela cheia, pin central e bottom sheet.

Cada parte é um **microfrontend em um framework diferente**, ligado por **Module Federation**:

| App | Framework | Porta | Responsabilidade |
|-----|-----------|-------|------------------|
| `apps/shell` | Angular 21 | 4200 | Layout, busca de bairro, dono dos relatos (`ReportsService`), carrega os remotos |
| `apps/mapa` | React 19 + MapLibre | 4201 | Mapa, pin arrastável, mapa de calor dos relatos, botão "minha localização" |
| `apps/painel` | Vue 3 | 4202 | Bottom sheet: status da região, "Estou sem água" / "A água voltou", ranking de bairros |
| `apps/api` | Node + ws | 4300 | Recebe os relatos, salva em `apps/api/data/reports.json` e avisa todos os aparelhos em tempo real (WebSocket) |
| `packages/contracts` | TypeScript | — | Tipos, barramento de eventos e dados dos bairros, compartilhados por todos |

## Rodando

Requer Node 20.19+. Os comandos funcionam tanto na pasta `tem-agua` quanto na raiz `nova-startup`.

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe API, mapa, painel e shell em http://localhost:4200 |
| `npm run dev:ngrok` | O mesmo + túnel HTTPS do **ngrok**, com o link público em destaque (para o celular/GPS) |
| `npm run dev:tunnel` | O mesmo, mas com o túnel do **cloudflared** (sem conta) |
| `npm run stop` | Derruba tudo que os comandos acima subiram (inclusive o túnel aberto por eles) |

No Windows também dá para dar dois cliques em `iniciar.cmd` (usa o ngrok) / `parar.cmd`, na raiz `nova-startup`.

O que o `scripts/dev.mjs` faz:
1. Confere a versão do Node e instala as dependências se faltar `node_modules`.
2. Confere se as portas 4200, 4201, 4202 e 4300 estão livres. Se não estiverem, mostra o PID e o processo de cada uma e sugere o `npm run stop`.
3. Sobe a API e os remotos; o shell só sobe depois que os `remoteEntry.js` respondem (sem "falha ao carregar" na primeira abertura).
4. Com `--tunnel=ngrok` ou `--tunnel=cloudflared`, espera o shell e abre o túnel. O link também fica salvo em `tem-agua/.tunnel-url`.

Se um processo cair, os outros são derrubados; Ctrl+C para tudo. Os remotos rodam em `vite build --watch` + `vite preview`: cada alteração recompila em ~1 s, recarregue a página para ver.

Para desenvolver um remoto isolado com hot reload: `npm run stop`, depois `npm run dev -w apps/mapa` (http://localhost:4201) ou `npm run dev -w apps/painel` (http://localhost:4202).

### Testar no celular (com GPS)

O navegador só libera o GPS em HTTPS: use `npm run dev:ngrok` (ou `iniciar.cmd`) e abra no celular o link que aparece em destaque. O link é **público** enquanto o túnel estiver aberto.

**ngrok** (usa o SDK oficial `@ngrok/ngrok`, já instalado no projeto; nada para instalar no sistema):
1. Crie uma conta gratuita em https://dashboard.ngrok.com/signup e copie o token em https://dashboard.ngrok.com/get-started/your-authtoken.
2. Cole em `tem-agua/.env.local` (fora do git): `NGROK_AUTHTOKEN=seu_token`. O script também aceita a variável de ambiente ou o token do `ngrok config add-authtoken`.
3. Opcional: o plano gratuito dá **um domínio fixo** (https://dashboard.ngrok.com/domains). Coloque em `NGROK_DOMAIN=algo.ngrok-free.app` e o link deixa de mudar.
4. No plano gratuito, a primeira visita mostra uma tela de aviso do ngrok: toque em "Visit Site".

**cloudflared** (`npm run dev:tunnel`): não precisa de conta, mas o link `*.trycloudflare.com` muda a cada execução e o cloudflared precisa estar instalado.

Sem token/cloudflared, o app sobe normalmente em localhost e o terminal mostra o que fazer.

Isso funciona porque o shell serve tudo pela mesma origem: o `proxy.conf.json` do Angular repassa `/remotes/mapa` → porta 4201, `/remotes/painel` → porta 4202 e `/api` (HTTP e WebSocket) → porta 4300. O `angular.json` libera os hosts do cloudflared e do ngrok.

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
- **Bairros**: 91 centroides aproximados extraídos do OpenStreetMap (`packages/contracts/src/bairros.ts`).
- **Tempo real**: um relato feito em qualquer aparelho aparece nos outros em ~1 s. O `ReportsService` (shell) junta três fontes: relatos de demonstração, os do servidor (posição arredondada) e os deste aparelho (posição exata, no `localStorage`). Se a conexão cair, o indicador vira "Reconectando…", o relato fica pendente e é reenviado ao reconectar.
- **Por que WebSocket e não SSE**: os Quick Tunnels da Cloudflare (`trycloudflare.com`) seguram streams de Server-Sent Events; WebSocket passa normalmente.
- **API**: valida os dados, aceita só posições dentro de Salto, arredonda a posição no servidor (nunca guarda a exata), limita 10 relatos por minuto por IP e guarda 7 dias. É um protótipo: para produção, troque o arquivo JSON por um banco (ex.: Postgres/PostGIS ou Supabase).
- **Angular 21 em vez de 22**: o Angular 22 exige Node 22+. Com Node 22+ instalado, dá para atualizar com `ng update`.

## Deploy

Publique tudo no mesmo domínio: o build do shell (`apps/shell/dist/shell/browser`) na raiz, e o `dist` de cada remoto em `/remotes/mapa/` e `/remotes/painel/`. Os builds já saem com esses caminhos.

Se um remoto precisar ficar em outro domínio, use `MAPA_PUBLIC_URL`/`PAINEL_PUBLIC_URL` no build dele, ajuste `REMOTES` em `apps/shell/src/app/remotes.ts` e libere CORS para o domínio do shell.
