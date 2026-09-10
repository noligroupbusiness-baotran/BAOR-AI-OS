#!/usr/bin/env bash
# Cài đặt lần đầu trên VPS Ubuntu/Debian. Chạy bằng root hoặc user có sudo:
#   curl -fsSL https://raw.githubusercontent.com/noligroupbusiness-baotran/BAOR-AI-OS/claude/relaxed-ritchie-tb1144/deploy/install.sh | bash
# Sau khi chạy: mở http://<IP-VPS> (hoặc https://<DOMAIN> nếu đã đặt DOMAIN)
set -euo pipefail

REPO="https://github.com/noligroupbusiness-baotran/BAOR-AI-OS.git"
BRANCH="${BRANCH:-claude/relaxed-ritchie-tb1144}"
DIR="${DIR:-/opt/baor-ai-os}"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Cài Docker"
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -d "$DIR/.git" ]; then
  echo "==> Tải mã nguồn về $DIR"
  git clone -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  echo "==> Tạo tệp .env (đổi email/mật khẩu trong tệp này khi cần)"
  cat > .env <<ENV
ADMIN_EMAIL=${ADMIN_EMAIL:-thanhbaotran.business@gmail.com}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-123456}
AUTH_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
# Đặt tên miền để bật HTTPS tự động, ví dụ: DOMAIN=ai.tenmiencuaban.com
DOMAIN=${DOMAIN:-:80}
ENV
fi

echo "==> Khởi động ứng dụng"
docker compose up -d --build

IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')
echo
echo "Xong. Mở: http://$IP  (hoặc https://DOMAIN nếu đã cấu hình)"
echo "Xem log: docker compose -f $DIR/docker-compose.yml logs -f app"
