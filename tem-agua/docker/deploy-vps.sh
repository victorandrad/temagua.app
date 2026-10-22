#!/bin/sh
# Deploy do Tem Água? no VPS: baixa a imagem já construída no CI (registro do GitHub) e troca o
# container. O VPS não compila nada.
#
#   backend  <commit>  → api  (ghcr.io/victorandrad/temagua-api:<commit>)   workflow "Backend"
#   frontend <commit>  → web  (ghcr.io/victorandrad/temagua-web:<commit>)   workflow "Frontend"
#   tudo     [commit]  → api + web (+ db)                                    à mão
#
# O token para baixar do registro chega pela entrada padrão (o GITHUB_TOKEN do job, que expira no
# fim dele); sem token, usa o login que já existir no servidor (imagens públicas não precisam).
#
# Instalado no servidor em /usr/local/bin/tem-agua-deploy. A chave SSH do GitHub Actions só pode
# rodar este comando (em /root/.ssh/authorized_keys):
#   restrict,command="/usr/local/bin/tem-agua-deploy" ssh-ed25519 AAAA... github-actions-deploy@tem-agua
# O que o cliente pede no SSH chega em $SSH_ORIGINAL_COMMAND e só vale se for "<parte> [commit]".
set -eu

# Separa "parte commit" em palavras, sem expandir * ou ? (set -f).
set -f
# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-${*:-tudo}}
alvo="${1:-tudo}"
tag="${2:-latest}"
case "$alvo" in
  backend) servicos="api" ;;
  frontend) servicos="web" ;;
  tudo) servicos="api web" ;;
  *) echo "Uso: tem-agua-deploy backend|frontend|tudo [commit]"; exit 2 ;;
esac
case "$tag" in
  latest) ;;
  *) printf '%s' "$tag" | grep -Eq '^[0-9a-f]{7,40}$' || { echo "Commit inválido: $tag"; exit 2; } ;;
esac

cd /opt/tem-agua

# Um deploy por vez: backend e frontend do mesmo push esperam um pelo outro (até 15 min).
exec 9>/var/lock/tem-agua-deploy.lock
flock -w 900 9 || { echo "Outro deploy demorou demais; tente de novo."; exit 1; }

# Compose e configs do commit publicado (as imagens vêm do registro).
git fetch --quiet --depth 1 origin main
git reset --quiet --hard origin/main
echo "Repositório: $(git log -1 --format='%h · %s') · deploy: $alvo @ $tag"

# Guarda no .env qual imagem cada serviço usa: qualquer "compose up" depois mantém a versão publicada.
gravar() {
  if grep -q "^$1=" .env; then sed -i "s/^$1=.*/$1=$2/" .env; else echo "$1=$2" >> .env; fi
}
case "$alvo" in
  backend) gravar API_TAG "$tag" ;;
  frontend) gravar WEB_TAG "$tag" ;;
  tudo) gravar API_TAG "$tag"; gravar WEB_TAG "$tag" ;;
esac

# Token do registro pela entrada padrão (se houver).
token=""
if [ ! -t 0 ]; then read -r token || true; fi
if [ -n "$token" ]; then
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
  printf '%s' "$token" | docker login ghcr.io -u github-actions --password-stdin >/dev/null
fi

compose="docker compose -f compose.yaml -f compose.producao.yaml"
# shellcheck disable=SC2086
$compose pull --quiet $servicos
if [ "$alvo" = tudo ]; then
  $compose up -d --no-build --wait
else
  # --no-deps: o deploy do backend não mexe no front, e vice-versa.
  # shellcheck disable=SC2086
  $compose up -d --no-build --no-deps --wait $servicos
fi
docker image prune -f >/dev/null
echo "Deploy concluído ($alvo @ $tag)."
