#!/usr/bin/env bash
# Chạy BAOR AI OS trên máy của bạn: ./start.sh  (Windows: dùng Git Bash hoặc chạy các lệnh bên trong)
set -e
cd "$(dirname "$0")"
if [ ! -f .env.local ]; then
  cat > .env.local <<ENV
ADMIN_EMAIL=thanhbaotran.business@gmail.com
ADMIN_PASSWORD=123456
AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENV
  echo "Đã tạo .env.local với tài khoản mặc định (đổi trong tệp này khi cần)."
fi
[ -d node_modules ] || npm install
echo "Mở trình duyệt tại http://localhost:3000"
npm run dev
