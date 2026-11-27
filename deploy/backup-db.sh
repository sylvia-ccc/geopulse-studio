#!/usr/bin/env bash
set -euo pipefail

# SQLite 在线安全备份脚本（建议加入 crontab 每日凌晨 3 点自动执行）
# Crontab 示例: 0 3 * * * /path/to/geopulse-studio/deploy/backup-db.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_FILE="${ROOT_DIR}/data/geopulse.sqlite"
BACKUP_DIR="${ROOT_DIR}/backups"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/geopulse_${STAMP}.sqlite"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DATA_FILE" ]; then
  echo "[WARN] 未找到数据库文件：${DATA_FILE}"
  exit 0
fi

# 使用 Node 24 内置 node:sqlite 执行安全在线 VACUUM INTO 备份（避免 WAL 锁脏读）
if command -v node >/dev/null 2>&1; then
  node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); db.exec(\"VACUUM INTO '\" + process.argv[2].replace(/'/g, \"''\") + \"'\"); db.close();" "$DATA_FILE" "$OUT_FILE"
else
  cp "$DATA_FILE" "$OUT_FILE"
fi

gzip -f "$OUT_FILE"
find "$BACKUP_DIR" -name "geopulse_*.sqlite.gz" -mtime +"$RETENTION_DAYS" -delete

echo "[OK] 备份完成：${OUT_FILE}.gz（已自动清理超过 ${RETENTION_DAYS} 天的旧备份）"
