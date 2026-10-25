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
MAX_WORDS = 5
MAX_SEC = 2.2
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
PAUSE_BREAK = 0.35  # giây: ngừng giữa hai từ dài hơn mức này thì sang khung mới

STOP = set(("và của cho là thì mà với để có một những các này đó khi từ trong ra vào lên xuống được bị đã sẽ đang rất cũng còn nhưng "
            "hay hoặc tôi mình bạn anh chị em nó họ ở về theo như nếu vì việc khoảng quanh xung đấy đây kia nào đâu sao gì thế vậy "
            "chẳng hạn ví dụ chính bằng cái con người lại nữa rồi xong luôn thôi mới chỉ đều cả mọi từng tầm đến tới qua sau trước "
            "trên dưới giữa ngoài chúng ta hơn kém nhiều ít lắm quá thật thực đúng sai đúng thứ cách phải nên cần muốn thích biết").split())
STOP = set(map(lambda x: x, STOP))

def chunks(words, is_key=lambda t: False):
    out, cur = [], []
    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else None
        if cur and w["start"] - cur[-1]["end"] > PAUSE_BREAK:
            out.append(cur); cur = []
        # sang khung mới ngay trước từ khóa nếu khung hiện tại đã có ≥ 2 từ và chưa có từ khóa
        if cur and len(cur) >= 2 and is_key(w) and not any(is_key(x) for x in cur):
            out.append(cur); cur = []
        cur.append(w)
        span = cur[-1]["end"] - cur[0]["start"]
        endp = re.search(r"[.,!?…]$", w["word"].strip())
        # không cắt giữa một cụm từ khóa ("chi" | "phí")
        inside_phrase = is_key(w) and nxt is not None and is_key(nxt) and nxt["start"] - w["end"] <= PAUSE_BREAK
        if (len(cur) >= MAX_WORDS or span >= MAX_SEC or endp) and not inside_phrase:
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
FONT_BIG = os.path.join(FONTS, "BarlowCondensed-ExtraBold.ttf")
SIZE_SMALL, SIZE_PLAIN, SIZE_BIG = 48, 60, 200
MAX_LINE_W = 920
BLOCK_CENTER_Y = 0.60   # tâm khối chữ theo tỷ lệ chiều cao
ROW_GAP = 6

def clean(word):
    return nfd(re.sub(r"[^\w%-]", "", word))

def mark_keywords(words, keywords):
    """Đánh dấu w["key"] cho từ khóa, kể cả cụm nhiều từ ("chi phí", "kế hoạch") và số / năm / phần trăm."""
    phrases = [tuple(nfd(k).split()) for k in keywords if k.strip()]
    toks = [clean(w["word"]) for w in words]
    for w, t in zip(words, toks):
        w["key"] = bool(t) and bool(re.fullmatch(r"\d[\d.,-]*%?", t))
    for ph in phrases:
        n = len(ph)
        for i in range(len(toks) - n + 1):
            if all(toks[i + j] == ph[j] or (len(ph[j]) > 3 and ph[j] in toks[i + j]) for j in range(n)):
                for j in range(n): words[i + j]["key"] = True
    return words

def is_key_factory(keywords):
    """Giữ giao diện cũ: kiểm tra theo w["key"] nếu có, không thì theo từ đơn."""
    kw = [nfd(k) for k in keywords if k.strip()]
    def is_key(word):
        if isinstance(word, dict): return bool(word.get("key"))
        w = clean(word)
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
            mask = path + ".mask.png"
            run(["magick", "-background", "none", *_label(font, size_args, "white", text, []), "-trim", "+repage", "-alpha", "extract", mask])
            mw, mh = subprocess.run(["magick", "identify", "-format", "%w %h", mask], capture_output=True, text=True).stdout.split()
            h1 = max(1, int(int(mh) * 0.55)); h2 = max(1, int(mh) - h1)
            # gradient 3 nấc: trắng kem → màu nhấn → vàng đậm, cắt theo khuôn chữ
            run(["magick", "(", "-size", f"{mw}x{h1}", f"gradient:#FFF7C2-#{accent}", ")", "(", "-size", f"{mw}x{h2}", f"gradient:#{accent}-#E0A616", ")",
                 "-append", mask, "-compose", "CopyOpacity", "-composite", "+repage", path])
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
    flags = [is_key(w) for w in chunk if w["word"].strip()]
    if not any(flags) and len(items) >= 2:
        # không có từ khóa: nhấn từ dài nhất không phải từ nối, để khung nào cũng có điểm nhìn như mẫu
        stop_nfd = {nfd(x) for x in STOP}
        cands = [(len(nfd(t)), i) for i, (t, _) in enumerate(items) if len(nfd(re.sub(r"[^\w]", "", t))) >= 5 and nfd(re.sub(r"[^\w]", "", t)) not in stop_nfd]
        if cands:
            flags[max(cands)[1]] = True
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

# ---------- 3b. Âm "pop" tổng hợp bằng công thức (không cần tệp), hoặc dùng tệp .wav người dùng đưa ----------
import math, struct, wave

def make_pop_track(times, total_sec, out_path, sample_wav=None, sr=48000):
    n = int(total_sec * sr) + sr
    buf = [0.0] * n
    if sample_wav:
        with wave.open(sample_wav, "rb") as w:
            assert w.getsampwidth() == 2, "cần WAV 16-bit"
            frames = w.readframes(w.getnframes()); ch = w.getnchannels(); wsr = w.getframerate()
            raw = struct.unpack("<%dh" % (len(frames) // 2), frames)
            mono = [raw[i] / 32768.0 for i in range(0, len(raw), ch)]
            step = wsr / sr
            pop = [mono[min(len(mono) - 1, int(i * step))] for i in range(int(len(mono) / step))]
    else:
        # pop: sóng 720 Hz trượt xuống 420 Hz trong 90 ms, tắt nhanh; thêm cú "thump" 110 Hz nhẹ
        L = int(0.09 * sr); pop = []
        for i in range(L):
            t = i / sr; f = 720 - 300 * (i / L)
            env = math.exp(-t * 38)
            pop.append(0.55 * env * math.sin(2 * math.pi * f * t) + 0.25 * math.exp(-t * 25) * math.sin(2 * math.pi * 110 * t))
    for t0 in times:
        s0 = int(t0 * sr)
        for i, v in enumerate(pop):
            j = s0 + i
            if j < n: buf[j] += v
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(struct.pack("<%dh" % n, *[max(-32767, min(32767, int(v * 0.6 * 32767))) for v in buf]))

# ---------- 4. Ghép ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True); ap.add_argument("--transcript", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--music"); ap.add_argument("--logo"); ap.add_argument("--keywords", default=""); ap.add_argument("--accent", default="F2C94C")
    ap.add_argument("--no-cut", action="store_true", help="không cắt khoảng lặng")
    ap.add_argument("--caption-y", type=float, default=BLOCK_CENTER_Y, help="tâm khối chữ theo tỷ lệ chiều cao (0.6 = giữa dưới mặt)")
    ap.add_argument("--no-punch", action="store_true", help="không phóng khung khi có từ khóa")
    ap.add_argument("--no-pop", action="store_true", help="chữ từ khóa không nảy khi hiện")
    ap.add_argument("--sfx", default="auto", help="âm pop khi từ khóa hiện: auto (tự tạo) | tệp .wav | none")
    ap.add_argument("--grade", default="warm", help="bộ màu: warm | none")
    ap.add_argument("--silence-db", type=float, default=SILENCE_DB, help="ngưỡng lặng (dB), clip có nhạc nền sẵn cần -25")
    a = ap.parse_args()

    tr = json.load(open(a.transcript))
    words = [w for seg in tr["segments"] for w in seg.get("words", [])]
    total = duration(a.input)
    segs = [(0.0, total)] if a.no_cut else keep_segments(total, silences(a.input, a.silence_db))
    cut_total = sum(b - x for x, b in segs)
    words2 = [{"word": w["word"], "start": remap(w["start"], segs), "end": remap(w["end"], segs)} for w in words]
    is_key = is_key_factory(a.keywords.split(","))
    mark_keywords(words2, a.keywords.split(","))
    ch = chunks(words2, is_key)

    tmp = tempfile.mkdtemp()
    overlays = []  # (png, x, y, start, end)
    POP = [(1.14, 0.05), (1.07, 0.05)]  # (tỷ lệ phóng, thời gian giữ) rồi về 1.0: chữ "nảy" khi hiện
    for i, c in enumerate(ch):
        rows = caption_rows(c, is_key, a.accent, tmp, i)
        total_h = sum(h for _, _, h, _ in rows) + ROW_GAP * (len(rows) - 1)
        y = int(H * a.caption_y - total_h / 2)
        end_t = c[-1]["end"] + 0.10
        if i + 1 < len(ch):
            end_t = min(end_t, ch[i + 1][0]["start"] - 0.02)
        for r, (png, w, h, st) in enumerate(rows):
            cx, cy = W // 2, y + h // 2
            if not a.no_pop and h >= SIZE_BIG * 0.6:  # chỉ dòng từ khóa mới nảy
                t0 = st
                for k, (sc, dur) in enumerate(POP):
                    pp = os.path.join(tmp, f"pop{i}_{r}_{k}.png")
                    run(["magick", png, "-resize", f"{int(sc * 100)}%", pp])
                    pw, ph = int(w * sc), int(h * sc)
                    overlays.append((pp, cx - pw // 2, cy - ph // 2, t0, min(t0 + dur, end_t)))
                    t0 += dur
                overlays.append((png, (W - w) // 2, y, t0, end_t))
            else:
                overlays.append((png, (W - w) // 2, y, st, end_t))
            y += h + ROW_GAP

    # Vùng tối mềm ở nửa dưới để chữ nổi (như mẫu)
    vig = os.path.join(tmp, "vignette.png")
    run(["magick", "-size", f"{W}x{H}", "gradient:none-black", "-channel", "A", "-evaluate", "multiply", "0.45", "+channel", vig])

    sel = "+".join(f"between(t,{x:.3f},{b:.3f})" for x, b in segs)
    inputs = ["-i", a.input, "-i", vig]
    # Phóng khung 5% trong 0,35 giây mỗi khi một từ khóa bắt đầu (crop theo t rồi scale lại), rồi bộ màu ấm nhẹ.
    key_times = [w["start"] for c in ch for w in c if is_key(w)]
    punch = "+".join(f"between(t,{t0:.3f},{t0 + 0.35:.3f})" for t0 in key_times[:400]) or "0"
    zoom = f"(1+0.05*min(1,{punch}))" if not a.no_punch else "1"
    grade = ",eq=contrast=1.06:saturation=1.08,colorbalance=rs=.03:gs=.0:bs=-.04:rm=.02:bm=-.02" if a.grade == "warm" else ""
    fc = (f"[0:v]fps=30,select='{sel}',setpts=N/30/TB,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
          f"crop=w='iw/{zoom}':h='ih/{zoom}':x='(iw-ow)/2':y='(ih-oh)/2',scale={W}:{H}{grade}[base];"
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
    sfx_path = None
    if a.sfx != "none":
        sfx_path = os.path.join(tmp, "sfx.wav")
        pop_times = sorted(set(round(t, 2) for t in key_times))
        # tối đa 1 pop mỗi 3 giây để không mệt tai
        kept, last = [], -9
        for t in pop_times:
            if t - last >= 3.0: kept.append(t); last = t
        make_pop_track(kept, cut_total, sfx_path, a.sfx if a.sfx != "auto" else None)
        inputs += ["-i", sfx_path]
        nsfx = len(inputs) // 2 - 1
        fc += f";[voice][{nsfx}:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[voice2]"
        voice_lbl = "[voice2]"
    else:
        voice_lbl = "[voice]"
    if a.music:
        inputs += ["-stream_loop", "-1", "-i", a.music]
        n = len(inputs) // 2 - 1
        fc += (f";[{n}:a]atrim=0:{cut_total:.3f},volume=0.9[mus];[mus][voice]sidechaincompress=threshold=0.05:ratio=8:attack=40:release=400[duck];"
               f"{voice_lbl}[duck]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
        aout = "[aout]"
    else:
        fc += f";{voice_lbl}loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
        aout = "[aout]"

    cmd = ["ffmpeg", "-hide_banner", "-y", *inputs, "-filter_complex", fc, "-map", vout, "-map", aout,
           "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", a.out]
    run(cmd)
    print(json.dumps({"input_seconds": round(total, 1), "output_seconds": round(cut_total, 1), "cuts": len(segs) - 1, "captions": len(ch), "out": a.out}, ensure_ascii=False))

if __name__ == "__main__":
    main()
