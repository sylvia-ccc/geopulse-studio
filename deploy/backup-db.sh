#!/usr/bin/env bash
set -euo pipefail
umask 077

# Safe online SQLite snapshot, including committed WAL transactions.
# Usage: RETENTION_DAYS=14 bash deploy/backup-db.sh
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_FILE="${DATA_FILE:-${ROOT_DIR}/data/geopulse.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CONTAINER_NAME="${CONTAINER_NAME:-geopulse-studio}"
CONTAINER_DATA_FILE="${CONTAINER_DATA_FILE:-/app/data/geopulse.sqlite}"
STAMP="$(date +%Y%m%d_%H%M%S)_$$"
OUT_FILE="${BACKUP_DIR}/geopulse_${STAMP}.sqlite"

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "[ERROR] RETENTION_DAYS must be a nonnegative integer" >&2
  exit 1
fi
if [ ! -f "$DATA_FILE" ]; then
  echo "[ERROR] Database not found: ${DATA_FILE}" >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
TEMP_FILE="$(mktemp "${BACKUP_DIR}/.geopulse_snapshot.XXXXXX")"
CONTAINER_TEMP="/tmp/geopulse_snapshot_${STAMP}.sqlite"
CONTAINER_SNAPSHOT_CREATED=false
cleanup() {
  rm -f "$TEMP_FILE" "${TEMP_FILE}.gz" "${TEMP_FILE}-wal" "${TEMP_FILE}-shm"
  if [ "$CONTAINER_SNAPSHOT_CREATED" = true ]; then
    docker exec "$CONTAINER_NAME" rm -f "$CONTAINER_TEMP" "${CONTAINER_TEMP}-wal" "${CONTAINER_TEMP}-shm" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

BACKUP_JS="$(cat <<'NODE'
const fs = require('node:fs');
const { DatabaseSync, backup } = require('node:sqlite');
(async () => {
  const source = new DatabaseSync(process.argv[1], { readOnly: true });
  try {
    await backup(source, process.argv[2]);
  } finally { source.close(); }
  fs.chmodSync(process.argv[2], 0o600);
  const snapshot = new DatabaseSync(process.argv[2]);
  try {
    // Publish one self-contained snapshot, with no required WAL sidecar files.
    snapshot.exec('PRAGMA journal_mode=DELETE');
    const rows = snapshot.prepare('PRAGMA quick_check').all();
    if (rows.length !== 1 || Object.values(rows[0])[0] !== 'ok') throw new Error('Backup integrity check failed');
  } finally { snapshot.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
NODE
)"

if command -v node >/dev/null 2>&1 &&
   node --no-warnings -e "if(typeof require('node:sqlite').backup !== 'function') process.exit(1)" >/dev/null 2>&1; then
  node --no-warnings -e "$BACKUP_JS" "$DATA_FILE" "$TEMP_FILE"
elif command -v docker >/dev/null 2>&1 &&
     docker exec "$CONTAINER_NAME" node --no-warnings -e "if(typeof require('node:sqlite').backup !== 'function') process.exit(1)" >/dev/null 2>&1; then
  # Copy only the completed SQLite backup, never a live database or live WAL file.
  CONTAINER_SNAPSHOT_CREATED=true
  docker exec "$CONTAINER_NAME" node --no-warnings -e "$BACKUP_JS" "$CONTAINER_DATA_FILE" "$CONTAINER_TEMP"
  docker cp "${CONTAINER_NAME}:${CONTAINER_TEMP}" "$TEMP_FILE" >/dev/null
  chmod 600 "$TEMP_FILE"
else
  echo "[ERROR] Online backup requires Node with node:sqlite.backup, locally or in the app container; no live-file copy fallback" >&2
  exit 1
fi

gzip -c "$TEMP_FILE" > "${TEMP_FILE}.gz"
chmod 600 "${TEMP_FILE}.gz"
mv "${TEMP_FILE}.gz" "${OUT_FILE}.gz"
find "$BACKUP_DIR" -type f -name "geopulse_*.sqlite.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[OK] Verified online backup: ${OUT_FILE}.gz (retention ${RETENTION_DAYS} days)"
