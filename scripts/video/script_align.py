#!/usr/bin/env python3
"""Sửa lời máy nghe theo KỊCH BẢN đã duyệt (S4 Nội dung → Video).

Nguyên tắc (không bịa, không xoá lời OWNER nói thêm):
  - So chuỗi từ máy nghe với chuỗi từ kịch bản theo dạng BỎ DẤU (difflib) → chỉ THAY từ tại chỗ, không thêm / bớt từ,
    nên mốc thời gian của từng từ giữ nguyên.
  - Khối khớp (bỏ dấu giống nhau) mà dấu khác → lấy dấu theo kịch bản ("phá bang" → "phá băng").
  - Khối thay thế cùng số từ (≤ 3) → chỉ thay từ máy nghe CHƯA CHẮC (hoặc xác suất thấp) và gần giống từ kịch bản.
  - OWNER nói khác kịch bản (thêm câu, đổi ý) → giữ nguyên lời nói thật.
Từ đã sửa: uncertain = False (kịch bản đã duyệt xác nhận), ghi scriptFix để báo cáo.
"""
import difflib, re, sys, unicodedata


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower()).replace("đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w%]", "", s)


def tnorm(s):
    return re.sub(r"[^\w%]", "", unicodedata.normalize("NFC", str(s).lower()))


NEG = set("không chưa chẳng chả đừng chớ".split())


def _risky(word, target):
    """Không bao giờ tự thay: con số (giá, số lượng), từ phủ định (đảo nghĩa), tên riêng viết hoa giữa câu khi kịch bản viết thường."""
    if any(ch.isdigit() for ch in word + target):
        return True
    if tnorm(word) in NEG or tnorm(target) in NEG:
        return True
    return False


def script_words(text):
    """Lời nói trong kịch bản → danh sách từ (bỏ thẻ nguồn [S1]/[K2], dấu câu)."""
    text = re.sub(r"\[[SK]\d+\]", " ", text or "")
    return [w for w in (re.sub(r"^[^\w%]+|[^\w%]+$", "", x) for x in unicodedata.normalize("NFC", text).split()) if w]


def _apply(word, target):
    """Thay chữ, giữ dấu câu cuối. Viết hoa: tên riêng trong kịch bản (viết hoa) giữ hoa; từ máy nghe viết hoa (đầu câu) giữ hoa."""
    t = word["text"]
    tail = t[len(t.rstrip(",.?!")):]
    new = target if target[:1].isupper() else (target[:1].upper() + target[1:] if t[:1].isupper() else target)
    return new + tail


def correct(words, script_text, low_p=0.6, min_run=3):
    """Sửa `words` tại chỗ theo kịch bản. Trả danh sách {t, from, to, why}."""
    sw = script_words(script_text)
    if not sw or not words:
        return []
    a = [norm(w["text"]) for w in words]
    b = [norm(x) for x in sw]
    fixes = []
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = sm.get_opcodes()

    def strong(k):
        """Khối k là đoạn khớp ĐỦ DÀI (≥ min_run từ) — chỉ những đoạn này mới là bằng chứng lời nói đang theo kịch bản."""
        return 0 <= k < len(ops) and ops[k][0] == "equal" and (ops[k][2] - ops[k][1]) >= min_run

    for n, (op, i1, i2, j1, j2) in enumerate(ops):
        if op == "equal":
            # Khối khớp NGẮN (< min_run từ) là trùng ngẫu nhiên khi OWNER diễn đạt khác kịch bản ("Cô giáo" ↔ "có"):
            # KHÔNG đổi gì, kể cả cờ "nghe chưa chắc" (để người nghe lại).
            if not strong(n):
                continue
            for k in range(i2 - i1):
                w, target = words[i1 + k], sw[j1 + k]
                # từ nghe chắc ở MÉP đoạn khớp, sát chỗ OWNER rẽ khỏi kịch bản ("… phá băng cô ơi" vs "… có không"): giữ nguyên
                at_edge = (k == 0 and n > 0 and ops[n - 1][0] != "equal") or (k == i2 - i1 - 1 and n + 1 < len(ops) and ops[n + 1][0] != "equal")
                if at_edge and not (w.get("uncertain") or w.get("p", 1.0) < low_p):
                    continue
                if tnorm(w["text"]) != tnorm(target):  # cùng chữ (bỏ dấu giống hệt), khác dấu → dấu theo kịch bản (cả "khong" → "không")
                    old = w["text"]
                    w["text"] = _apply(w, target)
                    w["uncertain"] = False
                    w["scriptFix"] = True
                    fixes.append({"t": round(w["start"], 2), "from": old, "to": w["text"], "why": "dấu theo kịch bản"})
                elif w.get("uncertain"):  # nghe chưa chắc nhưng nằm trong đoạn khớp dài → xác nhận
                    w["uncertain"] = False
                    w["scriptFix"] = True
                    fixes.append({"t": round(w["start"], 2), "from": w["text"], "to": w["text"], "why": "khớp kịch bản, bỏ nghi ngờ"})
        elif op == "replace" and (i2 - i1) <= 3:
            # Chỉ sửa khối khác nhau KẸP GIỮA hai đoạn khớp dài (hoặc ở cuối lời nói: người nói dừng trước khi hết kịch bản),
            # độ dài hai phía gần bằng nhau → đây là chỗ máy nghe sai, không phải câu OWNER nói khác.
            at_end = i2 == len(words)
            # mép tin cậy: đoạn khớp dài, hoặc đoạn khớp chạm đầu / cuối lời nói ("… chị Trà [Dang] nha" — hết câu)
            left_ok = strong(n - 1) or (n - 1 >= 0 and ops[n - 1][0] == "equal" and ops[n - 1][1] == 0)
            right_ok = at_end or strong(n + 1) or (n + 1 < len(ops) and ops[n + 1][0] == "equal" and ops[n + 1][2] == len(words))
            if not left_ok or not right_ok:
                continue
            if not at_end and abs((i2 - i1) - (j2 - j1)) > 1:
                continue
            # mọi từ trong khối phải gần giống kịch bản; có từ khác hẳn → OWNER nói khác, bỏ cả khối ("bán hàng" ≠ "phá băng")
            if any(difflib.SequenceMatcher(None, a[i1 + k], b[j1 + k]).ratio() < 0.6 for k in range(min(i2 - i1, j2 - j1))):
                continue
            for k in range(min(i2 - i1, j2 - j1)):
                w, target = words[i1 + k], sw[j1 + k]
                close = difflib.SequenceMatcher(None, a[i1 + k], b[j1 + k]).ratio() >= 0.6
                # tên riêng máy nghe viết hoa giữa câu mà kịch bản viết thường → không thay ("Lan" ≠ "lành")
                i = i1 + k
                mid_sentence = i > 0 and not words[i - 1]["text"].rstrip().endswith((".", "?", "!"))
                name_clash = mid_sentence and w["text"][:1].isupper() and not target[:1].isupper()
                if close and not name_clash and not _risky(w["text"], target) and (w.get("uncertain") or w.get("p", 1.0) < low_p):
                    old = w["text"]
                    w["text"] = _apply(w, target)
                    w["uncertain"] = False
                    w["scriptFix"] = True
                    fixes.append({"t": round(w["start"], 2), "from": old, "to": w["text"], "why": "nghe chưa chắc, gần giống kịch bản"})
    return fixes


def self_test():
    def W(text, unc=(), p=None):
        return [{"text": x, "start": i * 0.4, "end": i * 0.4 + 0.3, "p": (p or {}).get(i, 0.95), "uncertain": i in unc} for i, x in enumerate(text.split())]
    bad = 0
    # 1) khác dấu → theo kịch bản; viết hoa đầu câu giữ
    w = W("Hôm nay mình chào hỏi phá bang với khách hàng.")
    fx = correct(w, "[S1] Hôm nay mình chào hỏi phá băng với khách hàng.")
    bad += [x["text"] for x in w][6] != "băng" or len(fx) != 1
    # 2) nghe chưa chắc + gần giống → sửa; nghe chắc mà khác → GIỮ (OWNER nói khác kịch bản)
    w = W("em gọi chị bên chỗ chị Trà Dang nha", unc={7})
    correct(w, "em gọi chị bên chỗ chị Trà Giang nha")
    bad += w[7]["text"] != "Giang" or w[7]["uncertain"]
    w = W("em gọi chị bên chỗ chị Mai nha")
    correct(w, "em gọi chị bên chỗ chị Trà Giang nha")
    bad += [x["text"] for x in w] != "em gọi chị bên chỗ chị Mai nha".split()
    # 3) OWNER nói thêm câu ngoài kịch bản → không xoá, không chèn; số từ và mốc giữ nguyên
    w = W("dạ alo chị ơi hôm nay trời đẹp quá mình chào hỏi phá băng")
    n0 = [(x["start"], x["end"]) for x in w]
    correct(w, "mình chào hỏi phá băng")
    bad += len(w) != 14 or [(x["start"], x["end"]) for x in w] != n0
    # 4) từ nghe chưa chắc nhưng khớp đúng kịch bản → bỏ nghi ngờ
    w = W("tìm một cái điểm chung", unc={2})
    correct(w, "tìm một cái điểm chung")
    bad += w[2]["uncertain"]
    # 4b) người nói dừng trước khi hết kịch bản: từ cuối nghe chưa chắc vẫn được sửa
    w = W("với chị Trà Dang", unc={3})
    correct(w, "với chị Trà Giang hỏi tuổi rồi dành tặng một lời khen")
    bad += w[3]["text"] != "Giang"
    # 6) OWNER diễn đạt khác kịch bản: từ nghe chắc trùng ngẫu nhiên 1 tiếng KHÔNG bị đổi dấu
    for heard, script in (("phá băng Cô giáo cũ của mình bảo là cứ cười trước đã Hỏi tuổi", "phá băng Bạn có biết cách làm quen nhanh không Hỏi tuổi"),
                          ("cô giáo của tôi rất hiền", "bạn có muốn thử không"),
                          ("nhưng mà chị ơi", "má ơi chị ơi")):
        w = W(heard)
        correct(w, script)
        bad += [x["text"] for x in w] != heard.split()
    # 6b) "Cô" nghe chưa chắc / xác suất thấp trong câu diễn đạt lại: vẫn GIỮ, và cờ nghi ngờ GIỮ (để người nghe lại)
    heard = "phá băng Cô giáo cũ của mình bảo là cứ cười trước đã Hỏi tuổi"
    script = "phá băng Bạn có biết cách làm quen nhanh không Hỏi tuổi"
    w = W(heard, unc={2})
    correct(w, script)
    bad += w[2]["text"] != "Cô" or not w[2]["uncertain"]
    w = W(heard, p={2: 0.5})
    correct(w, script)
    bad += w[2]["text"] != "Cô"
    # 6c) đoạn khớp dài: khôi phục dấu cả với từ phủ định ("khong" → "không")
    w = W("mình khong nên vội vàng quá")
    correct(w, "mình không nên vội vàng quá")
    bad += w[1]["text"] != "không"
    # 6d) khối có từ khác hẳn kịch bản → bỏ cả khối; từ nghe chắc ở mép chỗ rẽ khỏi kịch bản giữ nguyên
    w = W("hôm nay mình nói về bán hàng với khách hàng nhé", p={5: 0.5})
    correct(w, "hôm nay mình nói về phá băng với khách hàng nhé")
    bad += [x["text"] for x in w][5:7] != ["bán", "hàng"]
    w = W("chào các bạn hôm nay phá băng cô ơi")
    correct(w, "chào các bạn hôm nay phá băng có không")
    bad += w[7]["text"] != "cô"
    # 7) con số / phủ định / tên riêng không tự thay dù nghe chưa chắc
    w = W("giá cỡ 200 nghìn", unc={2})
    correct(w, "giá cỡ 300 nghìn")
    bad += w[2]["text"] != "200"
    w = W("mình chưa gọi", unc={1})
    correct(w, "mình cha gọi")
    bad += w[1]["text"] != "chưa"
    w = W("dạ chị Lan ơi", unc={2})
    correct(w, "dạ chị lành ơi")
    bad += w[2]["text"] != "Lan"
    # 8) tên riêng viết hoa trong kịch bản giữ hoa khi sửa
    w = W("em là bao nè", unc={2})
    correct(w, "em là Bảo nè")
    bad += w[2]["text"] != "Bảo"
    # 5) kịch bản rỗng → không đổi gì
    w = W("a b c")
    bad += correct(w, "") != []
    print(f"script_align tự kiểm: {'đạt' if not bad else f'{bad} lỗi'}")
    return bad == 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
