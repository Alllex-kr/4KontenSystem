#!/bin/sh
# Rollt ein fertiges Docker-Image auf dem Server aus. Wird von GitHub Actions (deploy.yml) aufgerufen,
# geht aber auch von Hand:
#
#   ./scripts/deploy.sh ghcr.io/alllex-kr/4kontensystem:<commit>
#
# Ablauf: Sicherung → neuesten Stand von compose.yml/Caddyfile holen → Image laden → starten →
# warten, bis die App gesund ist. Wird sie nicht gesund, kommt automatisch das vorherige Image zurück.
#
# Ist REGISTRY_USER gesetzt, wird das Registry-Token von der Standardeingabe gelesen (GitHub Actions).
set -eu
SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SCRIPT")/.."

IMAGE="${1:?Bitte das Image angeben, z. B. ./scripts/deploy.sh ghcr.io/alllex-kr/4kontensystem:latest}"

# 1. Neuesten Stand holen und das (evtl. geänderte) Skript neu starten
if [ -z "${DEPLOY_PULLED:-}" ]; then
  echo "→ Neuesten Stand von GitHub holen"
  git pull --ff-only
  DEPLOY_PULLED=1 exec sh "$SCRIPT" "$@"
fi

# 2. Sicherung, falls die Datenbank schon läuft
if [ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]; then
  echo "→ Sicherung vor dem Update"
  ./scripts/backup.sh
fi

# 3. Image laden
if [ -n "${REGISTRY_USER:-}" ]; then
  docker login ghcr.io -u "$REGISTRY_USER" --password-stdin >/dev/null
fi
echo "→ Image laden: $IMAGE"
APP_IMAGE="$IMAGE" docker compose pull app
[ -n "${REGISTRY_USER:-}" ] && docker logout ghcr.io >/dev/null

# Gewähltes Image in der .env merken, damit auch ein späteres "docker compose up -d" dieses nimmt
set_image() {
  if grep -q '^APP_IMAGE=' .env; then
    sed -i "s|^APP_IMAGE=.*|APP_IMAGE=\"$1\"|" .env
  else
    printf '\n# Von scripts/deploy.sh gesetzt: aktuell laufendes Image\nAPP_IMAGE="%s"\n' "$1" >> .env
  fi
}
PREVIOUS="$(sed -n 's/^APP_IMAGE="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .env)"

start() {
  set_image "$1"
  docker compose up -d --no-build --remove-orphans
}

wait_healthy() {
  i=0
  while [ $i -lt 40 ]; do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)"
    [ "$status" = "healthy" ] && return 0
    [ "$status" = "unhealthy" ] && return 1
    i=$((i + 1)); sleep 3
  done
  return 1
}

# 4. Starten und prüfen
echo "→ Starten"
start "$IMAGE"
if wait_healthy; then
  echo "✓ Ausgerollt: $IMAGE"
  docker image prune -f >/dev/null
  exit 0
fi

echo "✗ Die neue Version wird nicht gesund. Letzte Logs:" >&2
docker compose logs --tail 50 app >&2
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$IMAGE" ]; then
  echo "→ Zurück auf die vorherige Version: $PREVIOUS" >&2
  start "$PREVIOUS"
  wait_healthy && echo "Vorherige Version läuft wieder." >&2
fi
exit 1
