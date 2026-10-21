# Front-end: compila os três microfrontends e serve tudo pela mesma origem com Nginx.
#   /                 → shell (Angular)
#   /remotes/mapa/    → mapa (React)
#   /remotes/painel/  → painel (Vue)
#   /remotes/metricas/→ painel de métricas (Vue)
#   /api, /api/ws     → proxy para o container "api"
# Contexto do build: a pasta tem-agua/.

# ---- 1. Build ----
FROM node:22-alpine AS build
WORKDIR /app
ENV CI=true NG_CLI_ANALYTICS=false

# Só os manifests primeiro: a camada do npm ci fica em cache enquanto as dependências não mudarem.
COPY package.json package-lock.json .npmrc ./
COPY apps/shell/package.json apps/shell/
COPY apps/mapa/package.json apps/mapa/
COPY apps/painel/package.json apps/painel/
COPY apps/metricas/package.json apps/metricas/
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --no-audit --no-fund

COPY . .
# Os remotos saem com base /remotes/<nome>/ (vite.config.ts); o shell busca nesses caminhos.
RUN npm run build

# ---- 2. Runtime ----
FROM nginx:1.30-alpine
# Template: a imagem oficial gera /etc/nginx/conf.d/default.conf trocando as variáveis de ambiente.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/shell/dist/shell/browser /usr/share/nginx/html
COPY --from=build /app/apps/mapa/dist /usr/share/nginx/html/remotes/mapa
COPY --from=build /app/apps/painel/dist /usr/share/nginx/html/remotes/painel
COPY --from=build /app/apps/metricas/dist /usr/share/nginx/html/remotes/metricas

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
