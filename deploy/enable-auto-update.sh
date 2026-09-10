#!/usr/bin/env bash
# Bật tự cập nhật trên VPS: cứ 2 phút kiểm tra GitHub, có commit mới thì build lại.
# Dùng: bash /opt/baor-ai-os/deploy/enable-auto-update.sh   (chạy bằng root)
# Tắt:  systemctl disable --now baor-auto-update.timer
set -euo pipefail
DIR="${DIR:-/opt/baor-ai-os}"
INTERVAL="${INTERVAL:-2min}"
chmod +x "$DIR/deploy/auto-update.sh" "$DIR/deploy/update.sh"

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  cat > /etc/systemd/system/baor-auto-update.service <<UNIT
[Unit]
Description=BAOR AI OS: cập nhật khi GitHub có commit mới
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
Environment=DIR=$DIR
ExecStart=/usr/bin/env bash $DIR/deploy/auto-update.sh
UNIT
  cat > /etc/systemd/system/baor-auto-update.timer <<UNIT
[Unit]
Description=BAOR AI OS: kiểm tra bản mới mỗi $INTERVAL

[Timer]
OnBootSec=1min
OnUnitActiveSec=$INTERVAL
AccuracySec=15s

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now baor-auto-update.timer
  echo "Đã bật tự cập nhật (systemd timer, mỗi $INTERVAL)."
  echo "Xem trạng thái: systemctl list-timers baor-auto-update.timer"
  echo "Xem nhật ký:    journalctl -u baor-auto-update -n 50"
else
  LINE="*/2 * * * * DIR=$DIR /usr/bin/env bash $DIR/deploy/auto-update.sh >> /var/log/baor-auto-update.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'deploy/auto-update.sh' ; echo "$LINE" ) | crontab -
  echo "Đã bật tự cập nhật (cron, mỗi 2 phút). Nhật ký: /var/log/baor-auto-update.log"
fi
