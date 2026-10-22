"""Khung ngang 16:9 theo "Skill Edit Video Ngang" v0.1.r2 (Notion 02 SKILL, ACTIVE — OWNER duyệt 22/10/2026 18:14).

Số đo của skill ghi ở 3840×2160; bộ dựng xuất 1920×1080 nên mọi số dưới đây = số skill ÷ 2.
- Phụ đề (R8.1): Times Italic 96 @4K → 48, \\an2\\pos(1920,2030) → đáy y1015; vùng cấm vẽ y ≥ 1925 @4K → 962.
- Chữ nhấn (R8.3–R8.4): Times Bold Italic 168 → 84, \\an1, đứng x266 → 133, bay vào từ x326 → 163, đáy y1790 → 895.
- Dòng miễn trừ (R8.5): Times Italic 84 → 42 trắng \\an4 (230,1780) → (115,890) trên hộp đen alpha &H38& bo R22 → 11,
  x200–1257 / y1722–1838 → x100–628 / y861–919.
- Title-safe 5 % (R3.0.2): (192,108,3648,2052) → (96,54,1824,1026).
- Ảnh chỉ nằm trong KHUNG cạnh người nói (R5.1): không B-roll toàn khung, không nền mờ toàn khung (R6.3); không che mặt (R5.2);
  0 ảnh trong đoạn doanh thu (R5.4); không đặt khi đang có khung vẽ (A10 luật phối 4).
- 6 mẫu M1–M6 (Kho khung animation, C3): ở đây dựng M1, M2, M4, M5 (điện thoại), M6. M3 (split khúc cuối) CHƯA dựng.
  Mọi số chuyển động / kích thước theo C3 (ghi [AI SUY LUẬN, đã dùng ở DEMO v4.1] trong skill — MẪU THAM KHẢO, chưa phải chuẩn OWNER chốt).
- Chỗ lệch có chủ ý (ghi vào báo cáo): M1 "kính" cần video ngay dưới thẻ làm mờ — lớp chữ dựng tách khỏi video nên viền dùng
  trắng mờ đục 32 % [AI SUY LUẬN]; nhãn M4 dùng Tinos Bold (SIL OFL) thay Playfair Display SC (chưa có tệp font có giấy phép trong máy).
"""
import math
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

CW, CH = 1920, 1080
SAFE = (96, 54, 1824, 1026)
SUB_FS, SUB_BOTTOM, SUB_FORBID_Y = 48, 1015, 962
EMP_FS, EMP_X, EMP_X_IN, EMP_BOTTOM = 84, 133, 163, 895
DISC = {"fs": 42, "box": (100, 861, 628, 919), "x": 115, "cy": 890, "alpha": 1 - 0x38 / 255, "r": 11}
BAND_1P = (125, 510, 820, 890)   # dải sơ đồ cảnh 1 người (C-K.1: x250–1640, y1020–1780 @4K)
GOLD = (212, 175, 55)
FONT = None  # esv_render gán hàm font() (đã xử lý font có giấy phép Tinos) trước khi dựng
NAVY = (11, 26, 51)


# ---------------------------------------------------------------- easing (C3.0 R3.0.6)

def ss(u):
    u = min(1.0, max(0.0, u))
    return u ** 3 * (u * (u * 6 - 15) + 10)


def eoc(u):
    u = min(1.0, max(0.0, u))
    return 1 - (1 - u) ** 3


def eic(u):
    u = min(1.0, max(0.0, u))
    return u ** 3


def eob(u, s=1.4):
    u = min(1.0, max(0.0, u))
    return 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2


def spring(t, zeta=0.55, omega=13.0):
    """Lò xo tắt dần ζ 0,55, ω 13 rad/s: 0 → 1, vượt ~10 %, lắng ~0,6 s."""
    if t <= 0:
        return 0.0
    wd = omega * math.sqrt(1 - zeta ** 2)
    return 1 - math.exp(-zeta * omega * t) * (math.cos(wd * t) + zeta / math.sqrt(1 - zeta ** 2) * math.sin(wd * t))


# ---------------------------------------------------------------- mặt người theo thời gian (dùng để né)

def face_track(src, info, crop, every=0.5):
    """Dò mặt (Haar) mỗi `every` giây trên nguồn đã cắt khung, MỘT lượt giải mã. Trả [(t, [(x0,y0,x1,y1) theo khung xuất 1920×1080 khi z=1])].
    Lọc như skill (R1.4 / A10.4): bỏ hộp quá nhỏ, co 12 % mỗi cạnh để hộp sát mặt hơn rồi mới cộng lề an toàn ở bước đặt."""
    import cv2
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    w_, h_ = 960, 540
    vf = f"fps={1 / every:.4f}," + (f"{crop}," if crop else "") + f"scale={w_}:{h_},format=gray"
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True)
    raw = np.frombuffer(p.stdout, np.uint8)
    n = len(raw) // (w_ * h_)
    out = []
    for k in range(n):
        g = raw[k * w_ * h_:(k + 1) * w_ * h_].reshape(h_, w_)
        fcs = cas.detectMultiScale(g, 1.1, 6, minSize=(48, 48))
        boxes = []
        for (x, y, w, h) in fcs:
            sx = CW / w_
            x0, y0, x1, y1 = x * sx, y * sx, (x + w) * sx, (y + h) * sx
            sh = 0.12 * (x1 - x0)
            boxes.append((x0 + sh, y0 + sh, x1 - sh, y1 - sh))
        out.append((k * every, boxes))
    return plausible(out)


def plausible(samples, win=3.0):
    """Lọc "mặt hợp lý" — dùng CHUNG cho đặt thẻ (face_track) và bảng kiểm J: hộp cùng tầm cao với mặt quen của người nói (lệch tâm
    ≤ 1 bề rộng mặt) và ≥ 35 % cỡ mặt đó, HOẶC mặt cận to hơn hẳn (≥ 1,3×) ở mọi độ cao. Bỏ được tay khum / micro bị dò nhầm (nằm
    thấp) mà vẫn giữ mặt người ngồi cạnh (thường nhỏ hơn hẳn người cầm máy).
    "Mặt quen" = trung vị các mẫu chỉ 1 mặt TRONG CỬA SỔ ±win giây (3 s — đủ ngắn để bám người nói đổi tư thế; không lấy cả video: người nói cúi / đứng / đổi khung thì cả
    đoạn sau bị lọc mất — phản biện 22/10 P2-1). samples: [(t, [(x0,y0,x1,y1)])].
    Lịch sử: lọc theo mặt LỚN NHẤT làm mất mặt người nữ (1017, thẻ che 41–43 s); không lọc thì tay bị coi là mặt (sơ đồ bị đẩy sát mặt)."""
    def ref(t):
        near = [(tt, b) for tt, b in samples if abs(tt - t) <= win]
        one = [b[0] for _, b in near if len(b) == 1] or [max(b, key=lambda q: q[2] - q[0]) for _, b in near if b]
        if not one:
            one = [b[0] for _, b in samples if len(b) == 1] or [max(b, key=lambda q: q[2] - q[0]) for _, b in samples if b]
        if not one:
            return None
        return float(np.median([q[2] - q[0] for q in one])), float(np.median([(q[1] + q[3]) / 2 for q in one]))
    out = []
    for t, b in samples:
        r = ref(t) if b else None
        if not r:
            out.append((t, list(b)))
            continue
        med_w, my = r
        # Giữ: (a) cùng tầm cao với mặt quen (lệch ≤ 1 bề rộng mặt) và không quá bé (≥ 35 %) — người ngồi cạnh / sau thường NHỎ hơn
        # hẳn người cầm máy (selfie): luật cũ "≥ 60 % cỡ" làm mất mặt người nữ 1017 ở 40–44 s, thẻ che kín chị mà J (cùng luật) không thấy;
        # (b) mặt cận to hơn hẳn (≥ 1,3×) ở mọi độ cao. Bỏ: hộp nằm thấp hẳn (tay khum ngang ngực, micro) mà không to.
        out.append((t, [q for q in b if ((q[2] - q[0]) >= 0.35 * med_w and abs((q[1] + q[3]) / 2 - my) <= 1.0 * med_w) or (q[2] - q[0]) >= 1.3 * med_w]))
    return out


def fallback_person(track, A):
    """Không dò được mặt trong cửa sổ: coi vị trí quen của người nói là có người (trung vị mọi hộp mặt đã dò; chưa dò được mặt nào
    thì quanh tâm zoom A — dải ~22 % bề ngang). Không bao giờ coi "không thấy mặt" là "không có người" (phản biện 22/10 P2-2)."""
    allb = [q for _, b in track for q in b]
    if allb:
        return [tuple(float(np.median([q[i] for q in allb])) for i in range(4))]
    w, h = 0.22 * CW, 0.30 * CH
    return [(A[0] - w / 2, A[1] - h / 2, A[0] + w / 2, A[1] + h / 2)]


def faces_at(track, t, zoom=1.0, center=(CW / 2, CH / 2), span=0.0):
    """Hộp mặt trong [t − span, t + span] (mẫu gần nhất nếu span = 0), đã áp zoom quanh tâm."""
    if not track:
        return []
    if span <= 0:
        _, b = min(track, key=lambda s: abs(s[0] - t))
        bs = b
    else:
        bs = [q for tt, b in track if t - span - 0.5 <= tt <= t + span + 0.5 for q in b]
    cx, cy = center
    return [(cx + (x0 - cx) * zoom, cy + (y0 - cy) * zoom, cx + (x1 - cx) * zoom, cy + (y1 - cy) * zoom) for x0, y0, x1, y1 in bs]


# ---------------------------------------------------------------- chỗ trống (R3.0.1)

# Lề quanh thẻ cho bóng đổ / vành / nảy khi vào (px @1080): title-safe tính CẢ bóng và quầng (R3.0.2, R9.0) — đo ở tự kiểm
PAD = {"M1": 48, "M2": 40, "M4": 22, "M5": 58, "M6": 60}


def best_rect(free, ratio, max_w, min_w, face_cx, scale=10, pad=0):
    """Khung lớn nhất đúng tỉ lệ `ratio` (rộng/cao) mà khung nới thêm `pad` mỗi bên vẫn nằm trọn vùng trống (mảng bool ở 1/scale),
    ưu tiên xa mặt theo chiều ngang. Dùng ảnh tích phân như skill (best_rect). Trả (x0, y0, x1, y1) theo px khung hoặc None."""
    H, W = free.shape
    ii = np.pad(np.cumsum(np.cumsum((~free).astype(np.int32), 0), 1), ((1, 0), (1, 0)))
    pc = int(np.ceil(pad / scale))
    best = None
    for wc in range(int(max_w / scale), int(min_w / scale) - 1, -1):
        hc = max(1, int(round(wc / ratio)))
        WW, HH = wc + 2 * pc, hc + 2 * pc
        if HH > H or WW > W:
            continue
        s = ii[HH:, WW:] - ii[:-HH, WW:] - ii[HH:, :-WW] + ii[:-HH, :-WW]
        ys, xs = np.nonzero(s == 0)
        if len(xs):
            cxs = (xs + WW / 2) * scale
            k = int(np.argmax(np.abs(cxs - face_cx)))
            x0, y0 = (xs[k] + pc) * scale, (ys[k] + pc) * scale
            best = (x0, y0, x0 + wc * scale, y0 + hc * scale)
            break
    return best


def free_mask(face_boxes, extra=(), scale=10, margin=45 / 2):
    """Mặt nạ trống: trong title-safe, trên vùng cấm phụ đề, ngoài hộp mặt (+lề, đáy ×1,3) và các hộp `extra` (chữ nhấn đang hiện…)."""
    W, H = CW // scale, CH // scale
    free = np.zeros((H, W), bool)
    free[int(np.ceil(SAFE[1] / scale)):int(SUB_FORBID_Y // scale) - 1, int(np.ceil(SAFE[0] / scale)):int(SAFE[2] // scale)] = True
    for (x0, y0, x1, y1) in list(face_boxes):
        # Cấm cả NGƯỜI, không chỉ hộp mặt: "khung ảnh nằm cạnh người nói, trong vùng trống" (R5.1, R5.3) — tóc + vai + thân
        # xuống tới vùng phụ đề. Dựng thật 1017 (22/10): chỉ cấm hộp mặt thì thẻ M1 che người nữ ở khung máy dò sót mặt.
        w, h = x1 - x0, y1 - y0
        X0, Y0, X1, Y1 = x0 - 0.6 * w - margin, y0 - 0.3 * h - margin, x1 + 0.6 * w + margin, CH
        free[max(0, int(Y0 // scale)):int(np.ceil(Y1 / scale)), max(0, int(X0 // scale)):int(np.ceil(X1 / scale))] = False
    for (x0, y0, x1, y1) in extra:
        free[max(0, int(y0 // scale)):int(np.ceil(y1 / scale)), max(0, int(x0 // scale)):int(np.ceil(x1 / scale))] = False
    return free


# ---------------------------------------------------------------- ảnh trong thẻ

def load_media(path, size, yc=0.38, t0=0.0, dur=0.0):
    """Ảnh (hoặc clip) → khung đúng tỉ lệ `size` ×1,12 cho Ken Burns (R3.0.3). Clip: trả danh sách khung 15 fps."""
    W, H = int(size[0] * 1.12), int(size[1] * 1.12)
    if path.lower().endswith((".mp4", ".mov", ".m4v", ".webm")):
        p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t0:.3f}", "-t", f"{max(0.5, dur):.3f}", "-i", path,
                            "-vf", f"fps=15,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
        n = len(p.stdout) // (W * H * 3)
        fr = [Image.frombuffer("RGB", (W, H), p.stdout[k * W * H * 3:(k + 1) * W * H * 3]).convert("RGBA") for k in range(n)]
        return fr or [Image.new("RGBA", (W, H), (20, 20, 20, 255))]
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    im.thumbnail((2400, 2400))
    ar = W / H
    if im.width / im.height > ar:
        nw = int(im.height * ar)
        x0 = (im.width - nw) // 2
        im = im.crop((x0, 0, x0 + nw, im.height))
    else:
        nh = int(im.width / ar)
        y0 = int(min(max(0, yc * im.height - nh / 2), im.height - nh))
        im = im.crop((0, y0, im.width, y0 + nh))
    return [im.resize((W, H), Image.LANCZOS).convert("RGBA")]


def ken_burns(frames, size, u, z0=1.0, z1=1.07, pan=0.025, sign=1, t=0.0):
    """Ken Burns trong thẻ (R3.0.4): 1,00 → 1,07, lia 2,5 % bề rộng theo smootherstep suốt nhịp."""
    src = frames[min(len(frames) - 1, int(t * 15))] if len(frames) > 1 else frames[0]
    p = ss(u)
    z = z0 + (z1 - z0) * p
    w, h = size
    cw_, ch_ = src.width / (1.12 * z) * 1.0, src.height / (1.12 * z)
    cx = src.width / 2 + sign * (p - 0.5) * pan * src.width
    cy = src.height / 2
    box = (cx - cw_ / 2, cy - ch_ / 2, cx + cw_ / 2, cy + ch_ / 2)
    return src.transform((w, h), Image.EXTENT, box, Image.BILINEAR)


def rounded_mask(size, r, feather=1):
    m = Image.new("L", (size[0] * 2, size[1] * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] * 2 - 1, size[1] * 2 - 1), radius=r * 2, fill=255)
    m = m.resize(size, Image.LANCZOS)
    return m.filter(ImageFilter.GaussianBlur(feather / 2)) if feather else m


def drop_shadow(alpha, opacity, sigma, dy):
    """Bóng = alpha thẻ làm mờ Gauss σ, dời dy, nhân độ đục (R3.0.8). Trả ảnh RGBA lớn hơn (lề 3σ) + độ lệch gốc."""
    pad = int(3 * sigma + abs(dy))
    w, h = alpha.size
    m = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    m.paste(alpha, (pad, pad + int(dy)))
    m = m.filter(ImageFilter.GaussianBlur(sigma)).point(lambda v: int(v * opacity))
    sh = Image.new("RGBA", m.size, (0, 0, 0, 0))
    sh.putalpha(m)
    return sh, pad


def paste_tf(canvas, img, cx, cy, scale=1.0, angle=0.0, alpha=1.0):
    """Đặt ảnh RGBA theo tâm, có scale / xoay / độ mờ (dời dưới-pixel bằng affine, R3.0.7)."""
    if alpha <= 0.003 or img is None:
        return None
    im = img
    if abs(scale - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BILINEAR)
    if abs(angle) > 0.05:
        im = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    if alpha < 0.999:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im = im.copy()
        im.putalpha(a)
    x, y = cx - im.width / 2, cy - im.height / 2
    ix, iy = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - ix, y - iy
    if fx > 0.01 or fy > 0.01:
        im = im.transform((im.width + 1, im.height + 1), Image.AFFINE, (1, 0, -fx, 0, 1, -fy), Image.BILINEAR)
    canvas.alpha_composite(im, (ix, iy)) if 0 <= ix and 0 <= iy and ix + im.width <= canvas.width and iy + im.height <= canvas.height else _paste_clip(canvas, im, ix, iy)
    return (ix, iy, ix + im.width, iy + im.height)


def _paste_clip(canvas, im, ix, iy):
    x0, y0 = max(0, ix), max(0, iy)
    x1, y1 = min(canvas.width, ix + im.width), min(canvas.height, iy + im.height)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.alpha_composite(im.crop((x0 - ix, y0 - iy, x1 - ix, y1 - iy)), (x0, y0))


# ---------------------------------------------------------------- 5 mẫu (C3)

class Card:
    """Một nhịp ảnh: mẫu + khung đặt + ảnh. `frame(t, canvas)` vẽ, trả hộp đã vẽ (để kiểm che mặt / chồng chữ)."""
    RATIOS = {"M1": (1.6, 1.0, 0.8), "M2": (1.3, 0.85), "M4": (1.25, 0.9), "M5": (0.49,), "M6": (1.6,)}
    MAXW = {"M1": 750, "M2": 720, "M4": 700, "M5": 330, "M6": 820}

    def __init__(self, kind, t0, t1, rect, media, label="", side=1, variant=0):
        self.kind, self.t0, self.t1, self.rect, self.label, self.side, self.variant = kind, t0, t1, rect, label, side, variant
        x0, y0, x1, y1 = rect
        self.w, self.h = int(x1 - x0), int(y1 - y0)
        self.cx, self.cy = (x0 + x1) / 2, (y0 + y1) / 2
        self.media = media  # [(frames, kb_sign)]
        # lề từ thẻ tới mép title-safe phía thẻ bay vào / ra: chuyển động không được đưa thẻ (kể cả bóng) ra ngoài safe
        self.room = max(0.0, (SAFE[2] - x1) if side > 0 else (x0 - SAFE[0])) - PAD.get(kind, 40) * 0.5
        self._prep()

    # ---- dựng sẵn phần tĩnh của thẻ
    def _prep(self):
        k = self.kind
        if k == "M1":
            R, inset = 24, 17
            self.base = Image.new("RGBA", (self.w, self.h), (255, 255, 255, int(255 * 0.32)))
            self.base.putalpha(rounded_mask((self.w, self.h), R))
            hl = Image.new("L", (self.w, self.h), 0)
            ImageDraw.Draw(hl).rounded_rectangle((0, 0, self.w - 1, self.h - 1), radius=R, outline=255, width=2)
            gx = np.linspace(1.0, 0.45, self.w)[None, :] * np.linspace(1.0, 0.6, self.h)[:, None]
            hl = Image.fromarray((np.asarray(hl, np.float32) * gx * 0.65).astype(np.uint8))
            self.base.paste((255, 255, 255, 255), (0, 0), hl)
            self.inner = (inset, inset, self.w - inset, self.h - inset)
            self.inner_mask = rounded_mask((self.w - 2 * inset, self.h - 2 * inset), 15)
            self.shadow = drop_shadow(self.base.getchannel("A").point(lambda v: 255 if v else 0), 0.38, 20, 12)
        elif k == "M2":
            self.inner = (0, 0, self.w, self.h)
            self.shadow = drop_shadow(Image.new("L", (self.w, self.h), 255), 0.30, 15, 9)
        elif k == "M4":
            R, mg, strip = 3, 14, 85 if self.label else 0
            self.base = Image.new("RGBA", (self.w, self.h), (0xF4, 0xEF, 0xE7, 255))
            self.base.putalpha(rounded_mask((self.w, self.h), R, 0))
            self.inner = (mg, mg, self.w - mg, self.h - mg - strip)
            self.inner_mask = Image.new("L", (self.inner[2] - self.inner[0], self.inner[3] - self.inner[1]), 255)
            self.shadow = drop_shadow(self.base.getchannel("A"), 0.30, 8, 5)
            self.strip = strip
            if self.label:
                fs = 52  # 104 @4K, tự thu 6 px @4K / bước, tối thiểu 60 @4K (R3.4.2)
                while True:
                    f = FONT("Times New Roman Bold Italic.ttf", fs)  # Tinos Bold Italic (OFL) — thay Playfair Display SC chưa có tệp
                    if fs <= 30 or f.getlength(self.label.upper()) <= self.w - 2 * mg - 10:
                        break
                    fs -= 3
                self.lbl = Image.new("RGBA", (self.w - 2 * mg, strip), (0, 0, 0, 0))
                ImageDraw.Draw(self.lbl).text((0, strip * 0.52), self.label.upper(), font=f, fill=(0x15, 0x15, 0x15, 255), anchor="lm")
        elif k == "M5":
            H = self.h
            sc = H / 1140
            self.R, self.bez = int(90 * sc), max(6, int(26 * sc))
            body = Image.new("RGBA", (self.w, self.h), (0x11, 0x13, 0x18, 255))
            body.putalpha(rounded_mask((self.w, self.h), self.R, 0))
            edge = Image.new("L", (self.w, self.h), 0)
            ImageDraw.Draw(edge).rounded_rectangle((0, 0, self.w - 1, self.h - 1), radius=self.R, outline=255, width=2)
            body.paste((0x5A, 0x60, 0x6C, 255), (0, 0), edge)
            self.base = body
            b = self.bez
            self.inner = (b, b, self.w - b, self.h - b)
            self.inner_mask = rounded_mask((self.w - 2 * b, self.h - 2 * b), int(66 * sc), 0)
            iw, ih = int(150 * sc), max(6, int(40 * sc))
            self.island = (int(self.w / 2 - iw / 2), b + int(22 * sc), int(self.w / 2 + iw / 2), b + int(22 * sc) + ih)
            self.shadow = drop_shadow(body.getchannel("A"), 0.45, 22, 14)
        elif k == "M6":
            self.prints = []
            n = len(self.media)
            spots = [(0.38, 0.36, -5), (0.62, 0.64, 4)] if n <= 2 else [(0.36, 0.33, -6), (0.64, 0.47, 5), (0.48, 0.70, -2)]
            pw = int(self.w * (0.74 if n <= 2 else 0.70) * 0.62)
            ph = int(pw / 1.6)
            for i, (rx, ry, ang) in enumerate(spots[:n]):
                bw = 9
                card = Image.new("RGBA", (pw + 2 * bw, ph + 2 * bw), (255, 255, 255, 255))
                card.putalpha(rounded_mask(card.size, 3, 0))
                self.prints.append({"size": (pw, ph), "card": card, "bw": bw, "pos": (self.rect[0] + rx * self.w, self.rect[1] + ry * self.h), "ang": ang,
                                    "shadow": drop_shadow(card.getchannel("A"), 0.40, 17, 10)})

    def media_size(self, i=0):
        if self.kind == "M6":
            return self.prints[i]["size"]
        x0, y0, x1, y1 = self.inner
        if self.kind == "M5":
            return (int((x1 - x0) * 1.55), y1 - y0)
        return (x1 - x0, y1 - y0)

    # ---- vẽ một khung
    def frame(self, t, canvas):
        if t < self.t0 or t >= self.t1:
            return None
        ms = (t - self.t0) * 1000
        left = (self.t1 - t) * 1000
        u = (t - self.t0) / max(0.01, self.t1 - self.t0)
        return getattr(self, "_" + self.kind)(t, ms, left, u, canvas)

    def _photo(self, i, u, t, z0=1.0, z1=1.07):
        frames, sign = self.media[min(i, len(self.media) - 1)]
        return ken_burns(frames, self.media_size(i), u, z0, z1, sign=sign, t=t - self.t0)

    def _M1(self, t, ms, left, u, canvas):
        enter = spring(ms / 1000)
        a = min(ss(ms / 250), ss(left / 350))
        sc = (0.86 + 0.14 * enter) * (1 - 0.06 * eic(1 - left / 350) if left < 350 else 1)
        dx = self.side * min(70, self.room) * max(0.0, 1 - enter) + (self.side * min(30, self.room) * eic(1 - left / 350) if left < 350 else 0)
        card = self.base.copy()
        x0, y0, x1, y1 = self.inner
        ph = self._photo(0, u, t)
        card.paste(ph, (x0, y0), self.inner_mask)
        sh, pad = self.shadow
        paste_tf(canvas, sh, self.cx + dx, self.cy, sc, 0, a)
        return paste_tf(canvas, card, self.cx + dx, self.cy, sc, 0, a)

    def _M2(self, t, ms, left, u, canvas):
        p_in = ss((ms - 0) / 550)
        p_out = ss(1 - left / 350) if left < 350 else 0.0
        reveal = max(0.0, p_in - p_out)
        if reveal <= 0.002:
            return None
        ph = self._photo(0, u, t, 1.10, 1.00)
        w, h = ph.size
        m = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(m)
        kind = self.variant % 3
        if kind == 0:   # quét trái → phải
            d.rectangle((0, 0, int((w + 30) * reveal), h), fill=255)
        elif kind == 1:  # chéo 30°
            off = (w + h * math.tan(math.radians(30)) + 30) * reveal
            d.polygon([(0, 0), (off, 0), (off - h * math.tan(math.radians(30)), h), (0, h)], fill=255)
        else:            # tròn nở từ tâm
            r = reveal * math.hypot(w, h) / 2 + 1
            d.ellipse((w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(10))
        ph = ph.copy()
        ph.putalpha(m)
        sh, _ = self.shadow
        paste_tf(canvas, sh, self.cx, self.cy, 1, 0, reveal)
        box = paste_tf(canvas, ph, self.cx, self.cy)
        # viền vàng 6 px @4K → 3 px, vẽ dần theo chu vi chiều kim đồng hồ từ góc trên-trái (250–700 ms), rút khi ra
        pb = ss((ms - 250) / 450) * (1 - p_out)
        if pb > 0.002:
            per = 2 * (w + h)
            L = per * pb
            pts = [(0, 0), (w, 0), (w, h), (0, h), (0, 0)]
            lay = Image.new("RGBA", (w + 6, h + 6), (0, 0, 0, 0))
            ld = ImageDraw.Draw(lay)
            acc = 0.0
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                seg = math.hypot(bx - ax, by - ay)
                if acc >= L:
                    break
                k = min(1.0, (L - acc) / seg)
                ld.line([(ax + 3, ay + 3), (ax + 3 + (bx - ax) * k, ay + 3 + (by - ay) * k)], fill=GOLD + (255,), width=3)
                acc += seg
            paste_tf(canvas, lay, self.cx, self.cy)
        return box

    def _M4(self, t, ms, left, u, canvas):
        a = min(ss(ms / 300), 1 - eic(1 - left / 320) if left < 320 else 1.0)
        below = max(0.0, SUB_FORBID_Y - self.rect[3] - PAD["M4"])  # trượt lên từ dưới / rơi khi ra: không qua vạch phụ đề
        dy = min(40, below) * (1 - eoc(ms / 500)) + (min(20, below) * eic(1 - left / 320) if left < 320 else 0)
        card = self.base.copy()
        x0, y0, x1, y1 = self.inner
        ph = self._photo(0, u, t)
        rv = ss((ms - 100) / 500)
        if rv > 0:
            m = Image.new("L", ph.size, 0)
            ImageDraw.Draw(m).rectangle((0, 0, ph.width, int((ph.height + 20) * rv)), fill=255)
            card.paste(ph, (x0, y0), m.filter(ImageFilter.GaussianBlur(10)))
        if self.label:
            rl = ss((ms - 280) / 350)
            ImageDraw.Draw(card).rectangle((x0, y1 + 10, x0 + int(70 * rl), y1 + 13), fill=(0xC8, 0x10, 0x2E, 255))
            lu = eoc((ms - 350) / 450)
            if lu > 0:
                lb = self.lbl.copy()
                lb.putalpha(lb.getchannel("A").point(lambda v: int(v * lu)))
                card.alpha_composite(lb, (x0, int(y1 + 6 + 20 * (1 - lu))))
        sh, _ = self.shadow
        paste_tf(canvas, sh, self.cx, self.cy + dy, 1, 0, a)
        return paste_tf(canvas, card, self.cx, self.cy + dy, 1, 0, a)

    def _M5(self, t, ms, left, u, canvas):
        a = min(ss(ms / 300), 1 - ss(1 - left / 350) if left < 350 else 1.0)
        drop = min(160, max(0.0, SUB_FORBID_Y - self.rect[3] - PAD["M5"] * 0.5)) * (1 - eob(ms / 600, 1.1))  # không rơi qua vạch phụ đề
        lift = -60 * ss(1 - left / 350) if left < 350 else 0.0
        ang = 4 * (1 - eoc(ms / 600))
        body = self.base.copy()
        x0, y0, x1, y1 = self.inner
        sw, sh_ = x1 - x0, y1 - y0
        wide = self._photo(0, u, t, 1.0, 1.0)
        px = int((wide.width - sw) * (0.15 + 0.70 * ss(u)))
        scr = wide.crop((px, 0, px + sw, sh_))
        if len(self.media) > 1:  # ảnh 2 vuốt vào từ phải 450 ms giữa nhịp
            mid = (self.t1 - self.t0) * 500
            sw_u = ss((ms - mid) / 450)
            if sw_u > 0:
                w2 = self._photo(1, u, t, 1.0, 1.0).crop((0, 0, sw, sh_))
                scr.alpha_composite(w2, (int(sw * (1 - sw_u)), 0)) if int(sw * (1 - sw_u)) < sw else None
        body.paste(scr, (x0, y0), self.inner_mask)
        ImageDraw.Draw(body).rounded_rectangle(self.island, radius=(self.island[3] - self.island[1]) // 2, fill=(0, 0, 0, 255))
        sh, _ = self.shadow
        paste_tf(canvas, sh, self.cx, self.cy + drop + lift, 1, ang, a)
        return paste_tf(canvas, body, self.cx, self.cy + drop + lift, 1, ang, a)

    def _M6(self, t, ms, left, u, canvas):
        box = None
        for i, p in enumerate(self.prints):
            st = ms - 180 * i
            if st <= 0:
                continue
            pos = eoc(st / 550)
            sc = 0.9 + 0.1 * eob(st / 550)
            al = min(ss(st / 220), 1 - ss(1 - left / 300) if left < 300 else 1.0)
            sc *= (1 - 0.08 * ss(1 - left / 300)) if left < 300 else 1.0
            ang = p["ang"] + 18 * (1 - pos)
            tx, ty = p["pos"]
            # bay ngang từ mép gần (450 px @4K-demo), không bay từ dưới lên qua phụ đề; quãng bay thu lại theo lề còn lại
            # để thẻ đang bay cũng không lọt title-safe (R3.6.5 CHƯA CHỐT → áp chặt: "cho thẻ hiện từ trong lề")
            half = math.hypot(p["card"].width, p["card"].height) / 2 + 30
            room = (SAFE[2] - (tx + half)) if self.side > 0 else ((tx - half) - SAFE[0])
            fx = tx + self.side * min(450, max(0.0, room)) * (1 - pos)
            card = p["card"].copy()
            card.paste(self._photo(i, u, t), (p["bw"], p["bw"]))
            sh, _ = p["shadow"]
            paste_tf(canvas, sh, fx, ty, sc, ang, al)
            b = paste_tf(canvas, card, fx, ty, sc, ang, al)
            if b:
                box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        return box


# ---------------------------------------------------------------- chọn mẫu theo câu (C2.2, CHƯA CHỐT)

TEMPLATE_RULES = [
    ("M5", ("online", "video", "điện thoại", "mạng xã hội", "facebook", "tiktok", "page", "tư vấn", "chăm sóc", "nhắn tin", "gọi điện", "năm")),
    ("M6", ("đồng đội", "tập thể", "team", "đội nhóm", "cùng nhau", "rất nhiều bạn", "các bạn", "nhân sự", "mọi người", "gia đình")),
    ("M4", ("thương hiệu", "giá trị", "cốt lõi", "học hỏi", "kỹ năng", "chuyên nghiệp")),
    ("M2", ("mục tiêu", "phát triển", "mở rộng", "thành công", "tự hào", "vinh danh", "sự kiện")),
]


def choose_template(sentence, prev, counts, n_media, total):
    s = sentence.lower()
    want = next((k for k, kws in TEMPLATE_RULES if any(x in s for x in kws)), "M1")
    order = [want] + [k for k in ("M1", "M2", "M5", "M4", "M6") if k != want]
    for k in order:
        if k == prev:
            continue  # R2.4: 2 nhịp liền nhau không cùng mẫu
        if k == "M6" and n_media < 2:
            continue
        if total >= 4 and counts.get(k, 0) + 1 > max(1, round(0.3 * total)) and k != order[-1]:
            continue  # R2.4: mỗi mẫu ≤ ~30 % số nhịp
        return k
    return "M1" if prev != "M1" else "M2"


# ---------------------------------------------------------------- tự kiểm (không cần video thật)

def self_test():
    bad = 0

    def check(c, msg):
        nonlocal bad
        if not c:
            bad += 1
            print("SAI:", msg)

    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    global FONT
    if FONT is None:
        from PIL import ImageFont
        fdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "fonts")
        FONT = lambda name, size: ImageFont.truetype(os.path.join(fdir, "Tinos-BoldItalic.ttf" if "Bold" in name else "Tinos-Italic.ttf"), size)  # noqa: E731
    face = (820, 180, 1100, 520)  # người nói giữa-phải
    # chặn hai bên mặt → chỗ trống duy nhất (nếu chỉ cấm hộp mặt) là ngay dưới mặt, trên thân người → phải KHÔNG có chỗ
    sides = [(SAFE[0], SAFE[1], face[0] - 200, SUB_FORBID_Y), (face[2] + 200, SAFE[1], SAFE[2], SUB_FORBID_Y)]
    check(best_rect(free_mask([face], sides), 1.0, 300, 120, 960) is None, "chỗ duy nhất là thân người dưới mặt: không được đặt thẻ")
    under = best_rect(free_mask([face]), 1.0, 300, 260, 960)
    check(under is None or under[2] <= face[0] - 0.6 * (face[2] - face[0]) or under[0] >= face[2] + 0.6 * (face[2] - face[0]),
          f"thẻ không được nằm trên người (vai / thân dưới mặt): {under}")
    free = free_mask([face])
    r = best_rect(free, 1.6, 750, 260, (face[0] + face[2]) / 2, pad=PAD["M1"])
    check(r is not None, "phải tìm được chỗ trống bên trái mặt")
    if r:
        check(r[2] <= face[0] - 20 or r[0] >= face[2] + 20, f"thẻ không được chạm hộp mặt + lề: {r}")
        check(r[0] >= SAFE[0] and r[1] >= SAFE[1] and r[2] <= SAFE[2] and r[3] <= SUB_FORBID_Y, f"thẻ trong title-safe, trên vùng phụ đề: {r}")
        check((r[0] + r[2]) / 2 < face[0], f"ưu tiên phía xa mặt: {r}")
    # P2-1: người nói đổi tầm cao đầu giữa video → đoạn sau KHÔNG được lọc mất mặt
    # (lệch tầm cao 400 px > 1 bề rộng mặt: trung vị cả video sẽ lọc mất cả đoạn sau → test ĐỎ nếu bỏ cửa sổ thời gian)
    samp = [(k * 0.5, [(800, 100, 1000, 300)]) for k in range(24)] + [(12 + k * 0.5, [(800, 500, 1000, 700)]) for k in range(16)]
    kept = plausible(samp)
    check(all(b for t, b in kept if t >= 12), "lọc theo cửa sổ: mặt sau khi đổi tầm cao vẫn giữ")
    hand = plausible([(k * 0.5, [(800, 100, 1000, 300), (700, 700, 820, 820)]) for k in range(10)])
    check(all(len(b) == 1 for _, b in hand), "lọc vẫn bỏ tay khum nằm thấp")
    # người ngồi cạnh NHỎ hơn hẳn người cầm máy (selfie 1017: mặt chị ~55 % mặt anh) cùng tầm cao → phải giữ
    two = plausible([(k * 0.5, [(800, 100, 1000, 300)] if k % 2 else [(800, 100, 1000, 300), (400, 150, 510, 260)]) for k in range(10)])
    check(all(len(b) == 2 for k, (_, b) in enumerate(two) if k % 2 == 0), "giữ mặt người ngồi cạnh nhỏ hơn, cùng tầm cao")
    # P2-2: không dò được mặt → coi vị trí quen / tâm là có người
    fb = fallback_person([(0, [])], (960, 400))
    check(fb and fb[0][0] < 960 < fb[0][2] and fb[0][1] < 400 < fb[0][3], f"không thấy mặt: phải giả định người quanh tâm {fb}")
    big_face = (300, 100, 1700, 950)  # cận mặt chiếm gần hết khung → không có chỗ → không đặt thẻ
    check(best_rect(free_mask([big_face]), 1.6, 750, 260, 1000) is None, "cảnh cận mặt kín khung: không được ép thẻ vào")
    # chọn mẫu: không 2 nhịp liền cùng mẫu; M6 cần ≥ 2 ảnh; theo dấu hiệu lời nói
    check(choose_template("team building cùng đồng đội", None, {}, 3, 10) == "M6", "tập thể → M6")
    check(choose_template("team building cùng đồng đội", None, {}, 1, 10) != "M6", "M6 cần ≥ 2 ảnh")
    check(choose_template("chăm sóc khách qua page", None, {}, 1, 10) == "M5", "online / tư vấn → M5")
    check(choose_template("chăm sóc khách qua page", "M5", {}, 1, 10) != "M5", "không lặp mẫu liền nhau")
    # mỗi mẫu vẽ được, khi đứng yên nằm trong title-safe và không chạm mặt
    import tempfile
    img = os.path.join(tempfile.mkdtemp(), "card.png")
    Image.new("RGB", (1600, 1000), (180, 120, 60)).save(img)
    try:
        for kind in ("M1", "M2", "M4", "M5", "M6"):
            ratio = Card.RATIOS[kind][0]
            rr = best_rect(free, ratio, Card.MAXW[kind], 150 if kind == "M5" else 260, 960, pad=PAD[kind])
            check(rr is not None, f"{kind}: không có chỗ")
            if not rr:
                continue
            n = 3 if kind == "M6" else 1
            # ca xấu nhất: thẻ sát mép phải title-safe (chừa đúng PAD) và bay vào từ phía mép đó
            w_, h_ = rr[2] - rr[0], rr[3] - rr[1]
            rr = (SAFE[2] - PAD[kind] - w_, rr[1], SAFE[2] - PAD[kind], rr[3])
            # ca xấu nhất thứ hai: sát vạch cấm phụ đề (thẻ rơi / trượt từ dưới lên không được qua vạch)
            low = (rr[0], SUB_FORBID_Y - PAD[kind] - h_, rr[2], SUB_FORBID_Y - PAD[kind])
            cl = Card(kind, 0.0, 3.0, low, [None] * n, "ĐỒNG ĐỘI" if kind == "M4" else "", 1)
            cl.media = [(load_media(img, cl.media_size(j)), 1) for j in range(n)]
            for tt in [k / 30 for k in range(0, 90, 2)]:
                cv = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
                cl.frame(tt, cv)
                b3 = cv.getchannel("A").point(lambda v: 255 if v > 5 else 0).getbbox()
                if b3 and b3[3] > SUB_FORBID_Y + 1:
                    check(False, f"{kind} sát đáy lúc {tt:.2f}s xuống quá vạch phụ đề {b3}")
                    break
            c = Card(kind, 0.0, 3.0, rr, [None] * n, "ĐỒNG ĐỘI" if kind == "M4" else "", 1)
            c.media = [(load_media(img, c.media_size(j)), 1) for j in range(n)]
            canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
            c.frame(1.5, canvas)  # giữa nhịp: đã đứng yên
            bb = canvas.getchannel("A").point(lambda v: 255 if v > 5 else 0).getbbox()
            check(bb is not None, f"{kind}: không vẽ gì")
            if bb:
                check(bb[0] >= SAFE[0] - 1 and bb[1] >= SAFE[1] - 1 and bb[2] <= SAFE[2] + 1 and bb[3] <= SUB_FORBID_Y + 30, f"{kind}: lọt ngoài title-safe / xuống phụ đề {bb}")
                a = np.asarray(canvas.getchannel("A"))
                check(a[face[1]:face[3], face[0]:min(face[2], rr[0] - PAD[kind])].max() <= 8 if rr[0] - PAD[kind] > face[0] else True, f"{kind}: vẽ đè mặt")
            for tt in [k / 30 for k in range(0, 90, 2)]:  # MỌI khung (vào / đứng / ra): kể cả lúc bay vẫn trong title-safe
                cv = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
                c.frame(tt, cv)
                b2 = cv.getchannel("A").point(lambda v: 255 if v > 5 else 0).getbbox()
                if b2 and not (b2[0] >= SAFE[0] - 1 and b2[1] >= SAFE[1] - 1 and b2[2] <= SAFE[2] + 1 and b2[3] <= SUB_FORBID_Y + 1):
                    check(False, f"{kind} lúc {tt:.2f}s lọt title-safe {b2}")
                    break
    finally:
        os.remove(img)
    print(f"ngang tự kiểm: {'đạt' if not bad else f'{bad} lỗi'}")
    return bad == 0


if __name__ == "__main__":
    import sys
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
