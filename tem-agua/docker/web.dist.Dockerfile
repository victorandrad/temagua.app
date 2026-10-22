# Front-end a partir do build já feito (npm run build no CI): só copia os dist para o Nginx.
# É a imagem publicada no registro (ghcr.io/victorandrad/temagua-web) e usada em produção; o
# web.Dockerfile, que compila dentro do Docker, continua para o "docker compose up --build" local.
# Contexto do build: a pasta tem-agua/ (o web.dist.Dockerfile.dockerignore deixa entrar só os dist).
FROM nginx:1.30-alpine
# Template: a imagem oficial gera /etc/nginx/conf.d/default.conf trocando as variáveis de ambiente.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/shell/dist/shell/browser /usr/share/nginx/html
COPY apps/mapa/dist /usr/share/nginx/html/remotes/mapa
COPY apps/painel/dist /usr/share/nginx/html/remotes/painel
COPY apps/metricas/dist /usr/share/nginx/html/remotes/metricas

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
