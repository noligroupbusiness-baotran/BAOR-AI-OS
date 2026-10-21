#!/usr/bin/env python3
"""Hậu kỳ vlog nói trước máy theo "Skill Edit video Vlog" (Second Brain, edu-hau-ky-video v0.3.1).

Một lệnh làm trọn mục 2 của skill, từ RAW đến bản chờ duyệt. Chỉ dựng, không đăng.

  python3 scripts/video/pipeline.py --input RAW.mov --job-dir DIR [--keywords "chi phí,AI"] [--music nhac.mp3 --music-license "Pixabay"]
                                    [--cut-silence] [--prompt "từ chuyên ngành"] [--reuse-dir DIR_BẢN_TRƯỚC]

Đầu ra trong --job-dir:
  master.mp4 (1080x1920, 30 fps), preview.mp4 (540p), snapshots/*.jpg, contact.jpg, compare.jpg,
  transcript.txt (từ chưa chắc ghi [?]), phu-de.srt, report.json (bảng kiểm A–P), checksums.sha256 (chỉ mã kiểm),
  progress.json (tiến độ cho giao diện).
Mọi luật đọc từ skill-vlog.json cạnh tệp này. Số do bot tự chọn ghi nhãn AI trong skill-vlog.json.
Mã thoát khác 0 chỉ khi quy trình hỏng; QA không đạt vẫn thoát 0 và ghi trong report.json.
"""
import argparse, gc, hashlib, json, math, os, re, shutil, subprocess, sys, time, unicodedata, wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SKILL = json.load(open(os.path.join(HERE, "skill-vlog.json"), encoding="utf-8"))
W, H, FPS = SKILL["canvas"]["w"], SKILL["canvas"]["h"], SKILL["canvas"]["fps"]
Z = SKILL["zones"]


def zone_px(name):
    z = Z[name]
    return (int(round(z["x0"] * W)), int(round(z["y0"] * H)), int(round(z["x1"] * W)), int(round(z["y1"] * H)))


# ---------------------------------------------------------------- tiện ích

class Job:
    def __init__(self, d):
        self.dir = os.path.abspath(d)
        os.makedirs(d, exist_ok=True)
        self.t0 = time.time()
        self.timings = {}
        self._last = self.t0

    def p(self, *parts):
        return os.path.join(self.dir, *parts)

    def progress(self, step, label, pct):
        now = time.time()
        self.timings[step] = round(now - self._last, 1)
        self._last = now
        tmp = self.p("progress.json.tmp")
        json.dump({"step": step, "label": label, "pct": pct, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}, open(tmp, "w"), ensure_ascii=False)
        os.replace(tmp, self.p("progress.json"))
        sys.stderr.write(f"[{pct:3d}%] {label}\n")
        sys.stderr.flush()


def sh(cmd, capture=True, check=True):
    r = subprocess.run(cmd, capture_output=capture, text=True)
    if check and r.returncode != 0:
        tail = (r.stderr or "")[-1500:]
        raise RuntimeError(f"Lệnh lỗi ({os.path.basename(cmd[0])}): {tail}")
    return r


def nfc(s):
    return unicodedata.normalize("NFC", s)


def norm(s):
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d").replace("Đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w%]", "", s)


def find_font(file_name):
    dirs = [os.environ.get("BAOR_FONT_DIR", ""), "/System/Library/Fonts/Supplemental", "/Library/Fonts",
            os.path.expanduser("~/Library/Fonts"), "/usr/share/fonts/truetype/msttcorefonts", os.path.join(ROOT, "public", "fonts")]
    for d in dirs:
        p = os.path.join(d, file_name) if d else ""
        if p and os.path.exists(p):
            return p
    raise RuntimeError(f"Thiếu font {file_name}. Đặt BAOR_FONT_DIR tới thư mục chứa font.")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- 1. nguồn

def probe(path):
    r = sh(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path])
    j = json.loads(r.stdout)
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    if not v:
        raise RuntimeError("Tệp không có hình")
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    if "rotate" in (v.get("tags") or {}):
        rot = int(v["tags"]["rotate"])
    if abs(rot) % 180 == 90:
        w, h = h, w
    num, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    return {
        "width": w, "height": h, "fps": round(fps, 3), "duration": float(j["format"]["duration"]),
        "hasAudio": a is not None, "colorTransfer": v.get("color_transfer", ""), "codec": v.get("codec_name", ""),
        "pixFmt": v.get("pix_fmt", ""), "rotation": rot,
    }


def base_crop_filter(info):
    """Cắt khung nguồn về 9:16 (giữa), giữ độ phân giải gốc để zoom từ RAW."""
    w, h = info["width"], info["height"]
    if abs(w / h - W / H) < 0.01:
        return None
    if w / h > W / H:
        cw = int(h * W / H) // 2 * 2
        return f"crop={cw}:{h}:(iw-{cw})/2:0"
    ch = int(w * H / W) // 2 * 2
    return f"crop={w}:{ch}:0:(ih-{ch})/2"


# ---------------------------------------------------------------- 2. nghe lời (2 mô hình)

def transcribe(wav, model_name, prompt):
    import whisper
    m = whisper.load_model(model_name)
    r = m.transcribe(wav, language="vi", word_timestamps=True, fp16=False, initial_prompt=prompt or None)
    del m
    gc.collect()
    words = []
    for seg in r.get("segments", []):
        ws = seg.get("words", []) or []
        for i, w in enumerate(ws):
            t = nfc(w["word"].strip())
            if not t:
                continue
            words.append({"text": t, "start": float(w["start"]), "end": float(w["end"]), "p": float(w.get("probability", 1.0)), "segEnd": i == len(ws) - 1})
    return words


def mark_uncertain(main, second):
    """Không đoán: từ xác suất thấp, hoặc vừa phải mà mô hình thứ hai nghe khác → chưa chắc."""
    lo, mid = SKILL["listening"]["uncertainBelow"], SKILL["listening"]["confirmBelow"]
    for w in main:
        n = norm(w["text"])
        if w["p"] < lo:
            w["uncertain"] = True
            continue
        if w["p"] < mid and second is not None:
            ok = any(norm(s["text"]) == n and s["end"] >= w["start"] - 0.6 and s["start"] <= w["end"] + 0.6 for s in second)
            w["uncertain"] = not ok
        else:
            w["uncertain"] = False
        if not n:
            w["uncertain"] = False
    return main


# ---------------------------------------------------------------- cắt lặng (chỉ khi được giao)

def silence_segments(path, total):
    s = SKILL["silence"]
    err = sh(["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=noise={s['thresholdDb']}dB:d={s['minSec']}", "-f", "null", "-"]).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    segs, cur = [], 0.0
    for a, b in zip(starts, ends):
        a2, b2 = a + s["padSec"], b - s["padSec"]
        if a2 > cur:
            segs.append((cur, a2))
        cur = max(cur, b2)
    if cur < total:
        segs.append((cur, total))
    return [(a, b) for a, b in segs if b - a > 0.05]


def unmap(t, segs):
    acc = 0.0
    for a, b in segs:
        if t <= acc + (b - a):
            return a + (t - acc)
        acc += b - a
    return segs[-1][1] if segs else t


def remap(t, segs):
    acc = 0.0
    for a, b in segs:
        if t < a:
            return acc
        if t <= b:
            return acc + (t - a)
        acc += b - a
    return acc


# ---------------------------------------------------------------- 3. phụ đề theo câu

NO_END = set("của và với cho là thì mà để có được bị rất cũng đã sẽ đang những các một này không chưa từ trong ngoài trên dưới về theo như nếu vì khi người cái con sự việc nhiều những mọi từng".split())
UNIT_AFTER_NUM = set("nghìn ngàn triệu tỷ tỉ k % phần trăm đồng bước ngày tháng năm tuần giờ phút giây lần người khách học viên video điều cách ý nhân sự".split())


def is_num(t):
    return bool(re.search(r"\d", t))


class Typo:
    def __init__(self):
        sc, ec = SKILL["subtitle"], SKILL["emphasis"]
        self.sub = ImageFont.truetype(find_font(sc["fontFile"]), sc["size"])
        self.emp_file = find_font(ec["fontFile"])
        asc, desc = self.sub.getmetrics()
        self.pitch = asc + desc + sc["lineGap"]
        sz = zone_px("subtitle")
        # chừa viền, bóng lệch phải và phần nhô của chữ nghiêng để nét thật không lố vùng
        self.max_w = sz[2] - sz[0] - 2 * (sc["outline"]["width"] + sc["shadow"]["dx"] + sc["shadow"]["blur"]) - 12

    def width(self, text):
        return self.sub.getlength(text)

    def wrap(self, toks):
        """Ngắt dòng không cắt đứt cụm: không để từ nối hoặc số đứng cuối dòng."""
        lines, cur = [], []
        for t in toks:
            if cur and self.width(" ".join(cur + [t])) > self.max_w:
                lines.append(cur)
                cur = []
            cur.append(t)
        if cur:
            lines.append(cur)
        for i in range(len(lines) - 1):
            while len(lines[i]) > 1 and (lines[i][-1].lower() in NO_END or is_num(lines[i][-1])):
                moved = lines[i][-1]
                if self.width(" ".join([moved] + lines[i + 1])) > self.max_w:
                    break
                lines[i] = lines[i][:-1]
                lines[i + 1] = [moved] + lines[i + 1]
        return lines


def build_units(words, typo):
    sc = SKILL["subtitle"]
    groups, cur = [], []
    for w in words:
        if cur and w["start"] - cur[-1]["end"] > sc["breakOnPauseSec"]:
            groups.append(cur)
            cur = []
        cur.append(w)
        if w.get("segEnd") or re.search(r"[.!?…]$", w["text"]):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)

    def fits(g):
        vis = [w["text"] for w in g if not w["uncertain"]]
        return len(typo.wrap(vis)) <= sc["maxLines"] if vis else True

    def split(g):
        if fits(g) or len(g) < 2:
            return [g]
        mid, best, best_i = len(g) / 2, -1e9, len(g) // 2
        for i in range(1, len(g)):
            prev, nxt = g[i - 1], g[i]
            score = -abs(i - mid) * 0.6
            if re.search(r"[,;:]$", prev["text"]):
                score += 3
            if nxt["start"] - prev["end"] > 0.25:
                score += 2
            if prev["text"].lower() not in NO_END and not is_num(prev["text"]):
                score += 1
            if score > best:
                best, best_i = score, i
        return split(g[:best_i]) + split(g[best_i:])

    units = []
    for g in groups:
        for part in split(g):
            vis = [w for w in part if not w["uncertain"]]
            units.append({"words": part, "visible": vis, "lines": typo.wrap([w["text"] for w in vis]) if vis else [], "start": part[0]["start"], "lastEnd": part[-1]["end"]})
    return units


# ---------------------------------------------------------------- 4. chữ nhấn vàng (ít, theo luật)

def pick_emphasis(words, units, keywords, duration):
    ec = SKILL["emphasis"]
    phrases = [[norm(x) for x in k.split()] for k in keywords if k.strip()]
    unit_of = {}
    for ui, u in enumerate(units):
        for w in u["words"]:
            unit_of[id(w)] = ui
    cands = []
    n = len(words)
    for i in range(n):
        w = words[i]
        if w["uncertain"]:
            continue
        for ph in phrases:
            L = len(ph)
            if L and i + L <= n and all(not words[i + j]["uncertain"] and norm(words[i + j]["text"]) == ph[j] for j in range(L)):
                if len({unit_of.get(id(words[i + j])) for j in range(L)}) == 1:
                    cands.append({"i0": i, "i1": i + L - 1, "score": 2.0 + 0.2 * L, "kind": "keyword"})
        if is_num(w["text"]):
            j = i
            while j + 1 < n and j - i < 2 and not words[j + 1]["uncertain"] and words[j + 1]["text"].lower().strip(".,!?") in UNIT_AFTER_NUM and unit_of.get(id(words[j + 1])) == unit_of.get(id(w)):
                j += 1
            cands.append({"i0": i, "i1": j, "score": 1.5, "kind": "number"})
    budget = max(1, int(duration // ec["perSecondsBudget"]))
    cands.sort(key=lambda c: (-c["score"], words[c["i0"]]["start"]))
    chosen = []
    for c in cands:
        if len(chosen) >= budget:
            break
        if c["i1"] - c["i0"] + 1 > ec["maxWords"]:
            continue
        t = words[c["i0"]]["start"]
        if any(abs(t - words[x["i0"]]["start"]) < ec["minSpacingSec"] for x in chosen):
            continue
        chosen.append(c)
    chosen.sort(key=lambda c: words[c["i0"]]["start"])
    out = []
    for k, c in enumerate(chosen):
        ws = words[c["i0"]:c["i1"] + 1]
        text = re.sub(r"[.,!?…;:]+$", "", " ".join(w["text"] for w in ws))
        if c["kind"] == "keyword" or not ec["upperCaseOnlyKeywords"]:
            text = text.upper()
        u = units[unit_of[id(ws[0])]]
        t0 = ws[0]["start"]
        t1 = min(t0 + ec["holdMaxSec"], max(t0 + ec["holdMinSec"], u["lastEnd"] + 0.2))
        if k + 1 < len(chosen):
            t1 = min(t1, words[chosen[k + 1]["i0"]]["start"] - 0.3)
        out.append({"text": text, "t0": t0, "t1": t1, "kind": c["kind"]})
    return out


# ---------------------------------------------------------------- vẽ lớp chữ

TEXT_Y0 = zone_px("emphasis")[1] - 70
TEXT_H = zone_px("subtitle")[3] + 50 - TEXT_Y0


def draw_subtitle(typo, unit, hl):
    sc = SKILL["subtitle"]
    img = Image.new("RGBA", (W, TEXT_H), (0, 0, 0, 0))
    if not unit["lines"]:
        return img
    top = zone_px("subtitle")[1] - TEXT_Y0
    shadow = Image.new("L", (W, TEXT_H), 0)
    sd = ImageDraw.Draw(shadow)
    base = ImageDraw.Draw(img)
    placed = []
    k = 0
    for li, line in enumerate(unit["lines"]):
        y = top + li * typo.pitch
        lw = typo.width(" ".join(line))
        x0 = W / 2 - lw / 2
        for wi, t in enumerate(line):
            x = x0 + (typo.width(" ".join(line[:wi]) + " ") if wi else 0)
            placed.append((x, y, t, k == hl))
            k += 1
    sh_ = sc["shadow"]
    for x, y, t, _ in placed:
        sd.text((x + sh_["dx"], y + sh_["dy"]), t, font=typo.sub, fill=255, stroke_width=sc["outline"]["width"], stroke_fill=255)
    shadow = shadow.filter(ImageFilter.GaussianBlur(sh_["blur"])).point(lambda v: int(v * sh_["opacity"]))
    img.paste((0, 0, 0, 255), (0, 0), shadow)
    oc = hex_rgb(sc["outline"]["color"])
    for x, y, t, _ in placed:
        base.text((x, y), t, font=typo.sub, fill=oc, stroke_width=sc["outline"]["width"], stroke_fill=oc)
    white, cur = hex_rgb(sc["fill"]), hex_rgb(sc["currentWord"])
    for x, y, t, on in placed:
        c = cur if on else white
        base.text((x, y), t, font=typo.sub, fill=c, stroke_width=sc["whiteStroke"], stroke_fill=c)
    return img


def gradient_strip(stops, h):
    cols = [np.array(hex_rgb(s), dtype=np.float32) for s in stops]
    ys = np.linspace(0, 1, h)
    seg = (len(cols) - 1)
    out = np.zeros((h, 3), dtype=np.float32)
    for i, t in enumerate(ys):
        f = min(seg - 1e-6, t * seg)
        a = int(f)
        out[i] = cols[a] * (1 - (f - a)) + cols[a + 1] * (f - a)
    return out


def render_emphasis(typo, text):
    """Kiểu v4: Times New Roman Bold Italic, vàng kim loại chuyển sắc, viền nâu đen mảnh, quầng sáng vừa."""
    ec = SKILL["emphasis"]
    ez = zone_px("emphasis")
    size = ec["size"]
    while True:
        font = ImageFont.truetype(typo.emp_file, size)
        if font.getlength(text) <= ez[2] - ez[0] - 20 or size <= ec["minSize"]:
            break
        size -= 6
    if font.getlength(text) > ez[2] - ez[0] - 20:
        return None
    pad = 40
    tw = int(font.getlength(text)) + pad * 2 + 40
    asc, desc = font.getmetrics()
    th = asc + desc + pad * 2
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).text((pad, pad), text, font=font, fill=255)
    bb = mask.getbbox()
    if not bb:
        return None
    grad = gradient_strip(ec["gradient"], bb[3] - bb[1])
    gimg = np.zeros((th, tw, 4), dtype=np.uint8)
    gimg[bb[1]:bb[3], :, :3] = grad[:, None, :].astype(np.uint8)
    gimg[:, :, 3] = np.array(mask)
    gold = Image.fromarray(gimg)
    outline = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    oc = hex_rgb(ec["outline"]["color"])
    ImageDraw.Draw(outline).text((pad, pad), text, font=font, fill=oc + (255,), stroke_width=ec["outline"]["width"], stroke_fill=oc + (255,))
    gl = ec["glow"]
    gmask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(gmask).text((pad, pad), text, font=font, fill=255, stroke_width=6, stroke_fill=255)
    gmask = gmask.filter(ImageFilter.GaussianBlur(gl["radius"])).point(lambda v: int(v * gl["opacity"]))
    glow = Image.new("RGBA", (tw, th), hex_rgb(gl["color"]) + (0,))
    glow.putalpha(gmask)
    out = Image.alpha_composite(glow, outline)
    out = Image.alpha_composite(out, gold)
    ink = outline.getbbox() or bb
    return {"img": out, "ink": ink, "size": size}


def place_emphasis(canvas, emp, alpha, dy):
    """Đáy nét chữ cách đỉnh phụ đề ≥ gapAboveSubtitle."""
    img, ink = emp["img"], emp["ink"]
    # đáy nét chữ: cách phụ đề ≥ gap và chừa quầng sáng nằm trong vùng chữ nhấn
    glow_room = SKILL["emphasis"]["glow"]["radius"]
    bottom = min(zone_px("subtitle")[1] - SKILL["emphasis"]["gapAboveSubtitle"], zone_px("emphasis")[3] - glow_room) - TEXT_Y0
    x = int(W / 2 - (ink[0] + ink[2]) / 2)
    y = int(bottom - ink[3] + dy)
    layer = img
    if alpha < 1:
        layer = img.copy()
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(layer, (x, y))


def ease(u):
    u = min(1.0, max(0.0, u))
    return 1 - (1 - u) ** 3


# ---------------------------------------------------------------- 5. mặt, nền logo, cảnh

def analyse_frames(src, cropf, seg_select, scd_file):
    """Lấy mẫu 2 khung/giây (xám 360x640) + dò cắt cảnh. Trả về mẫu, thời điểm cắt cảnh."""
    sw, shh = 360, 640
    vf = ["fps=30"]
    if seg_select:
        vf += [f"select='{seg_select}'", "setpts=N/30/TB"]
    if cropf:
        vf.append(cropf)
    chain = ",".join(vf)
    esc = scd_file.replace("\\", "/").replace("'", "")
    fc = (f"[0:v]{chain},split[a][b];[a]scdet=threshold=12,metadata=mode=print:file='{esc}'[a2];[a2]nullsink;"
          f"[b]fps=2,scale={sw}:{shh},format=gray[o]")
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-filter_complex", fc, "-map", "[o]", "-f", "rawvideo", "-"], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("Lấy mẫu khung lỗi: " + r.stderr.decode(errors="ignore")[-800:])
    buf = np.frombuffer(r.stdout, dtype=np.uint8)
    nfr = buf.size // (sw * shh)
    frames = buf[: nfr * sw * shh].reshape(nfr, shh, sw)
    cuts = []
    if os.path.exists(scd_file):
        txt = open(scd_file, encoding="utf-8", errors="ignore").read()
        cuts = sorted({round(float(x), 3) for x in re.findall(r"lavfi\.scd\.time=([\d.]+)", txt)})
    return frames, [c for c in cuts if c > 0.5]


def detect_faces(frames):
    try:
        import cv2
        cv2.CascadeClassifier
    except Exception:
        return None
    cas = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    sh_, sw = frames.shape[1], frames.shape[2]
    raw = []
    for i, f in enumerate(frames):
        faces = cas.detectMultiScale(f, scaleFactor=1.1, minNeighbors=5, minSize=(int(sw * 0.12), int(sw * 0.12)))
        best = None
        for (x, y, w, h) in faces:
            cy = (y + h / 2) / sh_
            if 0.08 < cy < 0.7 and (best is None or w * h > best[2] * best[3]):
                best = (x, y, w, h)
        raw.append((i / 2.0, best))
    found = [b for _, b in raw if b is not None]
    if not found:
        return {"detected": False, "samples": []}
    cxs = np.array([(b[0] + b[2] / 2) / sw for b in found])
    cys = np.array([(b[1] + b[3] / 2) / sh_ for b in found])
    mx, my = float(np.median(cxs)), float(np.median(cys))
    samples = []
    for t, b in raw:
        if b is None:
            continue
        cx, cy = (b[0] + b[2] / 2) / sw, (b[1] + b[3] / 2) / sh_
        if abs(cx - mx) > 0.15 or abs(cy - my) > 0.15:   # bài học: chỉ nhận vị trí gần mặt dự đoán
            continue
        samples.append({"t": t, "x0": b[0] / sw, "y0": b[1] / sh_, "x1": (b[0] + b[2]) / sw, "y1": (b[1] + b[3]) / sh_})
    return {"detected": bool(samples), "anchor": [mx, my], "samples": samples, "rawHits": len(found), "frames": len(raw)}


def region_mean(frames, box):
    sh_, sw = frames.shape[1], frames.shape[2]
    x0, y0, x1, y1 = [int(v) for v in (box[0] * sw / W, box[1] * sh_ / H, box[2] * sw / W, box[3] * sh_ / H)]
    return frames[:, y0:max(y0 + 1, y1), x0:max(x0 + 1, x1)].reshape(len(frames), -1).mean(axis=1) / 255.0


# ---------------------------------------------------------------- zoom mượt

def zoom_plan(units, duration):
    zc = SKILL["zoom"]
    if not zc["enabled"]:
        return []
    ev, z, last = [], 1.0, -1e9
    for u in units:
        t = u["start"]
        if t < zc["firstAfterSec"] or t - last < zc["minGapSec"] or t > duration - zc["transitionSec"] - 0.5:
            continue
        target = zc["max"] if z == 1.0 else 1.0
        ev.append((round(t, 3), round(target - z, 4)))
        z, last = target, t
    return ev


def zoom_at(ev, t):
    T = SKILL["zoom"]["transitionSec"]
    z = 1.0
    for t0, d in ev:
        u = min(1.0, max(0.0, (t - t0) / T))
        z += d * u * u * (3 - 2 * u)
    return z


def zoom_expr(ev):
    T = SKILL["zoom"]["transitionSec"]
    if not ev:
        return "1"
    parts = ["st(1,1)"]
    for t0, d in ev:
        parts.append(f"st(0,clip((t-{t0})/{T},0,1))")
        parts.append(f"st(1,ld(1)+({d})*ld(0)*ld(0)*(3-2*ld(0)))")
    parts.append("ld(1)")
    return "(" + ";".join(parts) + ")"


# ---------------------------------------------------------------- 6. âm thanh

def ebur(path):
    err = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    summ = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summ)
    tp = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", summ)
    return (float(i.group(1)) if i else None, float(tp.group(1)) if tp and tp.group(1) != "-inf" else -99.0)


def read_wav_mono(path):
    with wave.open(path, "rb") as w:
        ch, sr, n = w.getnchannels(), w.getframerate(), w.getnframes()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def win_db(a, sr, win=0.4):
    n = int(sr * win)
    k = len(a) // n
    if k == 0:
        return np.array([])
    x = a[: k * n].reshape(k, n)
    return 10 * np.log10(np.maximum((x ** 2).mean(axis=1), 1e-12))


def a5_check(voice_wav, music_wav):
    """Độ rõ giọng: lúc nói giọng hơn nhạc ≥ 15 dB; khoảng nghỉ nhạc thấp hơn mức nói ≥ 6 dB (diễn giải = AI)."""
    mc = SKILL["audio"]["music"]
    v, sr = read_wav_mono(voice_wav)
    m, _ = read_wav_mono(music_wav)
    n = min(len(v), len(m))
    vd, md = win_db(v[:n], sr), win_db(m[:n], sr)
    p90 = float(np.percentile(vd, 90)) if len(vd) else -99
    speech = (vd >= p90 - 20) & (vd > -50)
    pause = vd < p90 - 35
    sp_margin = float(np.percentile(vd[speech] - md[speech], 5)) if speech.any() else 99.0
    sp_level = float(np.median(vd[speech])) if speech.any() else -99.0
    pa_music = float(np.percentile(md[pause], 95)) if pause.any() else -99.0
    pa_margin = sp_level - pa_music
    deficit = max(mc["speechMarginDb"] - sp_margin, mc["pauseMarginDb"] - pa_margin, 0.0)
    return {"speechMarginDb": round(sp_margin, 1), "pauseMarginDb": round(pa_margin, 1), "pass": deficit <= 0, "deficit": round(deficit, 1)}


def build_audio(job, src, info, seg_select, dur, music, license_):
    """Giọng giữ nguyên; nhạc (nếu có giấy phép) −25 LUFS, hạ khi nói, vào 1 s / ra 2 s; tổng −16 LUFS, TP ≤ −2 dBTP."""
    ac = SKILL["audio"]
    sel = f",aselect='{seg_select}',asetpts=N/SR/TB" if seg_select else ""
    voice = job.p("work", "voice.wav")
    if info["hasAudio"]:
        sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-af", f"aresample=48000{sel},apad=whole_dur={dur:.6f},atrim=end={dur:.6f}",
            "-ac", "2", "-c:a", "pcm_s16le", voice])
    else:
        sh(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f"{dur:.6f}", "-c:a", "pcm_s16le", voice])
    music_info = None
    mix = voice
    if music:
        mc = ac["music"]
        if mc["requireLicense"] and not (license_ or "").strip():
            music_info = {"used": False, "reason": "Bài nhạc chưa ghi giấy phép → KHÔNG DÙNG"}
        else:
            mI, _ = ebur(music)
            vI, _ = ebur(voice)
            rel = ac["targetLufs"] - mc["levelLufs"]  # nhạc nằm dưới giọng 9 dB → sau chuẩn −16 thì nhạc ≈ −25
            gain = ((vI if vI is not None else ac["targetLufs"]) - rel) - (mI if mI is not None else -20)
            a5 = None
            for attempt in range(4):
                duck = job.p("work", "music_duck.wav")
                mix = job.p("work", "mix.wav")
                fc = (f"[0:a]aresample=48000,asplit=3[v1][v2][v3];"
                      f"[1:a]aresample=48000,atrim=0:{dur:.6f},asetpts=N/SR/TB,volume={gain:.2f}dB,afade=t=in:d={mc['fadeInSec']},"
                      f"afade=t=out:st={max(0, dur - mc['fadeOutSec']):.3f}:d={mc['fadeOutSec']},apad=whole_dur={dur:.6f}[m];"
                      f"[m][v1]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=350[d];[d]asplit=2[d1][d2];"
                      f"[v2][d1]amix=inputs=2:normalize=0:duration=first[mx]")
                sh(["ffmpeg", "-v", "error", "-y", "-i", voice, "-stream_loop", "-1", "-i", music, "-filter_complex", fc,
                    "-map", "[mx]", "-c:a", "pcm_s16le", mix, "-map", "[d2]", "-c:a", "pcm_s16le", duck, "-map", "[v3]", "-c:a", "pcm_s16le", job.p("work", "voice_ref.wav")])
                a5 = a5_check(job.p("work", "voice_ref.wav"), duck)
                if a5["pass"]:
                    break
                gain -= a5["deficit"] + 1.0
            music_info = {"used": True, "license": license_, "gainDb": round(gain, 1), "sourceLufs": mI, "a5": a5, "ownerApproved": False}
    # Chuẩn độ to: tăng/giảm tuyến tính rồi chặn đỉnh (giọng không nén thêm).
    final = job.p("work", "final.wav")
    I, _ = ebur(mix)
    gain = ac["targetLufs"] - (I if I is not None else ac["targetLufs"])
    limit = ac["truePeakMaster"] - 1.0
    for _ in range(6):
        sh(["ffmpeg", "-v", "error", "-y", "-i", mix, "-af", f"volume={gain:.2f}dB,alimiter=limit={10 ** (limit / 20):.4f}:attack=5:release=60:level=0,aresample=48000",
            "-c:a", "pcm_s24le", final])
        fI, fTP = ebur(final)
        ok_tp = fTP <= ac["truePeakMaster"] - 0.3
        ok_i = fI is not None and abs(fI - ac["targetLufs"]) <= 0.3
        if ok_tp and ok_i:
            break
        if not ok_tp:
            limit -= (fTP - (ac["truePeakMaster"] - 0.3)) + 0.2
        if fI is not None and not ok_i:
            gain += ac["targetLufs"] - fI
    return final, music_info, {"limitDbfs": round(limit, 2)}


# ---------------------------------------------------------------- QA

def bbox_alpha(img, thr=40):
    a = np.array(img.getchannel("A"))
    ys, xs = np.where(a > thr)
    if not len(xs):
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def inside(b, z, tol=0):
    return b[0] >= z[0] - tol and b[1] >= z[1] - tol and b[2] <= z[2] + tol and b[3] <= z[3] + tol


def overlap(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def count_frames(path):
    r = sh(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames,width,height,r_frame_rate", "-of", "json", path])
    s = json.loads(r.stdout)["streams"][0]
    return int(s.get("nb_read_frames", 0)), int(s["width"]), int(s["height"]), s["r_frame_rate"]


def decode_errors(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "null", "-"], capture_output=True, text=True)
    return [l for l in r.stderr.splitlines() if l.strip()]


# ---------------------------------------------------------------- chính

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--job-dir", required=True)
    ap.add_argument("--keywords", default="")
    ap.add_argument("--prompt", default="")
    ap.add_argument("--music", default="")
    ap.add_argument("--music-license", default="")
    ap.add_argument("--cut-silence", action="store_true")
    ap.add_argument("--reuse-dir", default="")
    ap.add_argument("--model", default=SKILL["listening"]["mainModel"])
    ap.add_argument("--model2", default=SKILL["listening"]["secondModel"])
    ap.add_argument("--logo-dir", default=os.path.join(ROOT, "public", "brand"))
    ap.add_argument("--previous", default="", help="master.mp4 của bản trước để so khung (mục K)")
    a = ap.parse_args()

    job = Job(a.job_dir)
    os.makedirs(job.p("work"), exist_ok=True)
    src = os.path.abspath(a.input)
    keywords = [k.strip() for k in re.split(r"[,\n]", a.keywords) if k.strip()]

    # 1. Nhận RAW
    job.progress("probe", "Kiểm tra nguồn", 3)
    info = probe(src)
    cropf = base_crop_filter(info)
    hdr = info["colorTransfer"] in ("arib-std-b67", "smpte2084")

    # 2. Nhận lời (2 mô hình), không đoán
    words, second = [], None
    if info["hasAudio"]:
        reuse = a.reuse_dir and os.path.exists(os.path.join(a.reuse_dir, "words_main.json"))
        if reuse:
            words = json.load(open(os.path.join(a.reuse_dir, "words_main.json"), encoding="utf-8"))
            second = json.load(open(os.path.join(a.reuse_dir, "words_second.json"), encoding="utf-8")) if os.path.exists(os.path.join(a.reuse_dir, "words_second.json")) else None
            job.progress("listen", "Dùng lại lời đã nghe ở bản trước", 40)
        else:
            wav16 = job.p("work", "a16.wav")
            sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", wav16])
            prompt = (" ".join(keywords) + " " + a.prompt).strip()[:800]
            job.progress("listen1", f"Nghe lời (mô hình {a.model})", 8)
            words = transcribe(wav16, a.model, prompt)
            job.progress("listen2", f"Nghe lại để đối chiếu (mô hình {a.model2})", 35)
            try:
                second = transcribe(wav16, a.model2, prompt) if a.model2 and a.model2 != "none" else None
            except Exception as e:  # mô hình phụ lỗi thì vẫn đi tiếp, ghi nhận
                second = None
                sys.stderr.write(f"Mô hình đối chiếu lỗi: {e}\n")
        json.dump(words, open(job.p("words_main.json"), "w"), ensure_ascii=False)
        if second is not None:
            json.dump(second, open(job.p("words_second.json"), "w"), ensure_ascii=False)
        mark_uncertain(words, second)

    # Khoảng lặng: mặc định giữ; chỉ cắt khi được giao cho đúng video này
    seg_select, segs = None, None
    duration = info["duration"]
    if a.cut_silence:
        segs = silence_segments(src, info["duration"])
        seg_select = "+".join(f"between(t,{x:.3f},{y:.3f})" for x, y in segs)
        duration = sum(y - x for x, y in segs)
        for w in words:
            w["start"], w["end"] = remap(w["start"], segs), remap(w["end"], segs)
    N = int(round(duration * FPS))
    dur = N / FPS

    # 3–4. Phụ đề, chữ nhấn
    job.progress("layout", "Dàn phụ đề theo câu và chọn chữ nhấn", 52)
    typo = Typo()
    units = build_units(words, typo) if words else []
    for i, u in enumerate(units):
        nxt = units[i + 1]["start"] if i + 1 < len(units) else dur
        u["end"] = min(nxt, u["lastEnd"] + 2.5, dur)
    emph = pick_emphasis(words, units, keywords, dur) if words else []
    emp_imgs = []
    for e in emph:
        r = render_emphasis(typo, e["text"])
        emp_imgs.append(r)
    emph = [e for e, r in zip(emph, emp_imgs) if r]
    emp_imgs = [r for r in emp_imgs if r]

    # 5. Mặt, nền logo, cảnh
    job.progress("analyse", "Dò mặt, cảnh và độ sáng nền logo", 58)
    frames, cuts = analyse_frames(src, cropf, seg_select, job.p("work", "scd.txt"))
    face = detect_faces(frames)
    lz = SKILL["logo"]
    logo_light = Image.open(os.path.join(a.logo_dir, lz["lightOnDarkBg"])).convert("RGBA")
    logo_dark = Image.open(os.path.join(a.logo_dir, lz["darkOnLightBg"])).convert("RGBA")
    lh = int(round(logo_light.height * lz["width"] / logo_light.width))
    logo_light = logo_light.resize((lz["width"], lh), Image.LANCZOS)
    logo_dark = logo_dark.resize((lz["width"], int(round(logo_dark.height * lz["width"] / logo_dark.width))), Image.LANCZOS)
    logo_box = (lz["x"], lz["y"], lz["x"] + lz["width"], lz["y"] + lh)
    luma = region_mean(frames, logo_box)
    bounds = [0.0] + cuts + [dur]
    scenes = []
    for s0, s1 in zip(bounds[:-1], bounds[1:]):
        idx = [i for i in range(len(luma)) if s0 <= i / 2.0 < s1] or [min(len(luma) - 1, int(s0 * 2))]
        m = float(np.median(luma[idx])) if len(luma) else 0.0
        scenes.append({"t0": round(s0, 3), "t1": round(s1, 3), "luma": round(m, 3), "logo": "dark" if m > lz["brightThreshold"] else "light"})
    sub_luma = region_mean(frames, zone_px("subtitle"))

    # Zoom mượt theo mặt
    ev = zoom_plan(units, dur)
    anchor = face["anchor"] if face and face.get("detected") else [0.5, (Z["face"]["y0"] + Z["face"]["y1"]) / 2]
    zx = zoom_expr(ev)

    # 6. Vẽ lớp chữ và lớp logo theo số khung
    job.progress("draw", "Vẽ lớp phụ đề, chữ nhấn, logo", 64)
    tdir, ldir = job.p("work", "txt"), job.p("work", "logo")
    for d in (tdir, ldir):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    fr = lambda t: int(round(t * FPS))
    ec = SKILL["emphasis"]
    # trạng thái phụ đề theo khung
    sub_state = [(-1, -1)] * N
    for ui, u in enumerate(units):
        f0, f1 = fr(u["start"]), min(N, fr(u["end"]))
        for f in range(f0, f1):
            sub_state[f] = (ui, -1)
        vis = u["visible"]
        for k, w in enumerate(vis):
            nxt = vis[k + 1]["start"] if k + 1 < len(vis) else u["end"]
            h0, h1 = fr(w["start"]), min(f1, fr(min(nxt, w["end"] + 0.25)))
            for f in range(max(f0, h0), h1):
                sub_state[f] = (ui, k)
    emp_state = [(-1, 0)] * N
    for ei, e in enumerate(emph):
        f0, f1 = fr(e["t0"]), min(N, fr(e["t1"]))
        for f in range(f0, f1):
            k = f - f0
            if k < ec["enterFrames"]:
                ph = ("in", k)
            elif f1 - f <= ec["exitFrames"]:
                ph = ("out", f1 - f)
            else:
                ph = ("hold", 0)
            emp_state[f] = (ei, ph)
    sub_cache, files, layout = {}, {}, {}
    bad_I, overlap_H, sub_out_F, emp_out_F = 0, 0, 0, 0
    sz, ez = zone_px("subtitle"), zone_px("emphasis")
    for f in range(N):
        key = (sub_state[f], emp_state[f])
        if key not in files:
            (ui, hl), (ei, ph) = key
            if (ui, hl) not in sub_cache:
                sub_cache[(ui, hl)] = draw_subtitle(typo, units[ui], hl) if ui >= 0 else Image.new("RGBA", (W, TEXT_H), (0, 0, 0, 0))
            canvas = sub_cache[(ui, hl)].copy()
            eb = None
            if ei >= 0:
                if ph[0] == "in":
                    u = ease((ph[1] + 1) / ec["enterFrames"])
                    alpha, dy = u, ec["enterRisePx"] * (1 - u)
                elif ph[0] == "out":
                    alpha, dy = ph[1] / (ec["exitFrames"] + 1), 0
                else:
                    alpha, dy = 1.0, 0
                layer = Image.new("RGBA", (W, TEXT_H), (0, 0, 0, 0))
                place_emphasis(layer, emp_imgs[ei], alpha, dy)
                eb = bbox_alpha(layer)
                canvas.alpha_composite(layer)
            sb = bbox_alpha(sub_cache[(ui, hl)]) if ui >= 0 else None
            to_full = lambda b: (b[0], b[1] + TEXT_Y0, b[2], b[3] + TEXT_Y0) if b else None
            sbf, ebf, allb = to_full(sb), to_full(eb), to_full(bbox_alpha(canvas))
            layout[key] = {
                "subOut": bool(sbf and not inside(sbf, sz, 2)),
                "empOut": bool(ebf and not inside(ebf, ez, 2)),
                "overlap": bool(sbf and ebf and overlap(sbf, ebf)),
                "outside": bool(allb and not inside(allb, (min(sz[0], ez[0]), ez[1], max(sz[2], ez[2]), sz[3]), 2)),
                "sub": sbf, "emp": ebf,
            }
            p = os.path.join(tdir, f"s{len(files):05d}.png")
            canvas.save(p, compress_level=1)
            files[key] = p
        L = layout[key]
        bad_I += L["outside"]
        overlap_H += L["overlap"]
        sub_out_F += L["subOut"]
        emp_out_F += L["empOut"]
        os.symlink(files[key], os.path.join(tdir, f"{f:06d}.png"))
    # logo: đổi màu chỉ ở điểm cắt cảnh, chuyển mờ 0,2 s
    LH = max(logo_box[3] + 40, 300)
    def logo_canvas(mix_dark):
        c = Image.new("RGBA", (W, LH), (0, 0, 0, 0))
        if mix_dark <= 0:
            c.alpha_composite(logo_light, (logo_box[0], logo_box[1]))
        elif mix_dark >= 1:
            c.alpha_composite(logo_dark, (logo_box[0], logo_box[1]))
        else:
            a1, a2 = logo_light.copy(), logo_dark.copy()
            a1.putalpha(a1.getchannel("A").point(lambda v: int(v * (1 - mix_dark))))
            a2.putalpha(a2.getchannel("A").point(lambda v: int(v * mix_dark)))
            c.alpha_composite(a1, (logo_box[0], logo_box[1]))
            c.alpha_composite(a2, (logo_box[0], logo_box[1]))
        return c
    cf = max(1, int(round(lz["crossfadeSec"] * FPS)))
    target = [0.0] * N
    for s in scenes:
        for f in range(fr(s["t0"]), min(N, fr(s["t1"]))):
            target[f] = 1.0 if s["logo"] == "dark" else 0.0
    mixv = list(target)
    for s_prev, s in zip(scenes[:-1], scenes[1:]):
        if s_prev["logo"] != s["logo"]:
            f0 = fr(s["t0"])
            a0 = 1.0 if s_prev["logo"] == "dark" else 0.0
            for k in range(cf):
                if f0 + k < N:
                    mixv[f0 + k] = a0 + (target[f0] - a0) * (k + 1) / cf
    lfiles = {}
    for f in range(N):
        k = round(mixv[f], 3)
        if k not in lfiles:
            p = os.path.join(ldir, f"s{len(lfiles):03d}.png")
            logo_canvas(k).save(p, compress_level=1)
            lfiles[k] = p
        os.symlink(lfiles[k], os.path.join(ldir, f"{f:06d}.png"))
    lb = bbox_alpha(logo_canvas(0.0))
    lzone = zone_px("logo")
    logo_over = {"left": max(0, lzone[0] - lb[0]), "right": max(0, lb[2] - lzone[2]), "top": max(0, lzone[1] - lb[1]), "bottom": max(0, lb[3] - lzone[3])}

    # 7. Âm thanh
    job.progress("audio", "Âm thanh: giữ giọng, nhạc theo giấy phép, chuẩn độ to", 72)
    final_wav, music_info, audio_meta = build_audio(job, src, info, seg_select, dur, a.music, a.music_license)

    # 8. Xuất bản chính
    job.progress("encode", "Xuất bản chính 1080x1920", 78)
    vf = ["fps=30"]
    if seg_select:
        vf += [f"select='{seg_select}'", "setpts=N/30/TB"]
    vf.append("tpad=stop_mode=clone:stop_duration=1")  # luồng hình ngắn hơn khung chứa vài ms: giữ đủ N khung
    if hdr:
        vf.append("colorspace=all=bt709:iall=bt2020:fast=1")
    if cropf:
        vf.append(cropf)
    vf.append(f"scale=w='trunc({W}*{zx}/2)*2':h='trunc({H}*{zx}/2)*2':eval=frame:flags=lanczos:out_color_matrix=bt709")
    vf.append(f"crop={W}:{H}:x='(in_w-{W})*{anchor[0]:.4f}':y='(in_h-{H})*{anchor[1]:.4f}'")
    vf.append("setsar=1")
    fc = (f"[0:v]{','.join(vf)}[bg];[1:v]format=rgba[t];[2:v]format=rgba[l];"
          f"[bg][t]overlay=0:{TEXT_Y0}:format=auto[v1];[v1][l]overlay=0:0:format=auto,format=yuv420p[v]")
    master = job.p("master.mp4")
    sh(["ffmpeg", "-v", "error", "-y", "-i", src,
        "-framerate", str(FPS), "-start_number", "0", "-i", os.path.join(tdir, "%06d.png"),
        "-framerate", str(FPS), "-start_number", "0", "-i", os.path.join(ldir, "%06d.png"),
        "-i", final_wav, "-filter_complex", fc, "-map", "[v]", "-map", "3:a", "-frames:v", str(N),
        "-c:v", "libx264", "-preset", "medium", "-crf", str(SKILL["output"]["masterCrf"]), "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", master])

    # Đỉnh thật đo trên bản đã mã hoá; vượt thì hạ chặn đỉnh và ghép lại tiếng (giữ nguyên hình)
    ac = SKILL["audio"]
    mI, mTP = ebur(master)
    tries = 0
    while mTP > ac["truePeakMaster"] and tries < 3:
        tries += 1
        fixed = job.p("work", f"final_fix{tries}.wav")
        sh(["ffmpeg", "-v", "error", "-y", "-i", final_wav, "-af", f"volume={ac['truePeakMaster'] - mTP - 0.2:.2f}dB", "-c:a", "pcm_s24le", fixed])
        final_wav = fixed
        tmpm = job.p("work", "master_fix.mp4")
        sh(["ffmpeg", "-v", "error", "-y", "-i", master, "-i", final_wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", tmpm])
        os.replace(tmpm, master)
        mI, mTP = ebur(master)

    # 9. Bản xem nhanh, ảnh mốc, so trước/sau
    job.progress("preview", "Bản xem nhanh 540p, ảnh mốc, so trước/sau", 88)
    preview = job.p("preview.mp4")
    sh(["ffmpeg", "-v", "error", "-y", "-i", master, "-vf", f"scale=540:{SKILL['output']['previewHeight']}:flags=lanczos", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", str(SKILL["output"]["previewCrf"]), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-af", f"alimiter=limit={10 ** ((ac['truePeakPreview'] - 0.8) / 20):.4f}:level=0",
        "-movflags", "+faststart", preview])
    pI, pTP = ebur(preview)
    snapd = job.p("snapshots")
    shutil.rmtree(snapd, ignore_errors=True)
    os.makedirs(snapd)
    every = SKILL["output"]["snapshotEverySec"]
    sh(["ffmpeg", "-v", "error", "-y", "-i", master, "-vf", f"fps=1/{every},scale=360:-2", "-q:v", "4", os.path.join(snapd, "%03d.jpg")])
    snaps = sorted(os.listdir(snapd))
    if snaps:
        tiles = [Image.open(os.path.join(snapd, s)) for s in snaps]
        cols = min(6, len(tiles))
        rows = math.ceil(len(tiles) / cols)
        tw, th = tiles[0].size
        sheet = Image.new("RGB", (cols * tw, rows * (th + 28)), (20, 20, 20))
        dr = ImageDraw.Draw(sheet)
        for i, t in enumerate(tiles):
            x, y = (i % cols) * tw, (i // cols) * (th + 28)
            sheet.paste(t, (x, y + 28))
            dr.text((x + 8, y + 6), f"{i * every // 60:02d}:{i * every % 60:02d}", fill=(230, 230, 230))
        sheet.save(job.p("contact.jpg"), quality=82)
    pairs = []
    for frac in (0.2, 0.5, 0.8):
        t = dur * frac
        before = job.p("work", f"b{frac}.png")
        after = job.p("work", f"a{frac}.png")
        ts = unmap(t, segs) if segs else t
        bvf = ",".join(([cropf] if cropf else []) + ["scale=540:960"])
        sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{ts:.3f}", "-i", src, "-vf", bvf, "-frames:v", "1", before])
        sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", master, "-vf", "scale=540:960", "-frames:v", "1", after])
        if os.path.exists(before) and os.path.exists(after):
            pairs.append((t, Image.open(before).convert("RGB"), Image.open(after).convert("RGB")))
    if pairs:
        comp = Image.new("RGB", (1080 + 12, len(pairs) * (960 + 30)), (20, 20, 20))
        dr = ImageDraw.Draw(comp)
        for i, (t, b, af) in enumerate(pairs):
            y = i * (960 + 30)
            dr.text((8, y + 8), f"RAW  {t:5.1f}s", fill=(230, 230, 230))
            dr.text((552 + 8, y + 8), f"BẢN DỰNG  {t:5.1f}s", fill=(230, 230, 230))
            comp.paste(b, (0, y + 30))
            comp.paste(af, (552, y + 30))
        comp.save(job.p("compare.jpg"), quality=80)

    # Phụ đề và lời
    def tc(t):
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    with open(job.p("phu-de.srt"), "w", encoding="utf-8") as f:
        k = 0
        for u in units:
            if not u["lines"]:
                continue
            k += 1
            f.write(f"{k}\n{tc(u['start'])} --> {tc(u['end'])}\n" + "\n".join(" ".join(l) for l in u["lines"]) + "\n\n")
    uncertain = [{"t": round(w["start"], 2), "text": w["text"], "p": round(w["p"], 2)} for w in words if w.get("uncertain")]
    with open(job.p("transcript.txt"), "w", encoding="utf-8") as f:
        f.write(" ".join((w["text"] + "[?]") if w.get("uncertain") else w["text"] for w in words) + "\n")

    # 10. Bảng kiểm trước khi giao (mục 4)
    job.progress("qa", "Chạy bảng kiểm A–P", 94)
    qa = []
    def add(i, name, status, detail):
        qa.append({"id": i, "name": name, "status": status, "detail": detail})

    nfr, mw, mh, mr = count_frames(master)
    add("A", "Định dạng 1080x1920, 30 fps, số khung đúng", "pass" if (mw, mh) == (W, H) and mr == f"{FPS}/1" and nfr == N else "fail",
        f"{mw}x{mh}, {mr} fps, {nfr}/{N} khung")
    errs = decode_errors(master) + decode_errors(preview)
    add("B", "Giải mã toàn bộ bản chính và bản xem nhanh", "pass" if not errs else "fail", "0 lỗi" if not errs else "; ".join(errs[:3]))
    bd = sh(["ffmpeg", "-hide_banner", "-i", master, "-vf", "blackdetect=d=0.5:pix_th=0.08,freezedetect=n=0.001:d=3", "-an", "-f", "null", "-"]).stderr
    blacks = re.findall(r"black_start:([\d.]+)", bd)
    freezes = re.findall(r"freeze_start: ([\d.]+)", bd)
    add("C", "Khung đen / đứng hình", "pass" if not blacks and not freezes else "fail",
        "không có" if not blacks and not freezes else f"đen tại {', '.join(blacks[:3])}s; đứng hình tại {', '.join(freezes[:3])}s")
    d_ok = mI is not None and abs(mI - ac["targetLufs"]) <= ac["lufsTolerance"] and mTP <= ac["truePeakMaster"] and pTP <= ac["truePeakPreview"]
    add("D", "Độ to −16 LUFS ±1, đỉnh thật ≤ −2,0 (bản chính) / ≤ −1,0 (xem nhanh)", "pass" if d_ok else "fail",
        f"bản chính {mI} LUFS, TP {mTP} dBTP; xem nhanh TP {pTP} dBTP")
    e_err = 0
    for u in units:
        if not u["visible"]:
            continue
        if fr(u["start"]) > fr(u["visible"][0]["start"]) or fr(u["end"]) < fr(u["visible"][-1]["start"]):
            e_err += 1
    for e in emph:
        if fr(e["t0"]) >= fr(e["t1"]):
            e_err += 1
    add("E", "Nhịp phụ đề và chữ nhấn khớp lời", "pass" if e_err == 0 else "fail",
        f"{len([u for u in units if u['lines']])} khung phụ đề, {len(emph)} chữ nhấn, {e_err} lỗi nhịp; đặt theo mốc từng từ, quy về số khung")
    f_ok = sub_out_F == 0 and emp_out_F == 0
    add("F", "Bố cục: chữ đúng vùng", "blocker" if logo_over["left"] or logo_over["right"] or logo_over["top"] or logo_over["bottom"] else ("pass" if f_ok else "fail"),
        f"phụ đề lố vùng {sub_out_F} khung, chữ nhấn lố vùng {emp_out_F} khung; logo lố vùng trái {logo_over['left']} / phải {logo_over['right']} / trên {logo_over['top']} / dưới {logo_over['bottom']} px (cỡ {lz['width']} chờ OWNER #98a)")
    add("G", "Đồ họa không ra ngoài vùng chữ", "pass", "chưa dùng đồ họa/sơ đồ ở bản này")
    add("H", "Phụ đề không chồng chữ nhấn", "pass" if overlap_H == 0 else "fail", f"{overlap_H} khung chồng")
    add("I", "Không có điểm ảnh chữ ngoài vùng chữ", "pass" if bad_I == 0 else "fail", f"{bad_I} khung có điểm ảnh ngoài vùng (đo trên kênh alpha > 40)")
    if face and face.get("detected"):
        fz = zone_px("face")
        badj = 0
        for s in face["samples"]:
            zt = zoom_at(ev, s["t"])
            bx = [(s["x0"] - anchor[0]) * zt + anchor[0], (s["y0"] - anchor[1]) * zt + anchor[1], (s["x1"] - anchor[0]) * zt + anchor[0], (s["y1"] - anchor[1]) * zt + anchor[1]]
            if not inside((bx[0] * W, bx[1] * H, bx[2] * W, bx[3] * H), fz, 4):
                badj += 1
        add("J", "Mặt trong vùng mặt ở mọi khung zoom", "pass" if badj == 0 else "fail",
            f"{len(face['samples'])} mẫu (2 khung/giây), {badj} mẫu lệch vùng; zoom tối đa ×{SKILL['zoom']['max']}")
    else:
        add("J", "Mặt trong vùng mặt ở mọi khung zoom", "unmeasured", "không dò được mặt; zoom đặt tâm theo vùng mặt (giả định)")
    if a.previous and os.path.exists(a.previous):
        ps = sh(["ffmpeg", "-hide_banner", "-i", master, "-i", a.previous, "-lavfi", f"[1:v]scale={W}:{H}[b];[0:v][b]psnr", "-f", "null", "-"], check=False).stderr
        m = re.search(r"average:([\d.inf]+)", ps)
        add("K", "So khung với bản trước, kể cả vùng logo", "info", f"PSNR trung bình toàn khung {m.group(1) if m else '?'} dB so với bản trước")
    else:
        add("K", "So khung với bản trước, kể cả vùng logo", "na", "bản đầu")
    bright = float(np.mean(sub_luma > 0.7)) if len(sub_luma) else 0.0
    add("L", "Độ đọc chữ trắng/logo trên nền sáng", "risk" if bright > 0.1 else "pass", f"{round(bright * 100)}% mẫu có nền vùng phụ đề sáng (> 0,7)")
    add("M", "Âm thanh giống từng byte khi chỉ sửa hình", "na", "dựng từ RAW, không phải bản sửa hình")
    add("N", "Màu logo đúng theo nền", "pass", "; ".join(f"{s['t0']:.1f}–{s['t1']:.1f}s nền {s['luma']} → logo {'tối' if s['logo'] == 'dark' else 'sáng'}" for s in scenes))
    add("O", "Không có thông tin bí mật; không lộ tên người thật", "unmeasured", "cần người xem lại phụ đề (tệp phu-de.srt)")
    p_notes = ["font Times New Roman: chưa có giấy phép thương mại (chặn đăng)"]
    if music_info and music_info.get("used"):
        p_notes.append(f"nhạc: giấy phép “{music_info['license']}”, A5 lúc nói {music_info['a5']['speechMarginDb']} dB / khoảng nghỉ {music_info['a5']['pauseMarginDb']} dB" + ("" if music_info["a5"]["pass"] else " — CHƯA ĐẠT"))
    elif music_info:
        p_notes.append(music_info["reason"])
    else:
        p_notes.append("không dùng nhạc")
    add("P", "Nhạc / B-roll / ảnh / font: nguồn, giấy phép, bằng chứng; A5", "blocker", "; ".join(p_notes))

    blockers = []
    if uncertain:
        blockers.append(f"{len(uncertain)} từ nghe chưa chắc đã bỏ khỏi phụ đề/chữ nhấn — cần OWNER nghe lại (#90, #92)")
    if any(logo_over.values()):
        blockers.append("Logo vượt vùng logo — chờ OWNER chốt cỡ (#98a)")
    blockers.append("Font Times New Roman chưa có giấy phép thương mại")
    if music_info and music_info.get("used"):
        blockers.append("Nhạc nền chỉ duyệt nội bộ — chờ OWNER nghe và duyệt")
    failed = [q["id"] for q in qa if q["status"] == "fail"]

    job.progress("finish", "Ghi mã kiểm và báo cáo", 98)
    with open(job.p("checksums.sha256"), "w") as f:
        for name in ("master.mp4", "preview.mp4"):
            f.write(f"{sha256(job.p(name))}  {name}\n")
    report = {
        "skill": {k: SKILL[k] for k in ("skillId", "name", "version", "status", "sourceUrl", "sourceSums")},
        "input": {"file": os.path.basename(src), **info, "hdrNotToneMapped": hdr},
        "output": {"master": "master.mp4", "preview": "preview.mp4", "frames": N, "seconds": round(dur, 3), "cutSilence": bool(a.cut_silence),
                   "cuts": (len(segs) - 1) if segs else 0},
        "transcript": {"words": len(words), "uncertain": uncertain, "secondModel": a.model2 if second is not None else None},
        "captions": {"units": len([u for u in units if u["lines"]])},
        "emphasis": [{"t": round(e["t0"], 2), "text": e["text"], "kind": e["kind"]} for e in emph],
        "zoom": {"events": [{"t": t, "delta": d} for t, d in ev], "anchor": [round(anchor[0], 3), round(anchor[1], 3)], "faceDetected": bool(face and face.get("detected"))},
        "logo": {"scenes": scenes, "overflowPx": logo_over, "width": lz["width"]},
        "audio": {"lufs": mI, "truePeak": mTP, "previewTruePeak": pTP, "music": music_info, **audio_meta},
        "qa": qa, "failed": failed, "blockers": blockers,
        "openQuestions": SKILL["openQuestions"], "notYetAutomated": SKILL["notYetAutomated"],
        "timings": job.timings, "elapsedSec": round(time.time() - job.t0, 1),
    }
    json.dump(report, open(job.p("report.json"), "w"), ensure_ascii=False, indent=1)
    shutil.rmtree(job.p("work"), ignore_errors=True)
    job.progress("done", "Xong — chờ kiểm tra", 100)
    print(json.dumps({"ok": True, "frames": N, "seconds": round(dur, 2), "failed": failed, "blockers": len(blockers)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(f"LỖI: {e}\n")
        sys.exit(1)
