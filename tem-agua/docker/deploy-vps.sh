#!/bin/sh
# Deploy do Tem Água? no VPS: traz o main do GitHub e recria os containers (só os que mudaram).
#
# Instalado no servidor em /usr/local/bin/tem-agua-deploy. A chave SSH do GitHub Actions só pode
# rodar este comando (em /root/.ssh/authorized_keys):
#   restrict,command="/usr/local/bin/tem-agua-deploy" ssh-ed25519 AAAA... github-actions-deploy@tem-agua
#
# Se o build falhar, os containers antigos continuam no ar (o compose só troca depois de construir).
set -eu

cd /opt/tem-agua

# Um deploy por vez (dois pushes seguidos não brigam pelo mesmo build).
exec 9>/var/lock/tem-agua-deploy.lock
flock -n 9 || { echo "Outro deploy em andamento; tente de novo em alguns minutos."; exit 1; }

git fetch --quiet --depth 1 origin main
git reset --quiet --hard origin/main
echo "Código: $(git log -1 --format='%h · %s')"

docker compose -f compose.yaml -f compose.producao.yaml up -d --build --wait
docker image prune -f >/dev/null
echo "Deploy concluído."
