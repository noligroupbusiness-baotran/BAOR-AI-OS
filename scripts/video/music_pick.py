"""Chọn nhạc nền cho bộ dựng từ thư viện DATA_DIR/video-assets/music/manifest.json (không phụ thuộc numpy / PIL → test được ở CI).

Luật: bộ dựng chỉ TỰ chọn bài đã được OWNER nghe duyệt (giấy phép không còn "chờ OWNER"); bài nạp từ kho tư liệu
(scripts/video/library_sync.py) mang "chờ OWNER nghe duyệt" cho tới khi OWNER bấm "Duyệt dùng" trong Cài đặt › Thư viện nhạc nền.
"""
import hashlib
import json
import os

MUSIC_PENDING = "chờ OWNER"
# Phần chung (A) A5.2 / A15 / CK-11 (QĐ-CEO 1010): KHÔNG dùng — Pixabay 552792, 241274 (LOẠI), 136824 (chưa tra bên thứ ba
# đăng lại → chưa được dùng). Không bao giờ dùng, kể cả khi manifest còn ghi giấy phép / "default" / OWNER duyệt.
BANNED_IDS = ("552792", "241274", "136824")
# Mixkit: QĐ-CEO 1010 cấm toàn bộ; OWNER 25/10/2026 mở lại CHỈ các bài OWNER đã nghe duyệt ("Mở lại cả 27 bài Mixkit") → bài Mixkit
# chưa duyệt vẫn không dùng; library_sync vẫn KHÔNG nạp Mixkit mới từ kho.
BANNED_SOURCES = ("mixkit",)
OWNER_OK = "OWNER nghe duyệt"
A5_NO_MUSIC = ("chưa có bài đạt luật A5 (giấy phép thương mại rõ, không nhãn AI, OWNER đã nghe duyệt; Mixkit chỉ bài OWNER duyệt "
               "(QĐ OWNER 25/10/2026); không 552792 / 241274 / 136824) → bản KHÔNG nhạc theo Phần chung A5.2")


def banned(x):
    hay = f"{x.get('file', '')} {x.get('source', '')} {x.get('license', '')}".lower()
    if any(i in hay for i in BANNED_IDS):
        return next(i for i in BANNED_IDS if i in hay)
    if any(s in hay for s in BANNED_SOURCES) and OWNER_OK not in str(x.get("license", "")):
        return next(s for s in BANNED_SOURCES if s in hay)
    return None


def music_library(data_dir):
    """Thư viện nhạc DATA_DIR/video-assets/music/manifest.json: chỉ bài có giấy phép, có tệp, không bị loại, không thuộc bài LOẠI (A5).
    Bài nạp từ kho tư liệu (scripts/video/library_sync.py) mang "chờ OWNER nghe duyệt" cho tới khi OWNER duyệt trong app."""
    d = os.path.join(data_dir, "video-assets", "music")
    try:
        items = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [{**x, "path": os.path.join(d, x["file"])} for x in items if isinstance(x, dict) and x.get("file")
            and str(x.get("license", "")).strip() and not x.get("exclude") and not banned(x) and os.path.isfile(os.path.join(d, x["file"]))]


def music_genres(lib):
    """{loại: [tâm trạng]} để biên tập AI chọn loại nhạc hợp nội dung (gồm cả bài chưa duyệt: AI chọn LOẠI, không chọn bài)."""
    out = {}
    for x in lib:
        if x.get("genre"):
            out.setdefault(x["genre"], [])
            out[x["genre"]] += [m for m in x.get("mood", []) if m not in out[x["genre"]]]
    return out


def _by_seed(items, seed):
    items = sorted(items, key=lambda x: x["file"])
    return items[int(hashlib.sha256(seed.encode()).hexdigest(), 16) % len(items)]


def pick_music(lib, mood=None, seed=""):
    """Chọn bài nhạc nền, cố định theo video (dựng lại không đổi nhạc). Thứ tự:
    1) bài OWNER đã duyệt thuộc loại nhạc AI chọn; 2) bài mặc định đã duyệt;
    3) chưa có bài duyệt dùng được → bài kho ĐỦ-HỒ-SƠ hợp loại (không hợp thì bất kỳ bài ĐỦ-HỒ-SƠ) để OWNER nghe ngay trong bản dựng —
       giấy phép vẫn mang "chờ OWNER nghe duyệt" nên bảng kiểm P CHẶN ĐĂNG cho tới khi OWNER duyệt bài đó (Skill ESV B9 P / A5).
    Không bao giờ dùng bài LOẠI (BANNED_IDS) hay bài kho không ghi ĐỦ-HỒ-SƠ."""
    ok = [x for x in lib if MUSIC_PENDING not in str(x.get("license", ""))]
    fit = lambda x: mood and (x.get("genre") == mood or mood in x.get("mood", []))  # noqa: E731
    pend = [x for x in lib if MUSIC_PENDING in str(x.get("license", "")) and x.get("catalogStatus") == "ĐỦ-HỒ-SƠ"]
    info = {"mood": mood, "suggest": sorted(x["file"] for x in pend if fit(x))[:3]}
    fits = [x for x in ok if fit(x)]
    if fits:
        c = _by_seed(fits, seed)
        return c["path"], c["license"], {**info, "chosenBy": f"hợp loại nhạc '{mood}' ({len(fits)} bài đã duyệt)"}
    dflt = sorted([x for x in ok if x.get("default")], key=lambda x: x["file"])
    if dflt:
        why = "bài mặc định" + (f" (loại '{mood}' chưa có bài OWNER duyệt)" if mood else "")
        return dflt[0]["path"], dflt[0]["license"], {**info, "chosenBy": why}
    # Không còn dự phòng "bài chờ duyệt": A5.2 — chưa có bài đạt thì giao bản KHÔNG nhạc, ghi rõ (không trộn bài chưa đạt)
    if ok:
        c = sorted(ok, key=lambda x: x["file"])[0]
        return c["path"], c["license"], {**info, "chosenBy": "bài đã duyệt duy nhất còn lại"}
    return None, "", {**info, "reason": A5_NO_MUSIC}
