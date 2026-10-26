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
import contextlib
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
# Hệ số vẽ thẻ ảnh / M3 (esv_render gán = RQ trước khi dựng): 1 = khung 1920×1080, 2 = 4K 3840×2160. Toạ độ / hộp (rect, PAD,
# SAFE, M3_*) vẫn ở hệ thiết kế 1920×1080; lúc VẼ nhân RQ (cỡ thẻ, bo góc, viền, bóng, quãng bay, ảnh trong thẻ) → 4K là nét gốc,
# không phải ảnh 1080 phóng ×2. Hộp trả về (frame / tiles_frame) luôn ở hệ thiết kế. RQ = 1: mọi phép tính ×1 chính xác → 1080 không đổi.
RQ = 1
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

FT_W, FT_H = 960, 540  # cỡ khung dò mặt (½ khung xuất)


def face_frames(src, crop, every=0.5):
    """Khung xám FT_W×FT_H của nguồn đã cắt khung, mỗi `every` giây, đọc LẦN LƯỢT từng khung qua ống ffmpeg (MỘT lượt giải mã).
    Chỉ giữ một khung trong bộ nhớ. Bản cũ đọc cả nguồn vào một mảng (~0,5 MB / khung ở 2 khung/s): clip 10 phút đỉnh RSS 1,65 GB →
    nay 0,18 GB, bằng mức clip 1 phút (đo /usr/bin/time -l), cùng mốc thời gian và cùng hộp mặt."""
    vf = f"fps={1 / every:.4f}," + (f"{crop}," if crop else "") + f"scale={FT_W}:{FT_H},format=gray"
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
    fsz = FT_W * FT_H
    try:
        while True:
            buf = bytearray(fsz)
            view, got = memoryview(buf), 0
            while got < fsz:
                k = p.stdout.readinto(view[got:])
                if not k:
                    break
                got += k
            if got < fsz:  # hết nguồn (khung cuối thiếu bị bỏ — như phép chia nguyên của bản đọc cả mảng)
                return
            yield np.frombuffer(buf, np.uint8).reshape(FT_H, FT_W)
    finally:
        p.stdout.close()
        if p.poll() is None:
            p.kill()
        p.wait()


def face_track(src, info, crop, every=0.5):
    """Dò mặt (Haar) mỗi `every` giây trên nguồn đã cắt khung, MỘT lượt giải mã, dò ngay từng khung (bộ nhớ không tăng theo thời lượng).
    Trả [(t, [(x0,y0,x1,y1) theo khung xuất 1920×1080 khi z=1])].
    Lọc như skill (R1.4 / A10.4): bỏ hộp quá nhỏ, co 12 % mỗi cạnh để hộp sát mặt hơn rồi mới cộng lề an toàn ở bước đặt."""
    import cv2
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    out = []
    # closing: lỗi giữa chừng (dò mặt, Ctrl-C) vẫn đóng ống và dừng ffmpeg ngay (finally của face_frames), không chờ GC
    with contextlib.closing(face_frames(src, crop, every)) as frames:
        for k, g in enumerate(frames):
            out.append((k * every, face_boxes(cas.detectMultiScale(g, 1.1, 6, minSize=(48, 48)))))
    return plausible(out)


def face_boxes(fcs):
    """Hộp Haar trên khung dò FT_W×FT_H → hộp theo khung xuất CW×CH, co 12 % mỗi cạnh. Xếp theo (x, y, w, h): OpenCV dò song song
    nhiều luồng nên THỨ TỰ hộp đổi giữa các lần chạy (đo: cùng nguồn, 3 lần chạy lệch thứ tự ở 1–4 mẫu / 120) → xếp để tất định."""
    boxes = []
    for (x, y, w, h) in sorted(fcs, key=lambda q: (int(q[0]), int(q[1]), int(q[2]), int(q[3]))):
        sx = CW / FT_W
        x0, y0, x1, y1 = x * sx, y * sx, (x + w) * sx, (y + h) * sx
        sh = 0.12 * (x1 - x0)
        boxes.append((x0 + sh, y0 + sh, x1 - sh, y1 - sh))
    return boxes


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
    """Một nhịp ảnh: mẫu + khung đặt + ảnh. `frame(t, canvas)` vẽ, trả hộp đã vẽ (để kiểm che mặt / chồng chữ).
    `rect` ở hệ thiết kế 1920×1080; thẻ vẽ ở RQ (lúc tạo): canvas phải là (CW·RQ)×(CH·RQ), hộp trả về đã chia RQ."""
    RATIOS = {"M1": (1.6, 1.0, 0.8), "M2": (1.3, 0.85), "M4": (1.25, 0.9), "M5": (0.49,), "M6": (1.6,)}
    MAXW = {"M1": 750, "M2": 720, "M4": 700, "M5": 330, "M6": 820}

    def __init__(self, kind, t0, t1, rect, media, label="", side=1, variant=0):
        self.kind, self.t0, self.t1, self.rect, self.label, self.side, self.variant = kind, t0, t1, rect, label, side, variant
        self.q = q = RQ
        x0, y0, x1, y1 = rect
        self.w, self.h = int((x1 - x0) * q), int((y1 - y0) * q)  # cỡ VẼ (px ở độ phân giải đích)
        self.cx, self.cy = (x0 + x1) / 2 * q, (y0 + y1) / 2 * q
        self.media = media  # [(frames, kb_sign)] — khung ảnh cỡ media_size() (px đích)
        # nạp chậm (tuỳ chọn): loader() trả media lúc thẻ bắt đầu hiện, nhả sau t1 → RAM chỉ giữ ảnh của thẻ đang hiện
        # (4K: ảnh trong thẻ gấp 4 lần điểm ảnh; clip B-roll 15 khung/s — nạp sẵn mọi thẻ của video dài tốn hàng trăm MB)
        self.loader = None
        # lề từ thẻ tới mép title-safe phía thẻ bay vào / ra: chuyển động không được đưa thẻ (kể cả bóng) ra ngoài safe
        self.room = (max(0.0, (SAFE[2] - x1) if side > 0 else (x0 - SAFE[0])) - PAD.get(kind, 40) * 0.5) * q
        self._prep()

    # ---- dựng sẵn phần tĩnh của thẻ
    def _prep(self):
        k, q = self.kind, self.q
        if k == "M1":
            R, inset = 24 * q, 17 * q
            self.base = Image.new("RGBA", (self.w, self.h), (255, 255, 255, int(255 * 0.32)))
            self.base.putalpha(rounded_mask((self.w, self.h), R, q))
            hl = Image.new("L", (self.w, self.h), 0)
            ImageDraw.Draw(hl).rounded_rectangle((0, 0, self.w - 1, self.h - 1), radius=R, outline=255, width=2 * q)
            gx = np.linspace(1.0, 0.45, self.w)[None, :] * np.linspace(1.0, 0.6, self.h)[:, None]
            hl = Image.fromarray((np.asarray(hl, np.float32) * gx * 0.65).astype(np.uint8))
            self.base.paste((255, 255, 255, 255), (0, 0), hl)
            self.inner = (inset, inset, self.w - inset, self.h - inset)
            self.inner_mask = rounded_mask((self.w - 2 * inset, self.h - 2 * inset), 15 * q, q)
            self.shadow = drop_shadow(self.base.getchannel("A").point(lambda v: 255 if v else 0), 0.38, 20 * q, 12 * q)
        elif k == "M2":
            self.inner = (0, 0, self.w, self.h)
            self.shadow = drop_shadow(Image.new("L", (self.w, self.h), 255), 0.30, 15 * q, 9 * q)
        elif k == "M4":
            R, mg, strip = 3 * q, 14 * q, 85 * q if self.label else 0
            self.base = Image.new("RGBA", (self.w, self.h), (0xF4, 0xEF, 0xE7, 255))
            self.base.putalpha(rounded_mask((self.w, self.h), R, 0))
            self.inner = (mg, mg, self.w - mg, self.h - mg - strip)
            self.inner_mask = Image.new("L", (self.inner[2] - self.inner[0], self.inner[3] - self.inner[1]), 255)
            self.shadow = drop_shadow(self.base.getchannel("A"), 0.30, 8 * q, 5 * q)
            self.strip = strip
            if self.label:
                fs = 52 * q  # 104 @4K, tự thu 6 px @4K / bước, tối thiểu 60 @4K (R3.4.2)
                while True:
                    f = FONT("Times New Roman Bold Italic.ttf", fs)  # Tinos Bold Italic (OFL) — thay Playfair Display SC chưa có tệp
                    if fs <= 30 * q or f.getlength(self.label.upper()) <= self.w - 2 * mg - 10 * q:
                        break
                    fs -= 3 * q
                self.lbl = Image.new("RGBA", (self.w - 2 * mg, strip), (0, 0, 0, 0))
                ImageDraw.Draw(self.lbl).text((0, strip * 0.52), self.label.upper(), font=f, fill=(0x15, 0x15, 0x15, 255), anchor="lm")
        elif k == "M5":
            H = self.h
            sc = H / 1140  # theo cỡ VẼ → 4K tự gấp đôi bo góc / viền máy / "đảo"
            self.R, self.bez = int(90 * sc), max(6 * q, int(26 * sc))
            body = Image.new("RGBA", (self.w, self.h), (0x11, 0x13, 0x18, 255))
            body.putalpha(rounded_mask((self.w, self.h), self.R, 0))
            edge = Image.new("L", (self.w, self.h), 0)
            ImageDraw.Draw(edge).rounded_rectangle((0, 0, self.w - 1, self.h - 1), radius=self.R, outline=255, width=2 * q)
            body.paste((0x5A, 0x60, 0x6C, 255), (0, 0), edge)
            self.base = body
            b = self.bez
            self.inner = (b, b, self.w - b, self.h - b)
            self.inner_mask = rounded_mask((self.w - 2 * b, self.h - 2 * b), int(66 * sc), 0)
            iw, ih = int(150 * sc), max(6 * q, int(40 * sc))
            self.island = (int(self.w / 2 - iw / 2), b + int(22 * sc), int(self.w / 2 + iw / 2), b + int(22 * sc) + ih)
            self.shadow = drop_shadow(body.getchannel("A"), 0.45, 22 * q, 14 * q)
        elif k == "M6":
            self.prints = []
            n = len(self.media)
            spots = [(0.38, 0.36, -5), (0.62, 0.64, 4)] if n <= 2 else [(0.36, 0.33, -6), (0.64, 0.47, 5), (0.48, 0.70, -2)]
            pw = int(self.w * (0.74 if n <= 2 else 0.70) * 0.62)
            ph = int(pw / 1.6)
            for i, (rx, ry, ang) in enumerate(spots[:n]):
                bw = 9 * q
                card = Image.new("RGBA", (pw + 2 * bw, ph + 2 * bw), (255, 255, 255, 255))
                card.putalpha(rounded_mask(card.size, 3 * q, 0))
                self.prints.append({"size": (pw, ph), "card": card, "bw": bw, "pos": (self.rect[0] * q + rx * self.w, self.rect[1] * q + ry * self.h), "ang": ang,
                                    "shadow": drop_shadow(card.getchannel("A"), 0.40, 17 * q, 10 * q)})

    def media_size(self, i=0):
        """Cỡ ảnh trong thẻ, px ở độ phân giải VẼ (4K: gấp đôi) — load_media nạp ảnh gốc đúng cỡ này, không phóng từ 1080."""
        if self.kind == "M6":
            return self.prints[i]["size"]
        x0, y0, x1, y1 = self.inner
        if self.kind == "M5":
            return (int((x1 - x0) * 1.55), y1 - y0)
        return (x1 - x0, y1 - y0)

    # ---- vẽ một khung
    def frame(self, t, canvas):
        if t < self.t0 or t >= self.t1:
            if self.loader is not None and t >= self.t1:
                self.media = None
            return None
        if self.loader is not None and self.media is None:
            self.media = self.loader()
        ms = (t - self.t0) * 1000
        left = (self.t1 - t) * 1000
        u = (t - self.t0) / max(0.01, self.t1 - self.t0)
        b = getattr(self, "_" + self.kind)(t, ms, left, u, canvas)
        return b if (b is None or self.q == 1) else tuple(v / self.q for v in b)

    def _photo(self, i, u, t, z0=1.0, z1=1.07):
        frames, sign = self.media[min(i, len(self.media) - 1)]
        return ken_burns(frames, self.media_size(i), u, z0, z1, sign=sign, t=t - self.t0)

    def _M1(self, t, ms, left, u, canvas):
        q = self.q
        enter = spring(ms / 1000)
        a = min(ss(ms / 250), ss(left / 350))
        sc = (0.86 + 0.14 * enter) * (1 - 0.06 * eic(1 - left / 350) if left < 350 else 1)
        dx = self.side * min(70 * q, self.room) * max(0.0, 1 - enter) + (self.side * min(30 * q, self.room) * eic(1 - left / 350) if left < 350 else 0)
        card = self.base.copy()
        x0, y0, x1, y1 = self.inner
        ph = self._photo(0, u, t)
        card.paste(ph, (x0, y0), self.inner_mask)
        sh, pad = self.shadow
        paste_tf(canvas, sh, self.cx + dx, self.cy, sc, 0, a)
        return paste_tf(canvas, card, self.cx + dx, self.cy, sc, 0, a)

    def _M2(self, t, ms, left, u, canvas):
        q = self.q
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
            d.rectangle((0, 0, int((w + 30 * q) * reveal), h), fill=255)
        elif kind == 1:  # chéo 30°
            off = (w + h * math.tan(math.radians(30)) + 30 * q) * reveal
            d.polygon([(0, 0), (off, 0), (off - h * math.tan(math.radians(30)), h), (0, h)], fill=255)
        else:            # tròn nở từ tâm
            r = reveal * math.hypot(w, h) / 2 + q
            d.ellipse((w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(10 * q))
        ph = ph.copy()
        ph.putalpha(m)
        sh, _ = self.shadow
        paste_tf(canvas, sh, self.cx, self.cy, 1, 0, reveal)
        box = paste_tf(canvas, ph, self.cx, self.cy)
        # viền vàng 6 px @4K → 3 px @1080, vẽ dần theo chu vi chiều kim đồng hồ từ góc trên-trái (250–700 ms), rút khi ra
        pb = ss((ms - 250) / 450) * (1 - p_out)
        if pb > 0.002:
            per = 2 * (w + h)
            L = per * pb
            pts = [(0, 0), (w, 0), (w, h), (0, h), (0, 0)]
            o = 3 * q
            lay = Image.new("RGBA", (w + 2 * o, h + 2 * o), (0, 0, 0, 0))
            ld = ImageDraw.Draw(lay)
            acc = 0.0
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                seg = math.hypot(bx - ax, by - ay)
                if acc >= L:
                    break
                k = min(1.0, (L - acc) / seg)
                ld.line([(ax + o, ay + o), (ax + o + (bx - ax) * k, ay + o + (by - ay) * k)], fill=GOLD + (255,), width=3 * q)
                acc += seg
            paste_tf(canvas, lay, self.cx, self.cy)
        return box

    def _M4(self, t, ms, left, u, canvas):
        q = self.q
        a = min(ss(ms / 300), 1 - eic(1 - left / 320) if left < 320 else 1.0)
        below = max(0.0, SUB_FORBID_Y - self.rect[3] - PAD["M4"]) * q  # trượt lên từ dưới / rơi khi ra: không qua vạch phụ đề
        dy = min(40 * q, below) * (1 - eoc(ms / 500)) + (min(20 * q, below) * eic(1 - left / 320) if left < 320 else 0)
        card = self.base.copy()
        x0, y0, x1, y1 = self.inner
        ph = self._photo(0, u, t)
        rv = ss((ms - 100) / 500)
        if rv > 0:
            m = Image.new("L", ph.size, 0)
            ImageDraw.Draw(m).rectangle((0, 0, ph.width, int((ph.height + 20 * q) * rv)), fill=255)
            card.paste(ph, (x0, y0), m.filter(ImageFilter.GaussianBlur(10 * q)))
        if self.label:
            rl = ss((ms - 280) / 350)
            ImageDraw.Draw(card).rectangle((x0, y1 + 10 * q, x0 + int(70 * q * rl), y1 + 13 * q), fill=(0xC8, 0x10, 0x2E, 255))
            lu = eoc((ms - 350) / 450)
            if lu > 0:
                lb = self.lbl.copy()
                lb.putalpha(lb.getchannel("A").point(lambda v: int(v * lu)))
                card.alpha_composite(lb, (x0, int(y1 + 6 * q + 20 * q * (1 - lu))))
        sh, _ = self.shadow
        paste_tf(canvas, sh, self.cx, self.cy + dy, 1, 0, a)
        return paste_tf(canvas, card, self.cx, self.cy + dy, 1, 0, a)

    def _M5(self, t, ms, left, u, canvas):
        q = self.q
        a = min(ss(ms / 300), 1 - ss(1 - left / 350) if left < 350 else 1.0)
        drop = min(160 * q, max(0.0, SUB_FORBID_Y - self.rect[3] - PAD["M5"] * 0.5) * q) * (1 - eob(ms / 600, 1.1))  # không rơi qua vạch phụ đề
        lift = -60 * q * ss(1 - left / 350) if left < 350 else 0.0
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
        q = self.q
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
            half = math.hypot(p["card"].width, p["card"].height) / 2 + 30 * q
            room = (SAFE[2] * q - (tx + half)) if self.side > 0 else ((tx - half) - SAFE[0] * q)
            fx = tx + self.side * min(450 * q, max(0.0, room)) * (1 - pos)
            card = p["card"].copy()
            card.paste(self._photo(i, u, t), (p["bw"], p["bw"]))
            sh, _ = p["shadow"]
            paste_tf(canvas, sh, fx, ty, sc, ang, al)
            b = paste_tf(canvas, card, fx, ty, sc, ang, al)
            if b:
                box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        return box


# ---------------------------------------------------------------- M3 · split screen + cột ảnh (khúc cuối, C3 M3)

M3_CARD = (100, 60, 1300, 940)          # thẻ người nói (200,120)–(2600,1880) @4K, video thu 0,815
M3_TILE = (470, 283)                    # ô 940×566 @4K
M3_COL_X, M3_GAP = 1350, 15             # cột x2700 @4K, cách 31 → 15
M3_OPEN, M3_CLOSE = 0.9, 1.0            # mở 900 ms, đóng 1000 ms (smootherstep)


def pick_m3(broll, rev_spans, busy, dur):
    """Chọn cửa sổ M3 (R2.3: M3 chỉ ở khúc cuối = sau đoạn doanh thu / kết quả, trước câu chào cuối) [AI SUY LUẬN — OWNER chưa nói mốc].
    Điều kiện cho CẢ CỬA SỔ (không chỉ từng ảnh — phản biện 22/10 P1-2): 2–5 ô ảnh ở 40 % cuối video, sau mọi câu doanh thu;
    cửa sổ [ô đầu − 0,9 s mở, ô cuối + 2,4 s + 1,0 s đóng] không giao câu doanh thu / khung vẽ / FS / vệt sáng (busy đã gồm ±1 s),
    dài ≤ 16 s (P1-1), kết thúc ≤ hết video − 2,5 s (câu chào cuối toàn khung); ô cách nhau ≥ 0,9 s (R3.3.7).
    Ô cuối luôn vào TRƯỚC lúc bắt đầu đóng (P2-2) vì t1 tính từ chính ô cuối. Chọn cửa sổ nhiều ô nhất, sớm nhất. Trả dict hoặc None."""
    tail = max(0.6 * dur, (max(b for _, b in rev_spans) + 0.3) if rev_spans else 0.0)
    cand = []
    for b in sorted(broll, key=lambda x: float(x["t0"])):
        t = float(b["t0"])
        if t >= tail + M3_OPEN and (not cand or t - cand[-1]["t"] >= 0.9):
            cand.append({"t": t, "file": b["file"], "b": b})
    blocked = list(rev_spans) + list(busy)
    best = None
    for i in range(len(cand)):
        for j in range(min(len(cand), i + 5) - 1, i, -1):
            t0, t1 = cand[i]["t"] - M3_OPEN, cand[j]["t"] + 2.4 + M3_CLOSE
            if t1 > dur - 2.5 or t1 - t0 > 16.0 or any(a_ < t1 and t0 < b_ for a_, b_ in blocked):
                continue
            if best is None or j - i + 1 > len(best["tiles"]):
                best = {"t0": t0, "t1": t1, "tiles": cand[i:j + 1]}
            break
    return best


class VideoReader:
    """Đọc tuần tự khung của nền đã cắt khung / cân màu (KHÔNG zoom — R3.3.8 không zoom trong cửa sổ M3) cho đoạn [t0, t0 + n/30).
    `vf` phải thu về đúng (CW·RQ)×(CH·RQ) — 4K đọc nguồn ở 3840×2160 (người nói trong thẻ M3 là điểm ảnh 4K gốc)."""

    def __init__(self, src, t0, n, vf):
        self.n, self.k, self.size = n, 0, (CW * RQ, CH * RQ)
        self.fsz = self.size[0] * self.size[1] * 3
        self.p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{t0:.3f}", "-i", src, "-frames:v", str(n), "-vf", vf,
                                   "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        self.last = Image.new("RGB", self.size, (0, 0, 0))

    def read(self):
        if self.k < self.n:
            buf = self.p.stdout.read(self.fsz)
            if len(buf) == self.fsz:
                self.last = Image.frombuffer("RGB", self.size, buf)
            elif self.k < self.n - 2:  # hỏng giữa chừng (lọc sai, nguồn ngắn): dừng bản dựng, không ra thẻ đen / đứng hình (phản biện P2-3)
                self.close()
                raise RuntimeError(f"M3: đọc khung nền lỗi ở khung {self.k}/{self.n}")
            self.k += 1
        return self.last

    def close(self):
        try:
            self.p.stdout.close()
            self.p.kill()
            self.p.wait(timeout=5)
        except Exception:
            pass


class Split3:
    """M3: người nói thu vào thẻ (100,60)–(1300,940) bo R20 viền vàng 55 %, nền gradient navy #0B1426 → #16263F; khung cắt ngang
    quanh mặt (cố định cả đoạn, không bám từng khung — R3.3.2); cột 3 ô bên phải: ô mới vào trên cùng bằng lộ từ trên (mép mềm,
    600 ms) + scale 0,96→1, ô cũ trượt xuống 1 bậc (600 ms), ô đáy mờ hết 0,30 s TRƯỚC khi ô mới vào (R3.3.5 → không bao giờ có ô
    thứ 4); ô chỉ hiện khi thẻ đã thu ≥ 85 % (R3.3.6); đóng: ô mờ tại chỗ, thẻ phóng ra toàn khung."""

    def __init__(self, m3, reader, face_cx, tiles_media):
        """face_cx ở hệ thiết kế; tiles_media: ảnh ô cỡ M3_TILE·RQ; reader trả khung (CW·RQ)×(CH·RQ). Vẽ ở RQ lúc tạo."""
        self.t0, self.t1, self.reader = m3["t0"], m3["t1"], reader
        self.q = q = RQ
        self.tiles = [dict(x, img=im) for x, im in zip(m3["tiles"], tiles_media)]
        cw = (M3_CARD[2] - M3_CARD[0]) / (M3_CARD[3] - M3_CARD[1]) * CH  # bề rộng cửa sổ nguồn giữ tỉ lệ thẻ
        self.win = (min(max(face_cx - cw / 2, 0), CW - cw) * q, cw * q)  # px ở độ phân giải vẽ
        g = np.linspace(0, 1, CH * q)[:, None, None]
        top, bot = np.array([0x0B, 0x14, 0x26]), np.array([0x16, 0x26, 0x3F])
        self.bg = Image.fromarray((top * (1 - g) + bot * g).repeat(CW * q, 1).astype(np.uint8)).convert("RGBA")

    def progress(self, t):
        return max(0.0, ss((t - self.t0) / M3_OPEN) - ss((t - (self.t1 - M3_CLOSE)) / M3_CLOSE))

    def frame(self, t):
        """Nền M3 (đục) cho khung t, hoặc None ngoài cửa sổ. Phải gọi đúng thứ tự khung (đọc video tuần tự)."""
        if t < self.t0 or t >= self.t1:
            return None
        src = self.reader.read()
        p = self.progress(t)
        q = self.q
        L = lambda a, b: a + (b - a) * p  # noqa: E731
        x0, y0, x1, y1 = L(0, M3_CARD[0] * q), L(0, M3_CARD[1] * q), L(CW * q, M3_CARD[2] * q), L(CH * q, M3_CARD[3] * q)
        wx, ww = self.win
        sx0, sx1 = L(0, wx), L(CW * q, wx + ww)
        out = self.bg.copy()
        w, h = max(2, int(round(x1 - x0))), max(2, int(round(y1 - y0)))
        card = src.crop((int(sx0), 0, int(round(sx1)), CH * q)).resize((w, h), Image.BILINEAR).convert("RGBA")
        r = int(20 * q * p)
        if r:
            card.putalpha(rounded_mask((w, h), r, 0))
            sh, pad = drop_shadow(card.getchannel("A"), 0.5 * p, 15 * q, 7 * q)
            out.alpha_composite(sh, (int(x0) - pad, int(y0) - pad))
        out.alpha_composite(card, (int(x0), int(y0)))
        if p > 0.02:
            rim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            ImageDraw.Draw(rim).rounded_rectangle((0, 0, w - 1, h - 1), radius=max(r, q), outline=GOLD + (int(255 * 0.55 * p),), width=q)
            out.alpha_composite(rim, (int(x0), int(y0)))
        return out

    def tiles_frame(self, t, layer):
        """Cột ô ảnh (vẽ vào lớp nội dung (CW·RQ)×(CH·RQ) để đo title-safe). Trả các hộp đã vẽ (hệ thiết kế)."""
        if t < self.t0 or t >= self.t1:
            return []
        q = self.q
        tw, th = M3_TILE[0] * q, M3_TILE[1] * q
        boxes = []
        ready = self.t0 + 0.75 * M3_OPEN  # ss(0,75) ≈ 0,90 ≥ 85 %: thẻ đã thu đủ
        close_a = 1 - ss((t - (self.t1 - M3_CLOSE)) / (0.6 * M3_CLOSE))
        starts = [max(x["t"], ready) for x in self.tiles]
        shown = [i for i, st in enumerate(starts) if st <= t]
        for i in shown:
            st = starts[i]
            newer = [j for j in shown if j > i]
            # ô thứ 4 không bao giờ có: ô bị đẩy xuống bậc 3 thì đã mờ hết 0,30 s trước khi ô mới vào
            if len(newer) >= 3:
                continue
            nxt3 = starts[i + 3] if i + 3 < len(starts) else None
            fade3 = 1.0 if nxt3 is None or len(newer) < 2 else max(0.0, min(1.0, (nxt3 - t) / 0.30))
            slot = 0.0
            for j in newer:
                slot += ss((t - starts[j]) / 0.6)
            u = ss((t - st) / 0.6)
            y = M3_CARD[1] + slot * (M3_TILE[1] + M3_GAP)
            if y + M3_TILE[1] > M3_CARD[3] + 0.5:
                continue
            tile = self.tiles[i]["img"].copy()
            m = Image.new("L", (tw, th), 0)
            ImageDraw.Draw(m).rectangle((0, 0, tw, int((M3_TILE[1] + 40) * q * u)), fill=255)
            m = ImageChops_multiply(m.filter(ImageFilter.GaussianBlur(14 * q)), rounded_mask((tw, th), 12 * q, 0))
            tile.putalpha(m)
            sc = 0.96 + 0.04 * u
            b = paste_tf(layer, tile, (M3_COL_X + M3_TILE[0] / 2) * q, (y + M3_TILE[1] / 2) * q, sc, 0, min(fade3, close_a))
            if b:
                boxes.append(b if q == 1 else tuple(v / q for v in b))
        return boxes


def ImageChops_multiply(a, b):
    from PIL import ImageChops
    return ImageChops.multiply(a, b)


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
    # M3: chọn đúng khúc cuối; không bao giờ có ô thứ 4; ô không lấn thẻ người nói; mọi khung trong title-safe; nền đục
    br = [{"t0": 20.0, "t1": 22.0, "file": "a"}, {"t0": 70.0, "t1": 72.0, "file": "b"}, {"t0": 72.0, "t1": 74.0, "file": "c"},
          {"t0": 73.5, "t1": 75.0, "file": "d"}, {"t0": 75.0, "t1": 76.5, "file": "e"}]
    m3 = pick_m3(br, [(60.0, 64.0)], [], 90.0)
    check(m3 is not None and [x["file"] for x in m3["tiles"]] == ["b", "c", "d", "e"], f"M3 khúc cuối: {m3 and [x['file'] for x in m3['tiles']]}")
    check(pick_m3(br, [(80.0, 85.0)], [], 90.0) is None, "M3 không mở trước / trong đoạn doanh thu")
    check(pick_m3(br[:2], [], [], 90.0) is None, "M3 cần ≥ 2 ảnh ở khúc cuối")
    many = pick_m3([{"t0": 70 + k, "t1": 70.5 + k, "file": f"f{k}"} for k in range(15)], [], [], 100.0)
    check(many and len(many["tiles"]) <= 5 and many["t1"] - many["t0"] <= 16.0, f"P1-1: cửa sổ ≤ 16 s, ≤ 5 ô: {many and (many['t0'], many['t1'], len(many['tiles']))}")
    dia = pick_m3([{"t0": 70.0, "t1": 71.0, "file": "a"}, {"t0": 76.0, "t1": 77.0, "file": "b"}], [], [(71.5, 74.5)], 100.0)
    check(dia is None, f"P1-2: sơ đồ nằm trong cửa sổ → không M3: {dia}")
    late = pick_m3([{"t0": 25.0, "t1": 26.0, "file": "a"}, {"t0": 27.4, "t1": 27.5, "file": "b"}], [], [], 30.0)
    check(late is None or all(x["t"] <= late["t1"] - M3_CLOSE - 0.5 for x in late["tiles"]), f"P2-2: ô cuối vào trước lúc đóng: {late}")

    class FakeReader:
        def read(self):
            return Image.new("RGB", (CW, CH), (90, 120, 150))

        def close(self):
            pass
    if m3:
        sp = Split3(m3, FakeReader(), 960, [Image.new("RGBA", M3_TILE, (200, 50, 50, 255)) for _ in m3["tiles"]])
        most = 0
        t = m3["t0"]
        while t < m3["t1"]:
            base = sp.frame(t)
            lay = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
            bx = sp.tiles_frame(t, lay)
            most = max(most, len(bx))
            check(base is not None and base.getchannel("A").getextrema()[0] == 255, "nền M3 phải đục toàn khung")
            bb = lay.getchannel("A").point(lambda v: 255 if v > 5 else 0).getbbox()
            if bb and not (bb[0] >= M3_CARD[2] and bb[0] >= SAFE[0] and bb[1] >= SAFE[1] - 1 and bb[2] <= SAFE[2] and bb[3] <= SUB_FORBID_Y):
                check(False, f"ô M3 lúc {t:.2f}s lấn thẻ / lọt safe {bb}")
                break
            t += 1 / 15
        check(1 <= most <= 3, f"M3: tối đa 3 ô cùng lúc (thấy {most})")
    _test_face_track_stream(check)
    _test_4k_native(check)
    print(f"ngang tự kiểm: {'đạt' if not bad else f'{bad} lỗi'}")
    return bad == 0


def _hf(a):
    """Chi tiết vượt nửa độ phân giải trên biên: |I − phóng×2(thu÷2(I))| trung bình ở điểm ảnh biên (cùng thước đo selftest 4K)."""
    a = np.asarray(a, np.float32)
    h, w = a.shape
    rt = np.asarray(Image.fromarray(a).resize((w // 2, h // 2), Image.BOX).resize((w // 2 * 2, h // 2 * 2), Image.LANCZOS), np.float32)
    a = a[:h // 2 * 2, :w // 2 * 2]
    gy, gx = np.gradient(a)
    edge = np.hypot(gx, gy) > 20
    return float(np.abs(a - rt)[edge].mean()) if edge.sum() > 50 else 0.0


def _test_face_track_stream(check):
    """face_track đọc từng khung qua ống: (1) cùng mốc thời gian + cùng hộp mặt với cách cũ (đọc cả nguồn vào một mảng rồi dò);
    (2) bộ nhớ Python đỉnh KHÔNG tăng theo thời lượng (clip 40 s ≈ clip 10 s), cách cũ tăng tuyến tính; (3) thứ tự hộp tất định.
    Nguồn: lavfi + mặt vẽ bằng PIL (không tài sản ngoài)."""
    import shutil
    import tempfile
    import tracemalloc
    import cv2
    d = tempfile.mkdtemp()
    try:
        fw, fh = 150, 188
        fimg = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        dr = ImageDraw.Draw(fimg)
        dr.ellipse((0, 0, fw - 1, fh - 1), fill=(200, 170, 140, 255))
        for cx in (0.3, 0.7):
            dr.rectangle((fw * (cx - 0.15), fh * 0.30, fw * (cx + 0.15), fh * 0.34), fill=(40, 34, 28, 255))
            dr.ellipse((fw * (cx - 0.10), fh * 0.38, fw * (cx + 0.10), fh * 0.46), fill=(30, 26, 21, 255))
        dr.polygon([(fw * 0.5, fh * 0.45), (fw * 0.42, fh * 0.62), (fw * 0.58, fh * 0.62)], fill=(150, 128, 105, 255))
        dr.rectangle((fw * 0.33, fh * 0.72, fw * 0.67, fh * 0.76), fill=(60, 51, 42, 255))
        fimg.filter(ImageFilter.GaussianBlur(2)).save(os.path.join(d, "face.png"))
        vids = {}
        for sec in (10, 40):
            v = os.path.join(d, f"f{sec}.mp4")
            # mặt đi ngang + ẩn / hiện theo chu kỳ, mặt thứ hai nhỏ hơn thỉnh thoảng (nhiều hộp / mẫu)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s=640x360:r=10:d={sec}", "-loop", "1", "-i", os.path.join(d, "face.png"),
                            "-filter_complex", "[1:v]split[a][b];[b]scale=90:113[c];[0:v][a]overlay=x='60+300*(1+sin(t/3))/2':y=60:enable='lt(mod(t,9),7)':shortest=1[p];"
                            "[p][c]overlay=x=520:y=120:enable='between(mod(t,7),2,5)':shortest=1", "-t", str(sec), "-c:v", "libx264", "-preset", "ultrafast",
                            "-pix_fmt", "yuv420p", v], check=True)
            vids[sec] = v
        cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

        def old_way(src):  # bản cũ: cả nguồn vào MỘT mảng rồi mới dò
            p = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps=2.0000,scale={FT_W}:{FT_H},format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True)
            raw = np.frombuffer(p.stdout, np.uint8)
            return plausible([(k * 0.5, face_boxes(cas.detectMultiScale(raw[k * FT_W * FT_H:(k + 1) * FT_W * FT_H].reshape(FT_H, FT_W), 1.1, 6, minSize=(48, 48))))
                              for k in range(len(raw) // (FT_W * FT_H))])

        def peak(f, *a):
            tracemalloc.start()
            r = f(*a)
            pk = tracemalloc.get_traced_memory()[1]
            tracemalloc.stop()
            return r, pk / 2 ** 20
        new40, pk_new40 = peak(face_track, vids[40], {}, None)
        old40, pk_old40 = peak(old_way, vids[40])
        new10, pk_new10 = peak(face_track, vids[10], {}, None)
        canon = lambda tr: [(t, sorted(b)) for t, b in tr]  # noqa: E731
        check([t for t, _ in new40] == [k * 0.5 for k in range(80)], f"face_track luồng: mốc thời gian 0, 0,5 … 39,5 s ({len(new40)} mẫu)")
        check(canon(new40) == canon(old40), "face_track luồng phải ra cùng hộp mặt với cách đọc cả mảng")
        nf = sum(1 for _, b in new40 if b)
        check(nf >= 30 and any(len(b) >= 2 for _, b in new40), f"clip thử phải có mặt để so (≥ 30 mẫu có mặt, có mẫu 2 mặt): {nf}")
        check(face_track(vids[40], {}, None) == new40, "face_track tất định (cả thứ tự hộp)")
        check(pk_new40 < 8 and pk_new40 < 1.5 * pk_new10 + 1, f"bộ nhớ đỉnh không tăng theo thời lượng: 10 s {pk_new10:.1f} MB, 40 s {pk_new40:.1f} MB")
        check(pk_old40 > 4 * pk_new40, f"đối chứng: cách cũ phải tốn hơn hẳn ({pk_old40:.1f} MB vs {pk_new40:.1f} MB) — không thì phép đo không phân biệt được")
        # lỗi trong lúc dò (sau khung đầu): ống / ffmpeg phải đóng NGAY khi face_track thoát, kể cả khi traceback còn được giữ
        # (giữ traceback = giữ khung của face_track → không có closing thì generator + ffmpeg còn sống tới khi GC)
        global face_boxes
        procs, real_popen, real_fb = [], subprocess.Popen, face_boxes

        def spy(*a, **k):
            p = real_popen(*a, **k)
            procs.append(p)
            return p

        def boom(fcs):
            raise RuntimeError("thử lỗi dò mặt")
        subprocess.Popen, face_boxes = spy, boom
        err = None
        try:
            face_track(vids[40], {}, None)
        except RuntimeError as e:
            err = e
        finally:
            subprocess.Popen, face_boxes = real_popen, real_fb
        check(err is not None and procs and procs[0].poll() is not None, f"lỗi giữa chừng: ffmpeg phải dừng ngay ({procs and procs[0].poll()})")
        del err
        print(f"ngang face_track luồng: {len(new40)} mẫu ({nf} có mặt) khớp cách cũ; đỉnh Python 40 s {pk_new40:.1f} MB (10 s {pk_new10:.1f} MB) — cách cũ {pk_old40:.1f} MB")
    finally:
        shutil.rmtree(d, ignore_errors=True)


def _test_4k_native(check):
    """4K (RQ = 2): thẻ M1–M6 và M3 vẽ thẳng ở 3840×2160 — cỡ thẻ / ảnh trong thẻ gấp đôi, cùng bố cục với RQ = 1 (thu ÷2 khớp, hộp trả
    về ở hệ thiết kế khớp), sắc hơn hẳn bản 1080 phóng ×2. RQ = 1 không đổi (đã kiểm ở trên và bằng so khung bản dựng 1080)."""
    import tempfile
    global RQ
    d = tempfile.mkdtemp()
    img = os.path.join(d, "detail.png")
    yy, xx = np.mgrid[0:1800, 0:2880]
    pat = np.where(((xx // 96) + (yy // 96)) % 2 == 0, 230, 25).astype(np.uint8)  # ô cờ 96 px + đường chéo mảnh: biên sắc, không răng cưa (moiré làm sai thước đo)
    dimg = Image.fromarray(np.dstack([pat, 255 - pat, pat // 2]))
    for k in range(0, 2880, 160):
        ImageDraw.Draw(dimg).line([(k, 0), (k + 900, 1800)], fill=(255, 255, 255), width=6)
    dimg.save(img)
    rect = (140, 120, 840, 560)
    rows = []
    try:
        for kind in ("M1", "M2", "M4", "M5", "M6"):
            r = rect if kind != "M5" else (300, 80, 520, 530)
            n = 3 if kind == "M6" else (2 if kind == "M5" else 1)
            out = {}
            for q in (1, 2):
                RQ = q
                c = Card(kind, 0.0, 3.0, r, [None] * n, "ĐỒNG ĐỘI" if kind == "M4" else "", 1)
                c.media = [(load_media(img, c.media_size(j)), 1) for j in range(n)]
                cv = Image.new("RGBA", (CW * q, CH * q), (0, 0, 0, 0))
                box = c.frame(1.5, cv)
                out[q] = (c, cv, box)
            RQ = 1
            (c1, cv1, b1), (c2, cv2, b2) = out[1], out[2]
            check((c2.w, c2.h) == (2 * c1.w, 2 * c1.h), f"{kind} 4K: cỡ thẻ phải gấp đôi {c1.w}x{c1.h} → {c2.w}x{c2.h}")
            ms1, ms2 = c1.media_size(0), c2.media_size(0)
            check(all(abs(v2 - 2 * v1) <= 2 for v1, v2 in zip(ms1, ms2)), f"{kind} 4K: ảnh trong thẻ phải nạp ở cỡ gấp đôi {ms1} → {ms2}")
            check(b1 is not None and b2 is not None and all(abs(v2 - v1) <= 2 for v1, v2 in zip(b1, b2)), f"{kind} 4K: hộp trả về (hệ thiết kế) phải khớp RQ=1: {b1} vs {b2}")
            soft = lambda a: np.asarray(a.filter(ImageFilter.GaussianBlur(1.5)), np.float32)  # noqa: E731
            lay = float(np.abs(soft(cv2.getchannel("A").resize((CW, CH), Image.BOX)) - soft(cv1.getchannel("A"))).mean())
            check(lay < 1.0, f"{kind} 4K: thu ÷2 phải khớp bố cục RQ=1 (lệch alpha TB {lay:.2f})")
            bb = cv2.getchannel("A").point(lambda v: 255 if v > 5 else 0).getbbox()
            check(bb is not None and bb[0] >= SAFE[0] * 2 - 2 and bb[1] >= SAFE[1] * 2 - 2 and bb[2] <= SAFE[2] * 2 + 2 and bb[3] <= SUB_FORBID_Y * 2 + 2,
                  f"{kind} 4K: trong title-safe {bb}")
            g = lambda cv: np.asarray(cv.convert("L"), np.float32) * np.asarray(cv.getchannel("A"), np.float32) / 255  # noqa: E731
            x0, y0, x1, y1 = bb
            up = np.asarray(Image.fromarray(g(cv1)).resize((CW * 2, CH * 2), Image.LANCZOS), np.float32)[y0:y1, x0:x1]
            s1, s2 = _hf(up), _hf(g(cv2)[y0:y1, x0:x1])
            need = 1.2 if kind == "M6" else 1.5  # M6: ảnh in xoay (BICUBIC) mềm ở cả hai độ phân giải
            check(s2 > need * s1, f"{kind} 4K: vẽ gốc phải sắc hơn 1080 phóng ×2 ≥ {need} lần (chi tiết {s1:.1f} → {s2:.1f})")
            rows.append(f"{kind} {c1.w}x{c1.h}→{c2.w}x{c2.h} chi tiết {s1:.1f}→{s2:.1f}")
        # M3: nền + cột ô vẽ thẳng 3840×2160, hộp ô (hệ thiết kế) khớp RQ = 1
        m3 = pick_m3([{"t0": 70.0, "t1": 72.0, "file": "b"}, {"t0": 72.0, "t1": 74.0, "file": "c"}, {"t0": 73.5, "t1": 75.0, "file": "d"}], [], [], 90.0)

        class FR:
            def __init__(self, q):
                self.im = Image.fromarray(np.dstack([pat] * 3)).resize((CW * q, CH * q))

            def read(self):
                return self.im
        res = {}
        for q in (1, 2):
            RQ = q
            sp = Split3(m3, FR(q), 960, [load_media(img, (M3_TILE[0] * q, M3_TILE[1] * q))[0].resize((M3_TILE[0] * q, M3_TILE[1] * q)) for _ in m3["tiles"]])
            t = m3["tiles"][-1]["t"] + 1.0
            base = sp.frame(t)
            lay = Image.new("RGBA", (CW * q, CH * q), (0, 0, 0, 0))
            res[q] = (base, sp.tiles_frame(t, lay), lay)
        RQ = 1
        check(res[2][0].size == (CW * 2, CH * 2) and res[1][0].size == (CW, CH), f"M3 4K: nền phải {CW * 2}x{CH * 2}: {res[2][0].size}")
        check(len(res[1][1]) == len(res[2][1]) and all(abs(v2 - v1) <= 2 for p1, p2 in zip(res[1][1], res[2][1]) for v1, v2 in zip(p1, p2)),
              f"M3 4K: hộp ô (hệ thiết kế) phải khớp RQ=1: {res[1][1]} vs {res[2][1]}")
        b2 = np.asarray(res[2][0].convert("L").resize((CW, CH), Image.BOX), np.float32)
        b1 = np.asarray(res[1][0].convert("L"), np.float32)
        x0, y0, x1, y1 = M3_CARD
        check(float(np.abs(b2 - b1)[y0 + 20:y1 - 20, x0 + 20:x1 - 20].mean()) < 25, "M3 4K: thẻ người nói thu ÷2 phải khớp bố cục RQ=1")
        rows.append(f"M3 nền {res[2][0].size[0]}x{res[2][0].size[1]}, {len(res[2][1])} ô")
        print("ngang 4K vẽ gốc: " + "; ".join(rows))
    finally:
        RQ = 1
        import shutil
        shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    import sys
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
