@echo off
REM Chay BAOR AI OS tren Windows: nhap doi start.bat
cd /d "%~dp0"
if not exist .env.local (
  for /f %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set SECRET=%%i
  (
    echo ADMIN_EMAIL=thanhbaotran.business@gmail.com
    echo ADMIN_PASSWORD=123456
    echo AUTH_SECRET=%SECRET%
  ) > .env.local
  echo Da tao .env.local voi tai khoan mac dinh.
)
if not exist node_modules call npm install
echo Mo trinh duyet tai http://localhost:3000
call npm run dev
