#!/usr/bin/env bash
set -euo pipefail

# GeoPulse Studio 一键生产部署脚本（Ubuntu / Debian / CentOS / macOS）
# 用法：DOMAIN=geo.yourdomain.com ADMIN_EMAIL=boss@yourdomain.com bash deploy/deploy.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================="
echo "  GeoPulse Studio 2.0 生产服务器一键部署"
echo "=========================================="

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] 未检测到 Docker，请先安装 Docker 与 Docker Compose 插件："
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi

DOMAIN="${DOMAIN:-localhost}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@geopulse.ai}"
APP_URL="https://${DOMAIN}"
if [ "$DOMAIN" = "localhost" ]; then
  APP_URL="http://localhost:3000"
fi

if [ ! -f ".env" ]; then
  SECRET="$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cat > .env <<EOF
DOMAIN=${DOMAIN}
NEXT_PUBLIC_APP_URL=${APP_URL}
SESSION_SECRET=${SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL}
COMMERCIAL_STRICT_BILLING=true
GEOPULSE_DATA_DIR=/app/data

# 可选：配置服务器全局 LLM 算力池，让付费客户免填 API Key 开箱即用
GLOBAL_LLM_PROVIDER=none
GLOBAL_LLM_BASE_URL=
GLOBAL_LLM_API_KEY=
GLOBAL_LLM_MODEL=
EOF
  echo "[OK] 已自动生成生产 .env 配置（含 64 位安全 SESSION_SECRET）"
else
  echo "[INFO] 检测到已有 .env 文件，将保留现有配置"
fi

mkdir -p data backups

if [ "$DOMAIN" = "localhost" ]; then
  echo "[INFO] 本地模式启动（docker-compose.yml，端口 3000）..."
  docker compose up -d --build
  HEALTH_URL="http://127.0.0.1:3000/api/health"
else
  echo "[INFO] 生产 HTTPS 模式启动（docker-compose.prod.yml，Caddy 自动申请 SSL 证书）..."
  docker compose -f docker-compose.prod.yml up -d --build
  HEALTH_URL="http://127.0.0.1/api/health"
fi

echo "[INFO] 等待服务通过健康检查..."
for i in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[SUCCESS] 服务健康检查通过！"
    echo "  访问地址: ${APP_URL}"
    echo "  管理员邮箱: ${ADMIN_EMAIL}（注册该邮箱即自动拥有商用发码后台权限）"
    echo "  AI 爬虫目录: ${APP_URL}/llms.txt"
    exit 0
  fi
  sleep 2
done

echo "[WARN] 服务启动超时，请查看容器日志：docker logs geopulse-studio"
exit 1
