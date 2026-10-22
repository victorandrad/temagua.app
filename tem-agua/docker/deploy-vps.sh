#!/bin/sh
# Deploy do Tem Água? no VPS: traz o main do GitHub e recria a parte pedida.
#
#   backend   → db + api            (workflow "Backend")
#   frontend  → web (Nginx + front)  (workflow "Frontend")
#   tudo      → tudo (padrão)
#
# Instalado no servidor em /usr/local/bin/tem-agua-deploy. A chave SSH do GitHub Actions só pode
# rodar este comando (em /root/.ssh/authorized_keys):
#   restrict,command="/usr/local/bin/tem-agua-deploy" ssh-ed25519 AAAA... github-actions-deploy@tem-agua
# O que o cliente pede no SSH chega em $SSH_ORIGINAL_COMMAND e só vale se for uma das três palavras.
#
# Se o build falhar, os containers antigos continuam no ar (o compose só troca depois de construir).
set -eu

alvo="${SSH_ORIGINAL_COMMAND:-${1:-tudo}}"
case "$alvo" in
  backend) servicos="db api" ;;
  frontend) servicos="web" ;;
  tudo) servicos="" ;;
  *) echo "Uso: tem-agua-deploy backend | frontend | tudo"; exit 2 ;;
esac

cd /opt/tem-agua

# Um deploy por vez: backend e frontend do mesmo push esperam um pelo outro (até 15 min).
exec 9>/var/lock/tem-agua-deploy.lock
flock -w 900 9 || { echo "Outro deploy demorou demais; tente de novo."; exit 1; }

git fetch --quiet --depth 1 origin main
git reset --quiet --hard origin/main
echo "Código: $(git log -1 --format='%h · %s') · deploy: $alvo"

compose="docker compose -f compose.yaml -f compose.producao.yaml"
if [ -n "$servicos" ]; then
  # --no-deps: o deploy do backend não reconstrói o front, e vice-versa.
  $compose up -d --build --no-deps --wait $servicos
else
  $compose up -d --build --wait
fi
docker image prune -f >/dev/null
echo "Deploy concluído ($alvo)."
