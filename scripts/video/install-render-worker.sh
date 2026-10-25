#!/usr/bin/env bash
# Cài máy dựng chạy nền trên máy OWNER (macOS LaunchAgent): tự bật khi đăng nhập, tự chạy lại khi dừng.
#   npm run render-worker:install     cài / cài lại
#   npm run render-worker:uninstall   gỡ
#   npm run render-worker:status      tình trạng + nhật ký gần nhất
# Khoá KHÔNG nằm trong script: máy dựng đọc ~/.baor/render-worker.env (lệnh dán sẵn ở Cài đặt › Video › Nơi dựng video › Tạo khoá).
set -euo pipefail

LABEL="vn.baor.render-worker"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/baor-render-worker.log"
DOMAIN="gui/$(id -u)"
CMD="${1:-install}"

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

case "$CMD" in
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    [ -f "$PLIST" ] && mv "$PLIST" "$PLIST.removed"
    echo "Đã gỡ máy dựng chạy nền (tệp cấu hình ~/.baor/render-worker.env giữ nguyên)."
    exit 0 ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|pid|last exit code) =' || true
    else
      echo "Máy dựng chưa được cài chạy nền (npm run render-worker:install)."
    fi
    [ -f "$HOME/.baor/render-worker.env" ] && echo "Cấu hình: có ~/.baor/render-worker.env" || echo "Cấu hình: CHƯA có ~/.baor/render-worker.env"
    [ -f "$LOG" ] && { echo "--- nhật ký gần nhất ($LOG)"; tail -n 15 "$LOG"; }
    exit 0 ;;
  install) ;;
  *) echo "Dùng: $0 [install|uninstall|status]"; exit 2 ;;
esac

[ "$(uname)" = "Darwin" ] || { echo "Script này dành cho macOS. Máy khác: chạy 'npm run render-worker' bằng trình quản lý dịch vụ của máy."; exit 2; }

# 1. Công cụ dựng
NODE="$(command -v node || true)"
PY="${PYTHON_BIN:-$(command -v python3 || true)}"
FFMPEG="$(command -v ffmpeg || true)"
TSX="$ROOT/node_modules/.bin/tsx"
missing=0
[ -n "$NODE" ] || { echo "THIẾU node"; missing=1; }
[ -n "$PY" ] || { echo "THIẾU python3"; missing=1; }
[ -n "$FFMPEG" ] || { echo "THIẾU ffmpeg (brew install ffmpeg)"; missing=1; }
[ -x "$TSX" ] || { echo "THIẾU tsx (chạy npm install trong $ROOT)"; missing=1; }
[ "$missing" = 0 ] || exit 1
if ! "$PY" -c "import whisper, cv2, PIL" 2>/dev/null; then
  echo "THIẾU thư viện Python của bộ dựng (whisper / opencv / pillow) cho $PY — xem scripts/video/README.md."
  exit 1
fi

# 2. LaunchAgent: PATH gồm thư mục của node / python / ffmpeg đã tìm được (launchd không đọc PATH của shell)
PATHS="$(dirname "$NODE"):$(dirname "$PY"):$(dirname "$FFMPEG"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" "$HOME/.baor"
chmod 700 "$HOME/.baor"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$TSX")</string>
    <string>$(xml "$ROOT/scripts/video/render-worker.mts")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$ROOT")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml "$PATHS")</string>
    <key>PYTHON_BIN</key><string>$(xml "$PY")</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
sleep 2
echo "Đã cài máy dựng chạy nền ($LABEL) — tự bật khi đăng nhập máy. Nhật ký: $LOG"
[ -f "$HOME/.baor/render-worker.env" ] || echo "Còn thiếu khoá: Cài đặt › Video › Nơi dựng video › Tạo khoá trên mkt.baor.vn → dán lệnh hiện ra vào Terminal. Máy dựng tự nhận, không cần cài lại."
