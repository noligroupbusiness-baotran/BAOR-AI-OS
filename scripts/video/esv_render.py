#!/usr/bin/env python3
"""Bộ dựng theo "Skill ESV" (Notion 02 SKILL, edu-hau-ky-video-916-phu-luc v0.3.1, DRAFT) — kiểu EDIT_v9 dọc 9:16.

  python3 scripts/video/esv_render.py --input RAW.mp4 --job-dir DIR --plan plan.json [--words words.json] [--logo baor-light.png]

plan.json (bước biên tập; do người hoặc AI lập từ lời nói, chỉ dùng từ nghe rõ):
  { "emphasis": [{"t": 5.08, "text": "KỊCH BẢN", "style": "blur|fade|shine", "end": 6.4}],
    "diagrams": [{"type": "compare", "t0":..,"t1":.., "wrong": {"t":.., "text":"..", "strike":..}},
                 {"type": "arrow", "t0":..,"t1":.., "top": {"t":..,"text":".."}, "bottom": {"t":..,"text":".."}}],
    "zooms": [] (trống = tự đặt theo hồ sơ nhịp CHẬM/VỪA/NHANH, mục 6.5), "pace": "CHAM|VUA|NHANH" (tuỳ chọn), "content": "hướng dẫn" }
  Thêm sơ đồ: {"type": "steps", "steps": [{"t","text"}]}, {"type": "mechanism"|"process", "top", "mid", "bottom"},
  {"type": "fs06", "t0", "t1"} (khung toàn màn hình + người nói thu vào khung), {"type": "leak", "t0"} (vệt sáng chuyển chương).

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
from music_pick import music_genres, music_library, music_pool, pick_music  # noqa: E402  (chọn nhạc nền: không phụ thuộc numpy, test được ở CI)

W, H, FPS = 1080, 1920, 30  # hệ toạ độ thiết kế 9:16 của Skill ESV (lớp chữ / sơ đồ vẽ ở hệ này)
ASPECTS = {"9:16": (1080, 1920), "4:5": (1080, 1350), "1:1": (1080, 1080), "16:9": (1920, 1080)}
CW, CH = W, H  # khung xuất thật (đặt lại trong main theo --aspect)
# Vùng ESV mục 2 (px @1080x1920)
RED = (0, 274, 1080, 1089)          # mặt
YEL = (82, 1118, 998, 1613)         # mọi chữ / đồ hoạ
BAND_Y0, BAND_Y1 = 1100, 1630        # lớp chữ vẽ trong dải này (bao trọn VÀNG)
SUB_BOTTOM = 1600                    # PA B \an2\pos(540,1600) — Skill ESV v0.1.r2 B3 (OWNER 22/10 09:16 «chọn phương án B.»)
SUB_MAXW = 904
EMP_BOTTOM = 1402                    # chữ nhấn \an2\pos(540,1402)
FONT_DIRS = [os.environ.get("BAOR_FONT_DIR", ""), "/System/Library/Fonts/Supplemental", "/Library/Fonts", "/usr/share/fonts/truetype/msttcorefonts"]
G1 = [("#FFF3C4", 0.0), ("#E8C872", 0.42), ("#B8913A", 0.78), ("#F2DC98", 1.0)]
GOLD, GOLD2, DARK_BROWN = "#D4AF37", "#E8C872", "#1E1408"
SS = 2  # vẽ chữ ở 2x rồi thu về để nét mảnh (0,8 px) đúng


# Font có giấy phép (S5): Tinos — SIL OFL 1.1, cùng số đo với Times New Roman (thay thế khớp từng ký tự), có tiếng Việt.
# Kèm trong repo (public/fonts/Tinos-*.ttf + OFL-Tinos.txt). BAOR_FONT=times để quay về Times New Roman của hệ điều hành.
FONT_ALIASES = {"Times New Roman Italic.ttf": "Tinos-Italic.ttf", "Times New Roman Bold Italic.ttf": "Tinos-BoldItalic.ttf"}
LICENSED_FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(HERE)), "public", "fonts")


def font_source(name):
    """(đường dẫn, tên hiển thị, giấy phép) của font sẽ dùng cho `name`."""
    alias = FONT_ALIASES.get(name)
    if alias and os.environ.get("BAOR_FONT", "").lower() != "times":
        p = os.path.join(LICENSED_FONT_DIR, alias)
        if os.path.exists(p):
            return p, alias.replace(".ttf", ""), "SIL OFL 1.1 (public/fonts/OFL-Tinos.txt)"
    for d in FONT_DIRS:
        p = os.path.join(d, name) if d else ""
        if p and os.path.exists(p):
            return p, name.replace(".ttf", ""), ""
    raise RuntimeError(f"Thiếu font {name}")


def font(name, size):
    path, _, _ = font_source(name)
    return ImageFont.truetype(path, int(round(size)))


def _font_os(name, size):
    for d in FONT_DIRS:
        p = os.path.join(d, name) if d else ""
        if p and os.path.exists(p):
            return ImageFont.truetype(p, int(round(size)))
    raise RuntimeError(f"Thiếu font {name}")


def half(n):
    """Nửa kích thước, làm tròn xuống số CHẴN: H.264 (yuv420p) bắt buộc chiều chẵn — 4:5 1080x1350 → 540x674, không phải 675."""
    return (n // 2) // 2 * 2


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

def build_sub_units(words, fsub, maxw=None):
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
        if width(u) <= (maxw or SUB_MAXW) or len(u) < 2:
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


def draw_subtitle(unit, hl, fsub_ss, cw=None, bottom=None, k=1.0):
    """1 dòng, đáy tại y1600 (PA B): bóng mềm, viền đen 2,45, chữ trắng nét trắng 0,8, từ đọc #FFC929.
    KHÔNG phát sáng (Skill ESV v0.1.r2 B3: OWNER 21/10 11:33 «chữ sub title không cần phát sáng»; QĐ-CEO 0958) — đã bỏ lớp quầng."""
    cw = cw or W
    bottom = SUB_BOTTOM if bottom is None else bottom
    words = [w["text"] for w in unit["words"]]
    text = " ".join(words)
    bw, bh = cw * SS, 200 * SS
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
    ImageDraw.Draw(sh_).text((x0 + 5.5 * k * SS, y0 + 3.8 * k * SS), text, font=fsub_ss, fill=255, stroke_width=int(round(2.45 * k * SS)), stroke_fill=255)
    sh_ = sh_.filter(ImageFilter.GaussianBlur(4.4 * k * SS / 2))
    canvas.paste((0, 0, 0, 255), (0, 0), sh_.point(lambda v: int(v * 0.67)))
    d = ImageDraw.Draw(canvas)
    d.text((x0, y0), text, font=fsub_ss, fill=(0, 0, 0, 255), stroke_width=max(1, int(round(2.45 * k * SS))), stroke_fill=(0, 0, 0, 255))
    for i, wd in enumerate(words):
        col = rgb("#FFC929") if i == hl else (255, 255, 255)
        d.text((xs[i], y0), wd, font=fsub_ss, fill=col + (255,), stroke_width=max(1, int(round(0.8 * k * SS))), stroke_fill=col + (255,))
    small = canvas.resize((cw, 200), Image.LANCZOS)
    return small, bottom - 200 + 30  # ảnh, y đỉnh trên khung


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
    mode169 = False  # 16:9 (Skill Edit Video Ngang R8.3–R8.4)
    right = False    # 16:9: mặt ở góc trái dưới → đặt chữ nhấn sát lề phải (đối xứng) [AI SUY LUẬN]

    def __init__(self, e, words):
        self.text = e["text"]
        self.style = e.get("style", "fade")
        self.t0 = float(e["t"])
        wend = max([w["end"] for w in words if self.t0 - 0.05 <= w["start"] <= self.t0 + 1.5] or [self.t0 + 0.6])
        self.t1 = float(e.get("end", max(wend + 0.8, self.t0 + 1.6)))
        self.fs = fit_size(self.text, 84, 820) if self.mode169 else fit_size(self.text)
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
        if self.mode169:
            import ngang as NG
            slide = (NG.EMP_X_IN - NG.EMP_X) * (1 - ease_cubic(ms / 450))  # bay vào từ x163 → đứng x133 (R8.4)
            pad = 0.35 * self.fs  # ảnh chữ vàng có lề trong suốt 0,35·fs mỗi bên (render_gold) → \an1 tính từ mép chữ
            x = int(NG.EMP_X + slide - pad) if not self.right else int(CW - NG.EMP_X - slide - img.width + pad)
            y = int(NG.EMP_BOTTOM - img.height * 0.80 + dy)
            layer.alpha_composite(img, (x, y))
            bb = img.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            if bb:
                boxes.append(("emp", (x + bb[0], y + bb[1], x + bb[2], y + bb[3])))
            return
        x = int(540 - img.width / 2)
        y = int(EMP_BOTTOM - img.height * 0.80 + dy)  # đáy nét chữ ≈ y1402
        layer.alpha_composite(img, (x, y - BAND_Y0))
        # Kiểm H đo NÉT chữ (alpha > 40) như phụ đề, không đo khung ảnh có viền trong suốt / quầng sáng
        bb = img.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if bb:
            boxes.append(("emp", (x + bb[0], y + bb[1], x + bb[2], y + bb[3])))


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
    elif glyph == "person":
        hr = k * 0.42
        d.ellipse([cx - hr, cy - k * 0.95, cx + hr, cy - k * 0.95 + 2 * hr], outline=(255, 255, 255, 255), width=3 * SS)
        d.arc([cx - k * 0.85, cy - k * 0.02, cx + k * 0.85, cy + k * 1.6], 200, 340, fill=(255, 255, 255, 255), width=3 * SS)
    elif glyph == "bubble":
        d.rounded_rectangle([cx - k, cy - k * 0.75, cx + k, cy + k * 0.45], radius=k * 0.3, outline=(255, 255, 255, 255), width=3 * SS)
        d.line([(cx - k * 0.45, cy + k * 0.45), (cx - k * 0.7, cy + k * 0.95), (cx - k * 0.05, cy + k * 0.45)], fill=(255, 255, 255, 255), width=3 * SS, joint="curve")
    elif glyph == "heart":
        pts = [(cx + k * 16 * math.sin(q) ** 3 / 17, cy - k * (13 * math.cos(q) - 5 * math.cos(2 * q) - 2 * math.cos(3 * q) - math.cos(4 * q)) / 17 - k * 0.05)
               for q in np.linspace(0, 2 * math.pi, 60)]
        d.line(pts + [pts[0]], fill=(255, 255, 255, 255), width=3 * SS, joint="curve")
    elif glyph == "phone":
        d.rounded_rectangle([cx - k * 0.5, cy - k * 0.9, cx + k * 0.5, cy + k * 0.9], radius=k * 0.15, outline=(255, 255, 255, 255), width=3 * SS)
        d.line([(cx - k * 0.15, cy + k * 0.65), (cx + k * 0.15, cy + k * 0.65)], fill=(255, 255, 255, 255), width=3 * SS)
    return c.resize((s, s), Image.LANCZOS)


def ease_out_back(u, s_=1.4):
    u = min(1.0, max(0.0, u))
    return 1 + (s_ + 1) * (u - 1) ** 3 + s_ * (u - 1) ** 2


def ease_in_out_quint(u):
    u = min(1.0, max(0.0, u))
    return 16 * u ** 5 if u < 0.5 else 1 - (-2 * u + 2) ** 5 / 2


def _put(layer, im, cx, cy, boxes, kind="gfx"):
    x, y = int(round(cx - im.width / 2)), int(round(cy - im.height / 2))
    layer.alpha_composite(im, (x, y - BAND_Y0))
    boxes.append((kind, (x, y, x + im.width, y + im.height)))


def _label_at(layer, img, x, cy, u, fade, boxes, dim=1.0):
    """Nhãn kiểu B vào: fscx 92→100, alpha, 320 ms ease-out cubic (u đã tính)."""
    lb = img.resize((max(1, int(img.width * (0.92 + 0.08 * u))), img.height), Image.LANCZOS)
    lb = with_alpha(lb, u * fade * dim)
    y = int(cy - lb.height / 2)
    layer.alpha_composite(lb, (int(x), y - BAND_Y0))
    boxes.append(("gfx", (int(x), y, int(x) + lb.width, y + lb.height)))


def _vline(layer, x, y0, y1, p, fade, width=3, color=GOLD):
    if p <= 0:
        return
    d = ImageDraw.Draw(layer)
    d.line([(x, y0 - BAND_Y0), (x, y0 + (y1 - y0) * p - BAND_Y0)], fill=rgb(color) + (int(255 * fade),), width=width)


def _head(layer, x, y, a, down=True, size=16):
    d = ImageDraw.Draw(layer)
    h = size / 2
    pts = [(x - h, y - h - BAND_Y0), (x + h, y - h - BAND_Y0), (x, y + h - BAND_Y0)] if down else [(x - h, y + h - BAND_Y0), (x + h, y + h - BAND_Y0), (x, y - h - BAND_Y0)]
    d.polygon(pts, fill=rgb(GOLD) + (int(255 * a),))


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
        rr = d.get("right", [])
        # ≤ 2 dòng đúng: y1300 + k·100 (Skill 5.3). 3 dòng trở lên: xếp khít 70 px, nhãn 56 px để không chạm phụ đề (đỉnh ≈ 1464)
        self.r_y = [1300 + k * 100 for k in range(len(rr))] if len(rr) <= 2 else [1280 + k * 70 for k in range(len(rr))]
        fs_r = 66 if len(rr) <= 2 else 56
        self.right = [(r["t"], label_img(r["text"][:1].upper() + r["text"][1:], fs_r)) for r in rr]
        self.tick = ring_icon(38 if len(rr) <= 2 else 30, "tick")

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
            if self.right and t >= self.right[0][0]:
                dim = min(dim, 1 - (0x70 / 255) * min(1.0, (t - self.right[0][0]) / 0.4))
            lb = with_alpha(lb, u * fade * dim)
            x, y = 190, 1180 - lb.height // 2
            layer.alpha_composite(lb, (x, y - BAND_Y0))
            boxes.append(("gfx", (x, y, x + lb.width, y + lb.height)))
            if strike_t and t >= strike_t:
                p = ease_cubic((t - strike_t) / 0.42)
                d = ImageDraw.Draw(layer)
                yy = 1180 - BAND_Y0 + 4
                d.line([(x - 6, yy), (x - 6 + (lb.width + 12) * p, yy)], fill=(255, 255, 255, int(255 * fade)), width=4)
        if self.right and t >= self.right[0][0]:
            p = ease_cubic((t - self.right[0][0]) / 0.42)
            d = ImageDraw.Draw(layer)
            d.line([(96, 1240 - BAND_Y0), (96 + 464 * p, 1240 - BAND_Y0)], fill=rgb(GOLD) + (int(255 * fade),), width=2)
        for k, (tr, img) in enumerate(self.right):
            if t < tr:
                continue
            cy = self.r_y[k]
            _put(layer, with_alpha(scale_in(self.tick, (t - tr) / 0.30), fade), 130, cy, boxes)
            if t >= tr + 0.09:
                _label_at(layer, img, 190, cy, ease_cubic((t - tr - 0.09) / 0.32), fade, boxes)


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


class Steps:
    """Thanh N bước (5.3): cột trái x128, y1130–1450 chia N hàng; chấm 46 px vàng #E8C872 viền 1,5 #1E1408; số Timesbi 34 #0D0B0B;
    nối dọc vàng 3 px; nhãn tại x172. Chấm 300 ms, số +60 ms 280 ms, nhãn +90 ms 320 ms; nét nối vẽ 260 ms từ t−60 ms;
    bước trước mờ về &H60& trong 350 ms khi bước sau hiện."""

    def __init__(self, d):
        self.t0, self.t1 = d["t0"], d["t1"]
        self.steps = d["steps"]
        n = len(self.steps)
        self.ys = [1130 + (320 / n) * (k + 0.5) for k in range(n)]
        self.lbls = [label_img(x["text"][:1].upper() + x["text"][1:], fit_label(x["text"], 66, 800)) for x in self.steps]
        fnum = font("Times New Roman Bold Italic.ttf", 34 * SS)
        self.dots = []
        for k in range(n):
            c = Image.new("RGBA", (56 * SS, 56 * SS), (0, 0, 0, 0))
            dd = ImageDraw.Draw(c)
            dd.ellipse([5 * SS, 5 * SS, 51 * SS, 51 * SS], fill=rgb("#E8C872") + (255,), outline=rgb(DARK_BROWN) + (255,), width=int(1.5 * SS))
            dd.text((28 * SS, 29 * SS), str(k + 1), font=fnum, fill=rgb("#0D0B0B") + (255,), anchor="mm")
            self.dots.append(c.resize((56, 56), Image.LANCZOS))

    def frame(self, t, layer, boxes):
        if not (self.t0 <= t < self.t1):
            return
        fade = min(1.0, (self.t1 - t) / 0.25)
        for k, st in enumerate(self.steps):
            ts = st["t"]
            if k > 0 and t >= ts - 0.06:
                _vline(layer, 128, self.ys[k - 1] + 26, self.ys[k] - 26, ease_cubic((t - ts + 0.06) / 0.26), fade)
            if t < ts:
                continue
            nxt = self.steps[k + 1]["t"] if k + 1 < len(self.steps) else None
            dim = 1.0 if nxt is None or t < nxt else 1 - (0x60 / 255) * min(1.0, (t - nxt) / 0.35)
            _put(layer, with_alpha(scale_in(self.dots[k], (t - ts) / 0.30), fade * dim), 128, self.ys[k], boxes)
            if t >= ts + 0.09:
                _label_at(layer, self.lbls[k], 172, self.ys[k], ease_cubic((t - ts - 0.09) / 0.32), fade, boxes, dim)


class Vertical:
    """Sơ đồ cơ chế dọc (5.3) và quy trình nối bước dọc: 2 vòng icon r42 tại (130,1182) và (130,1398), nhãn tại x190;
    giữa: nét dọc (+100 ms, 380 ms) + đầu mũi tên (+420 ms). Cơ chế: mũi tên lên/xuống + chữ vàng (≤ 80 px) ở giữa."""

    def __init__(self, d):
        self.t0, self.t1 = d["t0"], d["t1"]
        self.mech = d["type"] == "mechanism"
        self.top, self.bottom, self.mid = d["top"], d["bottom"], d.get("mid")
        self.ictop, self.icbot = ring_icon(42, d["top"].get("icon", "person")), ring_icon(42, d["bottom"].get("icon", "person"))
        self.ltop = label_img(self.top["text"][:1].upper() + self.top["text"][1:], fit_label(self.top["text"], 66, 780))
        self.lbot = label_img(self.bottom["text"][:1].upper() + self.bottom["text"][1:], fit_label(self.bottom["text"], 66, 780))
        self.gold = render_gold(self.mid["text"][:1].upper() + self.mid["text"][1:], min(80, fit_size(self.mid["text"], 80, 700)))[0] if self.mid else None

    def frame(self, t, layer, boxes):
        if not (self.t0 <= t < self.t1):
            return
        fade = min(1.0, (self.t1 - t) / 0.25)
        for (it, ic, lb, cy) in ((self.top, self.ictop, self.ltop, 1182), (self.bottom, self.icbot, self.lbot, 1398)):
            if t >= it["t"]:
                _put(layer, with_alpha(scale_in(ic, (t - it["t"]) / 0.30), fade), 130, cy, boxes)
                if t >= it["t"] + 0.09:
                    _label_at(layer, lb, 190, cy, ease_cubic((t - it["t"] - 0.09) / 0.32), fade, boxes)
        tl = (self.mid or self.bottom)["t"] if self.mech else self.top["t"]
        if t >= tl + 0.1:
            _vline(layer, 130, 1232, 1348, ease_cubic((t - tl - 0.1) / 0.38), fade)
        if t >= tl + 0.42:
            a = ease_out_back((t - tl - 0.42) / 0.22) * fade
            _head(layer, 130, 1346, min(1.0, a), down=True)
            if self.mech:
                _head(layer, 130, 1234, min(1.0, a), down=False)
        if self.gold is not None and t >= self.mid["t"]:
            u = ease_cubic((t - self.mid["t"]) / 0.38)
            im = with_alpha(self.gold, u * fade)
            x, cy = 190, 1290
            layer.alpha_composite(im, (x, int(cy - im.height / 2) - BAND_Y0))
            bb = im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            if bb:
                boxes.append(("gfx", (x + bb[0], int(cy - im.height / 2) + bb[1], x + bb[2], int(cy - im.height / 2) + bb[3])))


def fs_background(kind):
    """Nền tĩnh của khung toàn màn hình (Skill 5.4): FS-05 sân khấu đen + đèn rọi vàng ấm hình nón, vũng sáng, 3 tia chéo mờ;
    FS-01 gradient tối #0E0B07→#1A140C + lưới vàng α 6 %. Cả hai có vignette. Bụi vàng vẽ theo khung (động)."""
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    if kind == "fs05":
        base = np.zeros((CH, CW, 3), np.float32) + 7.0
        cx = CW * 0.5
        half = 50 + (yy / CH) * CW * 0.42
        cone = np.clip(1 - np.abs(xx - cx) / np.maximum(half, 1), 0, 1) ** 1.6 * np.clip(1 - yy / (CH * 0.86), 0, 1) ** 0.7
        pool = np.exp(-(((xx - cx) / (CW * 0.36)) ** 2 + ((yy - CH * 0.84) / (CH * 0.045)) ** 2))
        rays = np.zeros_like(xx)
        for k, (x0, slope) in enumerate(((CW * 0.18, 0.55), (CW * 0.62, -0.35), (CW * 0.85, -0.7))):
            dist = np.abs((xx - x0) - slope * yy) / np.sqrt(1 + slope ** 2)
            rays += np.exp(-(dist / (CW * 0.03)) ** 2) * 0.035
        light = cone * 0.55 + pool * 0.35 + rays
        warm = np.array([255, 205, 130], np.float32)
        img = base + light[..., None] * warm
    else:
        g = (yy / CH)[..., None]
        img = np.array([14, 11, 7], np.float32) * (1 - g) + np.array([26, 20, 12], np.float32) * g
        step = 60 * CW / 1080
        grid = ((np.mod(xx, step) < 1.2) | (np.mod(yy, step) < 1.2)).astype(np.float32) * 0.06
        img = img * (1 - grid[..., None]) + np.array([212, 175, 55], np.float32) * grid[..., None]
    r = np.sqrt(((xx - CW / 2) / (CW * 0.62)) ** 2 + ((yy - CH / 2) / (CH * 0.62)) ** 2)
    img *= np.clip(1.15 - 0.75 * r ** 2, 0.25, 1.0)[..., None]
    return Image.fromarray(img.clip(0, 255).astype(np.uint8)).convert("RGBA")


GRADE = []  # bộ lọc cân sáng / màu đo được cho video này (measure_grade), dùng chung cho mọi lần đọc khung nguồn


def measure_grade(src, info, face=None, n=10):
    """Cân sáng / màu NHẸ cho video có người nói — ĐO TRƯỚC, chỉ chỉnh khi lệch rõ, GIỮ màu da:
    - sáng: đo trên VÙNG MẶT (nền tối là chủ ý dựng cảnh, không tính); mặt < 0,35 → nâng gamma (≤ ×1,15), > 0,70 → hạ (≥ ×0,92)
    - màu: KHÔNG kéo "thế giới xám" (làm lạnh da, mất tông ấm có chủ ý); chỉ sửa ám SAI rõ: ám xanh lá (G > R và G > B quá 6 %)
      hoặc ám lạnh (B > R quá 6 %), mỗi kênh tối đa ±4 %. Tông ấm (R > G > B) giữ nguyên.
    Trả (bộ lọc ffmpeg, mô tả cho bảng kiểm)."""
    W, H = info["width"], info["height"]
    if face:
        side = int(min(W, H) * 0.22) // 2 * 2
        x = int(min(max(face[0] - side / 2, 0), W - side))
        y = int(min(max(face[1] - side / 2, 0), H - side))
        region = f"crop={side}:{side}:{x}:{y}"
    else:  # không dò được mặt: đo ô giữa khung
        region = f"crop=iw/3:ih/3:iw/3:ih/4"
    ys, rgb_ = [], []
    for k in range(n):
        t = info["duration"] * (k + 0.5) / n
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", f"{region},scale=96:-2,format=rgb24", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
        if not r.stdout:
            continue
        a_ = np.frombuffer(r.stdout, np.uint8).reshape(-1, 3).astype(np.float32) / 255.0
        mm = a_.mean(axis=0)
        rgb_.append(mm)
        ys.append(float(0.2126 * mm[0] + 0.7152 * mm[1] + 0.0722 * mm[2]))
    if not ys:
        return [], "không đo được (không đọc được khung)"
    y = float(np.median(ys))
    m = np.median(np.array(rgb_), axis=0)
    filt, did = [], []
    gamma = 1.0
    if y < 0.35:
        gamma = min(1.15, 1.0 + (0.35 - y) * 1.2)
    elif y > 0.70:
        gamma = max(0.92, 1.0 - (y - 0.70) * 0.8)
    if abs(gamma - 1.0) >= 0.02:
        filt.append(f"eq=gamma={gamma:.3f}")
        did.append(f"gamma ×{gamma:.2f} (mặt {'tối' if gamma > 1 else 'chói'})")
    r_, g_, b_ = (float(c) for c in m)
    gains = None
    if g_ > r_ * 1.06 and g_ > b_ * 1.06:  # ám xanh lá (đèn huỳnh quang) → hạ G
        gains = (1.0, max(0.96, (r_ + b_) / 2 / g_), 1.0)
        why = "ám xanh lá"
    elif b_ > r_ * 1.06:  # ám lạnh (cân trắng sai) → ấm lại nhẹ
        k = min(1.04, (b_ / r_) ** 0.5)
        gains = (k, 1.0, 1 / k)
        why = "ám lạnh"
    if gains:
        filt.append(f"colorchannelmixer=rr={gains[0]:.3f}:gg={gains[1]:.3f}:bb={gains[2]:.3f}")
        did.append(f"{why}: R×{gains[0]:.2f} G×{gains[1]:.2f} B×{gains[2]:.2f}")
    note = f"vùng mặt: sáng {y:.2f}, RGB {r_:.2f}/{g_:.2f}/{b_:.2f}; " + ("; ".join(did) if did else "trong ngưỡng, không chỉnh (giữ tông da / tông cảnh)")
    return filt, note


def fs06_clip(src, cropf, t0, d, out, kind="fs06"):
    """FS-06 (Skill 5.4/5.5 b): nền là chính cảnh quay làm mờ mạnh (≈40 px @1080), giảm bão hoà 55 %, tối, vignette;
    TR-PIP: người nói thu về khung góc vuông viền vàng góc trên phải (x615, y120, rộng 405) trong 0,6 s easeInOutQuint,
    phóng ngược ra ở 0,6 s cuối. Nội suy affine dưới điểm ảnh (không làm tròn)."""
    from PIL import ImageEnhance
    n = max(2, int(round(d * FPS)))
    vf = ",".join(["fps=30"] + ([cropf] if cropf else []) + GRADE + [f"scale={CW}:{CH}:flags=lanczos", "format=rgb24"])
    rd = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{t0:.3f}", "-i", src, "-frames:v", str(n), "-vf", vf, "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    wr = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{CW}x{CH}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    r = np.sqrt(((xx - CW / 2) / (CW * 0.62)) ** 2 + ((yy - CH / 2) / (CH * 0.62)) ** 2)
    vig = np.clip(1.15 - 0.75 * r ** 2, 0.25, 1.0)[..., None]
    static = fs_background(kind) if kind in ("fs05", "fs01") else None
    rng = np.random.default_rng(5)
    dx, dy = rng.uniform(0, CW, 160), rng.uniform(0, CH, 160)
    dvx, dvy, dph, drr = rng.uniform(-6, 6, 160), rng.uniform(-22, -6, 160), rng.uniform(0, 6.28, 160), rng.uniform(1.0, 2.6, 160)
    last = None
    for i in range(n):
        buf = rd.stdout.read(CW * CH * 3)
        if len(buf) == CW * CH * 3:
            last = Image.frombytes("RGB", (CW, CH), buf)
        fr = last
        t = i / FPS
        p = min(ease_in_out_quint(t / 0.6), ease_in_out_quint((d - t) / 0.6))
        if p < 0.001:
            wr.stdin.write(fr.tobytes())
            continue
        if static is not None:
            frame = static.copy()
            dd = ImageDraw.Draw(frame)
            for j in range(160):  # bụi vàng trôi chậm
                x_, y_ = dx[j] + dvx[j] * t, (dy[j] + dvy[j] * t) % CH
                a_ = int(255 * p * (0.25 + 0.3 * math.sin(dph[j] + 3 * t)))
                if a_ > 6:
                    dd.ellipse([x_ - drr[j], y_ - drr[j], x_ + drr[j], y_ + drr[j]], fill=(255, 214, 140, a_))
        else:
            sm = fr.resize((270, max(2, int(270 * CH / CW))), Image.BILINEAR).filter(ImageFilter.GaussianBlur(5))
            sm = ImageEnhance.Brightness(ImageEnhance.Color(sm).enhance(0.45)).enhance(0.55)
            bg = (np.asarray(sm.resize((CW, CH), Image.BICUBIC), dtype=np.float32) * vig).clip(0, 255).astype(np.uint8)
            frame = Image.fromarray(bg).convert("RGBA")
        px_, py_, pw_ = LAY["pip"]
        x, y, w = px_ * p, py_ * p, CW - (CW - pw_) * p
        k = w / CW
        lay = fr.convert("RGBA").transform((CW, CH), Image.AFFINE, (1 / k, 0, -x / k, 0, 1 / k, -y / k), resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
        frame.alpha_composite(lay)
        if p > 0.05:
            ImageDraw.Draw(frame).rectangle([x - 1.5, y - 1.5, x + w + 1.5, y + w * CH / CW + 1.5], outline=rgb(GOLD) + (int(255 * min(1.0, (p - 0.05) / 0.2)),), width=3)
        wr.stdin.write(frame.convert("RGB").tobytes())
    rd.stdout.close()
    rd.wait()
    wr.stdin.close()
    if wr.wait() != 0:
        raise RuntimeError(f"không dựng được khung {kind.upper()}")


def leak_clip(out, d=3.6):
    """AN-12 chuyển chương bằng vệt sáng: light leak vàng ấm + 1 vệt chéo quét qua toàn khung (easeInOutQuint), 220 hạt bụi vàng; 3,6 s.
    Lớp có alpha (gần với blend screen), chồng dưới logo và chữ."""
    n = int(round(d * FPS))
    sw, sh = 270, max(2, int(270 * CH / CW))
    Y, X = np.mgrid[0:sh, 0:sw].astype(np.float32)
    X /= sw
    Y /= sw
    rng = np.random.default_rng(12)
    px, py = rng.uniform(0, CW, 220), rng.uniform(0, CH, 220)
    vx, vy = rng.uniform(-14, 14, 220), rng.uniform(-30, -6, 220)
    ph, rr = rng.uniform(0, 6.28, 220), rng.uniform(1.2, 3.2, 220)
    wr = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{CW}x{CH}", "-r", str(FPS), "-i", "-",
                           "-c:v", "png", "-pix_fmt", "rgba", out], stdin=subprocess.PIPE)
    ang = math.radians(35)
    for i in range(n):
        t = i / FPS
        u = t / d
        e = ease_in_out_quint(u)
        cx, cy = -0.25 + 1.5 * e, 0.25 + 0.9 * e
        blob = np.exp(-(((X - cx) / 0.42) ** 2 + ((Y - cy) / 0.55) ** 2)) * (math.sin(math.pi * u) ** 1.3) * 0.8
        su = min(1.0, max(0.0, (t - 0.6) / 1.8))
        pos = -0.4 + 2.6 * ease_in_out_quint(su)
        band = np.exp(-(((X * math.cos(ang) + Y * math.sin(ang)) - pos) / 0.05) ** 2) * (math.sin(math.pi * su) if 0 < su < 1 else 0.0) * 0.7
        al = np.clip(blob + band, 0, 0.8)
        warm = np.clip(band / (blob + band + 1e-6), 0, 1)
        rgbm = np.stack([255 + 0 * warm, 205 + 40 * warm, 110 + 120 * warm], -1)
        small = np.concatenate([rgbm, (al * 255)[..., None]], -1).astype(np.uint8)
        img = Image.fromarray(small).resize((CW, CH), Image.BICUBIC)
        dd = ImageDraw.Draw(img)
        env = math.sin(math.pi * u) ** 0.8
        for j in range(220):
            x, y = px[j] + vx[j] * t, py[j] + vy[j] * t
            a_ = int(255 * env * (0.35 + 0.35 * math.sin(ph[j] + 5 * t)))
            if a_ > 8:
                dd.ellipse([x - rr[j], y - rr[j], x + rr[j], y + rr[j]], fill=(255, 220, 140, a_))
        wr.stdin.write(img.tobytes())
    wr.stdin.close()
    if wr.wait() != 0:
        raise RuntimeError("không dựng được vệt sáng AN-12")


def fit_emphasis(emph, windows):
    """Skill 4: kết thúc cắt trước chữ nhấn kế 0,08 s và trước animation 0,12 s; < 0,6 s thì bỏ; trùng cửa sổ animation thì bỏ."""
    emph = sorted(emph, key=lambda e: e.t0)
    keep = []
    for k, e in enumerate(emph):
        if any(a <= e.t0 < b for a, b in windows):
            continue
        if k + 1 < len(emph):
            e.t1 = min(e.t1, emph[k + 1].t0 - 0.08)
        nxt = [a for a, b in windows if a > e.t0]
        if nxt:
            e.t1 = min(e.t1, min(nxt) - 0.12)
        if e.t1 - e.t0 >= 0.6:
            keep.append(e)
    return keep


def make_layout(aspect):
    """Bố cục theo tỷ lệ. 9:16 giữ đúng số đo Skill ESV. Tỷ lệ khác: dải chữ 9:16 (rộng 1080) thu theo s và đặt sát đáy;
    vùng mặt = phần trên dải chữ; logo, thẻ ảnh, khung người (PIP) tính theo khung xuất. [AI SUY LUẬN — skill chưa có số cho tỷ lệ khác]"""
    cw, ch = ASPECTS[aspect]
    if aspect == "9:16":
        # Logo 340 px tại x76/y107, trọn trong XANH (Skill ESV v0.1.r2 B7; QĐ-CEO 0815 #98, 0958)
        return {"aspect": aspect, "CW": cw, "CH": ch, "s": 1.0, "tx": 0, "ty": BAND_Y0, "logo_w": 340, "logo_x": 76, "logo_y": 107,
                "red": (RED[1], RED[3]), "card_cy": 820.0, "card_w": 940, "card_h": 1180, "pip": (615, 120, 405)}
    s = {"4:5": 0.9, "1:1": 0.8, "16:9": 0.8}[aspect]
    bh = (BAND_Y1 - BAND_Y0) * s
    ty = int(round(ch - bh - ch * (0.012 if aspect == "16:9" else 0.03)))
    tx = int(round((cw - W * s) / 2))
    # 16:9: KHÔNG chèn logo tới khi có vị trí chuẩn (Skill Edit Video Ngang v0.1.r2 R8.6, #34c); 4:5 / 1:1 thu theo khung [AI SUY LUẬN]
    logo_w = 0 if aspect == "16:9" else int(round(340 * min(1.0, s + 0.1)))
    lx, ly = int(round(cw * 0.04)), int(round(ch * 0.04))
    text_top = ty + (YEL[1] - BAND_Y0) * s
    top, bottom = ly + 110, text_top - 16
    pip_w = cw * (0.32 if cw > ch else 0.375)
    return {"aspect": aspect, "CW": cw, "CH": ch, "s": s, "tx": tx, "ty": ty, "logo_w": logo_w, "logo_x": lx, "logo_y": ly,
            "red": (int(ch * 0.03), int(text_top)), "card_cy": (top + bottom) / 2, "card_w": cw * 0.8, "card_h": (bottom - top) * 0.95,
            "pip": (cw - pip_w - lx, ly, pip_w)}


LAY = make_layout("9:16")

# A16.1.4 — logo sáng / tối theo cảnh: nền vùng logo sáng → bản logo tối, nền tối → bản sáng.
# Ngưỡng + thời gian chuyển lấy từ skill-vlog.json "logo" (brightThreshold 0,55 luma, crossfadeSec 0,2 — "đo nền theo cảnh = AI").
try:
    _LOGO_SK = json.load(open(os.path.join(HERE, "skill-vlog.json"), encoding="utf-8")).get("logo", {})
except Exception:
    _LOGO_SK = {}
LOGO_THR = float(_LOGO_SK.get("brightThreshold", 0.55))
LOGO_XF = float(_LOGO_SK.get("crossfadeSec", 0.2))
LOGO_HYST = 0.03  # trễ ±0,03 quanh ngưỡng: nền dao động sát ngưỡng không làm đổi logo [AI SUY LUẬN]
LOGO_HOLD = 2.0   # mỗi bản logo giữ ≥ 2 s, đoạn ngắn hơn giữ bản đang có (không nháy) [AI SUY LUẬN]
LOGO_SPS = 4      # mẫu / giây khi đo nền vùng logo (mốc đổi lệch cảnh thật ≤ 0,125 s)


def dark_logo(light, explicit="", work=""):
    """Bản logo tối (đặt trên nền sáng) → (đường dẫn, ghi chú). Ưu tiên --logo-dark, rồi tệp cùng thư mục đổi 'light' → 'dark'
    (public/brand/baor-dark.png). Bản tối phải cùng tỷ lệ với bản sáng (chồng khít khi chuyển mờ). Không có: tạo tại chỗ từ kênh
    alpha bản sáng (màu #141414) vào thư mục work của job — không ghi tệp vào repo."""
    lw, lh = Image.open(light).size
    b = os.path.basename(light)
    cands = ([explicit] if explicit else []) + ([os.path.join(os.path.dirname(light), b.replace("light", "dark"))] if "light" in b else [])
    for c in cands:
        if c and os.path.isfile(c) and os.path.abspath(c) != os.path.abspath(light):
            dw, dh = Image.open(c).size
            if abs(dw / dh - lw / lh) < 0.01:
                return c, f"tệp {os.path.basename(c)}"
    im = Image.open(light).convert("RGBA")
    out = Image.new("RGBA", im.size, (20, 20, 20, 0))
    out.putalpha(im.getchannel("A"))
    p = os.path.join(work or ".", "logo_dark_auto.png")
    out.save(p)
    return p, "tạo tại chỗ từ bản sáng (đổi màu #141414; không có tệp bản tối cùng tỷ lệ)"


def luma_rel(rgb, mask):
    """Trung bình theo hình logo (mask 0–1) của khối RGB uint8 → (luma Y' Rec.709 0–1, độ chói tương đối WCAG 0–1)."""
    x = rgb[..., :3].astype(np.float32) / 255.0
    k = np.array([0.2126, 0.7152, 0.0722], np.float32)
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    w = float(mask.sum()) or 1.0
    return float(((x @ k) * mask).sum() / w), float(((lin @ k) * mask).sum() / w)


def contrast(l1, l2):
    """Tỷ lệ tương phản WCAG giữa hai độ chói tương đối."""
    return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)


def logo_schedule(lum, dur, sps=LOGO_SPS, thr=LOGO_THR, hyst=LOGO_HYST, hold=LOGO_HOLD):
    """Đoạn [(t0, t1, 'light' | 'dark')] phủ 0..dur từ luma nền vùng logo (mẫu k ở t = k/sps): nền sáng (> ngưỡng) → logo TỐI,
    nền tối → logo SÁNG. Trễ ±hyst quanh ngưỡng; đoạn ngắn hơn hold gộp vào bên cạnh (giữ bản đang có), ngắn nhất trước →
    mỗi lần đổi giữ ≥ hold giây (trừ khi cả video ngắn hơn)."""
    if not lum:
        return [(0.0, round(dur, 3), "light")]
    st = "dark" if lum[0] > thr else "light"
    segs, t0 = [], 0.0
    for k, v in enumerate(lum):
        nx = "dark" if st == "light" and v > thr + hyst else "light" if st == "dark" and v < thr - hyst else st
        if nx != st:
            tb = min(max(0.0, (k - 0.5) / sps), dur)
            if tb > t0:
                segs.append([t0, tb, st])
                t0 = tb
            elif segs:  # đổi ngay ở mốc 0 (không xảy ra với k ≥ 1) — phòng hờ
                segs[-1][1] = tb
            st = nx
    segs.append([t0, dur, st])
    while len(segs) > 1:
        k = min(range(len(segs)), key=lambda i: segs[i][1] - segs[i][0])
        if segs[k][1] - segs[k][0] >= hold:
            break
        if k == 0:
            segs[1][0] = segs[0][0]
            del segs[0]
        elif k == len(segs) - 1:
            segs[-2][1] = segs[-1][1]
            del segs[-1]
        else:  # hai bên cùng bản (xen kẽ) → nối liền
            segs[k - 1][1] = segs[k + 1][1]
            del segs[k:k + 2]
    return [(round(a, 3), round(b, 3), s) for a, b, s in segs]


def logo_check(master, segs, meas, logos, dur):
    """Bảng kiểm N: (trạng thái, chi tiết có số đo). Đo lại trên BẢN CHÍNH đã mã hoá: điểm ảnh trong hình logo (alpha > 0,9) tại
    từng mẫu phải gần bản logo theo lịch (bỏ 1 s đầu / cuối và ±0,35 s quanh mốc đổi); tương phản WCAG logo / nền theo từng mẫu."""
    if not meas or "bg" not in meas:
        return "unmeasured", f"không đo được nền vùng logo ({(meas or {}).get('error', 'không rõ')}) → giữ logo sáng cả video"
    bx, by, bw, bh = meas["box"]
    sw, sh_ = meas["sample"]
    bgv = meas["bg"]
    ref = {}
    for kind, path in zip(("light", "dark"), logos):
        im = Image.open(path).convert("RGBA").resize((sw, sh_), Image.BOX)
        arr = np.asarray(im)
        m_ = (arr[..., 3].astype(np.float32) / 255.0 > 0.9).astype(np.float32)
        ref[kind] = (luma_rel(arr, m_), m_)
    strict = ref["light"][1]
    kind_at = lambda t: next((s_[2] for s_ in segs if s_[0] <= t < s_[1]), segs[-1][2])
    r_ = subprocess.run(["ffmpeg", "-v", "error", "-i", master, "-vf", f"fps={LOGO_SPS},format=rgb24,crop={bw}:{bh}:{bx}:{by}:exact=1,scale={sw}:{sh_}:flags=area",
                         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    fsz = sw * sh_ * 3
    bounds = [s_[0] for s_ in segs[1:]]
    checked, wrong = 0, []
    for i in range(len(r_.stdout) // fsz):
        t = i / LOGO_SPS
        if t < 1.0 or t > dur - 1.0 or any(abs(t - b) < 0.35 for b in bounds):
            continue
        y_, _ = luma_rel(np.frombuffer(r_.stdout[i * fsz:(i + 1) * fsz], np.uint8).reshape(sh_, sw, 3), strict)
        seen = min(ref, key=lambda k_: abs(ref[k_][0][0] - y_))
        checked += 1
        if seen != kind_at(t):
            wrong.append(f"{t:.1f}s cần {kind_at(t)} thấy {seen} (Y' {y_:.2f})")
    lo = []
    for i, (y_, l_) in enumerate(bgv):
        k_ = kind_at(i / LOGO_SPS)
        lo.append((contrast(ref[k_][0][1], l_), i / LOGO_SPS))
    cmin, tmin = min(lo) if lo else (0.0, 0.0)
    weak = [t for c, t in lo if c < 3.0]
    other = {"light": "dark", "dark": "light"}
    held = [t for t in weak if contrast(ref[other[kind_at(t)]][0][1], bgv[int(round(t * LOGO_SPS))][1]) >= 3.0]  # bản kia đạt: đoạn < hold giữ bản cũ
    ys = [v[0] for v in bgv]
    swaps = len(segs) - 1
    hold_min = min(b - a for a, b, _ in segs)
    dark = [f"{a:.1f}–{b:.1f}s" for a, b, k_ in segs if k_ == "dark"]
    det = (f"đo nền vùng logo {len(bgv)} mẫu ({LOGO_SPS}/s): Y' {min(ys):.2f}–{max(ys):.2f}, ngưỡng {LOGO_THR:.2f} ±{LOGO_HYST:.2f}; "
           f"logo tối (nền sáng): {', '.join(dark) if dark else 'không đoạn nào'}; {swaps} lần đổi, giữ ngắn nhất {hold_min:.1f}s"
           f"{' (≥ ' + format(LOGO_HOLD, '.0f') + ' s)' if swaps else ''}, chuyển mờ {LOGO_XF:.1f}s; "
           f"kiểm trên bản chính {checked - len(wrong)}/{checked} mẫu đúng bản logo"
           + (f" — SAI: {'; '.join(wrong[:4])}" if wrong else "")
           + f"; tương phản logo/nền thấp nhất {cmin:.1f}:1 tại {tmin:.1f}s"
           + (f", {len(weak)} mẫu < 3:1 tại {', '.join(f'{t:.1f}s' for t in weak[:6])}"
              + (f" ({len(held)} mẫu vì cảnh sáng / tối ngắn < {LOGO_HOLD:.0f} s giữ bản cũ để không nháy" if held else " (")
              + (f"{'; ' if held else ''}{len(weak) - len(held)} mẫu nền trung tính, cả hai bản đều < 3:1" if len(weak) > len(held) else "") + ")" if weak else "")
           + (f"; bản tối: {meas['dark']}" if meas.get("dark") else ""))
    if wrong or not checked and dur > 3.0:
        return "fail", det
    return ("pass" if not weak else "info"), det


def logo_filter(segs, light_in, dark_in, w, x, y, xf=LOGO_XF):
    """Đồ thị ffmpeg phủ logo theo đoạn, vào [bg] ra [l]. Mỗi đoạn một bản sao, chồng theo thứ tự thời gian (đoạn sau nằm trên):
    bản mới hiện dần trong xf giây quanh mốc đổi (mốc ± xf/2), phủ lên bản cũ (hai bản cùng hình alpha) → chuyển mờ không lộ nền;
    bản cũ tắt khi bản mới đã đậm hẳn. Đoạn đầu giữ kiểu cũ: hiện mờ 0,3–0,9 s (+ trượt vào theo biểu thức x)."""
    n = {"light": sum(1 for s in segs if s[2] == "light"), "dark": sum(1 for s in segs if s[2] == "dark")}
    fc = ""
    for kind, src in (("light", light_in), ("dark", dark_in)):
        if n[kind]:
            outs = "".join(f"[lg{kind[0]}{i}]" for i in range(n[kind]))
            fc += f"[{src}]scale={w}:-1:flags=lanczos,format=rgba" + (f",split={n[kind]}{outs};" if n[kind] > 1 else f"{outs};")
    used, cur = {"light": 0, "dark": 0}, "bg"
    for k, (t0, t1, kind) in enumerate(segs):
        lab = f"lg{kind[0]}{used[kind]}"
        used[kind] += 1
        s0 = 0.0 if k == 0 else max(0.0, t0 - xf / 2)
        fade = "fade=t=in:st=0.3:d=0.6:alpha=1" if k == 0 else f"fade=t=in:st={s0:.3f}:d={xf:.3f}:alpha=1"
        en = "" if len(segs) == 1 else (f":enable='gte(t,{s0:.3f})'" if k == len(segs) - 1 else f":enable='between(t,{s0:.3f},{t1 + xf / 2:.3f})'")
        out = "l" if k == len(segs) - 1 else f"lo{k}"
        fc += f"[{lab}]{fade}[{lab}f];[{cur}][{lab}f]overlay=x='{x}':y={y}:eval=frame{en}[{out}];"
        cur = out
    return fc


def frame_crop(info, fx, fy, aspect, fr):
    """Khung cắt từ nguồn theo tỷ lệ xuất + cân chỉnh của người dựng (fr = {x, y, zoom}: tâm khung theo tỉ lệ nguồn 0–1, phóng ≥ 1).
    Không có cân chỉnh: tâm ngang theo mặt, dọc giữa (nguồn dọc giữ nguyên)."""
    sw, sh = info["width"], info["height"]
    ar = ASPECTS[aspect][0] / ASPECTS[aspect][1]
    cw, chh = (sh * ar, sh) if sw / sh > ar else (sw, sw / ar)
    z = max(1.0, float(fr.get("zoom") or 1.0))
    cw, chh = cw / z, chh / z
    cx = float(fr["x"]) * sw if fr.get("x") is not None else fx
    cy = float(fr["y"]) * sh if fr.get("y") is not None else sh / 2
    cw, chh = int(cw) // 2 * 2, int(chh) // 2 * 2
    x0 = int(min(max(cx - cw / 2, 0), sw - cw)) // 2 * 2
    y0 = int(min(max(cy - chh / 2, 0), sh - chh)) // 2 * 2
    if (cw, chh, x0, y0) == (sw, sh, 0, 0):
        return None, sw, sh, 0, 0
    return f"crop={cw}:{chh}:{x0}:{y0}", cw, chh, x0, y0


def keep_segments(src, dur, min_sil=0.60, keep_after=0.12, keep_before=0.18, above_floor=10.0, words=None):
    """Cắt lặng theo ngưỡng ĐÃ DUYỆT (Phần chung A11.4, QĐ-CEO 0815 #140; thay cho −42 dB / 0,28 s / 90 ms cũ — A16.3):
    lặng = nền ồn (phân vị 10 % mức RMS 50 ms) + 10 dB; chỉ "lặng quá dài" > 0,60 s mới rút, còn 0,30 s (giữ 0,12 s sau âm cuối +
    0,18 s trước âm đầu) — giữ hơi thở và từ đệm, lặng 0,6–0,8 s có hơi thở vẫn đạt. Bám lưới khung 1/30 s."""
    sr = 16000
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"], capture_output=True)
    x = np.frombuffer(r.stdout, np.int16).astype(np.float32) / 32768.0
    hop = int(0.05 * sr)
    n = len(x) // hop
    if n < 4:
        return [(0.0, dur)]
    rms = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    # Chặn trên: nguồn gần như không có khoảng nghỉ (đã cắt sẵn) thì p10 rơi vào chính giọng nói → câu nói nhỏ bị coi là lặng
    # (phản biện P2-1). Ngưỡng không được vượt trung vị − 20 dB; nguồn có khoảng nghỉ thật vẫn theo nền ồn + 10 dB của A11.4.
    thr = min(float(np.percentile(db, 10)) + above_floor, float(np.median(db)) - 20.0)
    quiet = db < thr
    # Từ đã nghe được (whisper) không bao giờ là lặng — câu nói rất nhỏ vẫn giữ. Mỗi từ chỉ giữ tối đa 0,8 s từ lúc bắt đầu:
    # whisper hay kéo mốc kết thúc của từ cuối câu qua cả khoảng lặng sau nó.
    for w in words or []:
        w0 = float(w.get("start", 0))
        w1 = min(float(w.get("end", w0)), w0 + 0.8)
        quiet[max(0, int(w0 / 0.05)):max(0, int(math.ceil(w1 / 0.05)))] = False
    sil, k = [], 0
    while k < n:
        if quiet[k]:
            j = k
            while j < n and quiet[j]:
                j += 1
            s0, s1 = k * 0.05, min(dur, j * 0.05)
            if s1 - s0 > min_sil:
                sil.append((s0, s1))
            k = j
        else:
            k += 1
    keep, a0 = [], 0.0
    for s0, s1 in sil:
        c0, c1 = s0 + keep_after, s1 - keep_before
        if c1 - c0 < 1 / FPS:
            continue
        if c0 > a0:
            keep.append((a0, c0))
        a0 = c1
    if a0 < dur:
        keep.append((a0, dur))
    g = lambda v: round(v * FPS) / FPS  # noqa: E731
    return [(g(a_), g(b_)) for a_, b_ in keep if g(b_) - g(a_) >= 2 / FPS]


def make_cut(src, keep, out, work):
    """Bản đã cắt lặng (nguồn mới cho mọi bước sau): hình chọn đúng khung, tiếng nối theo mẫu với vuốt 3 ms mỗi mối."""
    sr = 48000
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vn", "-ac", "2", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
    au = np.frombuffer(raw, np.float32).reshape(-1, 2)
    ramp = np.linspace(0, 1, int(0.003 * sr), dtype=np.float32)[:, None]
    parts = []
    for a, b in keep:
        seg = au[int(round(a * sr)):int(round(b * sr))].copy()
        if len(seg) > 2 * len(ramp):
            seg[:len(ramp)] *= ramp
            seg[-len(ramp):] *= ramp[::-1]
        parts.append(seg)
    wav = os.path.join(work, "cut_audio.f32")
    np.concatenate(parts).astype(np.float32).tofile(wav)
    # Hình: dựng riêng từng đoạn (tua chính xác theo khung, đúng số khung) rồi nối — không dùng một biểu thức select dài
    # (ffmpeg không dịch được biểu thức > ~100 đoạn: "Cannot allocate memory").
    from concurrent.futures import ThreadPoolExecutor
    segdir = os.path.join(work, "cut_segs")
    os.makedirs(segdir, exist_ok=True)
    jobs = []
    for i, (a, b) in enumerate(keep):
        f0, f1 = int(round(a * FPS)), int(round(b * FPS))
        jobs.append((os.path.join(segdir, f"{i:04d}.mp4"), f0, f1 - f0))

    def enc(jb):
        path_, f0, nf = jb
        P.sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{f0 / FPS:.6f}", "-i", src, "-an", "-vf", f"fps={FPS},tpad=stop_mode=clone:stop_duration=0.2", "-frames:v", str(nf),
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p", "-g", "60",
              "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", path_])
    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(enc, jobs))
    lst = os.path.join(segdir, "list.txt")
    open(lst, "w").write("".join(f"file '{j[0]}'\n" for j in jobs))
    n = sum(j[2] for j in jobs)
    P.sh(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-f", "f32le", "-ar", str(sr), "-ac", "2", "-i", wav,
          "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "pcm_s16le", out])
    shutil.rmtree(segdir, ignore_errors=True)
    return n


def time_map(keep):
    offs, o = [], 0.0
    for a, b in keep:
        offs.append(o)
        o += b - a

    def m(t):
        for (a, b), off in zip(keep, offs):
            if t < a:
                return round(off, 3)
            if t < b:
                return round(off + t - a, 3)
        return round(o, 3)
    return m, [round(x, 3) for x in offs[1:]]


def map_plan(plan, m):
    """Đổi mọi mốc giây của kế hoạch (theo RAW) sang thời gian bản đã cắt."""
    keys = ("t", "t0", "t1", "end", "strike", "out")

    def walk(x):
        if isinstance(x, dict):
            return {k: (m(v) if k in keys and isinstance(v, (int, float)) else walk(v)) for k, v in x.items()}
        if isinstance(x, list):
            return [walk(v) for v in x]
        return x
    q = walk({k: v for k, v in plan.items() if k != "zooms"})
    q["zooms"] = []  # zoom đặt lại theo bản đã cắt (tránh ±0,5 s quanh mối cắt)
    return q


class Chapter:
    """KH-CHUONG thẻ chương (Skill 5.5 b, OWNER chọn): hộp tối góc vuông x110–970, y1132–1446 (α 0x30); số trắng Timesbi 54 tại (150,1176);
    tên chương vàng G1 ≤ 104 px giữa (540,1290); vạch vàng 3 px x150→930, y1408 vẽ dần 600 ms."""

    def __init__(self, d):
        self.t0, self.t1 = d["t0"], d["t1"]
        f = font("Times New Roman Bold Italic.ttf", 54 * SS)
        num = str(d.get("num", ""))
        self.num = None
        if num:
            c = Image.new("RGBA", (200 * SS, 80 * SS), (0, 0, 0, 0))
            ImageDraw.Draw(c).text((0, 0), num, font=f, fill=(255, 255, 255, 255))
            bb = c.getbbox()
            self.num = c.crop(bb).resize((max(1, (bb[2] - bb[0]) // SS), max(1, (bb[3] - bb[1]) // SS)), Image.LANCZOS) if bb else None
        txt = d["text"][:1].upper() + d["text"][1:]
        self.name = render_gold(txt, min(104, fit_size(txt, 104, 780)))[0]

    def frame(self, t, layer, boxes):
        if not (self.t0 <= t < self.t1):
            return
        fade = min(1.0, (self.t1 - t) / 0.25)
        u = ease_cubic((t - self.t0) / 0.30)
        box = Image.new("RGBA", (860, 314), (14, 11, 7, int(207 * u * fade)))
        layer.alpha_composite(box, (110, 1132 - BAND_Y0))
        boxes.append(("gfx", (110, 1132, 970, 1446)))
        if self.num is not None and t >= self.t0 + 0.1:
            layer.alpha_composite(with_alpha(self.num, ease_cubic((t - self.t0 - 0.1) / 0.3) * fade), (150, 1150 - BAND_Y0))
        if t >= self.t0 + 0.15:
            v = ease_cubic((t - self.t0 - 0.15) / 0.45)
            im = with_alpha(self.name, v * fade)
            layer.alpha_composite(im, (int(540 - im.width / 2), int(1290 - im.height / 2 + 14 * (1 - v)) - BAND_Y0))
        if t >= self.t0 + 0.3:
            p_ = ease_cubic((t - self.t0 - 0.3) / 0.6)
            ImageDraw.Draw(layer).line([(150, 1408 - BAND_Y0), (150 + 780 * p_, 1408 - BAND_Y0)], fill=rgb(GOLD) + (int(255 * fade),), width=3)


class Quote:
    """AN-11 khung trích dẫn (Skill 5.5 b, OWNER duyệt cho câu chốt): ngoặc kép vàng vẽ nét (easeOutCubic), từng chữ hiện cách nhau
    0,24 s có bóng mờ, gạch chân vàng easeInOutQuint; chữ đúng nguyên lời; nằm trong VÀNG."""

    def __init__(self, d):
        self.t0, self.t1 = d["t0"], d["t1"]
        self.step = float(d.get("step", 0.24))
        words = d["text"].split()
        fs = 64
        f = font("Times New Roman Italic.ttf", fs)
        # chia dòng cân: số dòng tối thiểu để mỗi dòng ≤ 860 px, rồi ngắt theo bề rộng trung bình (không để 1 chữ lẻ dòng cuối)
        nl = max(1, math.ceil(f.getlength(" ".join(words)) / 860))
        target = f.getlength(" ".join(words)) / nl
        lines, cur = [], []
        for w_ in words:
            if cur and len(lines) < nl - 1 and f.getlength(" ".join(cur + [w_])) > target + f.getlength(w_) / 2:
                lines.append(cur)
                cur = []
            cur.append(w_)
        if cur:
            lines.append(cur)
        if len(lines) == 2:  # 2 dòng: ưu tiên ngắt sau dấu phẩy / chấm nếu dòng vẫn cân (35–65 %)
            tot = f.getlength(" ".join(words))
            cands = [i for i, w_ in enumerate(words[:-1]) if w_.endswith((",", ".", ";", ":")) and 0.35 <= f.getlength(" ".join(words[:i + 1])) / tot <= 0.65]
            if cands:
                i = min(cands, key=lambda i: abs(f.getlength(" ".join(words[:i + 1])) / tot - 0.5))
                lines = [words[:i + 1], words[i + 1:]]
        self.items = []  # (img, x, y)
        y = 1196 if len(lines) > 1 else 1236
        k = 0
        for ln in lines:
            imgs = [label_img(w_, fs) for w_ in ln]
            sp = f.getlength(" ")
            tw = sum(f.getlength(w_) for w_ in ln) + sp * (len(ln) - 1)
            x = 540 - tw / 2
            for w_, im in zip(ln, imgs):
                bl, bt = f.getbbox(w_)[:2]  # đặt theo đường chân chữ chung (ảnh chữ cắt sát nét: chữ có dấu cao hơn)
                self.items.append((im, x + bl, y + bt, k))
                x += f.getlength(w_) + sp
                k += 1
            y += 82
        self.ul_y = y - 6
        self.ul_w = min(760, max(220, max(i[0].width + i[1] for i in self.items) - min(i[1] for i in self.items)))
        self.qmark = render_gold("“", 120)[0]

    def frame(self, t, layer, boxes):
        if not (self.t0 <= t < self.t1):
            return
        fade = min(1.0, (self.t1 - t) / 0.25)
        q = ease_cubic((t - self.t0) / 0.35)
        qm = with_alpha(scale_in(self.qmark, q), fade)
        layer.alpha_composite(qm, (104, 1128 - BAND_Y0))
        boxes.append(("gfx", (104, 1128, 104 + qm.width, 1128 + qm.height)))
        for im, x, y, k in self.items:
            ts = self.t0 + 0.25 + k * self.step
            if t < ts:
                continue
            u = ease_cubic((t - ts) / 0.22)
            layer.alpha_composite(with_alpha(im, u * fade), (int(x), int(y + 8 * (1 - u)) - BAND_Y0))
            boxes.append(("gfx", (int(x), int(y), int(x) + im.width, int(y) + im.height)))
        tu = self.t0 + 0.25 + len(self.items) * self.step
        if t >= tu:
            p_ = ease_in_out_quint((t - tu) / 0.6)
            ImageDraw.Draw(layer).line([(540 - self.ul_w / 2, self.ul_y - BAND_Y0), (540 - self.ul_w / 2 + self.ul_w * p_, self.ul_y - BAND_Y0)], fill=rgb(GOLD) + (int(255 * fade),), width=3)


def fit_label(text, fs=66, maxw=800):
    f = font("Times New Roman Italic.ttf", fs)
    w = f.getlength(text)
    return fs if w <= maxw else max(52, int(fs * maxw / w))


def make_diagram(d):
    return {"compare": Compare, "arrow": Arrow, "steps": Steps, "mechanism": Vertical, "process": Vertical, "chapter": Chapter, "quote": Quote}[d["type"]](d)


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


# Zoom r3 (Skill ESV mục 6.2, 6.5): một đường cong, một tâm (mặt), smootherstep S(u)=6u⁵−15u⁴+10u³ — vận tốc và gia tốc
# bằng 0 ở hai đầu; KHÔNG zoom "thở"; tốc độ theo nhịp video. Biến khung của perspective: in = số khung + 1 → dùng (in−1).
ZOOM_PROFILES = {  # (khung vào, khung ra, giữ tối thiểu s, giãn cách s) — [AI SUY LUẬN, đã render thử và đo], CHƯA CHỐT
    "CHAM": (90, 75, 1.0, 4.0),
    "VUA": (54, 45, 1.0, 3.0),
    "NHANH": (30, 36, 0.8, 2.0),
}


def zoom_expr(zooms, v="(in-1)"):
    """z(f) = 1 + Σ (L−1)·[S((f−f_in)/N_in) − S((f−f_out)/N_out)]; mỗi lần zoom = {t, out, level, nin, nout} (giây / khung)."""
    def S(a, n):
        u = f"clip(({v}-{a})/{n},0,1)"
        return f"(pow({u},3)*({u}*({u}*6-15)+10))"
    parts = []
    for z in zooms:
        fi, fo = int(round(z["t"] * FPS)), int(round(z["out"] * FPS))
        parts.append(f"{z['level'] - 1:.4f}*({S(fi, int(z['nin']))}-{S(fo, int(z['nout']))})")
    return "(1+" + ("+".join(parts) if parts else "0") + ")"


def zoom_at(zooms, f):
    def S(u):
        u = min(1.0, max(0.0, u))
        return u ** 3 * (u * (u * 6 - 15) + 10)
    return 1 + sum((z["level"] - 1) * (S((f - z["t"] * FPS) / z["nin"]) - S((f - z["out"] * FPS) / z["nout"])) for z in zooms)


def fill_zooms(zooms, units, prof, blocked, dur, cut_times=(), every=10.0):
    """Lấp khoảng trống dài không zoom (bản v9 có 14 lần / 177 s): thêm zoom ×1,06 ở đầu câu phụ đề khi đã quá `every` giây
    không có zoom; vẫn giữ mọi luật của place_zooms (giãn cách, không chạm sơ đồ / FS / minh hoạ, tránh mối cắt)."""
    nin, nout, hold, gap = ZOOM_PROFILES[prof]
    out = sorted(zooms, key=lambda z: z["t"])
    for u in units:
        t = max(0.3, u["start"] - 0.1)
        o = t + nin / FPS + max(hold, 1.2)
        end = o + nout / FPS
        if end > dur - 0.5:
            continue
        if any(not (end + 1.0 <= a or t - 1.0 >= b) for a, b in blocked):
            continue
        if any(abs(x - c) < 0.5 for c in cut_times for x in (t, end)):
            continue
        prev = [z for z in out if z["t"] <= t]
        nxt = [z for z in out if z["t"] > t]
        # "every" = khoảng KHÔNG zoom tối đa (tính từ lúc zoom trước BẮT ĐẦU); giãn cách giữa hai zoom vẫn ≥ hồ sơ (OWNER 25/10/2026:
        # luật cũ đòi ≥ every giây SAU khi zoom trước kết thúc → video 36 s chỉ còn chỗ cho 1 zoom)
        if prev and (t - prev[-1]["t"] < every or t - (prev[-1]["out"] + prev[-1]["nout"] / FPS) < gap):
            continue
        if not prev and t < 1.5:
            continue
        if nxt and nxt[0]["t"] - end < gap:
            continue
        out.append({"t": round(t, 3), "out": round(o, 3), "level": 1.06, "nin": nin, "nout": nout})
        out.sort(key=lambda z: z["t"])
    return out


def pace_profile(units, words, n_cuts, dur, content=""):
    """Skill ESV 6.5 bước 1: tốc độ nói (âm tiết/s trên thời gian có lời), mật độ cắt (mối/phút), loại nội dung → CHẬM / VỪA / NHANH."""
    spoken = sum(u["end"] - u["start"] for u in units) or 1.0
    syl = sum(1 for w in words if _clean(w["text"]))  # mỗi chữ cách nhau dấu cách = 1 âm tiết
    rate = syl / spoken
    cuts = n_cuts / max(dur / 60.0, 0.1)
    v1 = "NHANH" if rate >= 4.5 else ("CHAM" if rate <= 3.5 else "VUA")
    v2 = "NHANH" if cuts >= 12 else ("CHAM" if cuts <= 6 else "VUA")
    c = (content or "").lower()
    v3 = ("NHANH" if any(k in c for k in ("quảng cáo", "tuyển dụng", "hook", "tin nhanh")) else
          "VUA" if any(k in c for k in ("giới thiệu", "hướng dẫn", "đào tạo")) else
          "CHAM" if any(k in c for k in ("chia sẻ", "tâm sự", "kể chuyện")) else "")
    if v3:
        prof, why = v3, f"theo loại nội dung ({content})"
    else:
        prof = v1 if v1 == v2 else "VUA"
        why = "2/2 tiêu chí đo" if v1 == v2 else "tiêu chí lệch nhau → VỪA"
    return prof, {"syllablesPerSec": round(rate, 2), "cutsPerMin": round(cuts, 1), "content": content or "", "byRate": v1, "byCuts": v2, "byContent": v3, "why": why}


def place_zooms(cands, prof, blocked, dur, cut_times=()):
    """Đặt zoom ở ý quan trọng (mốc chữ nhấn): mức ×1,06–1,08; giữ ≥ hồ sơ; giãn cách ≥ hồ sơ; không chạm sơ đồ / FS / minh hoạ
    (±1 s), không bắt đầu hay kết thúc trong ±0,5 s quanh mối cắt; zoom phải xong trước cuối video."""
    nin, nout, hold, gap = ZOOM_PROFILES[prof]
    out_list = []
    for t, lv in sorted(cands):
        t = max(0.3, t - 0.1)
        o = t + nin / FPS + max(hold, 1.2)
        end = o + nout / FPS
        if end > dur - 0.5:
            continue
        if any(not (end + 1.0 <= a or t - 1.0 >= b) for a, b in blocked):
            continue
        if any(abs(x - c) < 0.5 for c in cut_times for x in (t, end)):
            continue
        if out_list and t - (out_list[-1]["out"] + out_list[-1]["nout"] / FPS) < gap:
            continue
        out_list.append({"t": round(t, 3), "out": round(o, 3), "level": min(1.08, max(1.06, lv)), "nin": nin, "nout": nout})
    return out_list


# ---------------------------------------------------------------- kế hoạch tự động (khi chưa có biên tập)

STOP = set("""các bạn là có và của thì mà này đó cái chúng ta một những được không cũng với cho khi trong phải em anh chị mình nó nha ạ rồi nữa đây gì sao vì như thế nào hay đã đang sẽ lại ra vào lên xuống ở bên cạnh đâu luôn rằng nghĩ bây giờ nhiều người ai đều chỉ còn nên vậy thôi đi làm biết thấy nói hỏi bảo chuyện cứ hình dung mỗi lần về từ để do bị cả hết rất quá lắm này kia ấy""".split())


def _clean(t):
    return re.sub(r"[^\w%]", "", t.lower())


def _kw_hit(kw, spoken):
    """Từ khoá một tiếng: từ khoá viết HOA (vd "AI") phải nghe ra đúng chữ hoa; từ khoá trùng hư từ tiếng Việt thì bỏ."""
    w = spoken.strip(",.?!")
    if kw.isupper() and len(kw) <= 4:
        return w == kw
    return kw.lower() not in STOP


IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")


def apply_corrections(words, text):
    """Sửa chữ máy nghe sai theo danh sách OWNER/biên tập ("sai => đúng", cùng số tiếng): thay chữ, giữ mốc thời gian.
    Từ đã được sửa coi như đã nghe rõ (người đã xác nhận)."""
    pairs = []
    for line in re.split(r"[\n;]", text or ""):
        if "=>" not in line:
            continue
        a_, b_ = [x.strip() for x in line.split("=>", 1)]
        wa, wb = a_.split(), b_.split()
        if wa and len(wa) == len(wb):
            pairs.append(([_clean(x) for x in wa], wb))
    n = 0
    for wa, wb in pairs:
        for i in range(len(words) - len(wa) + 1):
            if all(_clean(words[i + k]["text"]) == wa[k] for k in range(len(wa))):
                for k in range(len(wa)):
                    t = words[i + k]["text"]
                    tail = t[len(t.rstrip(",.?!")):]
                    words[i + k]["text"] = (wb[k][:1].upper() + wb[k][1:] if t[:1].isupper() else wb[k]) + tail
                    words[i + k]["uncertain"] = False
                    words[i + k]["p"] = 1.0
                n += 1
    return n


def owner_decisions(data_dir):
    try:
        return json.load(open(os.path.join(data_dir, "video-assets", "owner-decisions.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def sfx_sounds(sr=48000, aspect="9:16"):
    """Hai tiếng tổng hợp (không tệp ngoài, không vướng bản quyền, không dùng nhiễu — OWNER 21/10 chê "vút vút"):
    "tách" ngắn (chữ nhấn, khung vẽ, thẻ ảnh) và tiếng ngân nhẹ có cao độ A–E–A (khung toàn màn hình, vệt sáng, chuyển chương)."""
    L = int(0.07 * sr)
    tt = np.arange(L) / sr
    f = 1400 * np.exp(-tt * 30) + 520
    pop = (np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-tt * 55)).astype(np.float32) * 0.42
    Ls = int(1.2 * sr)
    ts = np.arange(Ls) / sr
    env = np.minimum(1.0, ts / 0.25) ** 2 * np.exp(-np.maximum(0.0, ts - 0.25) / 0.45)
    sw = sum(amp * np.sin(2 * np.pi * fr * ts + ph) for fr, amp, ph in ((880.0, 1.0, 0.0), (1318.5, 0.6, 1.1), (1760.0, 0.35, 2.3), (2637.0, 0.12, 0.7)))
    sw = (sw * env / 2.07 * 0.30).astype(np.float32)
    snd = {"pop": (pop, 0.0), "swell": (sw, 0.15)}
    snd.update(owner_sfx(sr, aspect))
    return snd


# Độ dài tối đa (s) mỗi vai trò khi dùng tiếng thật (cắt + tắt dần 0,15 s) và độ sớm (tiếng bắt đầu trước hình) — [AI SUY LUẬN]
SFX_ROLE_LEN = {"emp_fade": 1.0, "emp_shine": 1.4, "diagram": 0.7, "diagram_pop": 0.6, "chapter": 1.8, "chapter_hit": 1.2, "fs_in": 1.4,
                "fs_out": 1.2, "card": 1.0, "M1": 1.0, "M2": 0.7, "M4": 1.0, "M5": 0.7, "M6": 0.7, "m3_open": 1.4, "m3_close": 1.2, "m3_tile": 0.6}
SFX_ROLE_LEAD = {"emp_fade": 0.08, "fs_in": 0.2, "m3_open": 0.2, "card": 0.1, "M1": 0.1, "M2": 0.05, "M5": 0.05}
SFX_FALLBACK = {"chapter": "swell", "chapter_hit": None, "fs_in": "swell", "fs_out": None, "m3_open": "swell", "m3_close": "swell", "leak": "swell"}


def owner_sfx(sr=48000, aspect="9:16"):
    """Tiếng SFX OWNER cung cấp (trang Notion "Kho hiệu ứng âm thanh", Phần chung A6.6) theo VAI TRÒ và khung: nhóm whoosh chỉ
    16:9 (9:16 CHƯA CHỐT → tiếng nhóm khác). Danh mục DATA_DIR/video-assets/sfx-owner/manifest.json. Thiếu tệp → bỏ vai trò (dùng
    tiếng tổng hợp). Trả {vai trò: (mẫu mono float32, độ sớm s)}."""
    d = os.path.join(os.environ.get("DATA_DIR", os.path.join(P.ROOT, "data")), "video-assets", "sfx-owner")
    try:
        man = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    key = "16:9" if aspect == "16:9" else "9:16"
    out = {}
    for role, files in (man.get("roles") or {}).items():
        f = files.get(key)
        if not f or not os.path.isfile(os.path.join(d, f)):
            continue
        L = SFX_ROLE_LEN.get(role, 1.0)
        r = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(d, f), "-t", f"{L:.2f}", "-af", f"afade=t=out:st={max(0.0, L - 0.15):.2f}:d=0.15",
                            "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True)
        x = np.frombuffer(r.stdout, np.float32)
        if len(x):
            out[role] = (x.copy(), SFX_ROLE_LEAD.get(role, 0.0))
    return out


def read_mono(path):
    import wave
    with wave.open(path, "rb") as w:
        n, ch, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    dt = {2: np.int16, 4: np.int32}[sw]
    x = np.frombuffer(raw, dtype=dt).astype(np.float32) / float(np.iinfo(dt).max)
    return x.reshape(-1, ch).mean(axis=1) if ch > 1 else x


def win_db(x, i0, i1, win):
    """Mức lớn nhất (dB RMS) theo cửa sổ trượt `win` mẫu trong đoạn [i0, i1)."""
    seg = x[max(0, i0):max(0, i1)]
    if len(seg) < win:
        return -120.0
    c = np.concatenate([[0.0], np.cumsum(seg.astype(np.float64) ** 2)])
    ms = (c[win:] - c[:-win]) / win
    return float(10 * np.log10(max(ms.max(), 1e-12)))


def sfx_events(plan, broll):
    """Mốc + VAI TRÒ SFX (Phần chung A6.1 / A6.6, Skill ESV B-SFX, Ngang R4): chữ nhấn fade/blur → emp_fade, shine → emp_shine;
    khung vẽ → diagram (tiếng bút); khung toàn màn hình vào / ra → fs_in / fs_out; chuyển chương / vệt sáng → chapter (+ chapter_hit);
    thẻ ảnh → theo mẫu (M1…M6, m3_tile) hoặc card. KHÔNG trên zoom (A6.2). Hai cú cùng vai trò cách < 0,22 s giữ 1 (Ngang R4.5)."""
    ev = [(float(e["t"]), "emp_shine" if e.get("style") == "shine" else "emp_fade", "chữ nhấn") for e in plan.get("emphasis", [])]
    for d in plan.get("diagrams", []):
        t0 = float(d["t0"])
        if d["type"] in ("fs06", "fs05", "fs01"):
            ev.append((t0 + 0.05, "fs_in", "khung toàn màn hình vào"))
            if d.get("t1") is not None:
                ev.append((float(d["t1"]) - 0.6, "fs_out", "khung toàn màn hình ra"))
        elif d["type"] in ("leak", "chapter"):
            ev.append((t0 + 0.05, "chapter", "chuyển chương / vệt sáng"))
            if d["type"] == "chapter":
                ev.append((t0 + 0.55, "chapter_hit", "chuyển chương"))
        else:
            ev.append((t0, "diagram", "khung vẽ"))
    ev += [(float(b["t0"]), b.get("template") or "card", "thẻ ảnh") for b in broll]
    ev.sort(key=lambda e: (e[0], e[2] != "chữ nhấn"))
    out = []
    for e in ev:
        if out and any(e[0] - o[0] < 0.22 and e[1] == o[1] for o in out[-3:]):
            continue
        out.append(e)
    return out


def place_sfx(path, events, voice_wav, dur, sr=48000, target=-21.0, cap=0.0, quiet=-45.0, limit=-19.6, aspect="9:16"):
    """Đặt từng cú với mức RIÊNG (Phần chung A6.3: đích −21 dB so giọng, chốt −19,6 dB, trần −19 dB): mức cửa sổ 100 ms lớn nhất
    của cú = (mức giọng ±0,5 s quanh cú) + target; không khuếch đại tệp gốc (cap 0 dB). Giọng quanh cú < −45 dB (lặng) → bỏ cú.
    Các cú sát nhau CỘNG DỒN (tiếng ngân dài 1,2 s chồng tiếng "tách") → đo lại trên stem thật bằng đúng cách đo của bảng kiểm S,
    cú nào vượt `limit` thì hạ mọi cú góp vào cửa sổ đó, lặp tới khi đạt (tối đa 8 lượt). Trả danh sách cú đã đặt + cú bỏ."""
    snd = sfx_sounds(sr, aspect)
    vo = read_mono(voice_wav)
    n = int(round(dur * sr))
    win = int(0.1 * sr)
    placed, dropped = [], []
    for t, kind, why in events:
        if kind not in snd:  # thiếu tệp tiếng thật cho vai trò → tiếng tổng hợp tương ứng (hoặc bỏ nếu vai trò không cần)
            fb = SFX_FALLBACK.get(kind, "pop")
            if not fb:
                continue
            kind = fb
        s_, lead = snd[kind]
        i = int(round((t - lead) * sr))
        if i < 0 or i >= n:
            continue
        v_db = win_db(vo, int((t - 0.5) * sr), int((t + 0.5) * sr), win)
        if v_db < quiet:
            dropped.append({"t": round(t, 2), "why": why, "reason": f"giọng quanh cú {v_db:.1f} dB (đang lặng)"})
            continue
        s_db = win_db(s_, 0, len(s_), min(win, len(s_)))
        placed.append({"t": round(t, 2), "kind": kind, "why": why, "gainDb": round(min(cap, v_db + target - s_db), 2), "_i": i, "_v": v_db})

    def render():
        out = np.zeros(n, dtype=np.float32)
        for p_ in placed:
            s_ = snd[p_["kind"]][0]
            m_ = min(len(s_), n - p_["_i"])
            out[p_["_i"]:p_["_i"] + m_] += s_[:m_] * (10 ** (p_["gainDb"] / 20))
        return out

    out = render()
    for _ in range(8):
        over = False
        for p_ in placed:
            t = p_["t"]
            exc = win_db(out, int((t - 0.2) * sr), int((t + 1.3) * sr), win) - p_["_v"] - limit
            if exc > 0:
                over = True
                lo, hi = (t - 0.2) * sr, (t + 1.3) * sr
                for q in placed:  # mọi cú có tiếng nằm trong cửa sổ đo của cú này
                    q_end = q["_i"] + len(snd[q["kind"]][0])
                    if q["_i"] < hi and q_end > lo:
                        q["gainDb"] = round(q["gainDb"] - exc - 0.5, 2)
        if not over:
            break
        out = render()
    pcm = (np.clip(out, -1, 1) * 32767).astype(np.int16)
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(np.repeat(pcm[:, None], 2, axis=1).tobytes())
    return [{k: v for k, v in p_.items() if not k.startswith("_")} for p_ in placed], dropped


def sfx_check(sfx_wav, voice_wav, music_wav, placed, sr=48000):
    """Kiểm S (Skill ESV B9 / A6.3–A6.4): mỗi cú ≤ −19 dB so giọng (cửa sổ trượt 100 ms, giọng ±0,5 s), và ≥ +8 dB so nhạc
    (nhạc sau nén theo giọng, cùng cửa sổ). Đo trên stem thật đã ghi ra đĩa, không dùng số tính trước."""
    sx, vo = read_mono(sfx_wav), read_mono(voice_wav)
    mu = read_mono(music_wav) if music_wav and os.path.exists(music_wav) else None
    win = int(0.1 * sr)
    rows = []
    for p_ in placed:
        t = p_["t"]
        s_db = win_db(sx, int((t - 0.2) * sr), int((t + 1.3) * sr), win)
        v_db = win_db(vo, int((t - 0.5) * sr), int((t + 0.5) * sr), win)
        m_db = win_db(mu, int((t - 0.2) * sr), int((t + 1.3) * sr), win) if mu is not None else None
        rows.append({"t": t, "vsVoiceDb": round(s_db - v_db, 1), "vsMusicDb": None if m_db is None else round(s_db - m_db, 1)})
    worst = max((r["vsVoiceDb"] for r in rows), default=None)
    low_music = [r["t"] for r in rows if r["vsMusicDb"] is not None and r["vsMusicDb"] < 8]
    return rows, worst, low_music


def broll_library(broll_dir):
    """Thư viện minh hoạ (clip + ảnh) từ manifest.json; chỉ mục có giấy phép, có tệp, có từ khoá."""
    mf = os.path.join(broll_dir, "manifest.json")
    if not os.path.exists(mf):
        return []
    lib = []
    for it in json.load(open(mf, encoding="utf-8")):
        f = os.path.join(broll_dir, it.get("file", ""))
        kws = [P.norm(k) for k in it.get("keywords", []) if P.norm(k)]
        if not str(it.get("license", "")).strip() or not os.path.isfile(f) or not kws or it.get("exclude"):
            continue
        is_img = f.lower().endswith(IMG_EXT)
        lib.append({**it, "path": f, "kw": kws, "dur": 99.0 if is_img else P.probe(f)["duration"]})
    return lib


def image_clip(src, out, d):
    """Ảnh tĩnh → clip 9:16: nền là chính ảnh phủ kín + làm mờ + tối; ảnh dạng thẻ bo góc ở giữa, đẩy vào chậm 1,00→1,05
    theo đường cos (biến đổi affine dưới điểm ảnh, không làm tròn → không giật). Ảnh nhỏ (vd 720 px) không bị phóng vỡ."""
    from PIL import ImageEnhance, ImageOps
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    s = max(CW / im.width, CH / im.height)
    bg = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)), Image.BILINEAR)
    bg = bg.crop(((bg.width - CW) // 2, (bg.height - CH) // 2, (bg.width - CW) // 2 + CW, (bg.height - CH) // 2 + CH))
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(36))).enhance(0.5).convert("RGBA")
    base = min(LAY["card_w"] / im.width, LAY["card_h"] / im.height)  # cỡ thẻ khi z = 1 (px khung / px ảnh)
    zmax = 1.05
    k0 = min(1.0, base * zmax)  # giữ ảnh gốc ở cỡ cần dùng lớn nhất (không phóng trước)
    fg = im.resize((max(1, round(im.width * k0)), max(1, round(im.height * k0))), Image.LANCZOS).convert("RGBA")
    m = Image.new("L", fg.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, fg.width - 1, fg.height - 1), radius=max(6, round(28 * k0 / base)), fill=255)  # bo 28 px trên khung
    fg.putalpha(m)
    cx, cy = CW / 2, LAY["card_cy"]  # tâm thẻ: vùng mặt (ĐỎ), chừa dải chữ phía dưới
    sh = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    sw, shh = im.width * base * 1.025, im.height * base * 1.025
    ImageDraw.Draw(sh).rounded_rectangle((cx - sw / 2, cy - shh / 2 + 18, cx + sw / 2, cy + shh / 2 + 18), radius=30, fill=(0, 0, 0, 150))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22)))
    n = max(2, int(round(d * FPS)))
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{CW}x{CH}", "-r", str(FPS), "-i", "-",
                             "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    fcx, fcy = fg.width / 2, fg.height / 2
    for i in range(n):
        e = 0.5 - 0.5 * math.cos(math.pi * i / (n - 1))
        k = base * (1.0 + (zmax - 1.0) * e) / k0  # px khung trên 1 px của fg
        layer = fg.transform((CW, CH), Image.AFFINE, (1 / k, 0, fcx - cx / k, 0, 1 / k, fcy - cy / k), resample=Image.BICUBIC)
        frame = bg.copy()
        frame.alpha_composite(layer)
        proc.stdin.write(frame.convert("RGB").tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"không dựng được clip ảnh {os.path.basename(src)}")


def auto_plan(words, dur, keywords):
    """Kế hoạch theo luật (ESV mục 4): chữ nhấn ít (≈1/30 s, cách ≥ 4 s), từ đã nghe rõ. Zoom đặt lúc dựng theo hồ sơ nhịp (mục 6.5).
    Sơ đồ / animation cần hiểu nội dung (quy trình, cơ chế) nên KHÔNG tự tạo ở đây: để biên tập (người hoặc AI) lập."""
    ws = [w for w in words if not w.get("uncertain")]
    toks = [(_clean(w["text"]), w) for w in ws]
    cands = {}
    kws = [k.strip() for k in keywords if k.strip()]
    for i in range(len(toks) - 1):
        a, b = toks[i][0], toks[i + 1][0]
        if not a or not b:
            continue
        phrase = f"{a} {b}"
        orig = f"{toks[i][1]['text']} {toks[i + 1][1]['text']}".strip(",.?!")
        score = 0.0
        if any(k.lower() == phrase or (k.lower() == a and _kw_hit(k, toks[i][1]["text"])) for k in kws):
            score += 3
            if b in STOP:  # chỉ nhấn đúng từ khoá, không kéo theo hư từ phía sau
                orig = toks[i][1]["text"].strip(",.?!")
        if a.isdigit() and b not in STOP:
            score += 2
        if a not in STOP and b not in STOP and not a.isdigit():
            score += 0.5
        if score <= 0:
            continue
        c = cands.setdefault(phrase, {"n": 0, "t": toks[i][1]["start"], "text": orig, "score": 0.0})
        c["n"] += 1
        c["score"] = max(c["score"], score)
    for c in cands.values():
        if c["n"] >= 2:
            c["score"] += c["n"]
    ranked = sorted([c for c in cands.values() if c["score"] >= 1.5 and c["t"] > 0.8], key=lambda c: -c["score"])
    budget = max(1, round(dur / 30))
    chosen = []
    for c in ranked:
        if len(chosen) >= budget:
            break
        if all(abs(c["t"] - x["t"]) >= 4.0 for x in chosen):
            chosen.append(c)
    chosen.sort(key=lambda c: c["t"])
    top = sorted(chosen, key=lambda c: -c["score"])[:3]
    emph = []
    for k, c in enumerate(chosen):
        text = c["text"].upper() if c in top else c["text"][:1].upper() + c["text"][1:]
        style = "blur" if k == 0 else ("shine" if c is top[0] else "fade")
        emph.append({"t": round(c["t"], 2), "text": text, "style": style})
    return {"by": "Luật tự động (chưa có biên tập AI)", "note": "Chữ nhấn theo từ khoá / cụm lặp / con số; không có sơ đồ.", "emphasis": emph, "diagrams": []}


# ---------------------------------------------------------------- chính

# ---------------------------------------------------------------- 16:9 — Skill Edit Video Ngang v0.1.r2 (ngang.py)

def _inter(a, b, m=0.0):
    return a[0] - m < b[2] and b[0] - m < a[2] and a[1] - m < b[3] and b[1] - m < a[3]


DIA169 = (696, 376)  # dải sơ đồ 9:16 (VÀNG 916×495) thu ×0,76 vào dải B 16:9 cảnh 1 người (C-K.1: x250–1640, y1020–1780 @4K)


def plan_ngang(src, info, cropf, plan, words, emph, dias, fs_events, rev_spans, zooms, A, broll_dir, m3=None):
    """Dò mặt theo thời gian rồi đặt mọi thứ của khung ngang TRƯỚC khi vẽ: chữ nhấn (trái / phải né mặt), sơ đồ (dải trái / phải),
    thẻ ảnh M1–M6 vào chỗ trống lớn nhất xa mặt (R3.0.1). Trả (cards, bỏ qua kèm lý do, vị trí sơ đồ)."""
    import ngang as NG
    NG.FONT = font
    track = NG.face_track(src, info, cropf)

    def faces(t0, t1):
        f0, f1 = int(t0 * FPS), int(t1 * FPS)
        z = max([zoom_at(zooms, f) for f in range(f0, f1 + 1, 3)] or [1.0])
        fb = NG.faces_at(track, (t0 + t1) / 2, z, A, span=(t1 - t0) / 2 + 2.0)  # ±2 s: máy dò sót mặt vài mẫu vẫn giữ được người
        if not fb:  # không thấy mặt ≠ không có người (phản biện P2-2): giả định người ở vị trí quen / quanh tâm zoom
            fb = [(A[0] + (x0 - A[0]) * z, A[1] + (y0 - A[1]) * z, A[0] + (x1 - A[0]) * z, A[1] + (y1 - A[1]) * z) for x0, y0, x1, y1 in NG.fallback_person(track, A)]
        return fb

    def fcx_of(fb):
        return float(np.median([(q[0] + q[2]) / 2 for q in fb])) if fb else CW / 2

    dropped_emph = []
    for e in emph:  # chữ nhấn \an1 trái; đè mặt (hoặc trùng dòng miễn trừ góc trái) → sang phải; hai bên đều đè mặt → bỏ
        w_ = e.img.width - 0.7 * e.fs
        boxL = (NG.EMP_X, NG.EMP_BOTTOM - e.img.height * 0.8, NG.EMP_X + w_, NG.EMP_BOTTOM + 0.2 * e.fs)
        boxR = (CW - NG.EMP_X - w_, boxL[1], CW - NG.EMP_X, boxL[3])
        fb = faces(e.t0, e.t1)
        left_ok = not any(_inter(boxL, q, 30) for q in fb) and not any(a_ < e.t1 and e.t0 < b_ for a_, b_ in rev_spans)
        right_ok = not any(_inter(boxR, q, 30) for q in fb)
        in_m3 = m3 is not None and m3["t0"] - 0.5 < e.t1 and e.t0 < m3["t1"] + 0.5
        if in_m3:
            continue  # M3: chữ nhấn nằm trong thẻ người nói (R3.3.10), không sang phải đè cột ô (phản biện P2-1); J đo trên bản chính
        if not left_ok and right_ok:
            e.right = True
        elif not left_ok:
            dropped_emph.append({"t": round(e.t0, 2), "text": e.text, "reason": "hai bên đều đè mặt người (Ngang R5.2: không chữ đè mặt)"})
            e.t1 = e.t0  # tắt chữ nhấn này
    dia_pos, dropped_dia = {}, []
    for d in dias:
        # Sơ đồ được vẽ trên THÂN người (dải 2 người C-K.1: "dưới cằm người nữ, trái mặt người nam"), chỉ cấm đè MẶT (A10.4).
        # Thử: dải trái 1 người, dải 2 người (thấp hơn), dải phải, dải phải thấp, giữa thấp; chạm mặt hết → bỏ sơ đồ (A10.4 mục 6c).
        fb = faces(d.t0, d.t1)
        w_, h_ = DIA169
        cands = [(125, 512), (125, 580), (CW - 125 - w_, 512), (CW - 125 - w_, 580), ((CW - w_) // 2, 580)]
        # câu doanh thu: dòng miễn trừ góc trái dưới cũng là vật cản (phản biện P2-4: sơ đồ đè hộp miễn trừ)
        obst = fb + ([NG.DISC["box"]] if any(a_ < d.t1 and d.t0 < b_ for a_, b_ in rev_spans) else [])
        pick = next(((x, y) for x, y in cands if not any(_inter((x, y, x + w_, y + h_), q, 20) for q in obst)), None)
        if pick is None:
            dropped_dia.append({"t": round(d.t0, 2), "text": d.__class__.__name__, "reason": "mọi vị trí sơ đồ đều chạm mặt người (A10.4: bỏ khung vẽ đoạn đó)"})
            d.t1 = d.t0
            continue
        dia_pos[id(d)] = pick
    lib = {m["file"]: m for m in broll_library(broll_dir)}
    busy = [(d.t0 - 1.0, d.t1 + 1.0) for d in dias] + [(float(x["t0"]) - 1.0, float(x["t1"]) + 1.0) for x in fs_events]
    cards, skips, prev, counts = [], [], None, {}
    items = sorted(plan.get("broll", []), key=lambda b: float(b["t0"]))
    for b in items:
        t0, t1 = float(b["t0"]), float(b["t1"])
        m = lib.get(b.get("file"))
        why = None
        if m3 and any(x["b"] is b for x in m3["tiles"]):
            continue  # ảnh này là một ô của M3 (split khúc cuối)
        if not m:
            why = "thiếu tệp / giấy phép / từ khoá trong thư viện"
        elif m3 and m3["t0"] - 0.5 < t1 and t0 < m3["t1"] + 0.5:
            why = "trong cửa sổ M3 (split khúc cuối)"
        elif any(a_ < t1 and t0 < b_ for a_, b_ in rev_spans):
            why = "đoạn doanh thu / thu nhập / kết quả: 0 ảnh (R5.4)"
        elif any(a_ < t1 and t0 < b_ for a_, b_ in busy):
            why = "đang có khung vẽ / khung toàn màn hình (A10 luật phối 4)"
        if why:
            skips.append({"t0": t0, "file": b.get("file"), "reason": why})
            continue
        sent = " ".join(w["text"] for w in words if t0 - 1.5 <= w["start"] <= t1 + 1.0)
        kw = set(P.norm(k) for k in m.get("keywords", []))
        extras = [x for x in lib.values() if x["file"] != m["file"] and x["file"].lower().endswith(IMG_EXT)
                  and kw & set(P.norm(k) for k in x.get("keywords", [])) and not any(x["file"] in c.files for c in cards[-3:])]
        kind = NG.choose_template(sent, prev, counts, 1 + min(2, len(extras)), len(items))
        label = str(b.get("keyword") or "")
        if kind == "M4" and not (label and P.norm(label) in P.norm(sent)):
            kind, label = ("M1" if prev != "M1" else "M2"), ""  # nhãn M4 phải nguyên văn lời (R3.4.2) — không có thì đổi mẫu
        fb = faces(t0, t1)
        fcx = fcx_of(fb)
        extra = []
        for e in emph:
            if e.t0 < t1 and t0 < e.t1:
                extra.append((CW - 1000, 760, CW - 96, 930) if e.right else (96, 760, 1000, 930))
        free = NG.free_mask(fb, extra)
        rect = None
        for k in (kind, "M1") if kind != "M1" else ("M1",):
            best = None
            for j, ratio in enumerate(NG.Card.RATIOS[k]):
                r = NG.best_rect(free, ratio, NG.Card.MAXW[k], 150 if k == "M5" else 260, fcx, pad=NG.PAD[k])
                if r:
                    area = (r[2] - r[0]) * (r[3] - r[1]) * (1.12 if j == 0 else 1.0)  # tỉ lệ chuẩn +12 % (best_multi)
                    if not best or area > best[0]:
                        best = (area, r)
            if best and (k != "M5" or best[1][3] - best[1][1] >= 420):
                rect, kind = best[1], k
                break
        if not rect:
            skips.append({"t0": t0, "file": m["file"], "reason": "không đủ chỗ trống cạnh người nói (né mặt, phụ đề, chữ nhấn, title-safe)"})
            continue
        n = 1 + (min(2, len(extras)) if kind == "M6" else (1 if kind == "M5" and extras else 0))
        ms_ = [m] + extras[:n - 1]
        side = 1 if (rect[0] + rect[2]) / 2 > fcx else -1
        c = NG.Card(kind, t0, t1, rect, [None] * n, label if kind == "M4" else "", side, counts.get("M2", 0))
        c.media = [(NG.load_media(os.path.join(broll_dir, x["file"]), c.media_size(j), yc=float(x.get("yc", 0.38)), t0=float(b.get("from", 0)), dur=t1 - t0),
                    1 if (len(cards) + j) % 2 == 0 else -1) for j, x in enumerate(ms_)]
        c.files = [x["file"] for x in ms_]
        c.license = "; ".join(sorted({str(x.get("license", "")) for x in ms_}))
        c.source = "; ".join(sorted({str(x.get("source", "")) for x in ms_}))
        cards.append(c)
        prev, counts[kind] = kind, counts.get(kind, 0) + 1
    skips += [{"t0": d["t"], "file": f"chữ nhấn “{d['text']}”", "reason": d["reason"]} for d in dropped_emph]
    skips += [{"t0": d["t"], "file": f"sơ đồ {d['text']}", "reason": d["reason"]} for d in dropped_dia]
    return cards, skips, dia_pos, track


_DARK169 = {}


def draw_ngang(t, cards, dias, dia_pos, emph, rev_spans, disc_img, units, sub_cache, fsub_ss, split3=None):
    """Một khung lớp chữ 16:9 (1920×1080): thẻ ảnh → sơ đồ (trên nền tối mềm) → chữ nhấn → dòng miễn trừ → phụ đề."""
    import ngang as NG
    layer = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    boxes = []
    base3 = split3.frame(t) if split3 else None
    if split3:
        boxes += [("card", b) for b in split3.tiles_frame(t, layer)]
    for c in cards:
        b = c.frame(t, layer)
        if b:
            boxes.append(("card", b))
    for d in dias:
        if not (d.t0 <= t < d.t1):
            continue
        band = Image.new("RGBA", (W, BAND_Y1 - BAND_Y0), (0, 0, 0, 0))
        d.frame(t, band, [])
        g = band.crop((YEL[0], YEL[1] - BAND_Y0, YEL[2], YEL[3] - BAND_Y0)).resize(DIA169, Image.LANCZOS)
        x0, y0 = dia_pos.get(id(d), (125, 512))
        dk = max(0.0, min(1.0, (t - d.t0) / 0.3, (d.t1 - t) / 0.3))
        if "d" not in _DARK169:  # nền tối mềm RGB(8,6,4) α ≤ 0,42 (A10), lùi vào trong để mép mờ không lọt title-safe
            m = Image.new("L", (DIA169[0] + 100, DIA169[1] + 100), 0)
            ImageDraw.Draw(m).rectangle((80, 60, DIA169[0] + 20, DIA169[1] + 40), fill=int(255 * 0.42))
            dd = Image.new("RGBA", m.size, (8, 6, 4, 255))
            dd.putalpha(m.filter(ImageFilter.GaussianBlur(18)))
            _DARK169["d"] = dd
        layer.alpha_composite(with_alpha(_DARK169["d"], dk), (x0 - 50, y0 - 50))
        layer.alpha_composite(g, (x0, y0))
        bb = g.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if bb:
            boxes.append(("gfx", (x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3])))
    for e in emph:
        e.frame(t, layer, boxes)
    for a_, b_ in rev_spans:  # R8.5: dòng miễn trừ trên hộp đen bo R11, phủ suốt câu
        if a_ <= t < b_ and disc_img is not None:
            al = min(1.0, (t - a_) / 0.15, (b_ - t) / 0.15)
            x1 = max(NG.DISC["box"][2], NG.DISC["x"] + disc_img.width + 12)
            bx = Image.new("RGBA", (x1 - NG.DISC["box"][0], NG.DISC["box"][3] - NG.DISC["box"][1]), (0, 0, 0, 0))
            ImageDraw.Draw(bx).rounded_rectangle((0, 0, bx.width - 1, bx.height - 1), radius=NG.DISC["r"], fill=(0, 0, 0, int(255 * NG.DISC["alpha"])))
            layer.alpha_composite(with_alpha(bx, al), (NG.DISC["box"][0], NG.DISC["box"][1]))
            layer.alpha_composite(with_alpha(disc_img, al), (NG.DISC["x"], int(NG.DISC["cy"] - disc_img.height / 2)))
            boxes.append(("disc", (NG.DISC["box"][0], NG.DISC["box"][1], x1, NG.DISC["box"][3])))
    u = next((x for x in units if x["start"] <= t < x["end"]), None)
    if u:
        hl = -1
        for k, w in enumerate(u["words"]):
            nxt = u["words"][k + 1]["start"] if k + 1 < len(u["words"]) else u["end"]
            if w["start"] <= t < max(nxt, w["end"]):
                hl = k
        key = (id(u), hl)
        if key not in sub_cache:
            sub_cache[key] = draw_subtitle(u, hl, fsub_ss, CW, NG.SUB_BOTTOM, NG.SUB_FS / 66)
        img, ytop = sub_cache[key]
        layer.alpha_composite(with_alpha(img, min(1.0, (t - u["start"]) / 0.045 + 0.0001)), (0, ytop))
        bb = img.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if bb:
            boxes.append(("sub", (bb[0], bb[1] + ytop, bb[2], bb[3] + ytop)))
    if base3 is not None:
        base3.alpha_composite(layer)
        return (base3, layer), boxes
    return layer, boxes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--job-dir", required=True)
    ap.add_argument("--plan", default="")
    ap.add_argument("--keywords", default="")
    ap.add_argument("--words", default="")
    ap.add_argument("--logo", default=os.path.join(P.ROOT, "public", "brand", "baor-light.png"))
    ap.add_argument("--logo-dark", default="", help="bản logo tối (trên nền sáng); trống = tệp cùng thư mục đổi light → dark, không có thì tạo tại chỗ")
    ap.add_argument("--model", default="medium")
    ap.add_argument("--model2", default="small")
    ap.add_argument("--music", default="", help="bài nhạc nền; trống = bài mặc định trong DATA_DIR/video-assets/music/manifest.json")
    ap.add_argument("--music-license", default="")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--cut-silence", action="store_true", help="cắt khoảng lặng (Skill ESV 10.5, chỉ khi được giao)")
    ap.add_argument("--aspect", default="9:16", choices=list(ASPECTS))
    ap.add_argument("--frame-x", type=float, default=None, help="tâm khung cắt theo chiều ngang nguồn, 0–1")
    ap.add_argument("--frame-y", type=float, default=None, help="tâm khung cắt theo chiều dọc nguồn, 0–1")
    ap.add_argument("--frame-zoom", type=float, default=1.0, help="phóng khung cắt ≥ 1")
    ap.add_argument("--no-sfx", action="store_true", help="tắt SFX tổng hợp (vút khi vào minh hoạ, tách khi chữ nhấn)")
    ap.add_argument("--corrections", default="", help='sửa chữ nghe sai, mỗi dòng "sai => đúng" (cùng số tiếng)')
    ap.add_argument("--script", default="", help="tệp lời nói của kịch bản đã gắn (Nội dung → Video): gợi ý nghe, sửa chữ, ngữ cảnh biên tập AI")
    ap.add_argument("--no-grade", action="store_true", help="không cân sáng / màu tự động")
    ap.add_argument("--ai-plan", action="store_true", help="bỏ kế hoạch có sẵn, để biên tập AI tại máy lập lại (scripts/video/ai_plan.py)")
    ap.add_argument("--quality", default="1080", choices=["1080", "4k"], help="4k = xuất gấp đôi (2160x3840 / 3840x2160) khi nguồn đủ điểm ảnh")
    a = ap.parse_args()
    global CW, CH, LAY
    LAY = make_layout(a.aspect)
    CW, CH = LAY["CW"], LAY["CH"]
    job = P.Job(a.job_dir)
    os.makedirs(job.p("work"), exist_ok=True)
    src = os.path.abspath(a.input)
    plan = json.load(open(a.plan, encoding="utf-8")) if a.plan and os.path.exists(a.plan) else None
    script_text = open(a.script, encoding="utf-8").read().strip() if a.script and os.path.exists(a.script) else ""

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
        job.progress("listen1", "Nghe lời nói", 8)
        words = P.transcribe(wav16, a.model, script_text[:400])  # kịch bản làm gợi ý tên riêng / thuật ngữ cho Whisper
        job.progress("listen2", "Nghe lại để đối chiếu", 30)
        second = P.transcribe(wav16, a.model2, "")
        P.mark_uncertain(words, second)
    fixes = apply_corrections(words, a.corrections)
    for w in words:
        w.setdefault("end", w["start"] + 0.2)
        if "uncertain" not in w:
            w["uncertain"] = w.get("p", 1) < 0.15
    # Lưu lời nghe THÔ (trước khi sửa theo kịch bản): bản sau dùng lại (--words) rồi sửa theo kịch bản HIỆN TẠI — bỏ gắn / đổi
    # kịch bản thì không còn dính sửa cũ, cờ "nghe chưa chắc" trở lại.
    json.dump([{k: v for k, v in w.items() if k != "scriptFix"} for w in words], open(job.p("words_main.json"), "w"), ensure_ascii=False)
    # Nội dung → Video: sửa chữ máy nghe theo kịch bản đã duyệt (chỉ thay tại chỗ, giữ mốc; lời nói ngoài kịch bản giữ nguyên)
    script_fixes = []
    if script_text:
        import script_align
        script_fixes = script_align.correct(words, script_text)
    if plan is not None and str(plan.get("by", "")).startswith("Luật tự động"):
        plan = None  # kế hoạch máy lập ở bản trước: lập lại (AI nếu có mô hình, không thì luật mới nhất)
    if a.ai_plan:
        plan = None  # người dùng bấm "AI biên tập lại"
    ai_run = None
    broll_dir = (plan or {}).get("brollDir") or os.path.join(os.environ.get("DATA_DIR", os.path.join(P.ROOT, "data")), "video-assets", "broll")
    if plan is None:
        # Biên tập AI trong ứng dụng: mô hình mở chạy tại máy lập kế hoạch, luật ESV kiểm từng mục (ai_plan.py).
        # Không có mô hình / lỗi → quay về kế hoạch theo luật, ghi rõ lý do trong ghi chú kế hoạch.
        ai_note = ""
        try:
            import ai_plan
            job.progress("aiplan", "Biên tập AI: đọc lời nói, chọn chữ nhấn / sơ đồ / minh hoạ (mô hình tại máy)", 31)
            plan = ai_plan.plan(words, dur, broll_library(broll_dir), (script_text[:1200] + (f" Từ khoá: {a.keywords}" if a.keywords else "")).strip(),
                                log=lambda m: print(m, file=sys.stderr), music_genres=music_genres(music_library(os.environ.get("DATA_DIR", os.path.join(P.ROOT, "data")))))
            if plan is None:
                ai_note = " Biên tập AI: không có mô hình tại máy (llama-server) hoặc Đội AI đang tắt → lập theo luật."
            else:
                ai_run = {"model": (plan.get("ai") or {}).get("model", ""), "seconds": (plan.get("ai") or {}).get("seconds", 0)}
        except Exception as e:  # mô hình lỗi giữa chừng không được làm hỏng cả bản dựng
            plan = None
            ai_note = f" Biên tập AI lỗi ({str(e)[:120]}) → lập theo luật."
        if plan is None:
            plan = auto_plan(words, dur, re.split(r"[,\n]", a.keywords))
            ev = P.plan_broll(words, dur, broll_library(broll_dir))
            plan["broll"] = [{"t0": e["t0"], "t1": e["t1"], "file": e["file"], "keyword": e["keyword"]} for e in ev]
            if ev:
                plan["note"] += f" Minh hoạ theo từ khoá lời nói: {len(ev)} lần."
            plan["note"] += ai_note
    json.dump(plan, open(job.p("plan.json"), "w"), ensure_ascii=False, indent=1)
    # Bảng biên tập: mục người dựng tắt (off = true) giữ trong kế hoạch nhưng không dựng
    for key in ("emphasis", "diagrams", "broll"):
        plan[key] = [x for x in plan.get(key, []) if not x.get("off")]
    cut_times, keep, src_dur = [], None, dur
    if a.cut_silence:
        job.progress("cut", "Cắt khoảng lặng", 32)
        keep = keep_segments(src, dur, words=words)
        cut_src = job.p("work", "cut.mov")
        N = make_cut(src, keep, cut_src, job.p("work"))
        mp, cut_times = time_map(keep)
        words = [{**w, "start": mp(w["start"]), "end": max(mp(w["start"]) + 0.05, mp(w["end"]))} for w in words]
        plan = map_plan(plan, mp)
        src = cut_src
        info = {**P.probe(src), "rotation": 0}
        dur = N / FPS

    # Khung: cắt theo tỷ lệ xuất quanh người nói (ESV mục 1: nguồn ngang → toàn chiều cao 9:16); người dựng chỉnh được tâm / phóng
    job.progress("frame", f"Dò mặt, chọn khung {a.aspect}", 36)
    fx, fy, face_ok = face_center(src, info)
    cropf, cw, chh, x0, y0 = frame_crop(info, fx, fy, a.aspect, {"x": a.frame_x, "y": a.frame_y, "zoom": a.frame_zoom})
    ax, ay = (fx - x0) / cw, (fy - y0) / chh
    # Chất lượng xuất (OWNER 25/10/2026: "ô chất lượng video 1080 hay 4K"): 4K chỉ khi vùng cắt trên nguồn đủ ≥ 90 % điểm ảnh của 4K —
    # không phóng to "4K giả" (vd nguồn ngang 4K cắt sang dọc 9:16 chỉ còn ~1215 px bề ngang) → giữ 1080 và ghi rõ lý do.
    Q, quality_note = 1, "1080"
    if a.quality == "4k":
        if cw >= 0.9 * 2 * CW and chh >= 0.9 * 2 * CH:
            Q, quality_note = 2, f"4K {2 * CW}x{2 * CH}"
        else:
            quality_note = f"chọn 4K nhưng vùng cắt nguồn chỉ {cw}x{chh} (< 90 % của {2 * CW}x{2 * CH}) → xuất 1080 để không phóng to giả"
    OW, OH = CW * Q, CH * Q
    # Cân sáng / màu nhẹ (S5): đo trên đúng vùng sẽ xuất, chỉ chỉnh khi lệch rõ
    if a.no_grade:
        GRADE[:], grade_note = [], "tắt (--no-grade)"
    else:
        g_, grade_note = measure_grade(src, info, (fx, fy) if face_ok else None)
        GRADE[:] = g_
    # tâm zoom: mặt, giới hạn để mặt nằm trong vùng mặt
    ax = min(max(ax, 0.2), 0.8)
    ay = min(max(ay, 0.20), 0.45) if a.aspect == "9:16" else min(max(ay, 0.15), 0.6)

    # Lớp chữ / đồ hoạ
    job.progress("draw", "Vẽ phụ đề karaoke, chữ nhấn vàng, sơ đồ theo ESV", 45)
    FULL = a.aspect == "16:9"  # Skill Edit Video Ngang: lớp chữ / thẻ ảnh vẽ toàn khung 1920×1080 (không dùng dải chữ 9:16)
    SUBFS = 48 if FULL else 66
    fsub = font("Times New Roman Italic.ttf", SUBFS)
    fsub_ss = font("Times New Roman Italic.ttf", SUBFS * SS)
    units = build_sub_units(words, fsub, 1500 if FULL else None)
    Emphasis.mode169 = FULL
    emph = [Emphasis(e, words) for e in plan.get("emphasis", [])]
    dias = [make_diagram(d) for d in plan.get("diagrams", []) if d["type"] in ("compare", "arrow", "steps", "mechanism", "process", "chapter", "quote")]
    fs_events = [d for d in plan.get("diagrams", []) if d["type"] in ("fs06", "fs05", "fs01")]
    leaks = [d for d in plan.get("diagrams", []) if d["type"] == "leak"]
    anim_windows = [(d.t0, d.t1) for d in dias] + [(d["t0"], d["t1"]) for d in fs_events]
    n_emph_plan = len(emph)
    emph = fit_emphasis(emph, anim_windows)
    tdir = job.p("work", "txt")
    os.makedirs(tdir, exist_ok=True)
    sub_cache = {}
    bad_zone, overlap, bad_safe = 0, 0, []
    BH = BAND_Y1 - BAND_Y0
    REV_KW = ("doanh thu", "thu nhập", "lợi nhuận", "kiếm được", "triệu", "tỷ", "lương")
    rev_spans = []
    for u in units:
        if any(k in " ".join(w["text"].lower() for w in u["words"]) for k in REV_KW):
            if rev_spans and u["start"] - rev_spans[-1][1] < 1.5:
                rev_spans[-1][1] = u["end"]
            else:
                rev_spans.append([u["start"], u["end"]])
    disc_img = label_img("Kết quả cá nhân, không cam kết", 42 if FULL else 48) if rev_spans else None
    # Zoom tính TRƯỚC khi vẽ: 16:9 cần biết mặt nằm đâu sau zoom để thẻ ảnh / sơ đồ / chữ nhấn né mặt
    m3 = None
    if FULL:  # M3 split khúc cuối (Ngang R2.3, C3 M3): chọn trước để chặn zoom trong cửa sổ (R3.3.8)
        import ngang as NG
        ok_files = {m["file"] for m in broll_library(broll_dir)}
        busy0 = [(d.t0 - 1.0, d.t1 + 1.0) for d in dias] + [(float(x["t0"]) - 1.0, float(x["t1"]) + 1.0) for x in fs_events] \
            + [(float(x["t0"]) - 1.0, float(x["t0"]) + 4.6) for x in leaks]  # vệt sáng 3,6 s: nền M3 đục sẽ che mất
        m3 = NG.pick_m3([b for b in plan.get("broll", []) if b.get("file") in ok_files], rev_spans, busy0, dur)
    blocked = anim_windows + [(float(b["t0"]), float(b["t1"])) for b in plan.get("broll", [])] + [(d["t0"], d["t0"] + 3.6) for d in leaks] \
        + ([(m3["t0"] - 1.0, m3["t1"] + 1.0)] if m3 else [])
    if plan.get("pace") in ZOOM_PROFILES:
        prof, pace = plan["pace"], {"why": "biên tập chọn"}
    else:
        prof, pace = pace_profile(units, words, len(cut_times) + len(plan.get("broll", [])) + 2 * len(fs_events) + len(leaks), dur, plan.get("content", ""))
    zooms = [z for z in plan.get("zooms", []) if "nin" in z]
    if not zooms:
        zooms = place_zooms([(e.t0, 1.08 if e.style == "shine" else (1.07 if e.style == "blur" else 1.06)) for e in emph], prof, blocked, dur, cut_times)
        zooms = fill_zooms(zooms, units, prof, blocked, dur, cut_times, every=6.0)  # OWNER 25/10/2026: không để video thưa (cũ 10 s)
    cards, card_skips, dia_pos, track169, split3 = [], [], {}, [], None
    if FULL:
        cards, card_skips, dia_pos, track169 = plan_ngang(src, info, cropf, plan, words, emph, dias, fs_events, rev_spans, zooms, (ax * CW, ay * CH), broll_dir, m3)
        if m3:
            base_vf = ",".join(["fps=30"] + ([cropf] if cropf else []) + GRADE + [f"scale={CW}:{CH}:flags=lanczos", "unsharp=5:5:0.3"])
            f0 = int(math.floor(m3["t0"] * FPS))
            while f0 / FPS < m3["t0"]:  # đúng điều kiện vòng vẽ dùng (t = f / FPS ≥ t0), tránh lệch 1 khung do số thực (phản biện P3-1)
                f0 += 1
            fcs = [(q[0] + q[2]) / 2 for tt, b in track169 if m3["t0"] <= tt <= m3["t1"] for q in b]
            lib_ = {m["file"]: m for m in broll_library(broll_dir)}
            split3 = NG.Split3(m3, NG.VideoReader(src, (f0 - 0.5) / FPS, int((m3["t1"] - f0 / FPS) * FPS) + 2, base_vf),
                               float(np.median(fcs)) if fcs else ax * CW,
                               [NG.load_media(os.path.join(broll_dir, x["file"]), NG.M3_TILE, yc=float(lib_[x["file"]].get("yc", 0.38)))[0].resize(NG.M3_TILE) for x in m3["tiles"]])
    frame_boxes = {}
    yy_ = np.arange(BH, dtype=np.float32)
    xx_ = np.arange(W, dtype=np.float32)
    # vào / ra 150 px theo chiều dọc và 180 px hai bên: không cạnh (ở tỷ lệ khác 9:16 dải chữ không phủ hết bề ngang)
    DARK_RAMP = 0.55 * (np.clip(yy_ / 150.0, 0, 1) * np.clip((BH - yy_) / 150.0, 0, 1))[:, None] * (np.clip(xx_ / 180.0, 0, 1) * np.clip((W - xx_) / 180.0, 0, 1))[None, :]
    for f in range(N):
        t = f / FPS
        if FULL:
            layer, boxes = draw_ngang(t, cards, dias, dia_pos, emph, rev_spans, disc_img, units, sub_cache, fsub_ss, split3)
            # title-safe đo trên lớp NỘI DUNG (chữ / thẻ / ô / sơ đồ), không đo nền M3 đục toàn khung
            abb = (layer[1] if isinstance(layer, tuple) else layer).getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
            layer = layer[0] if isinstance(layer, tuple) else layer
            import ngang as NG
            if abb and (abb[0] < NG.SAFE[0] or abb[1] < NG.SAFE[1] or abb[2] > NG.SAFE[2] or abb[3] > NG.SAFE[3]):
                bad_zone += 1
                bad_safe.append((round(t, 2), abb))
            if f % 15 == 0:
                frame_boxes[f] = [b for _, b in boxes]
            subs = [b for k, b in boxes if k == "sub"]
            others = [b for k, b in boxes if k != "sub"]
            if any(s_[1] < o[3] - 6 and o[1] < s_[3] and s_[0] < o[2] and o[0] < s_[2] for s_ in subs for o in others):
                overlap += 1
            layer.save(os.path.join(tdir, f"{f:06d}.png"), compress_level=1)
            if f % 150 == 0:
                job.progress("draw", f"Vẽ lớp chữ / thẻ ảnh {f}/{N} khung", 45 + int(25 * f / N))
            continue
        layer = Image.new("RGBA", (W, BH), (0, 0, 0, 0))
        boxes = []
        for d in dias:
            d.frame(t, layer, boxes)
        for e in emph:
            e.frame(t, layer, boxes)
        # Q-T016-5 (Skill 9b): câu nêu doanh thu / thu nhập / kết quả → dòng chữ nhỏ phủ suốt câu, vào/ra 150 ms; tạm đặt đỉnh VÀNG (vị trí chưa có dữ liệu OWNER)
        for a_, b_ in rev_spans:
            if a_ <= t < b_:
                al = min(1.0, (t - a_) / 0.15, (b_ - t) / 0.15)
                im = with_alpha(disc_img, 0.92 * al)
                x_, y_ = int(540 - im.width / 2), 1124
                layer.alpha_composite(im, (x_, y_ - BAND_Y0))
                boxes.append(("disc", (x_, y_, x_ + im.width, y_ + im.height)))
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
        if f % 15 == 0:  # lưu hộp chữ / đồ hoạ mỗi 0,5 s cho kiểm J ở tỷ lệ khác 9:16
            frame_boxes[f] = [b for _, b in boxes]
        subs = [b for k, b in boxes if k == "sub"]
        others = [b for k, b in boxes if k != "sub"]
        if any(s[1] < o[3] - 6 and o[1] < s[3] and s[0] < o[2] and o[0] < s[2] for s in subs for o in others):
            overlap += 1
        # KH-TOI (Skill 5.5 b, bộ A): khi sơ đồ chạy, làm tối mềm dải chữ (α ≤ 0,55 như skill, không cạnh) để nhãn trắng không chìm vào áo / tay / micro.
        # Vẽ SAU khi đo G / H / I (lớp tối không phải chữ).
        dk = max([min(1.0, (t - d_.t0) / 0.3, (d_.t1 - t) / 0.3) for d_ in dias if d_.t0 <= t < d_.t1] or [0.0])
        if dk > 0.01:
            dark = Image.fromarray(np.zeros((BH, W, 4), np.uint8))
            dark.putalpha(Image.fromarray((DARK_RAMP * dk * 255).astype(np.uint8)))
            dark.alpha_composite(layer)
            layer = dark
        layer.save(os.path.join(tdir, f"{f:06d}.png"), compress_level=1)
        if f % 150 == 0:
            job.progress("draw", f"Vẽ lớp chữ {f}/{N} khung", 45 + int(25 * f / N))

    if FULL and split3:
        split3.reader.close()
    # Âm thanh: giọng (lọc nhẹ, nén nhẹ) + nhạc nền có giấy phép (≈ −25 LUFS, nén theo giọng, vào 1 s / ra 2 s)
    # + SFX tổng hợp; tổng chuẩn −16 LUFS, đỉnh −2,5 dBTP.
    job.progress("audio", "Âm thanh: giọng, nhạc nền, SFX, chuẩn −16 LUFS", 72)
    data_dir = os.environ.get("DATA_DIR", os.path.join(P.ROOT, "data"))
    voice = job.p("work", "voice.wav")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-af", f"apad=whole_dur={dur:.6f},atrim=end={dur:.6f},highpass=f=70,acompressor=threshold=0.05:ratio=2.5:attack=10:release=200:makeup=2", "-ar", "48000", "-ac", "2", voice])
    mix = voice
    # Nhạc chọn tay trong Cài đặt (--music) thắng; không thì theo loại nhạc AI chọn (plan.music.mood), chỉ bài đã duyệt
    pick = {"chosenBy": "chọn trong Cài đặt"} if a.music else {}
    music_path, music_lic = (a.music, a.music_license) if a.music else (None, "")
    if not a.music:
        music_path, music_lic, pick = pick_music(music_library(data_dir), (plan.get("music") or {}).get("mood"), os.path.basename(a.input), pool=music_pool(data_dir))
    music_info = {"used": False, "reason": "tắt" if a.no_music else pick.get("reason", "thư viện nhạc chưa có bài có giấy phép"), **({k: v for k, v in pick.items() if k == "suggest"})}
    if music_path and not a.no_music and str(music_lic).strip():
        mdur = float(P.sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", music_path]).stdout.strip() or 0)
        bed = job.p("work", "music_bed.wav")
        if mdur < dur:  # bài ngắn hơn video: nối chính nó, giao nhau 3 s (không cụt nhịp ở chỗ nối)
            reps = int(math.ceil(dur / max(1.0, mdur - 4))) + 1
            ins = sum([["-i", music_path] for _ in range(reps)], [])
            fcx, last = "", "[0:a]"
            for k in range(1, reps):
                fcx += f"{last}[{k}:a]acrossfade=d=4:c1=tri:c2=tri[x{k}];"
                last = f"[x{k}]"
            P.sh(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fcx + f"{last}atrim=0:{dur:.6f},aresample=48000[o]", "-map", "[o]", "-ac", "2", bed])
        else:
            P.sh(["ffmpeg", "-v", "error", "-y", "-i", music_path, "-af", f"atrim=0:{dur:.6f},aresample=48000", "-ac", "2", bed])
        # Skill ESV v0.1.r2 B8: volume=-24dB, sidechain ratio 6 / attack 45 / release 250, vào 1 s / ra 2 s;
        # Skill Edit Video Ngang v0.1.r2 R8.8 (16:9): -18.1dB, ratio 4 / attack 30 / release 450, vào 1,5 s / ra 3 s. Hạ thêm nếu A5 chưa đạt.
        ng = a.aspect == "16:9"
        gain = -18.1 if ng else -24.0
        fin, fout, duckp = (1.5, 3.0, "ratio=4:attack=30:release=450") if ng else (1.0, 2.0, "ratio=6:attack=45:release=250")
        a5 = None
        for _ in range(4):
            duck, mix = job.p("work", "music_duck.wav"), job.p("work", "mix.wav")
            fcm = (f"[0:a]asplit=3[v1][v2][v3];[1:a]volume={gain:.2f}dB,afade=t=in:d={fin},"
                   f"afade=t=out:st={max(0, dur - fout):.3f}:d={fout},apad=whole_dur={dur:.6f}[m];"
                   f"[m][v1]sidechaincompress=threshold=0.03:{duckp}[d];[d]asplit=2[d1][d2];"
                   f"[v2][d1]amix=inputs=2:normalize=0:duration=first[mx]")
            P.sh(["ffmpeg", "-v", "error", "-y", "-i", voice, "-i", bed, "-filter_complex", fcm, "-map", "[mx]", "-c:a", "pcm_s16le", mix,
                  "-map", "[d2]", "-c:a", "pcm_s16le", duck, "-map", "[v3]", "-c:a", "pcm_s16le", job.p("work", "voice_ref.wav")])
            a5 = P.a5_check(job.p("work", "voice_ref.wav"), duck)
            if a5["pass"]:
                break
            gain -= a5["deficit"] + 1.0
        music_info = {"used": True, "file": os.path.basename(music_path), "license": music_lic, "gainDb": round(gain, 1), "a5": a5, **pick}
    sfx_info = {"used": False, "reason": "tắt"}
    if not a.no_sfx:
        if FULL:  # 16:9: tiếng theo đúng thứ thật sự hiện (thẻ đã đặt, chữ nhấn / sơ đồ không bị bỏ vì né mặt)
            shown_e = {round(e.t0, 3) for e in emph if e.t1 > e.t0}
            shown_d = {round(d.t0, 3) for d in dias if d.t1 > d.t0}
            p_sfx = {**plan, "emphasis": [e for e in plan.get("emphasis", []) if round(float(e["t"]), 3) in shown_e],
                     "diagrams": [d for d in plan.get("diagrams", []) if d["type"] not in ("compare", "arrow", "steps", "mechanism", "process", "chapter", "quote") or round(float(d["t0"]), 3) in shown_d]}
            evs = sfx_events(p_sfx, [{"t0": c.t0, "template": c.kind} for c in cards]
                             + ([{"t0": max(x["t"], m3["t0"] + 0.75 * 0.9), "template": "m3_tile"} for x in m3["tiles"]] if m3 else []))
            if m3:  # mở / đóng split (R3.3.9): tiếng thu người vào khung / ra lại toàn khung (Kho âm thanh: Whoosh 04 / 15)
                evs = sorted(evs + [(m3["t0"] + 0.05, "m3_open", "M3 mở"), (m3["t1"] - 1.0, "m3_close", "M3 đóng")], key=lambda e: e[0])
        else:
            evs = sfx_events(plan, [b for b in plan.get("broll", []) if not b.get("off")])
        if evs:
            sfxw = job.p("work", "sfx.wav")
            placed, dropped = place_sfx(sfxw, evs, voice, dur, aspect=a.aspect)
            owner_roles = set(owner_sfx(48000, a.aspect))
            withsfx = job.p("work", "mix_sfx.wav")
            P.sh(["ffmpeg", "-v", "error", "-y", "-i", mix, "-i", sfxw, "-filter_complex",
                  "[0:a][1:a]amix=inputs=2:normalize=0:duration=first[o]", "-map", "[o]", "-c:a", "pcm_s16le", withsfx])
            mix = withsfx
            rows, worst, low_music = sfx_check(sfxw, voice, job.p("work", "music_duck.wav") if music_info.get("used") else None, placed)
            sfx_info = {"used": bool(placed), "count": len(placed), "events": placed, "dropped": dropped, "levels": rows, "worstVsVoiceDb": worst,
                        "belowMusic8Db": low_music,
                        "source": (f"tiếng OWNER theo vai trò (Kho hiệu ứng âm thanh, giấy phép CHƯA XÁC MINH — Phần chung A0.2): "
                                   f"{sum(1 for p_ in placed if p_['kind'] in owner_roles)}/{len(placed)} cú; còn lại tổng hợp tại chỗ")
                        if owner_roles else "tổng hợp tại chỗ bằng công thức (không dùng tệp ngoài, không dùng nhiễu)"}
    m = P.sh(["ffmpeg", "-hide_banner", "-i", mix, "-af", "loudnorm=I=-16:TP=-2.5:LRA=11:print_format=json", "-f", "null", "-"], check=False).stderr
    js = json.loads(m[m.rfind("{"):m.rfind("}") + 1])
    final = job.p("work", "final.wav")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", mix, "-af",
          f"loudnorm=I=-16:TP=-2.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true,"
          f"aresample=192000,alimiter=limit=0.70:attack=1:release=80:level=false,aresample=48000,afade=t=out:st={max(0.0, dur - 0.7):.3f}:d=0.7", "-c:a", "pcm_s24le", final])

    # Bản chính: khung + zoom chỉ nền → logo → lớp chữ
    job.progress("encode", f"Xuất bản chính {OW}x{OH}", 78)
    # Zoom MƯỢT (ESV mục 6): biến đổi phối cảnh dưới điểm ảnh, làm trên khung gốc (vd 1216x2160) rồi mới thu về 1080x1920.
    # Không làm tròn kích thước theo từng khung (làm tròn gây giật 1–2 px). q = 1 − 1/z(t); tâm zoom A = mặt.
    Ax, Ay = ax * cw, ay * chh

    def persp_at(v="(in-1)"):  # v = biến khung 30 fps; lần đo nền logo chạy ít khung/s hơn → đổi về khung 30 fps tương ứng
        q = f"(1-1/{zoom_expr(zooms, v)})"
        return (f"perspective=x0='{Ax:.3f}*{q}':y0='{Ay:.3f}*{q}':x1='{cw}-{cw - Ax:.3f}*{q}':y1='{Ay:.3f}*{q}':"
                f"x2='{Ax:.3f}*{q}':y2='{chh}-{chh - Ay:.3f}*{q}':x3='{cw}-{cw - Ax:.3f}*{q}':y3='{chh}-{chh - Ay:.3f}*{q}':interpolation=cubic:eval=frame")
    persp = persp_at()
    vf = ["fps=30"] + ([cropf] if cropf else []) + GRADE + ["format=yuv444p", persp, f"scale={OW}:{OH}:flags=lanczos", "unsharp=5:5:0.3", "setsar=1",
           "setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709"]
    logo_w = LAY["logo_w"]
    # B-roll (ESV/SK-MED-03): cắt cảnh toàn khung theo kế hoạch, hiện/tắt mờ 0,2 s; phụ đề, chữ nhấn, logo vẫn nằm trên.
    manifest = {}
    mf = os.path.join(broll_dir, "manifest.json")
    if os.path.exists(mf):
        manifest = {m["file"]: m for m in json.load(open(mf, encoding="utf-8"))}
    brolls, b_args, b_fc, last = [], [], "", "bg0"
    if FULL:  # R5.1 / R6.3: 16:9 không B-roll toàn khung — ảnh nằm trong thẻ M1–M6 đã vẽ ở lớp chữ
        brolls = [{"t0": round(c.t0, 2), "t1": round(c.t1, 2), "file": ", ".join(c.files), "template": c.kind, "license": c.license, "source": c.source} for c in cards]
        if m3:
            lib_ = {m["file"]: m for m in broll_library(broll_dir)}
            ends = [m3["tiles"][k + 3]["t"] - 0.3 if k + 3 < len(m3["tiles"]) else m3["t1"] for k in range(len(m3["tiles"]))]
            brolls += [{"t0": round(x["t"], 2), "t1": round(ends[k], 2), "file": x["file"], "template": "M3", "license": lib_[x["file"]].get("license", ""), "source": lib_[x["file"]].get("source", "")} for k, x in enumerate(m3["tiles"])]
            brolls.sort(key=lambda b: b["t0"])
    for k, b in enumerate([] if FULL else plan.get("broll", [])):
        fpath = os.path.join(broll_dir, b["file"])
        meta = manifest.get(b["file"], {})
        if not os.path.isfile(fpath) or not str(meta.get("license", "")).strip() or meta.get("exclude"):
            sys.stderr.write(f"Bỏ B-roll {b['file']}: thiếu tệp, chưa ghi giấy phép hoặc bị loại ({meta.get('exclude', '')})\n")
            continue
        d = float(b["t1"]) - float(b["t0"])
        idx = 4 + len(brolls)
        start = float(b.get("from", 0))
        if fpath.lower().endswith(IMG_EXT):
            clip = job.p("work", f"anh_{k:02d}.mp4")
            image_clip(fpath, clip, d)
            fpath, start = clip, 0.0
        b_args += ["-ss", f"{start:.3f}", "-t", f"{d:.3f}", "-i", fpath]
        b_fc += (f"[{idx}:v]fps=30,scale={OW}:{OH}:force_original_aspect_ratio=increase:flags=lanczos,crop={OW}:{OH},setsar=1,format=yuva420p,"
                 f"fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st={max(0, d - 0.2):.3f}:d=0.2:alpha=1,setpts=PTS-STARTPTS+{float(b['t0']):.3f}/TB[b{k}];"
                 f"[{last}][b{k}]overlay=0:0:enable='between(t,{float(b['t0']):.3f},{float(b['t1']):.3f})':eof_action=pass[bg{k + 1}];")
        last = f"bg{k + 1}"
        brolls.append({**b, "license": meta.get("license", ""), "source": meta.get("source", "")})
    n_in = 4 + (0 if FULL else len(brolls))  # 16:9: ảnh nằm trong thẻ ở lớp chữ, không thêm đầu vào ffmpeg
    for k, fsd in enumerate(fs_events):
        t0_, d_ = float(fsd["t0"]), float(fsd["t1"]) - float(fsd["t0"])
        job.progress("encode", f"Dựng khung FS-06 {k + 1}/{len(fs_events)}", 78)
        clip = job.p("work", f"fs_{k}.mp4")
        fs06_clip(src, cropf, t0_, d_, clip, fsd["type"])
        b_args += ["-i", clip]
        b_fc += (f"[{n_in}:v]fps=30,scale={OW}:{OH}:flags=lanczos,setsar=1,format=yuv420p,setpts=PTS-STARTPTS+{t0_:.3f}/TB[fs{k}];"
                 f"[{last}][fs{k}]overlay=0:0:enable='between(t,{t0_:.3f},{t0_ + d_:.3f})':eof_action=pass[fsb{k}];")
        last, n_in = f"fsb{k}", n_in + 1
    for k, lk in enumerate(leaks):
        t0_ = float(lk["t0"])
        clip = job.p("work", f"leak_{k}.mov")
        leak_clip(clip, 3.6)
        b_args += ["-i", clip]
        b_fc += (f"[{n_in}:v]format=rgba,scale={OW}:{OH}:flags=lanczos,setpts=PTS-STARTPTS+{t0_:.3f}/TB[lk{k}];"
                 f"[{last}][lk{k}]overlay=0:0:format=auto:enable='between(t,{t0_:.3f},{t0_ + 3.6:.3f})':eof_action=pass[lkb{k}];")
        last, n_in = f"lkb{k}", n_in + 1
    # A16.1.4 logo sáng / tối theo cảnh: đo nền ĐÚNG vùng logo trên chính nền sẽ xuất (khung, cân màu, zoom, B-roll, FS, vệt sáng —
    # chưa có logo / chữ), LOGO_SPS mẫu/s, trung bình theo hình logo → lịch đoạn sáng / tối (giữ ≥ 2 s, chuyển mờ 0,2 s).
    logo_in = [os.path.abspath(a.logo)]
    logo_sched, logo_meas, logo_dark_path = [(0.0, round(dur, 3), "light")], None, ""
    if logo_w:
        lw0, lh0 = Image.open(a.logo).size
        bx, by, bw = LAY["logo_x"] * Q, LAY["logo_y"] * Q, logo_w * Q
        bh = int(round(bw * lh0 / lw0))
        sw = min(160, bw)
        sh_ = max(4, int(round(bh * sw / bw)))
        bw_, bh_ = min(bw, OW - bx), min(bh, OH - by)
        lmask = np.asarray(Image.open(a.logo).convert("RGBA").getchannel("A").resize((sw, sh_), Image.BOX), np.float32) / 255.0
        try:
            job.progress("encode", "Đo nền vùng logo theo cảnh (logo sáng / tối)", 77)
            ns = max(1, int(math.ceil(dur * LOGO_SPS)))
            # zoom tính theo SỐ KHUNG của perspective: ở {LOGO_SPS} khung/s phải đổi về khung 30 fps, không thì zoom lệch ×{FPS}/{LOGO_SPS} (phản biện 25/10 P2-1)
            vf_m = [persp_at(f"((in-1)*{FPS / LOGO_SPS:g})") if x is persp else x for x in vf[1:]]
            fc_m = (f"[0:v]{','.join([f'fps={LOGO_SPS}'] + vf_m)}[bg0];{b_fc}[{last}]null[bgm];"
                    f"[bgm]format=rgb24,crop={bw_}:{bh_}:{bx}:{by}:exact=1,scale={sw}:{sh_}:flags=area[m]")  # rgb trước khi cắt: yuv420p làm tròn x/y lẻ
            r_ = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-loop", "1", "-i", a.logo, "-framerate", str(FPS), "-start_number", "0",
                                 "-i", os.path.join(tdir, "%06d.png"), "-i", final, *b_args, "-filter_complex", fc_m, "-map", "[m]",
                                 "-frames:v", str(ns), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
            fsz = sw * sh_ * 3
            raw_ = r_.stdout
            if r_.returncode != 0 or len(raw_) < fsz:
                raise RuntimeError((r_.stderr or b"").decode("utf-8", "replace")[-300:] or "không có khung")
            bgv = [luma_rel(np.frombuffer(raw_[i * fsz:(i + 1) * fsz], np.uint8).reshape(sh_, sw, 3), lmask) for i in range(len(raw_) // fsz)]
            logo_sched = logo_schedule([v[0] for v in bgv], dur)
            logo_meas = {"box": [bx, by, bw_, bh_], "sample": [sw, sh_], "bg": bgv}
        except Exception as e_:
            logo_meas = {"error": str(e_)[:300]}
        try:
            dpath, dnote = dark_logo(a.logo, a.logo_dark, job.p("work"))
            logo_dark_path = os.path.abspath(dpath)
        except Exception as e_:  # không có bản tối dùng được → giữ logo sáng cả video, ghi lý do ở bảng kiểm N
            logo_sched, logo_dark_path = [(0.0, round(dur, 3), "light")], ""
            logo_meas = {"error": f"không có bản logo tối: {e_}"[:300]}
        if any(s_[2] == "dark" for s_ in logo_sched):
            logo_in.append(logo_dark_path)
            logo_meas["dark"] = dnote
    lx_expr = f"{LAY['logo_x'] * Q}-{12 * Q}*pow(1-min(max((t-0.3)/0.6\\,0)\\,1)\\,3)"
    fc = (f"[0:v]{','.join(vf)}[bg0];{b_fc}[{last}]null[bg];"
          + (logo_filter(logo_sched, "1:v", f"{n_in}:v", logo_w * Q, lx_expr, LAY["logo_y"] * Q) if logo_w else "[bg]null[l];")
          + (f"[2:v]format=rgba[tx];" if ((LAY["s"] == 1.0 or FULL) and Q == 1) else f"[2:v]format=rgba,scale=iw*{(1.0 if FULL else LAY['s']) * Q}:ih*{(1.0 if FULL else LAY['s']) * Q}:flags=lanczos[tx];")
          + f"[l][tx]overlay={0 if FULL else LAY['tx'] * Q}:{0 if FULL else LAY['ty'] * Q}:format=auto,fade=t=out:st={max(0.0, dur - 0.9):.3f}:d=0.9,format=yuv420p[v]")
    master = job.p("master.mp4")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-loop", "1", "-i", a.logo, "-framerate", str(FPS), "-start_number", "0", "-i", os.path.join(tdir, "%06d.png"),
          "-i", final, *b_args, *(["-loop", "1", "-i", logo_in[1]] if len(logo_in) > 1 else []),
          "-filter_complex", fc, "-map", "[v]", "-map", "3:a", "-frames:v", str(N),
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

    # Bản xem nhẹ (Phần chung A3.4): 9:16 → 540×960 CRF 26 AAC 96k; 16:9 → 720p (Ngang R1.14); tỷ lệ khác: nửa cỡ (chiều chẵn)
    PW, PH = (1280, 720) if a.aspect == "16:9" else (half(CW), half(CH))
    job.progress("preview", f"Bản xem nhanh {PW}x{PH}, ảnh mốc", 88)
    preview = job.p("preview.mp4")
    P.sh(["ffmpeg", "-v", "error", "-y", "-i", master, "-vf", f"scale={PW}:{PH}:flags=lanczos", "-c:v", "libx264", "-profile:v", "main", "-level", "3.1" if PH <= 960 else "4.0", "-preset", "slow", "-crf", "26" if a.aspect != "16:9" else "23",
          "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-af", "aresample=192000,alimiter=limit=0.66:attack=1:release=60:level=false,aresample=48000", "-movflags", "+faststart", preview])
    # AAC có thể đẩy đỉnh vượt vài dB ở vài chỗ (đã gặp: 0,0 dBTP dù bộ chặn ra −3,6): đo lại, vượt thì nén lại riêng tiếng với ngưỡng thấp hơn
    lim = 0.66
    for _ in range(3):
        _pI, _pTP = P.ebur(preview)
        if _pTP is None or _pTP <= -1.2:
            break
        lim *= 0.8
        tmp_prev = job.p("work", "preview_fix.mp4")
        P.sh(["ffmpeg", "-v", "error", "-y", "-i", preview, "-i", master, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "96k",
              "-af", f"aresample=192000,alimiter=limit={lim:.3f}:attack=1:release=60:level=false,aresample=48000", "-movflags", "+faststart", tmp_prev])
        os.replace(tmp_prev, preview)
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
    add("A", f"{OW}x{OH} ({a.aspect}{', 4K' if Q == 2 else ''}), 30 fps, H.264, số khung đúng", "pass" if (mw, mh) == (OW, OH) and mr == "30/1" and nfr == N else "fail",
        f"{mw}x{mh}, {mr}, {nfr}/{N} khung" + (f"; {quality_note}" if a.quality == "4k" else ""))
    errs = P.decode_errors(master) + P.decode_errors(preview)
    add("B", "Giải mã toàn bộ", "pass" if not errs else "fail", "0 lỗi" if not errs else "; ".join(errs[:3]))
    bd = P.sh(["ffmpeg", "-hide_banner", "-i", master, "-vf", "blackdetect=d=0.3:pix_th=0.08,freezedetect=n=0.001:d=1.5", "-an", "-f", "null", "-"]).stderr
    # Bỏ qua đoạn kết mờ sang đen có chủ đích (1,2 s cuối)
    blk = [float(x) for x in re.findall(r"black_start:([\d.]+)", bd) if float(x) < dur - 1.2]
    frz = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", bd) if float(x) < dur - 1.2]
    add("C", "Khung đen / đứng hình", "pass" if not blk and not frz else "fail",
        "không có (trừ kết mờ sang đen có chủ đích)" if not blk and not frz else f"đen tại {blk[:5]}, đứng hình tại {frz[:5]}")
    mI, mTP = P.ebur(master)
    pI, pTP = P.ebur(preview)
    add("D", "−16 LUFS ±1, đỉnh ≤ −2,0 (chính) / ≤ −1,0 (xem nhanh)", "pass" if mI is not None and abs(mI + 16) <= 1 and mTP <= -2.0 and pTP <= -1.0 else "fail", f"chính {mI} LUFS TP {mTP}; xem nhanh TP {pTP}")
    add("E", "Phụ đề / chữ nhấn theo mốc từng từ", "pass", f"{len(units)} câu phụ đề, {len(emph)} chữ nhấn, {len(dias)} sơ đồ; đặt theo mốc từ đã nghe rõ")
    od = owner_decisions(os.environ.get("DATA_DIR", os.path.join(P.ROOT, "data")))
    odq = f"OWNER duyệt {od.get('date', '')}: {od.get('quote', '')}"
    if not LAY["logo_w"]:
        add("F", "Bố cục: logo vùng XANH, chữ vùng VÀNG", "pass", "16:9: không chèn logo tới khi có vị trí chuẩn (Skill Edit Video Ngang R8.6, #34c)")
    else:
        lw0, lh0 = Image.open(a.logo).size
        lb = (LAY["logo_x"], LAY["logo_y"], LAY["logo_x"] + LAY["logo_w"], LAY["logo_y"] + round(LAY["logo_w"] * lh0 / lw0))
        if a.aspect == "9:16":
            inside = lb[0] >= 64 and lb[1] >= 51 and lb[2] <= 425 and lb[3] <= 248
            add("F", "Bố cục: logo vùng XANH, chữ vùng VÀNG", "pass" if inside else "fail",
                f"logo rộng {LAY['logo_w']} tại ({lb[0]},{lb[1]}) hộp x{lb[0]}–{lb[2]} y{lb[1]}–{lb[3]} {'trong' if inside else 'NGOÀI'} XANH x64–425 y51–248 (Skill ESV v0.1.r2 B7)")
        else:
            add("F", "Bố cục: logo vùng XANH, chữ vùng VÀNG", "pass", f"logo rộng {LAY['logo_w']} tại ({lb[0]},{lb[1]}) — tỷ lệ {a.aspect}: thu theo khung [AI SUY LUẬN, skill chưa có số]")
    if FULL:
        add("G", "Chữ / đồ hoạ / thẻ ảnh trong title-safe 5 % (Ngang R3.0.2, R9.2)", "pass" if bad_zone == 0 else "fail",
            f"{bad_zone} khung có điểm ảnh (α > 40) ngoài (96,54)–(1824,1026)" + (f": {bad_safe[:6]}" if bad_safe else ""))
    else:
        add("G", "Đồ hoạ trong VÀNG", "pass" if bad_zone == 0 else "fail", f"{bad_zone} khung có điểm ảnh ngoài VÀNG (+19 px)")
    add("H", "Phụ đề không chồng chữ nhấn / đồ hoạ", "pass" if overlap == 0 else "fail", f"{overlap} khung chồng")
    if FULL:
        add("I", "Quét điểm ảnh chữ ngoài VÀNG", "na", "16:9 không có vùng VÀNG cố định (C-K.3) — đo title-safe ở G")
    else:
        add("I", "Quét điểm ảnh chữ ngoài VÀNG", "pass" if bad_zone == 0 else "fail", f"{bad_zone} khung")
    # J: dò mặt trên bản chính mỗi 0,5 s
    import cv2
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    out_red, sampled, dets, bad_t = 0, 0, [], []
    for k in range(int(dur * 2)):
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{k / 2:.2f}", "-i", master, "-frames:v", "1", "-vf", f"scale={half(CW)}:{half(CH)}", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
        if not r.stdout:
            continue
        g = cv2.imdecode(np.frombuffer(r.stdout, np.uint8), cv2.IMREAD_GRAYSCALE)
        fcs = cas.detectMultiScale(g, 1.1, 6, minSize=(60, 60))
        if len(fcs):
            dets.append((k / 2, [tuple(int(v) for v in q) for q in fcs]))
    # Nhiều "mặt" trong một mẫu (vd hai bàn tay khum bị dò nhầm): chọn mặt gần tâm mặt quen của người nói (trung vị các mẫu chỉ có 1 mặt)
    one = [d[0] for _, d in dets if len(d) == 1] or [max(d, key=lambda q: q[2] * q[3]) for _, d in dets]
    mx = float(np.median([q[0] + q[2] / 2 for q in one])) if one else CW / 4
    my = float(np.median([q[1] + q[3] / 2 for q in one])) if one else CH / 6
    med_w = float(np.median([q[2] for q in one])) if one else 60.0
    if a.aspect != "9:16":
        import ngang as NG
        flt = NG.plausible([(t_, [(q[0], q[1], q[0] + q[2], q[1] + q[3]) for q in d]) for t_, d in dets])
        plaus_at = {t_: [(q[0], q[1], q[2] - q[0], q[3] - q[1]) for q in b] for t_, b in flt}
    for d_t, d in dets:
        sampled += 1
        x, y, w_, h_ = min(d, key=lambda q: (q[0] + q[2] / 2 - mx) ** 2 + (q[1] + q[3] / 2 - my) ** 2)
        if a.aspect == "9:16":
            if y * 2 < LAY["red"][0] - 4 or (y + h_) * 2 > LAY["red"][1] + 4:
                out_red += 1
                bad_t.append(d_t)
        else:
            # Tỷ lệ khác: đúng luật gốc "không chữ, không đồ hoạ đè mặt" — mặt giao với hộp chữ / đồ hoạ thật của khung đó
            fb = frame_boxes.get(int(round(d_t * FPS / 15)) * 15, [])
            hit = False
            # Chỉ tính "mặt" có cỡ và độ cao giống mặt người nói (trung vị các mẫu): hai bàn tay khum ngang ngực bị máy dò nhận
            # nhầm là mặt (đã thấy trên B1 4:5 ở 114,5 s và 152,5 s — chữ nằm dưới cằm). Nhiều người cùng khung vẫn được kiểm
            # vì mặt thật của họ cùng tầm.
            # mặt CẬN (to hơn hẳn trung vị, vd cảnh selfie) luôn được tính ở mọi vị trí — không che lỗi thật
            # cùng luật lọc với lúc đặt (ngang.plausible), trung vị theo cửa sổ ±3 s (phản biện P2-1)
            boxes_out = [(x * 2, y * 2, (x + w_) * 2, (y + h_) * 2) for (x, y, w_, h_) in plaus_at.get(d_t, [])]
            if FULL and not (m3 and m3["t0"] <= d_t < m3["t1"]):  # + mặt dò trên nguồn (đã áp zoom) — bắt được thẻ che KÍN mặt (phản biện P2-3)
                boxes_out += NG.faces_at(track169, d_t, zoom_at(zooms, int(d_t * FPS)), (ax * CW, ay * CH))
            for (fx0, fy0, fx1, fy1) in boxes_out:
                for bx0, by0, bx1, by1 in fb:
                    if FULL:
                        X0, X1, Y0, Y1 = bx0, bx1, by0, by1
                    else:
                        X0, X1 = LAY["tx"] + bx0 * LAY["s"], LAY["tx"] + bx1 * LAY["s"]
                        Y0, Y1 = LAY["ty"] + (by0 - BAND_Y0) * LAY["s"], LAY["ty"] + (by1 - BAND_Y0) * LAY["s"]
                    if X0 < fx1 - 6 and fx0 + 6 < X1 and Y0 < fy1 - 6 and fy0 + 6 < Y1:
                        hit = True
            out_red += hit
            if hit:
                bad_t.append(d_t)
    if FULL:  # thời điểm bản chính KHÔNG thấy mặt (có thể vì bị thẻ che kín) nhưng nguồn có mặt: đo theo mặt nguồn
        seen = {round(t_, 2) for t_, _ in dets}
        for t_, b in track169:
            if not b or round(t_, 2) in seen or t_ >= dur or (m3 and m3["t0"] <= t_ < m3["t1"]):
                continue
            sampled += 1
            fb = frame_boxes.get(int(round(t_ * FPS / 15)) * 15, [])
            z_ = zoom_at(zooms, int(t_ * FPS))
            fbx = NG.faces_at([(t_, b)], t_, z_, (ax * CW, ay * CH))
            if any(X0 < fx1 - 6 and fx0 + 6 < X1 and Y0 < fy1 - 6 and fy0 + 6 < Y1 for (fx0, fy0, fx1, fy1) in fbx for (X0, Y0, X1, Y1) in fb):
                out_red += 1
                bad_t.append(t_)
    j_name = "Mặt trong vùng ĐỎ ở mọi khung zoom" if a.aspect == "9:16" else "Không chữ / đồ hoạ đè mặt (đo giao hộp mặt với chữ thật)"
    add("J", j_name, ("pass" if out_red == 0 else "fail") if sampled else "unmeasured", f"{sampled} mẫu có mặt, {out_red} mẫu {'lệch ĐỎ' if a.aspect == '9:16' else 'có chữ đè mặt'}{(' tại ' + ', '.join(f'{t:.1f}s' for t in bad_t[:8])) if bad_t else ''}; tâm zoom theo mặt {'(dò được)' if face_ok else '(không dò được, giả định)'}")
    # S, T theo bảng kiểm Skill ESV v0.1.r2 B9 (cân màu chuyển sang V)
    if sfx_info.get("used"):
        w_ = sfx_info.get("worstVsVoiceDb")  # Phần chung A6.3: trần −19 dB (đích −21, chốt −19,6)
        lowm = sfx_info.get("belowMusic8Db") or []
        add("S", "SFX: mỗi cú ≤ −19 dB so giọng (trượt 100 ms); 0 SFX trên zoom; ≥ +8 dB so nhạc", "pass" if w_ is not None and w_ <= -19.0 else "fail",
            f"{sfx_info['count']} cú (chữ nhấn / khung vẽ / thẻ ảnh / khung toàn màn hình), cú to nhất {w_} dB so giọng; 0 cú trên zoom (zoom không sinh SFX)"
            + (f"; {len(lowm)} cú chưa cao hơn nhạc 8 dB tại {lowm[:5]} (không tăng để giữ ≤ −19 dB)" if lowm else "")
            + (f"; bỏ {len(sfx_info['dropped'])} cú rơi vào khoảng lặng" if sfx_info.get("dropped") else "") + "; SFX chưa được OWNER nghe duyệt (D-14)")
    else:
        add("S", "SFX: mỗi cú ≤ −19 dB so giọng; 0 SFX trên zoom", "na", sfx_info.get("reason", "không có cú SFX"))
    add("T", "Phụ đề không phát sáng; PA B \\pos(540,1600)" if a.aspect != "16:9" else "Phụ đề không phát sáng; \\an2\\pos(960,1015) (Ngang R8.1)", "pass",
        ("không lớp phát sáng; đáy phụ đề y1600 @1080x1920 (PA B)" + ("" if a.aspect == "9:16" else f" trong dải chữ thu ×{LAY['s']} cho {a.aspect}")) if a.aspect != "16:9" else
        "16:9: không lớp phát sáng; Times Italic 48 (96 @4K), đáy y1015 (y2030 @4K) — số skill ghi CHƯA DỰNG THỬ, nay đã dựng thật (1017)")
    add("V", "Cân sáng / màu nhẹ (đo trước, chỉ chỉnh khi lệch rõ)", "info", grade_note)
    add("K", "So với bản trước", "na", "chưa so khung tự động với bản trước (dựng lại từ RAW)")
    add("L", "Độ đọc chữ trắng trên nền sáng", "info", "kiểm bằng mắt khi duyệt")
    add("M", "Tiếng giống từng byte khi chỉ sửa hình", "na", "dựng từ RAW")
    if logo_w:
        try:  # đo kiểm không được làm chết lần dựng (lỗi thật 25/10 v_mvnu9i50atbkj v6: bản sửa dở chết ở đây) → ghi chưa đo + lý do
            n_status, n_detail = logo_check(master, logo_sched, logo_meas, [logo_in[0], logo_dark_path], dur)
        except Exception as e_:
            n_status, n_detail = "unmeasured", f"lỗi khi đo lại logo trên bản chính ({type(e_).__name__}: {str(e_)[:160]}); lịch đã dùng {[list(x) for x in logo_sched]}"
    else:
        n_status, n_detail = "na", f"{a.aspect}: không chèn logo tới khi có vị trí chuẩn (Skill Edit Video Ngang R8.6, #34c)" if a.aspect == "16:9" else "không chèn logo"
    add("N", "Màu logo theo nền (A16.1.4: nền sáng → logo tối, nền tối → logo sáng)", n_status, n_detail)
    add("O", "Không lộ tên người / bí mật", "unmeasured", "cần người xem phụ đề")
    b_note = "; ".join(f"minh hoạ {b['t0']:.1f}–{b['t1']:.1f}s {b['file']}" for b in brolls) or "không minh hoạ"
    m_note = (f"nhạc {music_info['file']} ({music_info.get('chosenBy', '')})" + (f"; gợi ý nghe duyệt: {', '.join(music_info['suggest'])}" if music_info.get("suggest") else "")
              if music_info.get("used") else f"không nhạc ({music_info['reason']})")
    pending_media = [b["file"] for b in brolls if "chờ OWNER" in str(b.get("license", ""))] + ([music_info["file"]] if music_info.get("used") and "chờ OWNER" in str(music_info["license"]) else [])
    # Kiểm CẢ HAI font bộ dựng dùng (thường + đậm): thiếu một nửa bộ Tinos thì phần đậm rơi về Times → chưa có giấy phép
    srcs = [font_source(n) for n in ("Times New Roman Italic.ttf", "Times New Roman Bold Italic.ttf")]
    font_name = " + ".join(x[1] for x in srcs)
    font_lic = srcs[0][2] if all(x[2] for x in srcs) else ""
    font_ok = bool(font_lic) or bool(od.get("fontLicense"))
    p_ok = font_ok and not pending_media
    font_note = f"font {font_name}: {font_lic}" if font_lic else f"font {font_name}: {'OWNER xác nhận' if od.get('fontLicense') else 'chưa có giấy phép thương mại'}"
    add("P", "Nhạc / B-roll / font có giấy phép", "pass" if p_ok else "blocker",
        f"{font_note}; {m_note}; {b_note}; SFX: {sfx_info.get('source', 'không')}" + (f" — {odq}" if p_ok and not font_lic else ""))
    add("Q", "Câu doanh thu / thu nhập / kết quả có dòng 'Kết quả cá nhân, không cam kết'", "pass",
        "không phát sinh" if not rev_spans else f"{len(rev_spans)} đoạn có dòng phủ suốt câu: {[[round(a_, 1), round(b_, 1)] for a_, b_ in rev_spans][:6]}"
        + (" (hộp đen bo R11 tại x100–628 y861–919, Ngang R8.5)" if FULL else " (vị trí tạm: đỉnh vùng chữ, chờ OWNER chốt)"))
    onscreen = [e.text for e in emph] + [x for d in plan.get("diagrams", []) for x in
                [d.get("wrong", {}).get("text", ""), d.get("top", {}).get("text", ""), d.get("bottom", {}).get("text", ""), d.get("mid", {}).get("text", "") if d.get("mid") else ""]
                + [r["text"] for r in d.get("right", [])] + [st["text"] for st in d.get("steps", [])] + [d.get("text", "") if d.get("type") in ("chapter", "quote") else ""]]
    nums = [x for x in onscreen if re.search(r"\d", x or "")]
    add("R", "A21: số trên màn hình khớp kịch bản / SRT đã duyệt", "pass" if not nums else "unmeasured",
        "không phát sinh (số thứ tự trong thanh bước / thẻ chương không phải số liệu)" if not nums else f"CHƯA KIỂM — chờ bản đối chiếu OWNER duyệt: {nums}")
    uncertain = [{"t": round(w["start"], 2), "text": w["text"], "p": round(w.get("p", 0), 2)} for w in words if w.get("uncertain")]
    blockers = []
    if not font_ok:
        blockers.append("Font Times New Roman chưa có giấy phép thương mại")
    if pending_media:
        blockers.append(f"Tư liệu chờ OWNER xác nhận quyền dùng: {', '.join(pending_media[:4])}")
    if uncertain and not od.get("uncertainWords"):
        blockers.insert(0, f"{len(uncertain)} từ nghe chưa chắc đã bỏ khỏi phụ đề/chữ nhấn — cần OWNER nghe lại (#90, #92)")
    failed = [q["id"] for q in qa if q["status"] == "fail"]
    with open(job.p("checksums.sha256"), "w") as fsum:
        for name in ("master.mp4", "preview.mp4"):
            fsum.write(f"{P.sha256(job.p(name))}  {name}\n")
    report = {
        "skill": ({"skillId": "edu-hau-ky-video-916-phu-luc", "name": "Skill ESV", "version": "v0.1.r2 (22/10/2026)", "status": "ACTIVE — OWNER duyệt 22/10/2026 18:14", "sourceUrl": "https://app.notion.com/p/4004ceb9517d81198fc4da9f9339234e", "engine": "esv_render.py (Pillow, không ASS)"}
                  if a.aspect != "16:9" else
                  {"name": "Skill Edit Video Ngang", "version": "v0.1.r2 (22/10/2026)", "status": "ACTIVE — OWNER duyệt 22/10/2026 18:14", "sourceUrl": "https://app.notion.com/p/4004ceb9517d81849441f9d0f3757538", "engine": "esv_render.py + ngang.py (Pillow, không ASS) — thẻ ảnh M1–M6 (M3 split khúc cuối); CHƯA có K1–K10 (skill CHƯA CHỐT)"}),
        "input": {"file": os.path.basename(src), **info, "crop": cropf},
        "output": {"master": "master.mp4", "preview": "preview.mp4", "aspect": a.aspect, "width": OW, "height": OH, "quality": quality_note, "crop": cropf, "frames": N, "seconds": round(dur, 3), "cutSilence": bool(keep), "cuts": len(cut_times), "sourceSeconds": round(src_dur, 3),
                   "keep": [[a_, b_] for a_, b_ in keep] if keep else None},
        "transcript": {"words": len(words), "uncertain": uncertain, "corrections": fixes, "secondModel": None if a.words else a.model2,
                       "script": bool(script_text), "scriptFixes": script_fixes[:200]},
        "captions": {"units": len(units)},
        "emphasis": [{"t": round(e.t0, 2), "text": e.text, "kind": e.style} for e in emph],
        "broll": {"events": brolls, "skipped": card_skips},
        "diagrams": [{"type": d["type"], "t0": d["t0"], "t1": d.get("t1", d["t0"] + 3.6)} for d in plan.get("diagrams", [])],
        "emphasisDropped": n_emph_plan - len(emph),
        "zoom": {"formula": "r3 smootherstep, một tâm, không zoom thở", "profile": prof, "pace": pace, "events": zooms, "anchor": [round(ax, 3), round(ay, 3)], "faceDetected": face_ok},
        "logo": {"schedule": [list(x) for x in logo_sched], "files": [os.path.basename(x) for x in logo_in],
                 "bgLuma": [round(v[0], 3) for v in (logo_meas or {}).get("bg", [])], "darkSource": (logo_meas or {}).get("dark", "")} if logo_w else None,
        "audio": {"lufs": mI, "truePeak": mTP, "previewTruePeak": pTP, "music": music_info, "sfx": sfx_info},
        "plan": {"by": plan.get("by", ""), "note": plan.get("note", "")},
        "aiRun": ai_run,  # mô hình biên tập đã chạy TRONG lần dựng này (ghi sổ Đội AI: AI Edit Video, ₫0 vì chạy tại máy)
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
