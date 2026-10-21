#!/usr/bin/env python3
"""Bộ dựng theo "Skill ESV" (Notion 02 SKILL, edu-hau-ky-video-916-phu-luc v0.3.1, DRAFT) — kiểu EDIT_v9 dọc 9:16.

  python3 scripts/video/esv_render.py --input RAW.mp4 --job-dir DIR --plan plan.json [--words words.json] [--logo baor-light.png]

plan.json (bước biên tập; do người hoặc AI lập từ lời nói, chỉ dùng từ nghe rõ):
  { "emphasis": [{"t": 5.08, "text": "KỊCH BẢN", "style": "blur|fade|shine", "end": 6.4}],
    "diagrams": [{"type": "compare", "t0":..,"t1":.., "wrong": {"t":.., "text":"..", "strike":..}},
                 {"type": "arrow", "t0":..,"t1":.., "top": {"t":..,"text":".."}, "bottom": {"t":..,"text":".."}}],
    "zooms": [{"t": 5.0, "level": 1.10, "out": 7.0}], "breath": [[0, 16.5], [16.5, 36]] }

Đầu ra như pipeline.py (master.mp4, preview.mp4, report.json, phu-de.srt, transcript.txt, contact.jpg, checksums.sha256)
để Video Studio đọc được. Không dùng ASS (ffmpeg máy này không có libass): vẽ bằng Pillow theo đúng số đo ESV.
Không đăng, không ghi đè bản trước. Số do bot tự chọn đã ghi nhãn trong ESV.
"""
import argparse, json, math, os, re, shutil, subprocess, sys, time

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pipeline as P  # noqa: E402  (dùng lại: probe, sh, ebur, transcribe, đếm khung, giải mã, sha256, Job)

W, H, FPS = 1080, 1920, 30
# Vùng ESV mục 2 (px @1080x1920)
RED = (0, 274, 1080, 1089)          # mặt
YEL = (82, 1118, 998, 1613)         # mọi chữ / đồ hoạ
BAND_Y0, BAND_Y1 = 1100, 1630        # lớp chữ vẽ trong dải này (bao trọn VÀNG)
SUB_BOTTOM = 1540                    # \an2\pos(540,1540)
SUB_MAXW = 904
EMP_BOTTOM = 1402                    # chữ nhấn \an2\pos(540,1402)
FONT_DIRS = [os.environ.get("BAOR_FONT_DIR", ""), "/System/Library/Fonts/Supplemental", "/Library/Fonts", "/usr/share/fonts/truetype/msttcorefonts"]
G1 = [("#FFF3C4", 0.0), ("#E8C872", 0.42), ("#B8913A", 0.78), ("#F2DC98", 1.0)]
GOLD, GOLD2, DARK_BROWN = "#D4AF37", "#E8C872", "#1E1408"
SS = 2  # vẽ chữ ở 2x rồi thu về để nét mảnh (0,8 px) đúng


def font(name, size):
    for d in FONT_DIRS:
        p = os.path.join(d, name) if d else ""
        if p and os.path.exists(p):
            return ImageFont.truetype(p, int(round(size)))
    raise RuntimeError(f"Thiếu font {name}")


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def ease_cubic(u):
    u = min(max(u, 0.0), 1.0)
    return 1 - (1 - u) ** 3


def cos_ease(u):
    u = min(max(u, 0.0), 1.0)
    return (1 - math.cos(math.pi * u)) / 2


def with_alpha(img, a):
    if a >= 0.999:
        return img
    out = img.copy()
    out.putalpha(out.getchannel("A").point(lambda v: int(v * max(0.0, a))))
    return out


def text_mask(text, f, stroke=0):
    l, t, r, b = f.getbbox(text, stroke_width=stroke)
    m = Image.new("L", (r - l + 4, b - t + 4), 0)
    ImageDraw.Draw(m).text((2 - l, 2 - t), text, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
    return m, (l - 2, t - 2)


# ---------------------------------------------------------------- phụ đề karaoke (ESV mục 3)

def build_sub_units(words, fsub):
    """Cụm theo ngắt câu (dấu câu / ngừng ≥ 0,35 s); cụm quá rộng tách đôi ở điểm cân nhất. Bỏ từ nghe chưa chắc."""
    ws = [w for w in words if not w.get("uncertain")]
    units, cur = [], []
    for i, w in enumerate(ws):
        cur.append(w)
        gap = (ws[i + 1]["start"] - w["end"]) if i + 1 < len(ws) else 9
        if re.search(r"[,.?!…]$", w["text"]) or gap >= 0.35:
            units.append(cur)
            cur = []
    if cur:
        units.append(cur)
    out = []

    def width(ws_):
        return fsub.getlength(" ".join(x["text"] for x in ws_)) + 2.6 * len(ws_) + 6

    def split(u):
        if width(u) <= SUB_MAXW or len(u) < 2:
            out.append(u)
            return
        best = min(range(1, len(u)), key=lambda k: abs(width(u[:k]) - width(u[k:])))
        split(u[:best])
        split(u[best:])

    for u in units:
        split(u)
    res = []
    for k, u in enumerate(out):
        start = u[0]["start"]
        nxt = out[k + 1][0]["start"] if k + 1 < len(out) else u[-1]["end"] + 0.6
        end = nxt if nxt - u[-1]["end"] < 0.4 else u[-1]["end"] + 0.3
        end = max(end, start + 0.5)
        res.append({"words": u, "start": start, "end": end})
    return res


def draw_subtitle(unit, hl, fsub_ss):
    """1 dòng, đáy tại y1540: bóng mềm, viền đen 2,45, quầng quanh từ đang đọc, chữ trắng nét trắng 0,8, từ đọc #FFC929."""
    words = [w["text"] for w in unit["words"]]
    text = " ".join(words)
    bw, bh = W * SS, 200 * SS
    canvas = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    tw = fsub_ss.getlength(text)
    x0 = (bw - tw) / 2
    asc, desc = fsub_ss.getmetrics()
    y0 = bh - 30 * SS - (asc + desc)
    # vị trí từng từ
    xs, x = [], x0
    for i, wd in enumerate(words):
        xs.append(x)
        x += fsub_ss.getlength(wd + (" " if i < len(words) - 1 else ""))
    # bóng
    sh_ = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(sh_).text((x0 + 5.5 * SS, y0 + 3.8 * SS), text, font=fsub_ss, fill=255, stroke_width=int(round(2.45 * SS)), stroke_fill=255)
    sh_ = sh_.filter(ImageFilter.GaussianBlur(4.4 * SS / 2))
    canvas.paste((0, 0, 0, 255), (0, 0), sh_.point(lambda v: int(v * 0.67)))
    # quầng sáng quanh từ đang đọc (v9 có; #100(b) còn mở)
    if hl >= 0:
        g = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(g).text((xs[hl], y0), words[hl], font=fsub_ss, fill=255, stroke_width=int(round(4.6 * SS)), stroke_fill=255)
        g = g.filter(ImageFilter.GaussianBlur(9.2 * SS / 2))
        canvas.alpha_composite(Image.composite(Image.new("RGBA", (bw, bh), rgb("#FFB800") + (255,)), Image.new("RGBA", (bw, bh), (0, 0, 0, 0)), g.point(lambda v: int(v * 0.75))))
    d = ImageDraw.Draw(canvas)
    d.text((x0, y0), text, font=fsub_ss, fill=(0, 0, 0, 255), stroke_width=int(round(2.45 * SS)), stroke_fill=(0, 0, 0, 255))
    for i, wd in enumerate(words):
        col = rgb("#FFC929") if i == hl else (255, 255, 255)
        d.text((xs[i], y0), wd, font=fsub_ss, fill=col + (255,), stroke_width=int(round(0.8 * SS)), stroke_fill=col + (255,))
    small = canvas.resize((W, 200), Image.LANCZOS)
    return small, SUB_BOTTOM - 200 + 30  # ảnh, y đỉnh trên khung


# ---------------------------------------------------------------- chữ nhấn vàng ánh kim (ESV mục 4)

def gradient_fill(size, stops):
    w, h = size
    col = np.zeros((h, 3), dtype=np.float32)
    ys = np.linspace(0, 1, h)
    cs = [np.array(rgb(c), dtype=np.float32) for c, _ in stops]
    ps = [p for _, p in stops]
    for i, y in enumerate(ys):
        for k in range(len(ps) - 1):
            if ps[k] <= y <= ps[k + 1]:
                u = (y - ps[k]) / (ps[k + 1] - ps[k])
                col[i] = cs[k] + (cs[k + 1] - cs[k]) * u
                break
    arr = np.repeat(col[:, None, :], w, axis=1).astype(np.uint8)
    return Image.fromarray(arr)


def render_gold(text, fs):
    """Ảnh RGBA chữ vàng G1: quầng #FFD66E 2 lớp, bóng lệch, viền #1E1408 0,025·fs, gradient dọc."""
    f = font("Times New Roman Bold Italic.ttf", fs * SS)
    stroke = max(1, int(round(0.025 * fs * SS)))
    m, _ = text_mask(text, f, 0)
    ms, _ = text_mask(text, f, stroke)
    pad = int(0.35 * fs * SS)
    w, h = ms.size[0] + 2 * pad, ms.size[1] + 2 * pad
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    full_m = Image.new("L", (w, h), 0)
    full_m.paste(m, (pad + stroke, pad + stroke))
    full_ms = Image.new("L", (w, h), 0)
    full_ms.paste(ms, (pad, pad))
    glow_col = Image.new("RGBA", (w, h), rgb("#FFD66E") + (255,))
    for blur, op in ((0.30 * fs, 0.45), (0.12 * fs, 0.75)):
        g = full_ms.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(blur * SS / 2))
        canvas.alpha_composite(Image.composite(glow_col, Image.new("RGBA", (w, h), (0, 0, 0, 0)), g.point(lambda v, o=op: int(v * o))))
    sh_ = ImageChops.offset(full_ms, int(0.083 * fs * SS), int(0.058 * fs * SS)).filter(ImageFilter.GaussianBlur(0.083 * fs * SS / 2))
    canvas.paste((0, 0, 0, 255), (0, 0), sh_.point(lambda v: int(v * 0.67)))
    canvas.paste(rgb(DARK_BROWN) + (255,), (0, 0), full_ms)
    grad = gradient_fill((w, h), G1).convert("RGBA")
    canvas.paste(grad, (0, 0), full_m)
    return canvas.resize((w // SS, h // SS), Image.LANCZOS), full_m.resize((w // SS, h // SS), Image.LANCZOS)


def fit_size(text, base=150, maxw=860):
    f = font("Times New Roman Bold Italic.ttf", base)
    fs = base
    while fs > 60 and f.getlength(text) > maxw:
        fs -= 4
        f = font("Times New Roman Bold Italic.ttf", fs)
    return fs


class Emphasis:
    def __init__(self, e, words):
        self.text = e["text"]
        self.style = e.get("style", "fade")
        self.t0 = float(e["t"])
        wend = max([w["end"] for w in words if self.t0 - 0.05 <= w["start"] <= self.t0 + 1.5] or [self.t0 + 0.6])
        self.t1 = float(e.get("end", max(wend + 0.8, self.t0 + 1.6)))
        self.fs = fit_size(self.text)
        self.img, self.mask = render_gold(self.text, self.fs)

    def frame(self, t, layer, boxes):
        if t < self.t0 or t >= self.t1:
            return
        ms = (t - self.t0) * 1000
        out_a = min(1.0, (self.t1 - t) / 0.25)
        img = self.img
        dy, alpha = 0, 1.0
        if self.style == "fade":
            dy = 0.18 * self.fs * (1 - ease_cubic(ms / 450))
            alpha = ease_cubic(ms / 380)
        elif self.style == "blur":
            u = ease_cubic(ms / 380)
            alpha = u
            r = 14 * (1 - u) + 0.4 * u
            if r > 0.6:
                img = img.filter(ImageFilter.GaussianBlur(r / 2))
            sx = 1 + 0.06 * (1 - u)  # giãn chữ 12 → 1 xấp xỉ bằng giãn ngang
            if sx > 1.001:
                img = img.resize((int(img.width * sx), img.height), Image.LANCZOS)
        elif self.style == "shine":
            u = ease_cubic(ms / 380)
            alpha = u
            s = 0.96 + 0.04 * u
            if s < 0.999:
                img = img.resize((int(img.width * s), int(img.height * s)), Image.LANCZOS)
            if 520 <= ms <= 1270:
                p = (ms - 520) / 750
                img = img.copy()
                band = Image.new("L", img.size, 0)
                bd = ImageDraw.Draw(band)
                cx = -90 + p * (img.width + 120)
                for k, a in enumerate((0xC8, 0x70, 0x30, 0x70, 0xC8)):
                    x = cx + (k - 2) * 22
                    bd.polygon([(x, 0), (x + 22, 0), (x + 22 - 30, img.height), (x - 30, img.height)], fill=255 - a)
                m = self.mask.resize(img.size) if self.mask.size != img.size else self.mask
                shine = ImageChops.multiply(band, m)
                img.paste(rgb("#FFF8EA") + (255,), (0, 0), shine)
        img = with_alpha(img, alpha * out_a)
        x = int(540 - img.width / 2)
        y = int(EMP_BOTTOM - img.height * 0.80 + dy)  # đáy nét chữ ≈ y1402
        layer.alpha_composite(img, (x, y - BAND_Y0))
        boxes.append(("emp", (x, y, x + img.width, y + img.height)))


# ---------------------------------------------------------------- sơ đồ (ESV mục 5)

def label_img(text, fs=66):
    """Nhãn kiểu B: Times Italic trắng, không viền, bóng đen lệch 2/34·fs, đục 70 %."""
    f = font("Times New Roman Italic.ttf", fs * SS)
    m, _ = text_mask(text, f)
    off = int(round(2 / 34 * fs * SS))
    w, h = m.size[0] + off + 8, m.size[1] + off + 8
    c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sh_ = Image.new("L", (w, h), 0)
    sh_.paste(m, (off, off))
    c.paste((0, 0, 0, 255), (0, 0), sh_.filter(ImageFilter.GaussianBlur(0.6 * SS)).point(lambda v: int(v * 0.70)))
    c.paste((255, 255, 255, 255), (0, 0), m)
    return c.resize((w // SS, h // SS), Image.LANCZOS)


def ring_icon(r, glyph):
    s = r * 2 + 12
    c = Image.new("RGBA", (s * SS, s * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    o = 6 * SS
    d.ellipse([o, o, o + 2 * r * SS, o + 2 * r * SS], fill=(13, 11, 11, 191), outline=rgb(GOLD) + (255,), width=3 * SS)
    cx = cy = o + r * SS
    k = r * 0.42 * SS
    if glyph == "x":
        for a, b in (((-k, -k), (k, k)), ((-k, k), (k, -k))):
            d.line([(cx + a[0], cy + a[1]), (cx + b[0], cy + b[1])], fill=(255, 255, 255, 255), width=4 * SS)
    elif glyph == "tick":
        d.line([(cx - k, cy), (cx - k * 0.25, cy + k * 0.7), (cx + k, cy - k * 0.7)], fill=rgb(GOLD2) + (255,), width=5 * SS, joint="curve")
    return c.resize((s, s), Image.LANCZOS)


def scale_in(img, u):
    """scale-in 85 → 100 % + hiện dần (neo tâm)."""
    e = ease_cubic(u)
    s = 0.85 + 0.15 * e
    im = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    return with_alpha(im, e)


class Compare:
    """So sánh sai (cột trái): vòng icon ✗ r38 tại (130,1180) + nhãn; gạch xoá trắng 4 px vẽ dần 420 ms lúc nói 'không đúng'."""

    def __init__(self, d):
        self.t0, self.t1 = d["t0"], d["t1"]
        self.w = d["wrong"]
        self.icon = ring_icon(38, "x")
        self.lbl = label_img(self.w["text"][:1].upper() + self.w["text"][1:])

    def frame(self, t, layer, boxes):
        if not (self.t0 <= t < self.t1):
            return
        fade = min(1.0, (self.t1 - t) / 0.25)
        ti = self.w["t"]
        if t >= ti:
            ic = with_alpha(scale_in(self.icon, (t - ti) / 0.30), fade)
            cx, cy = 130, 1180
            layer.alpha_composite(ic, (int(cx - ic.width / 2), int(cy - ic.height / 2) - BAND_Y0))
            boxes.append(("gfx", (cx - 44, cy - 44, cx + 44, cy + 44)))
        if t >= ti + 0.09:
            u = ease_cubic((t - ti - 0.09) / 0.32)
            lb = self.lbl.resize((max(1, int(self.lbl.width * (0.92 + 0.08 * u))), self.lbl.height), Image.LANCZOS)
            strike_t = self.w.get("strike")
            dim = 1.0
            if strike_t and t >= strike_t:
                dim = 1 - (1 - 0x8F / 255) * min(1.0, (t - strike_t) / 0.4)
            lb = with_alpha(lb, u * fade * dim)
            x, y = 190, 1180 - lb.height // 2
            layer.alpha_composite(lb, (x, y - BAND_Y0))
            boxes.append(("gfx", (x, y, x + lb.width, y + lb.height)))
            if strike_t and t >= strike_t:
                p = ease_cubic((t - strike_t) / 0.42)
                d = ImageDraw.Draw(layer)
                yy = 1180 - BAND_Y0 + 4
                d.line([(x - 6, yy), (x - 6 + (lb.width + 12) * p, yy)], fill=(255, 255, 255, int(255 * fade)), width=4)


class Arrow:
    """Mũi tên 2 bước: dòng trên trắng 70 px tại (540,1172) → thân dọc 3 px y1214–1290 (vẽ 520 ms, +300 ms)
    → đầu mũi tên 22 px tại y1298 (+760 ms) → dòng dưới vàng ánh kim 96 px, đáy y1418; dòng trên mờ về α&H50&."""

    def __init__(self, d):
        self.t0, self.t1 = d["t0"], d["t1"]
        self.top, self.bottom = d["top"], d["bottom"]
        self.topimg = label_img(self.top["text"][:1].upper() + self.top["text"][1:], 70)
        self.botimg, _ = render_gold(self.bottom["text"][:1].upper() + self.bottom["text"][1:], fit_size(self.bottom["text"], 96, 860))

    def frame(self, t, layer, boxes):
        if not (self.t0 <= t < self.t1):
            return
        fade = min(1.0, (self.t1 - t) / 0.25)
        ta, tb = self.top["t"], self.bottom["t"]
        d = ImageDraw.Draw(layer)
        if t >= ta:
            u = ease_cubic((t - ta) / 0.32)
            dim = 1.0 if t < tb else 1 - (1 - (255 - 0x50) / 255) * min(1.0, (t - tb) / 0.35)
            im = with_alpha(self.topimg, u * fade * dim)
            x, y = int(540 - im.width / 2), int(1172 - im.height / 2)
            layer.alpha_composite(im, (x, y - BAND_Y0))
            boxes.append(("gfx", (x, y, x + im.width, y + im.height)))
            ts = ta + 0.30
            if t >= ts:
                p = ease_cubic((t - ts) / 0.52)
                y1 = 1214 + (1290 - 1214) * p
                d.line([(540, 1214 - BAND_Y0), (540, y1 - BAND_Y0)], fill=rgb(GOLD) + (int(255 * fade),), width=3)
            th = ta + 0.76
            if t >= th:
                a = int(255 * ease_cubic((t - th) / 0.22) * fade)
                d.polygon([(540 - 11, 1298 - 11 - BAND_Y0), (540 + 11, 1298 - 11 - BAND_Y0), (540, 1298 + 11 - BAND_Y0)], fill=rgb(GOLD) + (a,))
        if t >= tb:
            u = ease_cubic((t - tb) / 0.38)
            im = with_alpha(self.botimg, u * fade)
            x = int(540 - im.width / 2)
            y = int(1418 - im.height * 0.80 + 0.18 * 96 * (1 - u))
            layer.alpha_composite(im, (x, y - BAND_Y0))
            boxes.append(("gfx", (x, y, x + im.width, y + im.height)))


# ---------------------------------------------------------------- khung, mặt, zoom (ESV mục 1, 6)

def face_center(src, info, n=12):
    import cv2
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    xs, ys = [], []
    for k in range(n):
        t = info["duration"] * (k + 0.5) / n
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=960:-2", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
        if not r.stdout:
            continue
        img = cv2.imdecode(np.frombuffer(r.stdout, np.uint8), cv2.IMREAD_GRAYSCALE)
        faces = cas.detectMultiScale(img, 1.1, 6, minSize=(60, 60))
        if len(faces):
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            sc = info["width"] / img.shape[1]
            xs.append((x + w / 2) * sc)
            ys.append((y + h / 2) * sc)
    if not xs:
        return info["width"] / 2, info["height"] * 0.35, False
    return float(np.median(xs)), float(np.median(ys)), True


def zoom_expr(zooms, breath):
    """z(t) = thở(×1,03) × nhấn(×1,07–1,12), cosine; biểu thức ffmpeg theo t."""
    def seg(t0, t1, z0, z1):
        return f"between(t,{t0:.3f},{t1:.3f})*({z0 - 1:.4f}+{z1 - z0:.4f}*(1-cos(PI*(t-{t0:.3f})/{t1 - t0:.3f}))/2)"
    parts_b = []
    for a, b in breath:
        L = b - a
        if L < 10:
            continue
        up = min(7.0, 0.45 * L)
        s0, s1 = a + 0.4, a + 0.4 + up
        e0 = b - 0.3 - 4.0
        parts_b += [seg(s0, s1, 1.0, 1.03), f"between(t,{s1:.3f},{e0:.3f})*0.03", seg(e0, e0 + 4.0, 1.03, 1.0)]
    parts_e = []
    for z in zooms:
        ti, lv, to = z["t"], z["level"], z["out"]
        parts_e += [seg(ti, ti + 0.8, 1.0, lv), f"between(t,{ti + 0.8:.3f},{to:.3f})*{lv - 1:.4f}", seg(to, to + 0.9, lv, 1.0)]
    zb = "(1+" + ("+".join(parts_b) if parts_b else "0") + ")"
    ze = "(1+" + ("+".join(parts_e) if parts_e else "0") + ")"
    return f"min(1.15,{zb}*{ze})"


def zoom_value(zooms, breath, t):
    def seg(t0, t1, z0, z1):
        return (z0 + (z1 - z0) * cos_ease((t - t0) / (t1 - t0))) if t0 <= t <= t1 else None
    zb = 1.0
    for a, b in breath:
        L = b - a
        if L < 10:
            continue
        up = min(7.0, 0.45 * L)
        s0, s1, e0 = a + 0.4, a + 0.4 + min(7.0, 0.45 * L), b - 0.3 - 4.0
        if s0 <= t <= s1:
            zb = seg(s0, s1, 1.0, 1.03)
        elif s1 < t < e0:
            zb = 1.03
        elif e0 <= t <= e0 + 4.0:
            zb = seg(e0, e0 + 4.0, 1.03, 1.0)
    ze = 1.0
    for z in zooms:
        ti, lv, to = z["t"], z["level"], z["out"]
        if ti <= t <= ti + 0.8:
            ze = seg(ti, ti + 0.8, 1.0, lv)
        elif ti + 0.8 < t < to:
            ze = lv
        elif to <= t <= to + 0.9:
            ze = seg(to, to + 0.9, lv, 1.0)
    return min(1.15, zb * ze)


# ---------------------------------------------------------------- chính

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--job-dir", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--words", default="")
    ap.add_argument("--logo", default=os.path.join(P.ROOT, "public", "brand", "baor-light.png"))
    ap.add_argument("--model", default="medium")
    ap.add_argument("--model2", default="small")
    a = ap.parse_args()
    job = P.Job(a.job_dir)
    os.makedirs(job.p("work"), exist_ok=True)
    src = os.path.abspath(a.input)
    plan = json.load(open(a.plan, encoding="utf-8"))
    shutil.copy(a.plan, job.p("plan.json"))

    job.progress("probe", "Kiểm tra nguồn", 3)
    info = P.probe(src)
    dur = info["duration"]
    N = int(round(dur * FPS))
    dur = N / FPS

    # Lời: dùng lại hoặc nghe 2 mô hình; từ chưa chắc không lên màn hình
    if a.words and os.path.exists(a.words):
        words = json.load(open(a.words, encoding="utf-8"))
        job.progress("listen", "Dùng lời đã nghe", 30)
    else:
        wav16 = job.p("work", "a16.wav")
        P.sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", wav16])
        job.progress("listen1", f"Nghe lời (mô hình {a.model})", 8)
        words = P.transcribe(wav16, a.model, "")
        job.progress("listen2", f"Nghe lại đối chiếu ({a.model2})", 30)
        second = P.transcribe(wav16, a.model2, "")
        P.mark_uncertain(words, second)
    for w in words:
        w.setdefault("end", w["start"] + 0.2)
        if "uncertain" not in w:
            w["uncertain"] = w.get("p", 1) < 0.15
    json.dump(words, open(job.p("words_main.json"), "w"), ensure_ascii=False)

    # Khung: nguồn ngang → cắt toàn chiều cao quanh người nói 1216x2160 (ESV mục 1); nguồn dọc giữ nguyên
    job.progress("frame", "Dò mặt, chọn khung 9:16", 36)
    fx, fy, face_ok = face_center(src, info)
    if info["width"] > info["height"]:
        ch = info["height"]
        cw = int(round(ch * 9 / 16 / 2)) * 2
        x0 = int(min(max(fx - cw / 2, 0), info["width"] - cw)) // 2 * 2
        cropf = f"crop={cw}:{ch}:{x0}:0"
        ax = (fx - x0) / cw
        ay = fy / ch
    else:
        cropf = None
        ax, ay = fx / info["width"], fy / info["height"]
    # tâm zoom: mặt, giới hạn để mặt nằm trong ĐỎ
    ax = min(max(ax, 0.2), 0.8)
    ay = min(max(ay, 0.20), 0.45)

    # Lớp chữ / đồ hoạ
    job.progress("draw", "Vẽ phụ đề karaoke, chữ nhấn vàng, sơ đồ theo ESV", 45)
    fsub = font("Times New Roman Italic.ttf", 66)
    fsub_ss = font("Times New Roman Italic.ttf", 66 * SS)
    units = build_sub_units(words, fsub)
    emph = [Emphasis(e, words) for e in plan.get("emphasis", [])]
    dias = [Compare(d) if d["type"] == "compare" else Arrow(d) for d in plan.get("diagrams", [])]
    tdir = job.p("work", "txt")
    os.makedirs(tdir, exist_ok=True)
    sub_cache = {}
    bad_zone, overlap = 0, 0
    BH = BAND_Y1 - BAND_Y0
    for f in range(N):
        t = f / FPS
        layer = Image.new("RGBA", (W, BH), (0, 0, 0, 0))
        boxes = []
        for d in dias:
            d.frame(t, layer, boxes)
        for e in emph:
            e.frame(t, layer, boxes)
        u = next((x for x in units if x["start"] <= t < x["end"]), None)
        if u:
            hl = -1
            for k, w in enumerate(u["words"]):
                nxt = u["words"][k + 1]["start"] if k + 1 < len(u["words"]) else u["end"]
                if w["start"] <= t < max(nxt, w["end"]):
                    hl = k
            key = (id(u), hl)
            if key not in sub_cache:
                sub_cache[key] = draw_subtitle(u, hl, fsub_ss)
            img, ytop = sub_cache[key]
            a_in = min(1.0, (t - u["start"]) / 0.045 + 0.0001)
            img2 = with_alpha(img, a_in)
            layer.alpha_composite(img2, (0, ytop - BAND_Y0))
            bb = img.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            if bb:
                boxes.append(("sub", (bb[0], bb[1] + ytop, bb[2], bb[3] + ytop)))
        # Kiểm F/I/H: điểm ảnh chữ trong VÀNG (+19 px), phụ đề không chồng chữ nhấn / đồ hoạ
        abb = layer.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if abb and (abb[0] < YEL[0] - 19 or abb[2] > YEL[2] + 19 or abb[1] + BAND_Y0 < YEL[1] - 19 or abb[3] + BAND_Y0 > YEL[3] + 19):
            bad_zone += 1
        subs = [b for k, b in boxes if k == "sub"]
        others = [b for k, b in boxes if k != "sub"]
        if any(s[1] < o[3] - 6 and o[1] < s[3] and s[0] < o[2] and o[0] < s[2] for s in subs for o in others):
            overlap += 1
        layer.save(os.path.join(tdir, f"{f:06d}.png"), compress_level=1)
        if f % 150 == 0:
            job.progress("draw", f"Vẽ lớp chữ {f}/{N} khung", 45 + int(25 * f / N))

    # Âm thanh: giọng (lọc nhẹ, nén nhẹ, chuẩn −16 LUFS, đỉnh −2,5); chưa có nhạc có giấy phép trên Drive → không nhạc
    job.progress("audio", "Âm thanh: lọc giọng, chuẩn −16 LUFS", 72)
    voice = job.p("work", "voice.wav")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-af", f"apad=whole_dur={dur:.6f},atrim=end={dur:.6f},highpass=f=70,acompressor=threshold=0.05:ratio=2.5:attack=10:release=200:makeup=2", "-ar", "48000", "-ac", "2", voice])
    m = P.sh(["ffmpeg", "-hide_banner", "-i", voice, "-af", "loudnorm=I=-16:TP=-2.5:LRA=11:print_format=json", "-f", "null", "-"], check=False).stderr
    js = json.loads(m[m.rfind("{"):m.rfind("}") + 1])
    final = job.p("work", "final.wav")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", voice, "-af",
          f"loudnorm=I=-16:TP=-2.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true,"
          "aresample=192000,alimiter=limit=0.70:attack=1:release=80:level=false,aresample=48000", "-c:a", "pcm_s24le", final])

    # Bản chính: khung + zoom chỉ nền → logo → lớp chữ
    job.progress("encode", "Xuất bản chính 1080x1920", 78)
    zx = zoom_expr(plan.get("zooms", []), plan.get("breath", [[0, dur]]))
    vf = ["fps=30"] + ([cropf] if cropf else [])
    vf += [f"scale=w='trunc({W}*{zx}/2)*2':h='trunc({H}*{zx}/2)*2':eval=frame:flags=lanczos", f"crop={W}:{H}:x='(in_w-{W})*{ax:.4f}':y='(in_h-{H})*{ay:.4f}'", "unsharp=5:5:0.35", "setsar=1",
           "setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709"]
    logo_w = 440
    fc = (f"[0:v]{','.join(vf)}[bg];"
          f"[1:v]scale={logo_w}:-1:flags=lanczos,format=rgba,fade=t=in:st=0.3:d=0.6:alpha=1[lg];"
          f"[bg][lg]overlay=x='50-24*pow(1-min(max((t-0.3)/0.6\\,0)\\,1)\\,3)':y=120:eval=frame[l];"
          f"[2:v]format=rgba[tx];[l][tx]overlay=0:{BAND_Y0}:format=auto,format=yuv420p[v]")
    master = job.p("master.mp4")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-loop", "1", "-i", a.logo, "-framerate", str(FPS), "-start_number", "0", "-i", os.path.join(tdir, "%06d.png"),
          "-i", final, "-filter_complex", fc, "-map", "[v]", "-map", "3:a", "-frames:v", str(N),
          "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
          "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
          "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", master])

    # Chuẩn độ to trên bản đã mã hoá: chỉnh tăng/giảm rồi chặn đỉnh, chỉ ghép lại tiếng (giữ nguyên hình)
    for k in range(4):
        mI, mTP = P.ebur(master)
        if mI is not None and abs(mI + 16) <= 0.4 and mTP <= -2.0:
            break
        gain = (-16 - mI) if mI is not None else 0
        fixed = job.p("work", f"final_fix{k}.wav")
        P.sh(["ffmpeg", "-v", "error", "-y", "-i", final, "-af", f"volume={gain:.2f}dB,aresample=192000,alimiter=limit=0.70:attack=1:release=80:level=false,aresample=48000", "-c:a", "pcm_s24le", fixed])
        final = fixed
        tmpm = job.p("work", "master_fix.mp4")
        P.sh(["ffmpeg", "-v", "error", "-y", "-i", master, "-i", final, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", tmpm])
        os.replace(tmpm, master)

    job.progress("preview", "Bản xem nhanh 540p, ảnh mốc", 88)
    preview = job.p("preview.mp4")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", master, "-vf", "scale=540:960:flags=lanczos", "-c:v", "libx264", "-profile:v", "main", "-level", "3.1", "-preset", "slow", "-crf", "26",
          "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-af", "alimiter=limit=0.85:level=false", "-movflags", "+faststart", preview])
    snapd = job.p("snapshots")
    shutil.rmtree(snapd, ignore_errors=True)
    os.makedirs(snapd)
    marks = [dur * (k + 0.5) / 12 for k in range(12)]
    for i, t in enumerate(marks):
        P.sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", master, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", os.path.join(snapd, f"{i + 1:03d}.jpg")])
    tiles = [Image.open(os.path.join(snapd, s)) for s in sorted(os.listdir(snapd))]
    if tiles:
        tw, th = tiles[0].size
        sheet = Image.new("RGB", (6 * tw, 2 * (th + 28)), (20, 20, 20))
        dr = ImageDraw.Draw(sheet)
        for i, im in enumerate(tiles):
            x, y = (i % 6) * tw, (i // 6) * (th + 28)
            sheet.paste(im, (x, y + 28))
            dr.text((x + 8, y + 6), f"{int(marks[i]) // 60:02d}:{int(marks[i]) % 60:02d}", fill=(230, 230, 230))
        sheet.save(job.p("contact.jpg"), quality=82)

    # Phụ đề / lời
    def tc(t):
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    with open(job.p("phu-de.srt"), "w", encoding="utf-8") as fsrt:
        for k, u in enumerate(units):
            fsrt.write(f"{k + 1}\n{tc(u['start'])} --> {tc(u['end'])}\n{' '.join(w['text'] for w in u['words'])}\n\n")
    with open(job.p("transcript.txt"), "w", encoding="utf-8") as ftx:
        ftx.write(" ".join(w["text"] + ("[?]" if w.get("uncertain") else "") for w in words) + "\n")

    # Bảng kiểm (ESV mục 10)
    job.progress("qa", "Chạy bảng kiểm A–P theo ESV", 94)
    qa = []

    def add(i, name, status, detail):
        qa.append({"id": i, "name": name, "status": status, "detail": detail})
    nfr, mw, mh, mr = P.count_frames(master)
    add("A", "1080x1920, 30 fps, H.264, số khung đúng", "pass" if (mw, mh) == (W, H) and mr == "30/1" and nfr == N else "fail", f"{mw}x{mh}, {mr}, {nfr}/{N} khung")
    errs = P.decode_errors(master) + P.decode_errors(preview)
    add("B", "Giải mã toàn bộ", "pass" if not errs else "fail", "0 lỗi" if not errs else "; ".join(errs[:3]))
    bd = P.sh(["ffmpeg", "-hide_banner", "-i", master, "-vf", "blackdetect=d=0.3:pix_th=0.08,freezedetect=n=0.001:d=1.5", "-an", "-f", "null", "-"]).stderr
    add("C", "Khung đen / đứng hình", "pass" if "black_start" not in bd and "freeze_start" not in bd else "fail", "không có" if "black_start" not in bd and "freeze_start" not in bd else "có, xem log")
    mI, mTP = P.ebur(master)
    pI, pTP = P.ebur(preview)
    add("D", "−16 LUFS ±1, đỉnh ≤ −2,0 (chính) / ≤ −1,0 (xem nhanh)", "pass" if mI is not None and abs(mI + 16) <= 1 and mTP <= -2.0 and pTP <= -1.0 else "fail", f"chính {mI} LUFS TP {mTP}; xem nhanh TP {pTP}")
    add("E", "Phụ đề / chữ nhấn theo mốc từng từ", "pass", f"{len(units)} câu phụ đề, {len(emph)} chữ nhấn, {len(dias)} sơ đồ; đặt theo mốc từ đã nghe rõ")
    add("F", "Bố cục: logo vùng XANH, chữ vùng VÀNG", "blocker", "logo PNG rộng 440 tại (50,120): lố XANH như ESV đã biết (#98a)")
    add("G", "Đồ hoạ trong VÀNG", "pass" if bad_zone == 0 else "fail", f"{bad_zone} khung có điểm ảnh ngoài VÀNG (+19 px)")
    add("H", "Phụ đề không chồng chữ nhấn / đồ hoạ", "pass" if overlap == 0 else "fail", f"{overlap} khung chồng")
    add("I", "Quét điểm ảnh chữ ngoài VÀNG", "pass" if bad_zone == 0 else "fail", f"{bad_zone} khung")
    # J: dò mặt trên bản chính mỗi 0,5 s
    import cv2
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    out_red, sampled = 0, 0
    for k in range(int(dur * 2)):
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{k / 2:.2f}", "-i", master, "-frames:v", "1", "-vf", "scale=540:960", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
        if not r.stdout:
            continue
        g = cv2.imdecode(np.frombuffer(r.stdout, np.uint8), cv2.IMREAD_GRAYSCALE)
        fcs = cas.detectMultiScale(g, 1.1, 6, minSize=(60, 60))
        if len(fcs):
            sampled += 1
            x, y, w_, h_ = max(fcs, key=lambda q: q[2] * q[3])
            if y * 2 < RED[1] - 4 or (y + h_) * 2 > RED[3] + 4:
                out_red += 1
    add("J", "Mặt trong vùng ĐỎ ở mọi khung zoom", ("pass" if out_red == 0 else "fail") if sampled else "unmeasured", f"{sampled} mẫu có mặt, {out_red} mẫu lệch ĐỎ; tâm zoom theo mặt {'(dò được)' if face_ok else '(không dò được, giả định)'}")
    add("K", "So với bản trước", "na", "bản đầu theo ESV")
    add("L", "Độ đọc chữ trắng trên nền sáng", "info", "kiểm bằng mắt khi duyệt")
    add("M", "Tiếng giống từng byte khi chỉ sửa hình", "na", "dựng từ RAW")
    add("N", "Màu logo theo nền", "info", "logo sáng (nền tối); cần OWNER xem")
    add("O", "Không lộ tên người / bí mật", "unmeasured", "cần người xem phụ đề")
    add("P", "Nhạc / B-roll / font có giấy phép", "blocker", "font Times New Roman chưa có giấy phép thương mại; không nhạc (Drive chưa có nhạc có giấy phép); không B-roll (chưa truy cập được thư mục)")
    uncertain = [{"t": round(w["start"], 2), "text": w["text"], "p": round(w.get("p", 0), 2)} for w in words if w.get("uncertain")]
    blockers = ["Font Times New Roman chưa có giấy phép thương mại", "Logo vượt vùng logo — chờ OWNER chốt cỡ (#98a)"]
    if uncertain:
        blockers.insert(0, f"{len(uncertain)} từ nghe chưa chắc đã bỏ khỏi phụ đề/chữ nhấn — cần OWNER nghe lại (#90, #92)")
    failed = [q["id"] for q in qa if q["status"] == "fail"]
    with open(job.p("checksums.sha256"), "w") as fsum:
        for name in ("master.mp4", "preview.mp4"):
            fsum.write(f"{P.sha256(job.p(name))}  {name}\n")
    report = {
        "skill": {"skillId": "edu-hau-ky-video-916-phu-luc", "name": "Skill ESV", "version": "v0.3.1", "status": "DRAFT", "sourceUrl": "https://app.notion.com/p/4004ceb9517d81198fc4da9f9339234e", "engine": "esv_render.py (Pillow, không ASS)"},
        "input": {"file": os.path.basename(src), **info, "crop": cropf},
        "output": {"master": "master.mp4", "preview": "preview.mp4", "frames": N, "seconds": round(dur, 3), "cutSilence": False, "cuts": 0},
        "transcript": {"words": len(words), "uncertain": uncertain, "secondModel": None if a.words else a.model2},
        "captions": {"units": len(units)},
        "emphasis": [{"t": round(e.t0, 2), "text": e.text, "kind": e.style} for e in emph],
        "diagrams": [{"type": "compare" if isinstance(d, Compare) else "arrow", "t0": d.t0, "t1": d.t1} for d in dias],
        "zoom": {"events": plan.get("zooms", []), "anchor": [round(ax, 3), round(ay, 3)], "faceDetected": face_ok},
        "audio": {"lufs": mI, "truePeak": mTP, "previewTruePeak": pTP, "music": {"used": False, "reason": "Drive chưa có nhạc có giấy phép"}},
        "plan": {"by": plan.get("by", ""), "note": plan.get("note", "")},
        "qa": qa, "failed": failed, "blockers": blockers,
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
        import traceback
        traceback.print_exc()
        sys.stderr.write(f"LỖI: {e}\n")
        sys.exit(1)
