#!/usr/bin/env bash
# Chạy định kỳ trên VPS (systemd timer hoặc cron): có commit mới trên GitHub thì tự cập nhật.
# Không cần secret hay SSH từ GitHub Actions. Nhật ký: journalctl -u baor-auto-update hoặc /var/log/baor-auto-update.log
set -euo pipefail
DIR="${DIR:-/opt/baor-ai-os}"
LOCK=/tmp/baor-auto-update.lock
exec 9>"$LOCK"
flock -n 9 || { echo "Đang có lần cập nhật khác chạy, bỏ qua."; exit 0; }
cd "$DIR"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch -q origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi
echo "$(date '+%F %T') Có bản mới ($(git log --oneline -1 "origin/$BRANCH")), đang cập nhật..."
bash "$DIR/deploy/update.sh"
