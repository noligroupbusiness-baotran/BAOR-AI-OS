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
  echo "==> Tạo tệp .env (đổi email trong tệp này khi cần)"
  cat > .env <<ENV
# Email chủ fanpage hiển thị trong giao diện (hệ thống không yêu cầu đăng nhập).
ADMIN_EMAIL=${ADMIN_EMAIL:-thanhbaotran.business@gmail.com}
# Tên miền của hệ thống (dùng khi chạy Caddy trong Docker).
DOMAIN=${DOMAIN:-mkt.baor.vn}
# Cổng nội bộ của app trên máy chủ (proxy của VPS trỏ vào 127.0.0.1:APP_PORT).
APP_PORT=${APP_PORT:-3200}
ENV
fi

echo "==> Khởi động ứng dụng"
# Nếu cổng 80 đã có proxy của máy chủ (Caddy/Nginx) thì chỉ chạy app; nếu trống thì chạy kèm Caddy.
if ss -ltn 2>/dev/null | grep -q ':80 ' || (command -v systemctl >/dev/null && systemctl is-active --quiet caddy); then
  echo "    Cổng 80 đã có proxy trên máy chủ: chỉ chạy app ở 127.0.0.1:$(grep -E '^APP_PORT=' .env | cut -d= -f2 || echo 3200)."
  echo "    Trỏ tên miền trong proxy đó tới cổng này (xem deploy/caddy-host-snippet.txt)."
  docker compose up -d --build
else
  docker compose --profile caddy up -d --build
fi

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

echo "==> Bật tự cập nhật khi GitHub có commit mới (mỗi 2 phút kiểm tra một lần)"
bash "$DIR/deploy/enable-auto-update.sh" || echo "    Không bật được tự cập nhật; chạy tay: bash $DIR/deploy/enable-auto-update.sh"
