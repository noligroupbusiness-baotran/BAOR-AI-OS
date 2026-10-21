#!/usr/bin/env bash
# Tự kiểm bộ dựng bằng footage tổng hợp hợp pháp (ffmpeg lavfi + giọng đọc máy), không dùng tài sản ngoài.
# Kiểm: dựng ra bản chính 1080x1920, bảng kiểm A–E đạt, B-roll có giấy phép được chèn, clip thiếu giấy phép bị loại, SFX có mặt.
# Bộ dựng Skill ESV (mặc định): A–E, G–J đạt; ảnh minh hoạ có giấy phép được chèn theo lời nói, ảnh thiếu giấy phép bị loại.
# Chạy: npm run video:selftest   (cần ffmpeg, python3 + whisper + opencv + pillow như README)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$(mktemp -d "${TMPDIR:-/tmp}/baor-selftest-XXXX")"
mkdir -p "$W/broll"
TEXT="Xin chào các bạn. Hôm nay mình nói về cách mở đầu cuộc gọi. Khi gọi điện thoại cho khách hàng, hãy giới thiệu bạn là ai. Sau đó nhắc lại nguồn thông tin khách đã để lại. Lắng nghe khách hàng là kỹ năng quan trọng nhất."
if command -v say >/dev/null && say -v '?' | grep -q "vi_VN"; then
  say -v "$(say -v '?' | awk '/vi_VN/{print $1; exit}')" -o "$W/speech.aiff" "$TEXT"
else
  echo "Không có giọng đọc tiếng Việt: dùng âm thử (bỏ qua kiểm B-roll theo lời)"; ffmpeg -v error -f lavfi -i "sine=frequency=220:duration=12" "$W/speech.aiff"
fi
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/speech.aiff")
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1080x1920:r=30:d=$D" -i "$W/speech.aiff" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$W/raw.mp4"
ffmpeg -v error -y -f lavfi -i "mandelbrot=s=1280x720:r=30" -t 4 -c:v libx264 -pix_fmt yuv420p "$W/broll/dien-thoai.mp4"
ffmpeg -v error -y -f lavfi -i "color=c=red:s=640x640:r=30" -t 3 -c:v libx264 -pix_fmt yuv420p "$W/broll/khong-giay-phep.mp4"
cat > "$W/broll/manifest.json" <<'J'
[{"file":"dien-thoai.mp4","keywords":["gọi điện"],"license":"Tự tạo bằng ffmpeg lavfi","source":"selftest"},
 {"file":"khong-giay-phep.mp4","keywords":["khách hàng"],"license":"","source":"selftest"}]
J
python3 "$HERE/pipeline.py" --input "$W/raw.mp4" --job-dir "$W/job" --model small --model2 none --broll-dir "$W/broll" --sfx --keywords "lắng nghe,khách hàng" 2>"$W/log.txt" | tail -1
python3 - "$W/job/report.json" <<'P'
import json, sys
r = json.load(open(sys.argv[1]))
qa = {q["id"]: q["status"] for q in r["qa"]}
bad = [k for k in "ABCDE" if qa.get(k) != "pass"]
assert not bad, f"bảng kiểm chưa đạt: {bad}"
assert r["broll"]["events"], "không chèn được B-roll có giấy phép"
assert any("khong-giay-phep" in s for s in r["broll"]["skipped"]), "clip thiếu giấy phép phải bị loại"
assert r["audio"].get("sfx", {}).get("used"), "SFX không có"
print(f"SELFTEST ĐẠT: {r['output']['seconds']}s, {len(r['broll']['events'])} B-roll, {r['audio']['sfx']['count']} SFX, LUFS {r['audio']['lufs']}, dựng {r['elapsedSec']}s")
P
echo "Kết quả: $W/job"

# --- Bộ dựng Skill ESV: ảnh tĩnh minh hoạ theo từ khoá lời nói (thư viện DATA_DIR/video-assets/broll)
B="$W/data/video-assets/broll"
mkdir -p "$B"
ffmpeg -v error -y -f lavfi -i "testsrc=s=720x720" -frames:v 1 "$B/goi-dien.jpg"
ffmpeg -v error -y -f lavfi -i "color=c=red:s=800x600" -frames:v 1 "$B/khong-giay-phep.jpg"
cat > "$B/manifest.json" <<'J'
[{"file":"goi-dien.jpg","kind":"image","keywords":["gọi điện"],"license":"Tự tạo bằng ffmpeg lavfi","source":"selftest"},
 {"file":"khong-giay-phep.jpg","kind":"image","keywords":["khách hàng"],"license":"","source":"selftest"}]
J
DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/raw.mp4" --job-dir "$W/esv" --model small --keywords "lắng nghe,khách hàng" 2>"$W/log-esv.txt" | tail -1
python3 - "$W/esv/report.json" <<'P'
import json, sys
r = json.load(open(sys.argv[1]))
qa = {q["id"]: q["status"] for q in r["qa"]}
bad = [k for k in "ABCDEGHI" if qa.get(k) != "pass"] + [k for k in "J" if qa.get(k) not in ("pass", "unmeasured")]
assert not bad, f"ESV: bảng kiểm chưa đạt: {bad}"
files = [b["file"] for b in r["broll"]["events"]]
assert "goi-dien.jpg" in files, f"ESV: không chèn ảnh có giấy phép ({files})"
assert "khong-giay-phep.jpg" not in files, "ESV: ảnh thiếu giấy phép phải bị loại"
print(f"SELFTEST ESV ĐẠT: {r['output']['frames']} khung, minh hoạ {files}, LUFS {r['audio']['lufs']}")
P
