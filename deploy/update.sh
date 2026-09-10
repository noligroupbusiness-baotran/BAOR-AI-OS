#!/usr/bin/env bash
# Cập nhật lên bản mới nhất trên GitHub và khởi động lại (GitHub Actions cũng gọi script này).
set -euo pipefail
cd "${DIR:-/opt/baor-ai-os}"
git fetch origin
# Giữ lại chỉnh sửa cục bộ (nếu có) trước khi cập nhật, tránh mất cấu hình riêng của VPS.
if ! git diff --quiet; then git stash push -m "local-before-update-$(date +%s)" >/dev/null; echo "Đã cất thay đổi cục bộ vào git stash."; fi
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
if docker compose ps --services 2>/dev/null | grep -q '^caddy$'; then
  docker compose --profile caddy up -d --build
else
  docker compose up -d --build
fi
docker image prune -f >/dev/null
echo "Đã cập nhật: $(git log --oneline -1)"
