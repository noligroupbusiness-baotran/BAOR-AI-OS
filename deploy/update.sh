#!/usr/bin/env bash
# Cập nhật lên bản mới nhất trên GitHub và khởi động lại (GitHub Actions cũng gọi script này).
set -euo pipefail
cd "${DIR:-/opt/baor-ai-os}"
git fetch origin
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
docker compose up -d --build
docker image prune -f >/dev/null
echo "Đã cập nhật: $(git log --oneline -1)"
