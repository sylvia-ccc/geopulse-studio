#!/usr/bin/env bash
set -euo pipefail
umask 077

# DOMAIN=geo.yourdomain.com ADMIN_EMAIL=your-private-email bash deploy/deploy.sh
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

: "${ADMIN_EMAIL:?Set ADMIN_EMAIL to your private owner email before deploying}"
ADMIN_EMAIL="$(printf '%s' "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]')"
if ! [[ "$ADMIN_EMAIL" =~ ^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "[ERROR] ADMIN_EMAIL must be a valid private owner email" >&2
  exit 1
fi
case "$ADMIN_EMAIL" in
  demo@geopulse.ai|admin@geopulse.ai|*@yourdomain.com|*@example.com)
    echo "[ERROR] Replace the public/sample ADMIN_EMAIL with your private owner email" >&2
    exit 1 ;;
esac
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Install Docker and its Compose plugin before deployment" >&2
  exit 1
fi
if [ -L .env ]; then
  echo "[ERROR] .env must be a private regular configuration file" >&2
  exit 1
fi
read_env_value() {
  awk -v key="$1" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2); sub(/\r$/, "", value); print value; exit }' .env
}
DOMAIN="${DOMAIN:-localhost}"
APP_URL="https://${DOMAIN}"
if [ "$DOMAIN" = localhost ]; then APP_URL="http://localhost:3000"; fi

if [ ! -f .env ]; then
  if command -v openssl >/dev/null 2>&1; then
    DEPLOY_SESSION_SECRET="$(openssl rand -hex 32)"
  elif command -v node >/dev/null 2>&1; then
    DEPLOY_SESSION_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  else
    echo "[ERROR] OpenSSL or Node is required to generate the session secret" >&2
    exit 1
  fi
  cat > .env <<EOF
DOMAIN=${DOMAIN}
APP_URL=${APP_URL}
NEXT_PUBLIC_APP_URL=${APP_URL}
SESSION_SECRET=${DEPLOY_SESSION_SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL}
COMMERCIAL_STRICT_BILLING=true
GEOPULSE_DATA_DIR=/app/data
GLOBAL_LLM_PROVIDER=none
GLOBAL_LLM_BASE_URL=
GLOBAL_LLM_API_KEY=
GLOBAL_LLM_MODEL=
EOF
  unset DEPLOY_SESSION_SECRET
  echo "[OK] Created private .env with a random session secret"
else
  chmod 600 .env
  if [ "$(read_env_value ADMIN_EMAIL)" != "$ADMIN_EMAIL" ]; then
    echo "[ERROR] Existing .env ADMIN_EMAIL differs. Set its private owner email explicitly, preserving SESSION_SECRET, then rerun" >&2
    exit 1
  fi
  DEPLOY_SESSION_SECRET="$(read_env_value SESSION_SECRET)"
  if [ "${#DEPLOY_SESSION_SECRET}" -lt 32 ] ||
     [ "$DEPLOY_SESSION_SECRET" = "geopulse-commercial-dev-secret-change-in-prod-2026" ] ||
     [[ "$DEPLOY_SESSION_SECRET" == *replace-with* ]] || [[ "$DEPLOY_SESSION_SECRET" == *change-this* ]]; then
    echo "[ERROR] Configure a strong production SESSION_SECRET before deployment; never rotate an existing encryption key without migrating stored credentials" >&2
    exit 1
  fi
  unset DEPLOY_SESSION_SECRET
  if [ "$(read_env_value NEXT_PUBLIC_APP_URL)" != "$APP_URL" ]; then
    echo "[ERROR] Existing .env URL differs from DOMAIN. Supply the correct DOMAIN and preserve the existing configuration" >&2
    exit 1
  fi
  echo "[INFO] Preserving existing private runtime configuration"
fi
chmod 600 .env

# Inspect the host before modifying this application's containers.
echo "[INFO] Read-only host resource, port and proxy checks"
df -h "$ROOT_DIR"
if command -v free >/dev/null 2>&1; then free -h; fi
if command -v ss >/dev/null 2>&1; then ss -ltn; fi
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
if command -v nginx >/dev/null 2>&1; then
  nginx -t >/dev/null 2>&1 || echo "[INFO] Nginx configuration check unavailable for this user; review the existing proxy before continuing"
fi
if [ "$DOMAIN" != localhost ] && command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  echo "[ERROR] Existing Nginx is active. Use an isolated app port and explicitly approved proxy configuration; this script will not start Caddy on its ports" >&2
  exit 1
fi
mkdir -p data backups
if [ -f data/geopulse.sqlite ]; then
  bash deploy/backup-db.sh
fi

COMPOSE_ARGS=()
COMPOSE_FILE=docker-compose.yml
if [ "$DOMAIN" != localhost ]; then
  COMPOSE_FILE=docker-compose.prod.yml
  COMPOSE_ARGS=(-f "$COMPOSE_FILE")
fi
PREVIOUS_IMAGE="$(docker compose "${COMPOSE_ARGS[@]}" images -q geopulse-studio 2>/dev/null || true)"
if [ -n "$PREVIOUS_IMAGE" ]; then
  ROLLBACK_STAMP="$(date +%Y%m%d_%H%M%S)"
  ROLLBACK_IMAGE="geopulse-studio:rollback-${ROLLBACK_STAMP}"
  ROLLBACK_FILE="backups/rollback_${ROLLBACK_STAMP}.yml"
  docker image tag "$PREVIOUS_IMAGE" "$ROLLBACK_IMAGE"
  printf 'services:\n  geopulse-studio:\n    image: %s\n' "$ROLLBACK_IMAGE" > "$ROLLBACK_FILE"
  chmod 600 "$ROLLBACK_FILE"
  echo "[INFO] Retained previous app image. Rollback command:"
  echo "  docker compose -f ${COMPOSE_FILE} -f ${ROLLBACK_FILE} up -d --no-build geopulse-studio"
else
  echo "[INFO] First deployment rollback command: docker compose -f ${COMPOSE_FILE} stop geopulse-studio"
fi
echo "[INFO] Building and starting this application's Compose services"
docker compose "${COMPOSE_ARGS[@]}" up -d --build

echo "[INFO] Waiting for application health"
for ((attempt = 0; attempt < 20; attempt++)); do
  if docker compose "${COMPOSE_ARGS[@]}" exec -T geopulse-studio \
      wget -q -O /dev/null http://127.0.0.1:3000/api/health; then
    echo "[SUCCESS] Application health passed: ${APP_URL}"
    echo "[IMPORTANT] Public registration never grants administrator access. Provision the private owner explicitly."
    echo "  Owner email: ${ADMIN_EMAIL}"
    echo "  Create a separate private directory outside the application, writable by container UID 1000."
    echo "  Example: sudo install -d -m 700 -o 1000 -g 1000 /opt/geopulse-private"
    echo "  Then run the application bootstrap CLI with a private mount (password is written only to its 0600 file):"
    if [ "$DOMAIN" = localhost ]; then
      echo "  docker compose run --rm --no-deps -v /opt/geopulse-private:/secure geopulse-studio node scripts/bootstrap-owner.cjs --credentials-file /secure/geopulse-owner.md --migrate-demo-workspace"
    else
      echo "  docker compose -f docker-compose.prod.yml run --rm --no-deps -v /opt/geopulse-private:/secure geopulse-studio node scripts/bootstrap-owner.cjs --credentials-file /secure/geopulse-owner.md --migrate-demo-workspace"
    fi
    echo "  Existing owner accounts and ledger files are never overwritten; use the existing private login when already provisioned."
    exit 0
  fi
  sleep 2
done

echo "[ERROR] Health check timed out; inspect only this app's logs: docker logs geopulse-studio" >&2
exit 1
