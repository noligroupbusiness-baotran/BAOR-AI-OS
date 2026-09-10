@echo off
REM Chay BAOR AI OS tren Windows: nhap doi start.bat
cd /d "%~dp0"
if not exist .env.local (
  (
    echo ADMIN_EMAIL=thanhbaotran.business@gmail.com
  ) > .env.local
  echo Da tao .env.local (doi email trong tep nay khi can).
)
if not exist node_modules call npm install
echo Mo trinh duyet tai http://localhost:3000
call npm run dev
