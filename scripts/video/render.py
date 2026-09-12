#!/usr/bin/env python3
"""Dựng video "người nói + phụ đề nhấn từ khóa" theo luật, không AI.

Đầu vào: clip người nói, bản chữ có mốc thời gian từng từ (Whisper JSON), tùy chọn nhạc nền và logo.
Các bước (mỗi bước là công thức, chạy lại cho kết quả giống hệt):
  1. Tìm khoảng lặng > CUT_SILENCE giây, cắt bỏ (jump cut), dịch lại mốc thời gian chữ.
  2. Gom từ thành khung phụ đề (tối đa MAX_WORDS từ hoặc MAX_SEC giây, ngắt ở dấu câu).
  3. Từ khóa (số, năm, danh sách thương hiệu) phóng to, đậm, màu nhấn; từ thường chữ trắng.
  4. Ghép: cắt lặng, phụ đề PNG phủ theo thời gian, logo góc, nhạc nền hạ âm khi có tiếng người, xuất 1080×1920.

Cách dùng:
  python3 scripts/video/render.py --input clip.mov --transcript words.json --out ra.mp4 \
      [--music nhac.mp3] [--logo logo.png] [--keywords "AI,marketing"] [--accent F2C94C]
"""
import argparse, json, re, subprocess, sys, tempfile, os, unicodedata

CUT_SILENCE = 0.6      # giây: lặng dài hơn mức này thì cắt
SILENCE_DB = -35       # ngưỡng coi là lặng
KEEP_PAD = 0.12        # giữ lại một chút trước/sau tiếng nói để không cụt
MAX_WORDS = 4
MAX_SEC = 1.8
W, H = 1080, 1920
FONT = "Helvetica Neue"

def run(cmd, capture=False):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-2000:])
        raise SystemExit(f"Lỗi lệnh: {' '.join(cmd[:3])}…")
    return r.stderr if capture else None

def nfd(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()

# ---------- 1. Khoảng lặng → đoạn giữ ----------
def silences(path, db=SILENCE_DB):
    err = run(["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=noise={db}dB:d={CUT_SILENCE}", "-f", "null", "-"], capture=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    return list(zip(starts, ends[: len(starts)]))

def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout
    return float(out.strip())

def keep_segments(total, sil):
    segs, cur = [], 0.0
    for s, e in sil:
        s2, e2 = s + KEEP_PAD, e - KEEP_PAD
        if s2 > cur:
            segs.append((cur, s2))
        cur = max(cur, e2)
    if cur < total:
        segs.append((cur, total))
    return [(a, b) for a, b in segs if b - a > 0.05]

def remap(t, segs):
    """Mốc thời gian gốc → mốc sau khi cắt."""
    acc = 0.0
    for a, b in segs:
        if t < a:
            return acc
        if t <= b:
            return acc + (t - a)
        acc += b - a
    return acc

# ---------- 2. Gom từ thành khung ----------
def chunks(words):
    out, cur = [], []
    for w in words:
        cur.append(w)
        span = cur[-1]["end"] - cur[0]["start"]
        endp = re.search(r"[.,!?…]$", w["word"].strip())
        if len(cur) >= MAX_WORDS or span >= MAX_SEC or endp:
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    return out

# ---------- 3. Phụ đề: mỗi dòng một PNG, hiện lần lượt theo lời nói ----------
# Bố cục như video mẫu: dòng phụ nhỏ chữ nghiêng, TỪ KHÓA font hẹp cao (Anton) tô vàng chuyển sắc có viền tối,
# dòng phụ tiếp theo bên dưới. Khối chữ đặt ở khoảng 60% chiều cao (dưới mặt), không sát đáy.
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "..", "public", "fonts")
FONT_SMALL = os.path.join(FONTS, "BeVietnamPro-MediumItalic.ttf")
FONT_PLAIN = os.path.join(FONTS, "BeVietnamPro-SemiBold.ttf")
FONT_BIG = os.path.join(FONTS, "Anton-Regular.ttf")
SIZE_SMALL, SIZE_PLAIN, SIZE_BIG = 46, 58, 150
MAX_LINE_W = 920
BLOCK_CENTER_Y = 0.60   # tâm khối chữ theo tỷ lệ chiều cao
ROW_GAP = 6

def is_key_factory(keywords):
    kw = [nfd(k) for k in keywords if k.strip()]
    def is_key(word):
        w = nfd(re.sub(r"[^\w%-]", "", word))
        if not w: return False
        if re.fullmatch(r"\d[\d.,-]*%?", w): return True
        return any(k == w or (len(k) > 3 and k in w) for k in kw)
    return is_key

def _label(font, size_args, fill, text, extra):
    return ["-font", font, *size_args, "-fill", fill, *extra, f"label:{text}"]

def text_png(text, kind, accent, path):
    """kind: small (nghiêng, trắng) | plain (đậm, trắng) | big (Anton, vàng chuyển sắc, viền tối, bóng)."""
    font, size = {"small": (FONT_SMALL, SIZE_SMALL), "plain": (FONT_PLAIN, SIZE_PLAIN), "big": (FONT_BIG, SIZE_BIG)}[kind]
    size_args = ["-pointsize", str(size)]
    def build(size_args):
        if kind == "big":
            # mặt chữ trắng làm khuôn → tô gradient vàng sáng → vàng đậm; viền nâu tối; bóng mềm
            run(["magick", "-background", "none", *_label(font, size_args, "white", text, []), "-trim", "+repage",
                 "(", "+clone", "-alpha", "extract", ")", "-delete", "0",
                 "(", "+clone", "-fill", "none", "-background", "none", "-sparse-color", "barycentric", f"0,0 #FFE68A 0,%[fx:h] #{accent}", ")",
                 "+swap", "-compose", "CopyOpacity", "-composite", "+repage", path])
            # viền tối + bóng: vẽ lại chữ với stroke rồi đặt gradient lên trên
            run(["magick", "-background", "none", *_label(font, size_args, "#3a2a05", text, ["-stroke", "#3a2a05", "-strokewidth", "9"]), "-trim", "+repage",
                 "(", "+clone", "-background", "black", "-shadow", "70x10+0+10", ")", "+swap", "-background", "none", "-layers", "merge", "+repage",
                 path, "-gravity", "center", "-compose", "over", "-composite", "+repage", path])
        else:
            fill = "white"
            run(["magick", "-background", "none", *_label(font, size_args, fill, text, ["-stroke", "black", "-strokewidth", "3"]),
                 *_label(font, size_args, fill, text, []), "-gravity", "center", "-compose", "over", "-composite",
                 "(", "+clone", "-background", "black", "-shadow", "60x6+0+6", ")", "+swap", "-background", "none", "-layers", "merge", "+repage", "-trim", "+repage", path])
        return int(subprocess.run(["magick", "identify", "-format", "%w", path], capture_output=True, text=True).stdout)
    w = build(size_args)
    if w > MAX_LINE_W:
        build(["-size", f"{MAX_LINE_W}x{int(size * 1.3)}"])
    h = int(subprocess.run(["magick", "identify", "-format", "%h", path], capture_output=True, text=True).stdout)
    return w, h

def caption_rows(chunk, is_key, accent, tmp, idx):
    """Trả về các dòng [(png, w, h, start)] của một khung; start = lúc từ đầu dòng được nói."""
    items = [(w["word"].strip(), w["start"]) for w in chunk if w["word"].strip()]
    flags = [is_key(t) for t, _ in items]
    rows = []
    if any(flags):
        i0 = flags.index(True); i1 = i0
        while i1 + 1 < len(flags) and flags[i1 + 1]: i1 += 1
        groups = [(items[:i0], "small"), (items[i0:i1 + 1], "big"), (items[i1 + 1:], "small")]
    else:
        groups = [(items, "plain")]
    out = []
    for r, (grp, kind) in enumerate(groups):
        if not grp: continue
        text = " ".join(t for t, _ in grp)
        if kind == "big": text = re.sub(r"[.,!?…]+$", "", text).upper()
        p = os.path.join(tmp, f"r{idx}_{r}.png")
        w, h = text_png(text, kind, accent, p)
        out.append((p, w, h, grp[0][1]))
    return out

# ---------- 4. Ghép ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True); ap.add_argument("--transcript", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--music"); ap.add_argument("--logo"); ap.add_argument("--keywords", default=""); ap.add_argument("--accent", default="F2C94C")
    ap.add_argument("--no-cut", action="store_true", help="không cắt khoảng lặng")
    ap.add_argument("--silence-db", type=float, default=SILENCE_DB, help="ngưỡng lặng (dB), clip có nhạc nền sẵn cần -25")
    a = ap.parse_args()

    tr = json.load(open(a.transcript))
    words = [w for seg in tr["segments"] for w in seg.get("words", [])]
    total = duration(a.input)
    segs = [(0.0, total)] if a.no_cut else keep_segments(total, silences(a.input, a.silence_db))
    cut_total = sum(b - x for x, b in segs)
    words2 = [{"word": w["word"], "start": remap(w["start"], segs), "end": remap(w["end"], segs)} for w in words]
    ch = chunks(words2)

    tmp = tempfile.mkdtemp()
    is_key = is_key_factory(a.keywords.split(","))
    overlays = []  # (png, x, y, start, end)
    for i, c in enumerate(ch):
        rows = caption_rows(c, is_key, a.accent, tmp, i)
        total_h = sum(h for _, _, h, _ in rows) + ROW_GAP * (len(rows) - 1)
        y = int(H * BLOCK_CENTER_Y - total_h / 2)
        end_t = c[-1]["end"] + 0.10
        for png, w, h, st in rows:
            overlays.append((png, (W - w) // 2, y, st, end_t))
            y += h + ROW_GAP

    # Vùng tối mềm ở nửa dưới để chữ nổi (như mẫu)
    vig = os.path.join(tmp, "vignette.png")
    run(["magick", "-size", f"{W}x{H}", "gradient:none-black", "-channel", "A", "-evaluate", "multiply", "0.45", "+channel", vig])

    sel = "+".join(f"between(t,{x:.3f},{b:.3f})" for x, b in segs)
    inputs = ["-i", a.input, "-i", vig]
    fc = (f"[0:v]fps=30,select='{sel}',setpts=N/30/TB,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}[base];"
          f"[base][1:v]overlay=0:0:format=auto[v0];[0:a]aselect='{sel}',asetpts=N/SR/TB[voice]")
    cur = "[v0]"
    for i, (png, x, y, s0, e0) in enumerate(overlays):
        inputs += ["-i", png]
        n = len(inputs) // 2 - 1
        # mỗi dòng hiện từ lúc từ đầu dòng được nói tới hết khung
        fc += f";{cur}[{n}:v]overlay={x}:{y}:enable='between(t,{s0:.3f},{e0:.3f})':format=auto[c{i}]"
        cur = f"[c{i}]"
    vout, aout = cur, "[voice]"
    if a.logo:
        inputs += ["-i", a.logo]
        n = len(inputs) // 2 - 1
        fc += f";[{n}:v]scale=220:-1[lg];{cur}[lg]overlay=W-w-48:64:format=auto[vl]"
        vout = "[vl]"
    if a.music:
        inputs += ["-stream_loop", "-1", "-i", a.music]
        n = len(inputs) // 2 - 1
        fc += (f";[{n}:a]atrim=0:{cut_total:.3f},volume=0.9[mus];[mus][voice]sidechaincompress=threshold=0.05:ratio=8:attack=40:release=400[duck];"
               f"[voice][duck]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
        aout = "[aout]"
    else:
        fc += ";[voice]loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
        aout = "[aout]"

    cmd = ["ffmpeg", "-hide_banner", "-y", *inputs, "-filter_complex", fc, "-map", vout, "-map", aout,
           "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", a.out]
    run(cmd)
    print(json.dumps({"input_seconds": round(total, 1), "output_seconds": round(cut_total, 1), "cuts": len(segs) - 1, "captions": len(ch), "out": a.out}, ensure_ascii=False))

if __name__ == "__main__":
    main()
