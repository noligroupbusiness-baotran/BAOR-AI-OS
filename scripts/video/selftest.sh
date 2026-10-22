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
# Tự kiểm bộ dựng phải tất định: tắt biên tập AI (cổng 9 không có mô hình) → kế hoạch theo luật, chèn ảnh theo từ khoá
BAOR_LLM_URL=http://127.0.0.1:9 DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/raw.mp4" --job-dir "$W/esv" --model small --keywords "lắng nghe,khách hàng" 2>"$W/log-esv.txt" | tail -1
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

# --- Bộ dựng Skill ESV r3: kế hoạch biên tập có đủ loại hiệu ứng (thanh bước, cơ chế dọc, so sánh có tick, quy trình, FS-06, vệt sáng)
cat > "$W/plan-fx.json" <<'J'
{"by": "selftest", "content": "hướng dẫn",
 "emphasis": [{"t": 1.0, "text": "Mở đầu", "style": "blur"}, {"t": 11.0, "text": "LẮNG NGHE", "style": "shine"}],
 "diagrams": [{"type": "fs06", "t0": 2.0, "t1": 5.0}, {"type": "steps", "t0": 2.2, "t1": 5.0, "steps": [{"t": 2.4, "text": "một"}, {"t": 3.2, "text": "hai"}]},
  {"type": "leak", "t0": 5.2},
  {"type": "mechanism", "t0": 5.5, "t1": 7.4, "top": {"t": 5.6, "text": "trên", "icon": "person"}, "mid": {"t": 6.0, "text": "giữa"}, "bottom": {"t": 6.4, "text": "dưới", "icon": "person"}},
  {"type": "compare", "t0": 7.6, "t1": 9.6, "wrong": {"t": 7.7, "text": "sai", "strike": 8.2}, "right": [{"t": 8.6, "text": "đúng"}]},
  {"type": "process", "t0": 9.7, "t1": 11.2, "top": {"t": 9.8, "text": "hỏi", "icon": "bubble"}, "bottom": {"t": 10.4, "text": "khen", "icon": "heart"}},
  {"type": "chapter", "t0": 11.3, "t1": 12.4, "num": "2", "text": "chương"}, {"type": "quote", "t0": 12.5, "t1": 14.6, "text": "câu chốt, đúng nguyên lời"},
  {"type": "fs05", "t0": 0.2, "t1": 1.9}, {"type": "fs01", "t0": 12.0, "t1": 14.6}],
 "broll": [{"t0": 12.5, "t1": 14.0, "file": "goi-dien.jpg"}, {"t0": 1.5, "t1": 2.5, "file": "khong-giay-phep.jpg"}]}
J
DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/raw.mp4" --job-dir "$W/esv-fx" --plan "$W/plan-fx.json" --words "$W/esv/words_main.json" 2>"$W/log-esv-fx.txt" | tail -1
python3 - "$W/esv-fx/report.json" <<'P'
import json, sys
r = json.load(open(sys.argv[1]))
qa = {q["id"]: q["status"] for q in r["qa"]}
bad = [k for k in "ABCDEGHIQR" if qa.get(k) != "pass"]
assert not bad, f"ESV hiệu ứng: bảng kiểm chưa đạt: {bad}"
types = sorted({d["type"] for d in r["diagrams"]})
assert types == ["chapter", "compare", "fs01", "fs05", "fs06", "leak", "mechanism", "process", "quote", "steps"], types
assert [b["file"] for b in r["broll"]["events"]] == ["goi-dien.jpg"], "chỉ ảnh có giấy phép được chèn"
assert r["zoom"]["profile"] == "VUA" and "smootherstep" in r["zoom"]["formula"]
print(f"SELFTEST ESV HIỆU ỨNG ĐẠT: {types}, zoom {r['zoom']['profile']} {len(r['zoom']['events'])} lần, SFX {r['audio']['sfx'].get('used')}")
P

# 4:5 và 1:1: kích thước bản chính / bản xem nhanh phải hợp lệ cho H.264 (chiều chẵn). Lỗi thật 22/10/2026: 4:5 1080x1350 →
# bản xem nhanh 540x675 (lẻ) làm ffmpeg dừng ở bước cuối.
for ASP in 4:5 1:1; do
  D="$W/esv-${ASP/:/x}"
  BAOR_LLM_URL=http://127.0.0.1:9 DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/raw.mp4" --job-dir "$D" --plan "$W/plan-fx.json" --words "$W/esv/words_main.json" --aspect "$ASP" 2>"$D.log" | tail -1
  python3 - "$D" "$ASP" <<'P'
import json, subprocess, sys
d, asp = sys.argv[1], sys.argv[2]
r = json.load(open(f"{d}/report.json"))
def dims(f):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip()
    return tuple(int(x) for x in o.split(","))
m, p = dims(f"{d}/master.mp4"), dims(f"{d}/preview.mp4")
want = {"4:5": (1080, 1350), "1:1": (1080, 1080)}[asp]
assert m == want, f"{asp}: bản chính {m}, cần {want}"
assert p[0] % 2 == 0 and p[1] % 2 == 0 and p[0] < m[0], f"{asp}: bản xem nhanh {p} không hợp lệ"
qa = {q["id"]: q["status"] for q in r["qa"]}
bad = [k for k in "ABCDEGHIQR" if qa.get(k) != "pass"]
assert not bad, f"{asp}: bảng kiểm chưa đạt {bad}"
print(f"SELFTEST {asp} ĐẠT: bản chính {m[0]}x{m[1]}, xem nhanh {p[0]}x{p[1]}")
P
done

# Cân sáng / màu nhẹ: cảnh tối ám xanh lá → nâng gamma + hạ G; ám lạnh → ấm lại; cảnh ấm bình thường → KHÔNG chỉnh (giữ tông da)
ffmpeg -v error -y -f lavfi -i "color=c=0x2a4a2a:s=640x360:d=2" -pix_fmt yuv420p "$W/g_dark_green.mp4"
ffmpeg -v error -y -f lavfi -i "color=c=0x6a7a9a:s=640x360:d=2" -pix_fmt yuv420p "$W/g_cool.mp4"
ffmpeg -v error -y -f lavfi -i "color=c=0x9a7060:s=640x360:d=2" -pix_fmt yuv420p "$W/g_warm.mp4"
python3 - "$HERE" "$W" <<'P'
import sys; sys.path.insert(0, sys.argv[1]); W = sys.argv[2]
import esv_render as E, pipeline as P
def g(f):
    info = P.probe(f"{W}/{f}")
    return E.measure_grade(f"{W}/{f}", info, None, n=2)
f1, n1 = g("g_dark_green.mp4"); f2, n2 = g("g_cool.mp4"); f3, n3 = g("g_warm.mp4")
assert any(x.startswith("eq=gamma=") for x in f1) and any("gg=0.9" in x for x in f1), f"tối ám xanh lá: {f1} {n1}"
assert any(x.startswith("colorchannelmixer=rr=1.0") for x in f2), f"ám lạnh: {f2} {n2}"
assert f3 == [], f"cảnh ấm bình thường không được chỉnh: {f3} {n3}"
print(f"SELFTEST CÂN MÀU ĐẠT: tối+xanh lá {f1}; lạnh {f2}; ấm giữ nguyên")
P
