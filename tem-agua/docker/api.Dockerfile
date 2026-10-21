# API de relatos em tempo real (Node + PostgreSQL + ws). Contexto do build: a pasta tem-agua/.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production API_PORT=4300

COPY apps/api/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY apps/api/*.mjs ./
COPY apps/api/db ./db
# Mesma lista de bairros do app (páginas de SEO e sitemap).
COPY packages/contracts/src/bairros.json ./bairros.json
# Setores de abastecimento (métricas por reservatório e páginas de bairro).
COPY packages/contracts/src/abastecimento.json ./abastecimento.json
USER node

# Os relatos ficam no PostgreSQL (DATABASE_URL); o container da API não guarda estado.
EXPOSE 4300
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:4300/api/reports || exit 1
CMD ["node", "server.mjs"]
