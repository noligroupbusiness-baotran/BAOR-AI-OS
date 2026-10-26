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
{"by": "selftest", "content": "hướng dẫn", "music": {"mood": "acoustic", "why": "selftest"},
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
# Thư viện nhạc: bộ dựng theo loại nhạc kế hoạch chọn ("acoustic") nhưng CHỈ tự dùng bài đã duyệt; bài "chờ OWNER nghe duyệt"
# cùng loại chỉ được gợi ý (dùng nó thì bảng kiểm P chặn đăng). Nhạc tự tạo bằng ffmpeg (không tài sản ngoài).
M="$W/data/video-assets/music"
mkdir -p "$M"
for n in mac-dinh acoustic-da-duyet acoustic-cho-duyet; do ffmpeg -v error -y -f lavfi -i "sine=frequency=330:duration=20" -c:a libmp3lame "$M/$n.mp3"; done
cat > "$M/manifest.json" <<'J'
[{"file":"mac-dinh.mp3","genre":"lofi-chill","license":"Tự tạo bằng ffmpeg lavfi","default":true},
 {"file":"acoustic-cho-duyet.mp3","genre":"acoustic","license":"Tự tạo — kho tư liệu: ĐỦ-HỒ-SƠ — chờ OWNER nghe duyệt","catalogStatus":"ĐỦ-HỒ-SƠ"},
 {"file":"acoustic-da-duyet.mp3","genre":"acoustic","license":"Tự tạo — kho tư liệu: ĐỦ-HỒ-SƠ — OWNER nghe duyệt 22/10/2026 (selftest)","catalogStatus":"ĐỦ-HỒ-SƠ"}]
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
assert qa.get("S") == "pass", f"SFX ≤ −19 dB so giọng: {[q for q in r['qa'] if q['id'] == 'S']}"
assert qa.get("T") == "pass" and qa.get("F") == "pass", "phụ đề PA B không phát sáng; logo 340 px trong XANH"
mu = r["audio"]["music"]
assert mu.get("used") and mu["file"] == "acoustic-da-duyet.mp3" and "acoustic" in mu.get("chosenBy", ""), f"nhạc theo loại, chỉ bài đã duyệt: {mu}"
assert mu.get("suggest") == ["acoustic-cho-duyet.mp3"], f"bài chưa duyệt chỉ được gợi ý: {mu}"
assert qa.get("P") != "blocker" or "chờ OWNER" not in mu["license"], "bài tự chọn không được làm bảng kiểm P chặn"
print(f"SELFTEST ESV HIỆU ỨNG ĐẠT: nhạc {mu['file']} ({mu['chosenBy']})")
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

# Cắt lặng (Phần chung A11.4 + phản biện P2-1): lặng thật > 0,60 s rút còn 0,30 s; nguồn nói liền không khoảng nghỉ không được mất
# câu nói nhỏ; khoảng có từ đã nghe được không bao giờ bị cắt.
python3 - "$HERE" "$W" <<'P'
import sys, wave
import numpy as np
sys.path.insert(0, sys.argv[1])
import esv_render as E
W, sr = sys.argv[2], 16000
rng = np.random.default_rng(1)
def voice(sec, db):  # "giọng" tổng hợp: nhiễu điều biên theo nhịp âm tiết, không có khoảng nghỉ
    t = np.arange(int(sec * sr)) / sr
    return rng.standard_normal(len(t)).astype(np.float32) * 0.1 * (0.75 + 0.25 * np.sin(2 * np.pi * 4 * t)) * 10 ** (db / 20)
def cuts(name, parts, words=None):
    x = np.concatenate(parts) + rng.standard_normal(sum(map(len, parts))).astype(np.float32) * 10 ** (-60 / 20)
    p = f"{W}/ks_{name}.wav"
    w = wave.open(p, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
    dur = len(x) / sr
    keep, out, a0 = E.keep_segments(p, dur, words=words), [], 0.0
    for k0, k1 in keep:
        if k0 > a0 + 1e-3:
            out.append((round(a0, 2), round(k0, 2)))
        a0 = k1
    if a0 < dur - 0.05:
        out.append((round(a0, 2), round(dur, 2)))
    return out
z = lambda s: np.zeros(int(s * sr), np.float32)
c = cuts("pause", [voice(4, 0), z(1.5), voice(4, 0)])
assert len(c) == 1 and abs((1.5 - (c[0][1] - c[0][0])) - 0.30) < 0.08, f"lặng 1,5 s phải rút còn ~0,30 s: {c}"
assert not cuts("short", [voice(4, 0), z(0.5), voice(4, 0)]), "lặng 0,5 s (< 0,60 s) không được cắt"
c = cuts("soft15", [voice(5, 0), voice(3, -15), voice(5, 0)])
assert not c, f"nói liền, câu nhỏ hơn 15 dB không được cắt: {c}"
words = [{"start": 5.0 + 0.4 * i, "end": 5.0 + 0.4 * i + 0.35} for i in range(8)]
c = cuts("soft30w", [voice(5, 0), voice(3.2, -30), voice(5, 0)], words)
assert not any(a < 8.2 and b > 5.0 for a, b in c), f"khoảng có từ đã nghe không được cắt: {c}"
print(f"SELFTEST CẮT LẶNG ĐẠT: rút lặng 1,5 s → 0,30 s; giữ câu nhỏ −15 dB; giữ khoảng có từ ở −30 dB")
P

# 16:9 — Skill Edit Video Ngang v0.1.r2: ảnh chỉ trong THẺ cạnh người nói (M1–M6), không B-roll toàn khung; chữ, thẻ, bóng trong title-safe 5 %
python3 "$HERE/ngang.py" --self-test
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/speech.aiff")  # $D bị vòng lặp 4:5 / 1:1 dùng lại làm thư mục
DUR2=$(python3 -c "print(round(2 * $DUR, 3))")  # dài gấp đôi lời nói: có "khúc cuối" cho M3 (split)
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1920x1080:r=30:d=$DUR2" -i "$W/speech.aiff" -filter_complex "[1:a]apad=whole_dur=$DUR2[a]" -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -c:a aac -t $DUR2 "$W/raw169.mp4"
ffmpeg -v error -y -f lavfi -i "testsrc=s=1200x800" -frames:v 1 "$B/tap-the.jpg"
ffmpeg -v error -y -f lavfi -i "rgbtestsrc=s=1200x800" -frames:v 1 "$B/tap-the-2.jpg"
python3 - "$B/manifest.json" <<'P'
import json, sys
m = json.load(open(sys.argv[1]))
m += [{"file": "tap-the.jpg", "kind": "image", "keywords": ["đồng đội"], "license": "Tự tạo bằng ffmpeg lavfi", "source": "selftest"},
      {"file": "tap-the-2.jpg", "kind": "image", "keywords": ["đồng đội"], "license": "Tự tạo bằng ffmpeg lavfi", "source": "selftest"}]
json.dump(m, open(sys.argv[1], "w"), ensure_ascii=False)
P
cat > "$W/plan-169.json" <<'J'
{"by": "selftest", "emphasis": [{"t": 1.0, "text": "Mở đầu", "style": "fade"}, {"t": 9.0, "text": "LẮNG NGHE", "style": "shine"}],
 "diagrams": [{"type": "arrow", "t0": 5.6, "t1": 7.6, "top": {"t": 5.7, "text": "hỏi"}, "bottom": {"t": 6.4, "text": "khen"}},
              {"type": "fs06", "t0": 8.6, "t1": 9.8}, {"type": "leak", "t0": 0.2}],
 "broll": [{"t0": 2.0, "t1": 5.0, "file": "goi-dien.jpg", "keyword": "gọi điện"}, {"t0": 11.2, "t1": 13.0, "file": "tap-the.jpg", "keyword": "khách hàng"},
           {"t0": 6.0, "t1": 7.0, "file": "tap-the-2.jpg"}, {"t0": 13.4, "t1": 14.4, "file": "khong-giay-phep.jpg"},
           {"t0": 20.0, "t1": 21.5, "file": "tap-the-2.jpg"}, {"t0": 21.6, "t1": 23.0, "file": "goi-dien.jpg"}, {"t0": 23.2, "t1": 24.6, "file": "tap-the.jpg"}]}
J
BAOR_LLM_URL=http://127.0.0.1:9 DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/raw169.mp4" --job-dir "$W/esv-169" --plan "$W/plan-169.json" --words "$W/esv/words_main.json" --aspect 16:9 2>"$W/esv-169.log" | tail -1
python3 - "$W/esv-169" <<'P'
import json, subprocess, sys
d = sys.argv[1]
r = json.load(open(f"{d}/report.json"))
qa = {q["id"]: q["status"] for q in r["qa"]}
m = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f"{d}/master.mp4"], capture_output=True, text=True).stdout.strip()
assert m == "1920,1080", m
pv = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f"{d}/preview.mp4"], capture_output=True, text=True).stdout.strip()
assert pv == "1280,720", f"16:9: bản xem trước phải 720p (Phần chung A3.4): {pv}"
bad = [k for k in "ABCDEFGHQRT" if qa.get(k) not in ("pass", "info")]
assert not bad, f"16:9: bảng kiểm chưa đạt {bad}: {[q for q in r['qa'] if q['id'] in bad]}"
ev = r["broll"]["events"]
assert ev and all(e.get("template", "").startswith("M") for e in ev), f"16:9: ảnh phải nằm trong thẻ M1–M6: {ev}"
assert "khong-giay-phep.jpg" not in json.dumps(ev), "16:9: ảnh thiếu giấy phép phải bị loại"
assert any("khung vẽ" in s["reason"] for s in r["broll"]["skipped"]), f"16:9: không đặt thẻ khi đang có khung vẽ: {r['broll']['skipped']}"
assert r["skill"]["name"] == "Skill Edit Video Ngang"
assert qa.get("N") == "na" and r.get("logo") is None, f"16:9: chưa chèn logo (Ngang R8.6) → bảng kiểm N = na: {[q for q in r['qa'] if q['id'] == 'N']}"
m3 = [e for e in ev if e["template"] == "M3"]
assert len(m3) == 3, f"16:9: khúc cuối phải thành M3 (split) với 3 ô: {ev}"
fr = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(m3[-1]["t0"] + 0.8), "-i", f"{d}/master.mp4", "-frames:v", "1", "-vf", "crop=8:8:1905:5", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
assert fr and max(fr) < 90 and fr[2] > fr[0], f"16:9: trong M3 góc trên phải phải là nền navy: {list(fr[:3])}"
nm3 = subprocess.run(["ffmpeg", "-v", "error", "-ss", "3.0", "-i", f"{d}/master.mp4", "-frames:v", "1", "-vf", "crop=8:8:1905:5", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
assert nm3 != fr, "ngoài M3 không có nền navy"
# trong thẻ người nói phải là VIDEO đang chạy (không đen / không navy / không đứng hình) — phản biện P2-3
def px(t):
    return subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", f"{d}/master.mp4", "-frames:v", "1", "-vf", "crop=200:120:500:400", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
c1, c2 = px(m3[1]["t0"] + 0.5), px(m3[1]["t0"] + 1.3)
assert c1 and sum(c1) / len(c1) > 50, "thẻ M3 đen / trống"
assert c1 != c2, "thẻ M3 đứng hình (nền video không chạy)"
print(f"SELFTEST 16:9 ĐẠT: thẻ {[(e['template'], e['file']) for e in ev]}, bỏ {len(r['broll']['skipped'])}")
P

# A16.1.4 logo sáng / tối theo cảnh — (1) luật lịch đổi: trễ quanh ngưỡng, giữ ≥ 2 s, chớp sáng ngắn không làm đổi;
# (2) dựng thật clip tổng hợp nửa sáng nửa tối (+ chớp sáng 1 s) ở 9:16 1080 và 9:16 4K: nửa sáng → logo TỐI, nửa tối → logo SÁNG,
# đo lại điểm ảnh logo trên bản chính; 16:9 không chèn logo (bảng kiểm N = na, kiểm ở khối 16:9 phía trên).
python3 - "$HERE" <<'P'
import sys; sys.path.insert(0, sys.argv[1])
import esv_render as E
sps = E.LOGO_SPS
lum = lambda f, dur: [f(k / sps) for k in range(int(dur * sps))]
s = E.logo_schedule(lum(lambda t: 0.9 if t < 5 or 8 <= t < 9 else 0.1, 12), 12.0)
assert [x[2] for x in s] == ["dark", "light"] and abs(s[0][1] - 5.0) <= 0.25, f"nửa sáng → tối, chớp 1 s không đổi: {s}"
assert E.logo_schedule([0.54, 0.57, 0.53, 0.56] * 12, 12.0) == [(0.0, 12.0, "light")], "dao động sát ngưỡng (trong vùng trễ) không được đổi logo"
s = E.logo_schedule(lum(lambda t: 0.9 if int(t / 1.5) % 2 else 0.1, 15), 15.0)
assert min(b - a for a, b, _ in s) >= E.LOGO_HOLD, f"mỗi lần đổi phải giữ ≥ {E.LOGO_HOLD}s: {s}"
s = E.logo_schedule(lum(lambda t: 0.9 if (t // 3) % 2 else 0.1, 12), 12.0)
assert [x[2] for x in s] == ["light", "dark", "light", "dark"], f"đổi đúng theo từng đoạn 3 s: {s}"
fc = E.logo_filter(s, "1:v", "7:v", 340, "76", 107)
assert fc.count("overlay=") == 4 and "[7:v]" in fc and fc.endswith("[l];") and f"d={E.LOGO_XF:.3f}" in fc, fc
assert E.logo_filter([(0.0, 9.0, "light")], "1:v", "7:v", 340, "76", 107).count("[7:v]") == 0, "cả video tối: không thêm bản logo tối"
# lần đo nền chạy LOGO_SPS khung/s: zoom (theo số khung perspective) phải đổi về khung 30 fps — phản biện 25/10 P2-1 (trước đây lệch ×7,5)
zs = [{"t": 10.0, "out": 14.0, "level": 1.5, "nin": 15, "nout": 15}]
ev_ = lambda expr, n: eval(expr.replace("(in-1)", "(IN-1)").replace("in-1)", "IN-1)"), {"clip": lambda x, a, b: min(max(x, a), b), "pow": pow, "IN": n})
for t in (2, 11, 12.5, 16):
    k = int(t * sps)
    got = ev_(E.zoom_expr(zs, f"((in-1)*{E.FPS / sps:g})"), k + 1)
    want = E.zoom_at(zs, int(round(t * E.FPS)))
    assert abs(got - want) < 1e-6, f"zoom lần đo nền lệch ở {t}s: {got} ≠ {want}"
assert abs(ev_(E.zoom_expr(zs), int(12 * sps) + 1) - 1.0) < 1e-6, "đối chứng: biến (in-1) ở 4 khung/s thì zoom 12 s rơi sai chỗ"
print(f"SELFTEST LỊCH LOGO ĐẠT: ngưỡng {E.LOGO_THR} ±{E.LOGO_HYST}, giữ ≥ {E.LOGO_HOLD}s, chuyển mờ {E.LOGO_XF}s")
P
echo '{"by": "selftest", "emphasis": [], "diagrams": [], "broll": []}' > "$W/plan-logo.json"
echo '[]' > "$W/words-logo.json"
# Ca 3 "cut35" (lỗi thật 25/10 v_mvnu9i50atbkj v6, 9:16 1080 35 s có cắt lặng — chết ở bảng kiểm N): sáng / tối / chớp / sáng, 3 khoảng lặng
# 1,6 s bị cắt → lịch tính trên dòng thời gian SAU cắt, bảng kiểm N đo lại trên bản chính không được làm chết lần dựng.
for CASE in 1080 4k cut35; do
  Q=1080; S=1080x1920; LD=12; CUT=""; AF="anull"
  # nửa đầu nền sáng (0xEEEEEE), nửa sau tối (0x181818) + chớp sáng 1 s trong nửa tối; nhiễu nhẹ để không bị coi là đứng hình
  EN="lt(t,$LD/2)+between(t,$LD*0.75,$LD*0.75+1)"
  if [ "$CASE" = 4k ]; then Q=4k; S=2160x3840; LD=8; EN="lt(t,$LD/2)+between(t,$LD*0.75,$LD*0.75+1)"; fi
  if [ "$CASE" = cut35 ]; then LD=35; CUT="--cut-silence"; EN="lt(t,10)+between(t,22,23)+gte(t,26)"
    AF="volume=enable='between(t,8,9.6)+between(t,20,21.6)+between(t,30,31.5)':volume=0"; fi
  ffmpeg -v error -y -f lavfi -i "color=c=0x181818:s=$S:r=30:d=$LD" -f lavfi -i "sine=frequency=200:duration=$LD" \
    -vf "drawbox=x=0:y=0:w=iw:h=ih:color=0xEEEEEE:t=fill:enable='$EN',noise=alls=12:allf=t" -af "$AF" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$W/logo-$CASE.mp4"
  BAOR_LLM_URL=http://127.0.0.1:9 DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/logo-$CASE.mp4" --job-dir "$W/esv-logo-$CASE" --plan "$W/plan-logo.json" \
    --words "$W/words-logo.json" --no-music --no-sfx --quality "$Q" $CUT 2>"$W/esv-logo-$CASE.log" | tail -1
  python3 - "$W/esv-logo-$CASE" "$CASE" "$LD" "$HERE/../../public/brand/baor-light.png" <<'P'
import json, subprocess, sys
import numpy as np
from PIL import Image
d, case, ld, light = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
r = json.load(open(f"{d}/report.json"))
qa = {x["id"]: x for x in r["qa"]}
k = 2 if case == "4k" else 1
assert r["output"]["width"] == 1080 * k, f"{case}: {r['output']['width']} ({r['output'].get('quality')})"
sch = r["logo"]["schedule"]
if case == "cut35":
    assert r["output"]["cuts"] >= 2 and r["output"]["seconds"] < ld - 2, f"cut35: phải cắt lặng: {r['output']['cuts']} cắt, {r['output']['seconds']}s"
    assert [x[2] for x in sch] == ["dark", "light", "dark"], f"cut35: sáng → tối (chớp 1 s không đổi) → sáng: {sch}"
else:
    assert [x[2] for x in sch] == ["dark", "light"], f"{case}: nửa sáng → logo tối, nửa tối → logo sáng, chớp 1 s không đổi: {sch}"
    assert abs(sch[0][1] - ld / 2) <= 0.3, f"{case}: mốc đổi lệch cảnh: {sch}"
assert min(b - a for a, b, _ in sch) >= 2.0, f"{case}: mỗi bản logo giữ ≥ 2 s: {sch}"
assert qa["N"]["status"] in ("pass", "info"), f"{case}: bảng kiểm N: {qa['N']}"
assert "SAI" not in qa["N"]["detail"] and "baor-dark.png" in qa["N"]["detail"], qa["N"]["detail"]
# đo độc lập trên bản chính: điểm ảnh trong hình logo (alpha > 0,9) — đoạn nền sáng phải TỐI, đoạn nền tối phải SÁNG
lw = 340 * k
im = Image.open(light).convert("RGBA")
lh = round(lw * im.size[1] / im.size[0])
m = np.asarray(im.getchannel("A").resize((lw, lh), Image.BOX), np.float32) / 255 > 0.9
def logo_y(t):
    b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", f"{d}/master.mp4", "-frames:v", "1", "-vf", f"format=gray,crop={lw}:{lh}:{76 * k}:{107 * k}:exact=1",
                        "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
    return float(np.frombuffer(b, np.uint8).reshape(lh, lw)[m].mean()) / 255
yd, yl = logo_y((sch[0][0] + sch[0][1]) / 2), logo_y(sch[1][0] + 1.0)
assert yd < 0.5 < yl, f"{case}: logo trên nền sáng phải tối ({yd:.2f}), trên nền tối phải sáng ({yl:.2f})"
print(f"SELFTEST LOGO THEO CẢNH {case} ĐẠT: {r['output']['width']}x{r['output']['height']} {r['output']['seconds']}s, lịch {sch}, logo Y' {yd:.2f} (nền sáng) / {yl:.2f} (nền tối); N {qa['N']['status']}")
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

# --- 4K vẽ GỐC (OWNER 26/10/2026): lớp chữ / sơ đồ / khung trích dẫn, FS-06, vệt sáng dựng thẳng ở 2160x3840 — trước đây là bản 1080
# phóng ×2 (mềm). Đo "chi tiết vượt 1080" = |I − phóng×2(thu÷2(I))| trung bình trên điểm ảnh biên: ảnh 1080 phóng lên gần như không có
# phần này. (1) Đơn vị: chữ vàng / phụ đề / nhãn / icon vẽ ở RQ=2 phải cùng bố cục với RQ=1 (thu về khớp) mà sắc hơn hẳn bản RQ=1 phóng.
# (2) Dựng thật clip 4K tổng hợp (nền gradient trơn — chi tiết đo được chỉ đến từ lớp vẽ) và đo trên bản chính.
cat > "$W/sharp.py" <<'P'
import subprocess
import numpy as np
from PIL import Image
def hf(a):
    a = np.asarray(a, np.float32)
    h, w = a.shape
    im = Image.fromarray(a)
    rt = np.asarray(im.resize((w // 2, h // 2), Image.BOX).resize((w // 2 * 2, h // 2 * 2), Image.LANCZOS), np.float32)
    a = a[:h // 2 * 2, :w // 2 * 2]
    gy, gx = np.gradient(a)
    edge = np.hypot(gx, gy) > 20
    return float(np.abs(a - rt)[edge].mean()) if edge.sum() > 50 else 0.0
def grab(path, t, box):
    x0, y0, x1, y1 = box
    b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", "-vf", f"crop={x1 - x0}:{y1 - y0}:{x0}:{y0}:exact=1,format=gray",
                        "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
    return np.frombuffer(b, np.uint8).reshape(y1 - y0, x1 - x0)
P
python3 - "$HERE" "$W" <<'P'
import sys; sys.path.insert(0, sys.argv[1]); sys.path.insert(0, sys.argv[2])
import numpy as np
from PIL import Image, ImageFilter
import esv_render as E
from sharp import hf
fsub = lambda: E.font("Times New Roman Italic.ttf", 66 * E.SS * E.RQ)
unit = {"words": [{"text": x} for x in "Lắng nghe khách hàng trước khi tư vấn".split()]}
mk = {"chữ vàng": lambda: E.render_gold("LẮNG NGHE", 150)[0], "phụ đề": lambda: E.draw_subtitle(unit, 2, fsub())[0],
      "nhãn": lambda: E.label_img("Chăm sóc khách hàng", 66), "icon": lambda: E.ring_icon(42, "tick")}
rows = []
for name, f in mk.items():
    E.RQ = 1; a = f()
    E.RQ = 2; b = f()
    E.RQ = 1
    # gấp đôi cỡ (± 1 % — cỡ chữ ×2 làm tròn khác nhau vài px ở mép trong suốt)
    assert all(abs(q2 - 2 * q1) <= max(4, 0.01 * 2 * q1) for q1, q2 in zip(a.size, b.size)), f"{name}: RQ=2 phải gấp đôi cỡ: {a.size} → {b.size}"
    # cùng bố cục: hộp nét (alpha > 40) của bản RQ=2 ÷ 2 lệch ≤ 2 px so với RQ=1; ảnh thu về (làm mềm 1,5 px) gần như trùng
    bb1 = a.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    bb2 = b.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    assert all(abs(v2 / 2 - v1) <= 2 for v1, v2 in zip(bb1, bb2)), f"{name}: hộp nét lệch: {bb1} vs {bb2} ÷ 2"
    soft = lambda im: np.asarray(im.getchannel("A").filter(ImageFilter.GaussianBlur(1.5)), np.float32)
    lay = float(np.abs(soft(b.resize(a.size, Image.BOX)) - soft(a)).mean())
    assert lay < 6.0, f"{name}: RQ=2 thu về phải khớp bố cục RQ=1 (lệch alpha {lay:.1f})"
    g2 = np.asarray(b.convert("LA").getchannel("L"), np.float32) * np.asarray(b.getchannel("A"), np.float32) / 255
    g1 = np.asarray(a.convert("LA").getchannel("L"), np.float32) * np.asarray(a.getchannel("A"), np.float32) / 255
    up = np.asarray(Image.fromarray(g1).resize(b.size, Image.LANCZOS), np.float32)
    s2, s1 = hf(g2), hf(up)
    assert s2 > 1.5 * s1, f"{name}: vẽ gốc 4K phải sắc hơn bản 1080 phóng ×2 (lanczos) ≥ 1,5 lần (chi tiết {s2:.1f} vs {s1:.1f})"
    rows.append(f"{name} {s1:.1f}→{s2:.1f}")
print("SELFTEST 4K VẼ GỐC (đơn vị) ĐẠT: chi tiết vượt 1080 (phóng ×2 → vẽ gốc): " + "; ".join(rows))
P
ffmpeg -v error -y -f lavfi -i "gradients=s=2160x3840:r=30:d=8:speed=0.03:c0=0x303846:c1=0x6a5a40:x0=0:y0=0:x1=2160:y1=3840" \
  -f lavfi -i "sine=frequency=200:duration=8" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$W/sharp4k.mp4"
python3 - "$W/sharp4k-words.json" <<'P'
import json, sys
toks = "lắng nghe khách hàng là kỹ năng quan trọng nhất của người tư vấn bán hàng mỗi ngày".split()
ws, t = [], 0.3
for k in range(18):
    ws.append({"start": round(t, 2), "end": round(t + 0.32, 2), "text": toks[k % len(toks)] + ("." if k % 6 == 5 else ""), "p": 0.9})
    t += 0.42 if k % 6 != 5 else 0.7
json.dump(ws, open(sys.argv[1], "w"), ensure_ascii=False)
P
cat > "$W/plan-sharp.json" <<'J'
{"by": "selftest", "content": "hướng dẫn", "emphasis": [{"t": 0.8, "text": "LẮNG NGHE", "style": "fade"}],
 "diagrams": [{"type": "fs06", "t0": 2.4, "t1": 4.6}, {"type": "compare", "t0": 2.5, "t1": 4.6, "wrong": {"t": 2.6, "text": "nói nhiều", "strike": 3.0}, "right": [{"t": 3.3, "text": "nghe nhiều"}]},
  {"type": "leak", "t0": 4.4}, {"type": "quote", "t0": 5.0, "t1": 7.6, "text": "lắng nghe trước, tư vấn sau"}]}
J
BAOR_LLM_URL=http://127.0.0.1:9 DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/sharp4k.mp4" --job-dir "$W/esv-sharp4k" --plan "$W/plan-sharp.json" \
  --words "$W/sharp4k-words.json" --no-music --no-sfx --quality 4k 2>"$W/esv-sharp4k.log" | tail -1
python3 - "$W" "$W/esv-sharp4k" <<'P'
import json, sys; sys.path.insert(0, sys.argv[1])
from sharp import grab, hf
d = sys.argv[2]
r = json.load(open(f"{d}/report.json"))
qa = {q["id"]: q for q in r["qa"]}
assert (r["output"]["width"], r["output"]["height"]) == (2160, 3840), r["output"]
bad = [k for k in "ABEGHI" if qa[k]["status"] != "pass"]
assert not bad, f"4K vẽ gốc: bảng kiểm chưa đạt {bad}: {[qa[k] for k in bad]}"
# F / T ghi theo độ phân giải thật (không còn toạ độ thiết kế 1080 cho bản 4K)
assert qa["F"]["status"] == "pass" and "logo rộng 680 tại (152,214)" in qa["F"]["detail"] and "@2160x3840" in qa["F"]["detail"], qa["F"]["detail"]
assert "y3200 @2160x3840" in qa["T"]["detail"], qa["T"]["detail"]
m = f"{d}/master.mp4"
# (lúc, vùng @4K, ngưỡng): ngưỡng ~ 2× mức đo được của bản cũ (1080 phóng ×2) trên đúng clip này
cases = [("phụ đề", 1.6, (180, 3000, 1980, 3232), 14.0), ("chữ nhấn", 1.6, (200, 2560, 1960, 2830), 12.0), ("so sánh", 4.0, (160, 2240, 1400, 2700), 12.0),
         ("trích dẫn", 7.2, (160, 2240, 2000, 2700), 14.0), ("FS-06 viền khung", 3.5, (1190, 200, 1290, 1720), 10.0), ("vệt sáng", 6.0, (0, 600, 2160, 2000), 10.0)]
rows, low = [], []
for name, t, box, thr in cases:
    v = hf(grab(m, t, box))
    rows.append(f"{name} {v:.1f}")
    if v < thr:
        low.append(f"{name} {v:.1f} < {thr}")
assert not low, f"4K chưa sắc (giống 1080 phóng ×2): {low}"
print(f"SELFTEST 4K VẼ GỐC (bản chính) ĐẠT: chi tiết vượt 1080 trên biên — {'; '.join(rows)}; F/T ghi @2160x3840")
P

# --- Zoom (OWNER 26/10/2026 "zoom còn thưa"): clip 36 s nói liên tục, 3 chữ nhấn, nhịp VỪA. Trước: 3 zoom (12 s / lần — chỉ zoom ở chữ
# nhấn, lấp trống chỉ thử đầu câu). Nay: punch-in nhẹ trong cửa sổ chữ nhấn + lấp trống tới mốc sớm nhất hợp lệ → ≈ 1 zoom / 6–8 s,
# vẫn giãn cách ≥ hồ sơ giữa mọi zoom, không zoom nào trùm lên nhau, xong trước cuối video.
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1080x1920:r=30:d=36" -f lavfi -i "sine=frequency=220:duration=36" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$W/zoom36.mp4"
python3 - "$W/zoom36-words.json" <<'P'
import json, sys
toks = "hôm nay mình nói về cách mở đầu cuộc gọi khi gọi điện thoại cho khách hàng hãy giới thiệu bạn là ai sau đó nhắc lại nguồn thông tin khách đã để lại lắng nghe khách hàng là kỹ năng quan trọng nhất".split()
ws, t, k = [], 0.4, 0
while t < 35.2:
    ws.append({"start": round(t, 2), "end": round(t + 0.32, 2), "text": toks[k % len(toks)] + ("." if k % 7 == 6 else ""), "p": 0.9})
    t += 0.42 if k % 7 != 6 else 0.8
    k += 1
json.dump(ws, open(sys.argv[1], "w"), ensure_ascii=False)
P
cat > "$W/plan-zoom.json" <<'J'
{"by": "selftest", "content": "hướng dẫn", "emphasis": [{"t": 6.0, "text": "Mở đầu", "style": "blur"}, {"t": 17.0, "text": "LẮNG NGHE", "style": "shine"},
 {"t": 28.0, "text": "Khách hàng", "style": "fade"}], "diagrams": [], "broll": []}
J
BAOR_LLM_URL=http://127.0.0.1:9 DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/zoom36.mp4" --job-dir "$W/esv-zoom36" --plan "$W/plan-zoom.json" \
  --words "$W/zoom36-words.json" --no-music --no-sfx 2>"$W/esv-zoom36.log" | tail -1
python3 - "$HERE" "$W/esv-zoom36" <<'P'
import json, sys; sys.path.insert(0, sys.argv[1])
import esv_render as E
r = json.load(open(f"{sys.argv[2]}/report.json"))
qa = {q["id"]: q["status"] for q in r["qa"]}
bad = [k for k in "ABCDEGHI" if qa.get(k) != "pass"]
assert not bad, f"zoom 36 s: bảng kiểm chưa đạt {bad}"
z = r["zoom"]
ev, dur, gap = sorted(z["events"], key=lambda x: x["t"]), r["output"]["seconds"], E.ZOOM_PROFILES[z["profile"]][3]
assert z["profile"] == "VUA", z["profile"]
assert z["count"] >= 5 and z["secPerZoom"] <= 8.0, f"mục tiêu ≈ 1 zoom / 6–8 s: {z['count']} zoom, {z['secPerZoom']} s / lần"
for a, b in zip(ev, ev[1:]):
    assert b["t"] - E._zoom_end(a) >= gap - 1e-6, f"giãn cách hồ sơ {gap}s bị vi phạm: {a} → {b}"
    if b["kind"].startswith("fill"):
        assert b["t"] - a["t"] >= 6.0 - 1e-6, f"zoom lấp trống phải cách zoom trước ≥ 6 s (tính từ lúc bắt đầu): {a['t']} → {b['t']}"
assert all(E._zoom_end(x) <= dur - 0.5 for x in ev), "zoom phải xong trước cuối video 0,5 s"
emp = [e["t"] for e in r["emphasis"]]
assert all(any(x["kind"] == "punch" and abs(x["t"] - (t - 0.1)) < 1e-3 for x in ev) for t in emp), f"mỗi chữ nhấn có punch-in đồng bộ: {ev}"
assert all(x["level"] <= 1.05 for x in ev if x["kind"] in ("punch", "fill-punch")), "punch-in phải nhẹ (≤ ×1,05)"
cap = r["captions"]
assert 0 < cap["subCacheMax"] <= cap["maxWordsPerUnit"] + 1, f"bộ đệm phụ đề chỉ được giữ ảnh của cụm đang hiện: {cap}"
print(f"SELFTEST ZOOM 36 s ĐẠT: {z['count']} zoom ({z['secPerZoom']} s / lần, trống dài nhất {z['longestNoZoomSec']} s; trước sửa: 3 zoom, 12 s / lần) — "
      + ", ".join(f"{x['t']:.1f}s {x['kind']}" for x in ev))
P

# --- Bộ đệm phụ đề (phản biện P2-1): trước đây giữ ảnh MỌI từ cả video (16:9 4K 120 s: 2,8 GB RAM, ngoại suy 10 phút ≈ 15 GB).
# Nay chỉ giữ ảnh của cụm đang hiện → bộ nhớ đỉnh KHÔNG tăng theo số từ: video dài gấp 4 lần cùng mức đỉnh (ảnh cỡ phụ đề 4K 2160×400).
python3 - "$HERE" <<'P'
import sys, tracemalloc; sys.path.insert(0, sys.argv[1])
import numpy as np
import esv_render as E
def peak(n_units, words=6):
    units = [{"words": [{"text": f"w{k}"} for k in range(words)]} for _ in range(n_units)]
    cache = {}
    tracemalloc.start()
    for u in units:            # khung theo thời gian: mỗi cụm, mỗi từ đang đọc (và −1 giữa hai từ) vài khung liền
        for hl in [-1] + list(range(words)):
            for _ in range(3):
                E.sub_image(cache, u, hl, lambda: (np.ones((400, 2160, 4), np.uint8), 1430))  # cỡ ảnh phụ đề 4K; numpy để tracemalloc đếm được
    _, pk = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return pk / 2 ** 20, cache["_max"]
(p20, m20), (p80, m80) = peak(20), peak(80)
assert m20 == m80 == 7, f"giữ cùng lúc tối đa (từ + 1) ảnh của MỘT cụm: {m20}, {m80}"
assert p80 < 1.15 * p20 + 4, f"bộ nhớ đỉnh tăng theo số từ: 20 cụm {p20:.0f} MB → 80 cụm {p80:.0f} MB"
print(f"SELFTEST BỘ ĐỆM PHỤ ĐỀ ĐẠT: đỉnh {p20:.0f} MB (120 từ) / {p80:.0f} MB (480 từ), giữ tối đa {m80} ảnh (cũ: giữ mọi từ → ~{480 * 2160 * 400 * 4 / 2 ** 20:.0f} MB)")
P

# --- "AI biên tập lại" cùng lời nói: esv_render giữ kế hoạch cũ và truyền prev cho ai_plan → lần 2 KHÔNG gọi lại bước phân tích cấu trúc.
# Mô hình GIẢ chạy ở 127.0.0.1 (cổng ngẫu nhiên, trả JSON đúng khuôn từng bước, đếm lượt gọi) — không gọi llama-server thật.
cat > "$W/fake_llm.py" <<'P'
import json, re, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
LOG = sys.argv[1]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def _send(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self._send({"status": "ok"} if self.path.startswith("/health") else {"model_path": "/models/fake-selftest.gguf"})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        props = set(body["response_format"]["json_schema"]["schema"].get("properties", {}))
        text = body["messages"][-1]["content"]
        m = re.search(r"\[(\d+)\] \([\d.]+s\) (\S+) (\S+)", text)
        ns = [int(x) for x in re.findall(r"(?m)^(\d+)\. ", text)]
        if "key_ideas" in props:
            kind, out = "analyze", {"topic": "lắng nghe khách hàng", "key_ideas": [], "lists": [], "contrasts": [], "cause_effect": [], "sections": []}
        elif "emphasis" in props:
            kind, out = "plan", {"summary": "lắng nghe", "diagrams": [], "emphasis": ([{"sid": int(m.group(1)), "phrase": f"{m.group(2)} {m.group(3)}", "why": ""}] if m else [])}
        elif "verdicts" in props:
            kind, out = "judge", {"verdicts": [{"n": n, "score": 4, "reason": "ok"} for n in ns]}
        elif "fixes" in props:
            kind, out = "repair", {"fixes": []}
        elif "picks" in props:
            kind, out = "broll", {"picks": []}
        elif "checks" in props:
            kind, out = "check", {"checks": []}
        else:
            kind, out = "music", {"mood": "acoustic", "why": "ấm"}
        open(LOG, "a").write(kind + "\n")
        self._send({"choices": [{"message": {"content": json.dumps(out, ensure_ascii=False)}}]})
srv = HTTPServer(("127.0.0.1", 0), H)
open(LOG + ".port", "w").write(str(srv.server_address[1]))
srv.serve_forever()
P
rm -f "$W/fake_llm.log" "$W/fake_llm.log.port"
python3 "$W/fake_llm.py" "$W/fake_llm.log" & FAKE=$!
trap 'kill $FAKE 2>/dev/null || true' EXIT
for _ in $(seq 50); do [ -s "$W/fake_llm.log.port" ] && break; python3 -c "import time; time.sleep(0.1)"; done
LLM="http://127.0.0.1:$(cat "$W/fake_llm.log.port")"
ffmpeg -v error -y -i "$W/zoom36.mp4" -t 8 -c copy "$W/ai8.mp4"
python3 -c "import json,sys; w=json.load(open(sys.argv[1])); json.dump([x for x in w if x['end'] < 7.6], open(sys.argv[2], 'w'), ensure_ascii=False)" "$W/zoom36-words.json" "$W/ai8-words.json"
BAOR_LLM_URL="$LLM" DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/ai8.mp4" --job-dir "$W/esv-ai1" --words "$W/ai8-words.json" --ai-plan --no-music --no-sfx 2>"$W/esv-ai1.log" | tail -1
cp "$W/fake_llm.log" "$W/fake_llm.run1"; : > "$W/fake_llm.log"
BAOR_LLM_URL="$LLM" DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/ai8.mp4" --job-dir "$W/esv-ai2" --words "$W/ai8-words.json" --plan "$W/esv-ai1/plan.json" --ai-plan --no-music --no-sfx 2>"$W/esv-ai2.log" | tail -1
cp "$W/fake_llm.log" "$W/fake_llm.run2"; : > "$W/fake_llm.log"
BAOR_AI_REANALYZE=1 BAOR_LLM_URL="$LLM" DATA_DIR="$W/data" python3 "$HERE/esv_render.py" --input "$W/ai8.mp4" --job-dir "$W/esv-ai3" --words "$W/ai8-words.json" --plan "$W/esv-ai1/plan.json" --ai-plan --no-music --no-sfx 2>"$W/esv-ai3.log" | tail -1
cp "$W/fake_llm.log" "$W/fake_llm.run3"
kill $FAKE 2>/dev/null || true; wait $FAKE 2>/dev/null || true; trap - EXIT
python3 - "$W" <<'P'
import json, sys
W = sys.argv[1]
p1, p2, p3 = (json.load(open(f"{W}/esv-ai{k}/plan.json")) for k in (1, 2, 3))
seen = [open(f"{W}/fake_llm.run{k}").read().split() for k in (1, 2, 3)]
calls = lambda p: (p.get("ai") or {}).get("calls", {}).get("analyze", {}).get("calls", 0)
for k, p in enumerate((p1, p2, p3), 1):
    assert str(p.get("by", "")).startswith("Biên tập AI"), f"lần {k}: kế hoạch phải do biên tập AI (mô hình giả) lập: {p.get('by')}"
assert calls(p1) >= 1 and seen[0].count("analyze") == calls(p1), f"lần 1 phải phân tích: {p1['ai']['calls']} / máy chủ thấy {seen[0]}"
assert calls(p2) == 0 and "analyze" not in seen[1] and p2["ai"]["analysisReused"], f"lần 2 cùng lời nói phải DÙNG LẠI phân tích: {p2['ai']['calls']} / {seen[1]}"
assert calls(p3) == calls(p1) and p3["ai"]["analysisReused"] is False, f"BAOR_AI_REANALYZE=1 phải phân tích lại: {p3['ai']['calls']}"
assert len(seen[1]) < len(seen[0]), f"lần 2 phải gọi mô hình ít hơn: {seen[0]} → {seen[1]}"
print(f"SELFTEST AI DÙNG LẠI PHÂN TÍCH ĐẠT: lần 1 {len(seen[0])} lượt gọi ({calls(p1)} phân tích), lần 2 {len(seen[1])} lượt (0 phân tích, dùng lại), ép làm lại {len(seen[2])} lượt")
P
