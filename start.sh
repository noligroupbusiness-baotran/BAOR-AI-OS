#!/usr/bin/env bash
# Chạy BAOR AI OS trên máy của bạn: ./start.sh  (Windows: dùng Git Bash hoặc chạy các lệnh bên trong)
set -e
cd "$(dirname "$0")"
if [ ! -f .env.local ]; then
  cat > .env.local <<ENV
# Email chủ fanpage hiển thị trong giao diện (không cần đăng nhập).
ADMIN_EMAIL=thanhbaotran.business@gmail.com
ENV
  echo "Đã tạo .env.local (đổi email trong tệp này khi cần)."
fi
[ -d node_modules ] || npm install
echo "Mở trình duyệt tại http://localhost:3000"
npm run dev
