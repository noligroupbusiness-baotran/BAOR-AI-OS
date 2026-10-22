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


def script_words(text):
    """Lời nói trong kịch bản → danh sách từ (bỏ thẻ nguồn [S1]/[K2], dấu câu)."""
    text = re.sub(r"\[[SK]\d+\]", " ", text or "")
    return [w for w in (re.sub(r"^[^\w%]+|[^\w%]+$", "", x) for x in unicodedata.normalize("NFC", text).split()) if w]


def _apply(word, target):
    """Thay chữ, giữ dấu câu cuối và kiểu viết hoa chữ đầu của từ máy nghe."""
    t = word["text"]
    tail = t[len(t.rstrip(",.?!")):]
    new = target[:1].upper() + target[1:] if t[:1].isupper() else target.lower() if target[:1].isupper() and not t[:1].isupper() else target
    return new + tail


def correct(words, script_text, low_p=0.6):
    """Sửa `words` tại chỗ theo kịch bản. Trả danh sách {t, from, to, why}."""
    sw = script_words(script_text)
    if not sw or not words:
        return []
    a = [norm(w["text"]) for w in words]
    b = [norm(x) for x in sw]
    fixes = []
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                w, target = words[i1 + k], sw[j1 + k]
                if tnorm(w["text"]) != tnorm(target):  # cùng chữ, khác dấu → dấu theo kịch bản
                    old = w["text"]
                    w["text"] = _apply(w, target)
                    w["uncertain"] = False
                    w["scriptFix"] = True
                    fixes.append({"t": round(w["start"], 2), "from": old, "to": w["text"], "why": "dấu theo kịch bản"})
                elif w.get("uncertain"):  # nghe chưa chắc nhưng khớp kịch bản → xác nhận
                    w["uncertain"] = False
                    w["scriptFix"] = True
                    fixes.append({"t": round(w["start"], 2), "from": w["text"], "to": w["text"], "why": "khớp kịch bản, bỏ nghi ngờ"})
        elif op == "replace" and (i2 - i1) <= 3:
            # Khối khác nhau ngắn phía lời nói (≤ 3 từ). Kịch bản có thể dài hơn (người nói dừng trước khi hết kịch bản / bỏ câu):
            # so từng từ với từ kịch bản CÙNG VỊ TRÍ trong khối; không thêm / bớt từ.
            for k in range(min(i2 - i1, j2 - j1)):
                w, target = words[i1 + k], sw[j1 + k]
                close = difflib.SequenceMatcher(None, a[i1 + k], b[j1 + k]).ratio() >= 0.6
                if close and (w.get("uncertain") or w.get("p", 1.0) < low_p):
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
    # 5) kịch bản rỗng → không đổi gì
    w = W("a b c")
    bad += correct(w, "") != []
    print(f"script_align tự kiểm: {'đạt' if not bad else f'{bad} lỗi'}")
    return bad == 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
