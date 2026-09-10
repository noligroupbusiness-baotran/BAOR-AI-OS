#!/usr/bin/env bash
# Cài đặt lần đầu trên VPS Ubuntu/Debian. Chạy bằng root hoặc user có sudo:
#   curl -fsSL https://raw.githubusercontent.com/noligroupbusiness-baotran/BAOR-AI-OS/main/deploy/install.sh | bash
# Sau khi chạy: mở https://mkt.baor.vn (tên miền phải trỏ về IP VPS này trước khi chạy để cấp được HTTPS)
set -euo pipefail

REPO="https://github.com/noligroupbusiness-baotran/BAOR-AI-OS.git"
BRANCH="${BRANCH:-main}"
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
# Tên miền của hệ thống. Caddy tự cấp HTTPS khi tên miền đã trỏ về IP VPS này.
# Đổi thành DOMAIN=:80 nếu muốn tạm truy cập bằng IP.
DOMAIN=${DOMAIN:-mkt.baor.vn}
ENV
fi

echo "==> Khởi động ứng dụng"
docker compose up -d --build

IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')
DOMAIN_SET=$(grep -E '^DOMAIN=' .env | cut -d= -f2)
echo
if [ "$DOMAIN_SET" = ":80" ]; then
  echo "Xong. Mở: http://$IP"
else
  echo "Xong. Mở: https://$DOMAIN_SET"
  echo "Nếu chưa vào được: kiểm tra bản ghi DNS A của $DOMAIN_SET đã trỏ về $IP chưa (đổi xong chờ 5-30 phút)."
fi
echo "Xem log: docker compose -f $DIR/docker-compose.yml logs -f app"
