#!/usr/bin/env python3
"""Biên tập AI trong ứng dụng (S3): lập kế hoạch dựng (chữ nhấn, sơ đồ / khung, thẻ chương, trích dẫn, minh hoạ) từ lời nói
bằng MÔ HÌNH NGÔN NGỮ CHẠY TẠI MÁY (llama.cpp `llama-server`, API kiểu OpenAI, đầu ra ép theo JSON schema), rồi KIỂM bằng luật:

  1. Mô hình chỉ được trả cụm chữ / mục theo SỐ CÂU; mọi chữ phải nằm NGUYÊN VĂN, liền mạch trong lời nói của câu đó
     (không dùng từ nghe chưa chắc) → mốc thời gian lấy từ chính từ được nói, không do mô hình đoán.
  2. Luật Skill ESV: chữ nhấn 1–4 tiếng, cách nhau ≥ 4 s, mật độ ≈ 1 / 15 s; sơ đồ không chồng nhau, chữ nhấn không nằm trong
     sơ đồ; không minh hoạ ở 3 s đầu / 2 s cuối; mỗi ảnh dùng một lần.
  3. Minh hoạ: mô hình chọn ảnh theo mô tả thư viện (chỉ ảnh / clip có giấy phép), rồi một lượt KIỂM RIÊNG hỏi lại "ảnh này có
     hợp câu nói không" (bài học "ảnh tiệc cho câu ly cà phê"); không hợp thì bỏ.
Mục bị loại ghi lý do trong plan["ai"]["rejected"] để người biên tập xem. Không có mô hình → trả None (bộ dựng dùng luật cũ).

  python3 scripts/video/ai_plan.py --words words_main.json --duration 180 --library DATA/video-assets/broll --out plan.json
"""
import argparse, hashlib, json, math, os, re, sys, time, unicodedata, urllib.error, urllib.request

ENDPOINT = os.environ.get("BAOR_LLM_URL", "http://127.0.0.1:8091")
def model_label():
    """Tên mô hình đang chạy (đọc từ llama-server /props), để kế hoạch ghi đúng mô hình nào đã lập."""
    try:
        with urllib.request.urlopen(ENDPOINT.rstrip("/") + "/props", timeout=3) as r:
            path = json.loads(r.read()).get("model_path", "")
        name = re.sub(r"-0000\d-of-0000\d|\.gguf$", "", os.path.basename(path))
        return f"{name} (llama.cpp tại máy)" if name else "mô hình tại máy"
    except (OSError, ValueError):
        return "mô hình tại máy"


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower()).replace("đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w%]", "", s)


# ---------------------------------------------------------------- câu
def sentences(words, gap=0.5, max_words=26):
    """Gom từ thành câu. Lời nói máy nghe thường KHÔNG có dấu câu: hết câu ở . ? ! hoặc ngắt hơi ≥ gap; câu quá dài thì cắt ở
    CHỖ NGẮT HƠI DÀI NHẤT trong câu (không cắt cứng theo số từ — cắt cứng làm gãy cụm như "hỏi tuổi | của khách hàng")."""
    def pause(i):
        return words[i + 1]["start"] - words[i].get("end", words[i]["start"]) if i + 1 < len(words) else 9.0
    groups, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        if w["text"].strip().endswith((".", "?", "!")) or pause(i) >= gap or i == len(words) - 1:
            groups.append(cur)
            cur = []
    out = []
    def emit(g):
        if len(g) > max_words:
            k = max(range(len(g) // 4, len(g) - len(g) // 4), key=lambda m: pause(g[m]))  # ngắt dài nhất ở giữa câu
            emit(g[:k + 1])
            emit(g[k + 1:])
            return
        out.append({"id": len(out) + 1, "idx": g, "t0": words[g[0]]["start"], "t1": words[g[-1]].get("end", words[g[-1]]["start"]),
                    "text": " ".join(("[?]" if words[j].get("uncertain") else "") + words[j]["text"].strip() for j in g)})
    for g in groups:
        emit(g)
    return out


def tnorm(s):
    """Chuẩn hoá GIỮ DẤU (tiếng Việt: bỏ dấu làm "chung"≡"chúng", "hỗ"≡"họ", "đề"≡"để" → lọc sai). Dùng cho mọi so khớp từ."""
    return re.sub(r"[^\w%]", "", unicodedata.normalize("NFC", str(s).lower()))


# Lời đệm / chào / xưng hô: không bao giờ là chữ nhấn (ESV: chữ nhấn là ý chính đáng nhớ). So khớp CÓ DẤU.
FILLER = set("dạ alo à ờ ừ ừa vâng hả nhé nha nghe nè thế thì mà là có rồi ơi các mọi người hát á hông".split())
# Từ PHỦ ĐỊNH: không bao giờ bị cắt khỏi cụm; cụm đứng ngay sau từ phủ định bị loại ("không nên hứa hẹn" ≠ "HỨA HẸN")
NEG = set("không chưa chẳng chả đừng chớ".split())


def content_words(phrase):
    return [w for w in (tnorm(x) for x in str(phrase).split()) if w and w not in FILLER]


# Hư từ không được nằm ở ĐẦU / CUỐI cụm trên màn hình (cụm phải tự đứng được)
EDGE = set("và của cho thì là mà với bên này đó các những một để ở tại vì nên khi ra vào lên xuống lại rồi nữa được gì cái".split())
# Đại từ / xưng hô (có dấu): chữ nhấn chứa chúng không đứng một mình được ("HỎI HỌ", "BÀ CON")
PRONOUN = set("họ mình chúng ta tôi bạn em anh chị bà cô chú nó".split())
# Chữ đệm được phép bỏ khỏi chữ trên màn hình khi máy nghe chưa chắc (nằm giữa cụm): "dành tặng một [?]cái lời khen"
DROPPABLE = {"cái"}


def align(phrase, sent, words, maxw):
    """Tìm đoạn LIỀN MẠCH trong lời nói của câu khớp nhất với cụm mô hình viết (mô hình chép đúng ý nhưng hay lệch chữ / ranh giới).
    Điều kiện nhận: mọi từ có nghĩa của cụm đều có trong đoạn, đoạn ≤ maxw tiếng, không dính từ nghe chưa chắc; cắt hư từ hai đầu.
    Chữ trên màn hình lấy từ LỜI NÓI, không lấy từ mô hình. → (chỉ số đầu, cuối) hoặc None."""
    want = [tnorm(x) for x in str(phrase).split() if tnorm(x)]
    core = [w for w in want if w not in FILLER and w not in EDGE] or want
    if not want:
        return None
    toks = [(j, tnorm(words[j]["text"])) for j in sent["idx"]]
    toks = [(j, t) for j, t in toks if t]
    best = None
    for a in range(len(toks)):
        for b in range(a, min(len(toks), a + len(want) + 2)):
            span = [t for _, t in toks[a:b + 1]]
            missing = sum(1 for c in core if c not in span)
            # mô hình hay thêm từ diễn giải ("hạn chế sự đề phòng"; "hạn chế" là 1 từ 2 tiếng): cụm ≥ 3 tiếng có nghĩa được
            # thiếu tối đa 1/3 số tiếng đó (làm tròn lên), và phải khớp ít nhất 2 tiếng
            if missing > (math.ceil(len(core) / 3) if len(core) >= 3 else 0) or len(core) - missing < min(2, len(core)):
                continue
            # bỏ hư từ ở hai đầu
            lo, hi = a, b
            while lo < hi and toks[lo][1] in EDGE | FILLER and toks[lo][1] not in core:
                lo += 1
            while hi > lo and toks[hi][1] in EDGE | FILLER and toks[hi][1] not in core:
                hi -= 1
            n = hi - lo + 1
            if n > maxw:
                continue
            span2 = [t for _, t in toks[lo:hi + 1]]
            # đủ từ có nghĩa, trừ điểm mỗi từ thừa (không có trong cụm mô hình viết)
            score = sum(1 for c in core if c in span2) / len(core) - 0.1 * sum(1 for t in span2 if t not in want)
            if best is None or score > best[0] or (score == best[0] and n < best[2] - best[1] + 1):
                best = (score, lo, hi)
    if not best or best[0] < 0.5:
        return None
    js = [toks[k][0] for k in range(best[1], best[2] + 1)]
    if any(words[j].get("uncertain") and not (tnorm(words[j]["text"]) in DROPPABLE and j not in (js[0], js[-1])) for j in js):
        return None
    return js[0], js[-1]


def spoken(words, a, b):
    """Chữ lên màn hình = đúng lời nói; chỉ bỏ chữ đệm "cái" nằm GIỮA cụm ("hạn chế cái sự đề phòng" → "hạn chế sự đề phòng"),
    theo tiền lệ bản người biên tập ("sự đề phòng"). Mọi chữ khác giữ nguyên."""
    return " ".join(words[j]["text"].strip(",.?!") for j in range(a, b + 1) if not (tnorm(words[j]["text"]) in DROPPABLE and a < j < b))


# ---------------------------------------------------------------- mô hình
def llm(messages, schema, max_tokens=1800, temperature=0.2, timeout=600):
    body = {"messages": messages, "temperature": temperature, "max_tokens": max_tokens,
            "response_format": {"type": "json_schema", "json_schema": {"name": "plan", "schema": schema}}}
    req = urllib.request.Request(ENDPOINT.rstrip("/") + "/v1/chat/completions", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read())
    return json.loads(d["choices"][0]["message"]["content"])


def available(timeout=3):
    try:
        with urllib.request.urlopen(ENDPOINT.rstrip("/") + "/health", timeout=timeout) as r:
            return json.loads(r.read()).get("status") == "ok"
    except (OSError, ValueError, urllib.error.URLError):
        return False


ANALYZE_SCHEMA = {
    "type": "object",
    "properties": {
        "topic": {"type": "string"},
        "key_ideas": {"type": "array", "maxItems": 10, "items": {"type": "object", "properties": {"sid": {"type": "integer"}, "idea": {"type": "string"}}, "required": ["sid", "idea"]}},
        "lists": {"type": "array", "maxItems": 6, "items": {"type": "object", "properties": {"sids": {"type": "array", "items": {"type": "integer"}}, "what": {"type": "string"}}, "required": ["sids", "what"]}},
        "contrasts": {"type": "array", "maxItems": 4, "items": {"type": "object", "properties": {"sids": {"type": "array", "items": {"type": "integer"}}, "what": {"type": "string"}}, "required": ["sids", "what"]}},
        "cause_effect": {"type": "array", "maxItems": 4, "items": {"type": "object", "properties": {"sids": {"type": "array", "items": {"type": "integer"}}, "what": {"type": "string"}}, "required": ["sids", "what"]}},
        "sections": {"type": "array", "maxItems": 6, "items": {"type": "object", "properties": {"sid": {"type": "integer"}, "title": {"type": "string"}}, "required": ["sid", "title"]}},
    },
    "required": ["topic", "key_ideas", "lists", "contrasts", "cause_effect", "sections"],
}

ANALYZE = """Bạn là biên tập viên nội dung. Đọc lời nói (đã chia câu có số [n]) và PHÂN TÍCH CẤU TRÚC, chưa chọn đồ hoạ:
- topic: video nói về gì (1 câu).
- key_ideas: các ý chính đáng nhớ nhất (số câu + ý, tối đa 10).
- lists: chỗ người nói LIỆT KÊ nhiều bước / nhiều ý theo thứ tự (các số câu chứa các mục).
- contrasts: chỗ nói cách SAI / không nên rồi cách ĐÚNG / nên.
- cause_effect: chỗ nói làm X thì được Y / X dẫn tới Y.
- sections: chỗ chuyển sang phần mới (số câu + tên phần ngắn).
Chỉ ghi những gì THẬT SỰ có trong lời nói."""

EXAMPLE = """VÍ DỤ BIÊN TẬP TỐT (video khác, chỉ để tham khảo cách chọn):
- Câu "mình sẽ đồng hành cùng với ai, kinh doanh sản phẩm gì" → sơ đồ process: [đồng hành cùng với ai] → [kinh doanh sản phẩm gì].
- Câu liệt kê "ở Bến Tre, Vĩnh Long, Tiền Giang" → steps: Bến Tre / Vĩnh Long / Tiền Giang.
- Chữ nhấn tốt: "TUYỂN DỤNG", "Học hỏi liên tục", "ĐỒNG ĐỘI", "Kỹ năng bán hàng" (khái niệm chính, 1–4 tiếng).
- Chữ nhấn XẤU: lời đệm / chào ("dạ alo", "à", "hả không"), cụm vô nghĩa khi tách khỏi câu, đại từ.
- Khung trích dẫn (quote) chỉ cho câu chốt TRỌN VẸN 5–14 tiếng (vd "Hãy cùng đến với chúng tôi"), không cho cụm 2–3 tiếng."""

NEED = {"steps": (2, 4), "compare": (2, 3), "arrow": (2, 2), "mechanism": (3, 3), "quote": (1, 1), "chapter": (1, 1)}  # số mục mỗi loại sơ đồ

SYSTEM = """Bạn là biên tập viên video ngắn tiếng Việt theo "Skill ESV" (video dạy kỹ năng bán hàng, 1 người nói trước máy quay).
Nhiệm vụ: đọc lời nói đã chia CÂU (mỗi câu có số [n] và mốc giây) và chọn chỗ đặt đồ hoạ giúp người xem hiểu ý chính.
LUẬT BẮT BUỘC:
- Mọi chữ bạn đưa ra phải CHÉP NGUYÊN VĂN, LIỀN MẠCH từ đúng câu được nêu số (không viết lại, không tóm tắt).
  Cụm phải là cụm HOÀN CHỈNH, tự đứng được khi tách khỏi câu (vd "lời hứa hẹn", không phải "cảm giác thân").
- Không chọn từ có dấu [?] (nghe chưa chắc).
- Chữ nhấn (emphasis): 1–4 tiếng, là TỪ KHOÁ / ý chính đáng nhớ (khái niệm, con số, kết luận). Không chọn hư từ, lời chào.
- Sơ đồ chỉ khi lời nói THẬT SỰ có cấu trúc đó:
  steps: người nói liệt kê 2–4 bước / ý theo thứ tự (mỗi bước là cụm nguyên văn ngắn 1–6 tiếng);
  compare: nói một cách SAI / không nên rồi cách ĐÚNG / nên (wrong 1 cụm, right 1–2 cụm);
  arrow: nguyên nhân → kết quả, hoặc việc làm → tác dụng (top, bottom);
  mechanism: hai đối tượng và mối quan hệ ở giữa (top, mid, bottom);
  quote: một câu chốt đáng trích nguyên câu (≤ 14 tiếng);
  chapter: chuyển sang phần / ý lớn mới (title = cụm nguyên văn 1–5 tiếng nêu tên phần).
- Ít mà chất: chỉ chọn chỗ thật sự giúp hiểu; không cần phủ mọi câu.
- Dùng bảng PHÂN TÍCH CẤU TRÚC được cung cấp: lists → steps, contrasts → compare, cause_effect → arrow, sections → chapter,
  key_ideas → chữ nhấn (chọn đúng cụm từ khoá trong câu đó). Bảng phân tích là gợi ý vị trí, KHÔNG phải chữ để dùng.
""" + EXAMPLE

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "emphasis": {"type": "array", "maxItems": 14, "items": {"type": "object", "properties": {"sid": {"type": "integer"}, "phrase": {"type": "string"}, "why": {"type": "string"}}, "required": ["sid", "phrase", "why"]}},
        "diagrams": {"type": "array", "maxItems": 8, "items": {"type": "object", "properties": {
            "type": {"type": "string", "enum": ["steps", "compare", "arrow", "mechanism", "quote", "chapter"]},
            "items": {"type": "array", "minItems": 1, "maxItems": 4, "items": {"type": "object", "properties": {"sid": {"type": "integer"}, "phrase": {"type": "string"}}, "required": ["sid", "phrase"]}},
            "why": {"type": "string"}}, "required": ["type", "items"]}},
    },
    "required": ["summary", "emphasis", "diagrams"],
}

BROLL_SCHEMA = {
    "type": "object",
    "properties": {"picks": {"type": "array", "maxItems": 6, "items": {"type": "object", "properties": {"sid": {"type": "integer"}, "asset": {"type": "integer"}, "why": {"type": "string"}}, "required": ["sid", "asset", "why"]}}},
    "required": ["picks"],
}
CHECK_SCHEMA = {"type": "object", "properties": {"fit": {"type": "boolean"}, "reason": {"type": "string"}}, "required": ["fit", "reason"]}


JUDGE_SCHEMA = {"type": "object", "properties": {"verdicts": {"type": "array", "items": {"type": "object", "properties": {
    "n": {"type": "integer"}, "score": {"type": "integer", "minimum": 1, "maximum": 5}, "reason": {"type": "string"}}, "required": ["n", "score", "reason"]}}}, "required": ["verdicts"]}
JUDGE = """Bạn là TRƯỞNG BIÊN TẬP khắt khe duyệt đồ hoạ cho video dạy bán hàng. Mỗi mục là chữ / sơ đồ sẽ hiện trên màn hình, kèm câu nói gốc.
Chấm TỪNG mục (theo số n) thang 1–5:
5 = khái niệm / bước / kết luận cốt lõi của bài; 4 = ý chính rõ, đáng nhớ; 3 = có ích, giúp nhịp video;
2 = vụn vặt; 1 = sai: tên người, lời đệm, xưng hô, cụm gãy thiếu chữ, hoặc sơ đồ có quan hệ sai với câu nói.
Video dạy kỹ năng cần nhiều điểm nhấn: đừng hạ điểm chỉ vì ý đơn giản nếu nó đúng là thuật ngữ của bài."""


def sent_block(sents):
    return "\n".join(f"[{s['id']}] ({s['t0']:.1f}s) {s['text']}" for s in sents)


def sent_block_idx(sents, words):
    """Câu kèm SỐ THỨ TỰ TỪ (0, 1, 2…): mô hình chọn đoạn từ `from`–`to` thay vì chép chữ → chữ trên màn hình luôn nguyên văn."""
    return "\n".join(f"[{s['id']}] ({s['t0']:.1f}s) " + " ".join(f"{k}:{'?' if words[j].get('uncertain') else ''}{words[j]['text'].strip()}" for k, j in enumerate(s["idx"])) for s in sents)


# ---------------------------------------------------------------- lập kế hoạch
def pick_broll(lib, sents, by_id, diagrams, dur, rejected):
    """Minh hoạ: mô hình chọn ảnh theo mô tả thư viện (chỉ ảnh / clip có giấy phép), rồi KIỂM RIÊNG từng lựa chọn."""
    broll = []
    if not lib:
        return broll
    catalog = "\n".join(f"#{i}: {os.path.splitext(os.path.basename(x['file']))[0].replace('_', ' ').replace('-', ' ')} — {', '.join(x.get('keywords', []))} — {x.get('source', '')[-60:]}" for i, x in enumerate(lib))
    user = (f"Thư viện ảnh / clip minh hoạ (chỉ được chọn số trong danh sách):\n{catalog}\n\nLời nói:\n{sent_block(sents)}\n\n"
            "Chọn tối đa 6 chỗ mà một ảnh trong thư viện minh hoạ ĐÚNG NGHĨA câu nói (đúng đối tượng / bối cảnh được nói tới). "
            "Không chọn nếu chỉ trùng chữ mà khác nghĩa. Không chọn câu trong 3 giây đầu.")
    picks = llm([{"role": "system", "content": "Bạn là biên tập viên hình ảnh, rất khắt khe về việc ảnh khớp nghĩa câu nói."}, {"role": "user", "content": user}], BROLL_SCHEMA, max_tokens=900).get("picks", [])
    used, last = set(), -1e9
    for p in sorted(picks, key=lambda p: by_id.get(p.get("sid"), {"t0": 1e9})["t0"]):
        s, a = by_id.get(p.get("sid")), p.get("asset")
        if not s or not isinstance(a, int) or isinstance(a, bool) or not (0 <= a < len(lib)):
            rejected.append({"kind": "broll", "reason": f"câu {p.get('sid')} / ảnh #{a} không hợp lệ"})
            continue
        it = lib[a]
        t0 = round(max(s["t0"], 3.0), 2)
        t1 = round(min(t0 + 2.5, dur - 2.0), 2)
        if it["file"] in used or t1 - t0 < 1.2 or t0 - last < 6 or any(dd["t0"] - 0.3 <= t0 <= dd["t1"] for dd in diagrams if dd["type"] in ("steps", "compare", "arrow", "mechanism")):
            rejected.append({"kind": "broll", "file": it["file"], "reason": "trùng ảnh / quá sát minh hoạ trước / trùng sơ đồ / sát đầu-cuối"})
            continue
        chk = llm([{"role": "system", "content": "Trả lời khắt khe, tiếng Việt."},
                   {"role": "user", "content": f"Câu nói: “{s['text']}”\nẢnh: {os.path.basename(it['file'])} — từ khoá: {', '.join(it.get('keywords', []))} — nguồn: {it.get('source', '')}\n"
                                               "Ảnh này có minh hoạ ĐÚNG NGHĨA câu nói không (không chỉ trùng chữ)? Ví dụ: câu về 'mời ly cà phê gặp khách' thì ảnh tiệc liên hoan là KHÔNG hợp."}],
                  CHECK_SCHEMA, max_tokens=200)
        if not chk.get("fit"):
            rejected.append({"kind": "broll", "file": it["file"], "reason": f"kiểm lần 2: không hợp — {chk.get('reason', '')[:140]}"})
            continue
        broll.append({"t0": t0, "t1": t1, "file": it["file"], "keyword": (it.get("keywords") or [""])[0], "why": f"{p.get('why', '')} | kiểm: {chk.get('reason', '')}"[:200]})
        used.add(it["file"])
        last = t1
    return broll


def plan(words, dur, library=None, content_hint="", log=print):
    """Trả kế hoạch dựng (mốc theo video gốc) hoặc None khi không có mô hình."""
    if not available():
        log("Không có mô hình tại máy (llama-server) → bỏ biên tập AI")
        return None
    t_start = time.time()
    sents = sentences(words)
    by_id = {s["id"]: s for s in sents}
    rejected = []

    # 1) Mô hình chọn chữ nhấn + sơ đồ theo từng đoạn ~40 câu (vừa ngữ cảnh, giữ chất lượng)
    raw_emph, raw_dias, summaries, analyses = [], [], [], []
    for k in range(0, len(sents), 40):
        chunk = sents[k:k + 40]
        user = (f"Video dài {dur:.0f} giây. " + (f"Chủ đề / kịch bản: {content_hint[:600]}\n" if content_hint else "")
                + f"Đoạn lời nói (câu {chunk[0]['id']}–{chunk[-1]['id']}):\n{sent_block(chunk)}\n\n"
                + f"Đề xuất khoảng {max(2, round((chunk[-1]['t1'] - chunk[0]['t0']) / 10))} chữ nhấn (mỗi cái 1–3 tiếng, chép đúng từ câu) và các sơ đồ thật sự có trong đoạn này.")
        ana = llm([{"role": "system", "content": ANALYZE}, {"role": "user", "content": sent_block(chunk)}], ANALYZE_SCHEMA, max_tokens=1400)
        analyses.append(ana)
        user += "\n\nPHÂN TÍCH CẤU TRÚC (đã làm ở bước trước):\n" + json.dumps(ana, ensure_ascii=False)
        out = llm([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}], PLAN_SCHEMA)
        out = out if isinstance(out, dict) else {}
        summaries.append(str(out.get("summary", ""))[:300])
        raw_emph += out.get("emphasis", []) if isinstance(out.get("emphasis"), list) else []
        raw_dias += out.get("diagrams", []) if isinstance(out.get("diagrams"), list) else []

    # Đầu ra mô hình có thể sai kiểu (dù đã ép schema): bỏ từng mục sai, ghi lý do — không làm hỏng cả kế hoạch
    def ok_item(x):
        return isinstance(x, dict) and isinstance(x.get("sid"), int) and not isinstance(x.get("sid"), bool) and isinstance(x.get("phrase"), str)
    bad_e = [x for x in raw_emph if not ok_item(x)]
    raw_emph = [x for x in raw_emph if ok_item(x)]
    bad_d = [x for x in raw_dias if not (isinstance(x, dict) and x.get("type") in NEED and isinstance(x.get("items"), list) and all(ok_item(i) for i in x["items"]))]
    raw_dias = [x for x in raw_dias if x not in bad_d]
    if bad_e or bad_d:
        rejected.append({"kind": "model", "reason": f"mô hình trả {len(bad_e)} chữ nhấn / {len(bad_d)} sơ đồ sai kiểu → bỏ"})

    # 2) Kiểm nguyên văn + đặt mốc từ chính lời nói
    def ground(sid, phrase, maxw=6):
        s_ = by_id.get(sid)
        if not s_:
            return None, f"câu {sid} không tồn tại"
        loc = align(phrase, s_, words, maxw)
        if not loc:  # mô hình hay ghi lệch một câu khi cụm nằm ở ranh giới câu: tìm trong câu trước + câu này + câu sau
            win = {"idx": [j for k in (sid - 1, sid, sid + 1) if k in by_id for j in by_id[k]["idx"]]}
            loc = align(phrase, win, words, maxw)
        if not loc:  # lệch xa hơn: tìm từng câu trong ±30 s, lấy lần xuất hiện GẦN câu được nêu nhất
            near = sorted((x for x in sents if abs(x["t0"] - s_["t0"]) <= 30), key=lambda x: abs(x["t0"] - s_["t0"]))
            for x in near:
                win = {"idx": [j for k in (x["id"], x["id"] + 1) if k in by_id for j in by_id[k]["idx"]]}
                loc = align(phrase, win, words, maxw)
                if loc:
                    break
        if not loc:
            return None, f"“{phrase}” không ghép được vào lời nói câu {sid} (thiếu từ / quá {maxw} tiếng / nghe chưa chắc)"
        return loc, ""

    def negated_before(j0):
        """Từ phủ định ngay trước cụm (trong 2 từ) → tách cụm ra sẽ ĐẢO nghĩa lời nói."""
        return any(tnorm(words[j]["text"]) in NEG for j in (j0 - 1, j0 - 2) if j >= 0)

    diagrams = []
    for d in raw_dias:
        typ, items = d.get("type"), d.get("items", [])
        need = NEED[typ]
        if not (need[0] <= len(items) <= need[1]):
            rejected.append({"kind": "diagram", "type": typ, "reason": f"{typ} cần {need[0]}–{need[1]} mục, có {len(items)}"})
            continue
        locs, bad = [], ""
        for it in items:
            loc, why = ground(it.get("sid"), it.get("phrase", ""), 14 if typ == "quote" else 6)
            if not loc:
                bad = why
                break
            if negated_before(loc[0]):
                bad = f"“{spoken(words, *loc)}” đứng sau từ phủ định — tách ra sẽ sai nghĩa"
                break
            locs.append(loc)
        if not bad and typ == "quote" and len(spoken(words, *locs[0]).split()) < 5:
            bad = "trích dẫn quá ngắn (< 5 tiếng): không phải câu chốt"
        if bad:
            rejected.append({"kind": "diagram", "type": typ, "reason": bad})
            continue
        if any(locs[m][0] <= locs[m - 1][1] for m in range(1, len(locs))):
            rejected.append({"kind": "diagram", "type": typ, "reason": "các mục không theo thứ tự lời nói"})
            continue
        t_first = words[locs[0][0]]["start"]
        t_last_end = words[locs[-1][1]].get("end", words[locs[-1][1]]["start"])
        if t_last_end - t_first > 14:
            rejected.append({"kind": "diagram", "type": typ, "reason": "các mục cách nhau quá xa (> 14 s)"})
            continue
        txt = [spoken(words, a, b) for a, b in locs]
        ts = [round(words[a]["start"], 2) for a, _ in locs]
        t0 = round(max(0.0, t_first - 0.35), 2)
        t1 = round(min(dur - 0.2, t_last_end + (2.2 if typ != "chapter" else 1.6)), 2)
        if typ == "steps":
            dd = {"type": "steps", "t0": t0, "t1": t1, "steps": [{"t": t, "text": x} for t, x in zip(ts, txt)]}
        elif typ == "compare":
            dd = {"type": "compare", "t0": t0, "t1": t1, "wrong": {"t": ts[0], "text": txt[0], "strike": round(ts[0] + 1.2, 2)}, "right": [{"t": t, "text": x} for t, x in zip(ts[1:], txt[1:])]}
        elif typ == "arrow":
            dd = {"type": "arrow", "t0": t0, "t1": t1, "top": {"t": ts[0], "text": txt[0]}, "bottom": {"t": ts[1], "text": txt[1]}}
        elif typ == "mechanism":
            dd = {"type": "mechanism", "t0": t0, "t1": t1, "top": {"t": ts[0], "text": txt[0], "icon": "person"}, "mid": {"t": ts[1], "text": txt[1]}, "bottom": {"t": ts[2], "text": txt[2], "icon": "person"}}
        elif typ == "quote":
            dd = {"type": "quote", "t0": t0, "t1": t1, "text": txt[0]}
        else:
            dd = {"type": "chapter", "t0": t0, "t1": t1, "text": txt[0], "num": ""}
        dd["why"] = str(d.get("why", ""))[:160]
        diagrams.append(dd)
    # không chồng nhau: giữ sơ đồ xuất hiện trước, sơ đồ chồng bị loại
    diagrams.sort(key=lambda x: x["t0"])
    kept = []
    for dd in diagrams:
        if kept and dd["t0"] < kept[-1]["t1"] + 0.3:
            rejected.append({"kind": "diagram", "type": dd["type"], "reason": f"chồng sơ đồ {kept[-1]['type']} ở {kept[-1]['t0']:.1f}s"})
            continue
        kept.append(dd)
    diagrams = kept
    chap_n = 0
    for dd in diagrams:
        if dd["type"] == "chapter":
            chap_n += 1
            dd["num"] = f"{chap_n:02d}"

    emphasis, budget = [], max(2, round(dur / 15))
    for e in raw_emph:
        loc, why = ground(e.get("sid"), e.get("phrase", ""), 4)
        if not loc:
            rejected.append({"kind": "emphasis", "phrase": e.get("phrase"), "reason": why})
            continue
        phrase = spoken(words, *loc)
        e["phrase"] = phrase
        if negated_before(loc[0]):
            rejected.append({"kind": "emphasis", "phrase": phrase, "reason": "đứng sau từ phủ định — tách ra sẽ sai nghĩa"})
            continue
        toks_ = [tnorm(x) for x in phrase.split()]
        if len(toks_) == 1 and not toks_[0].isdigit():
            rejected.append({"kind": "emphasis", "phrase": phrase, "reason": "một tiếng đứng riêng (dễ là chữ gãy / tên), không đủ nghĩa"})
            continue
        if any(t in PRONOUN for t in toks_):
            rejected.append({"kind": "emphasis", "phrase": phrase, "reason": "có đại từ / xưng hô, không đứng một mình được"})
            continue
        if not content_words(phrase) or tnorm(phrase.split()[0]) in FILLER:
            rejected.append({"kind": "emphasis", "phrase": phrase, "reason": "lời đệm / chào / xưng hô, không phải ý chính"})
            continue
        t = round(words[loc[0]]["start"], 2)
        if t < 0.8 or any(dd["t0"] - 0.5 <= t <= dd["t1"] + 0.5 for dd in diagrams):
            rejected.append({"kind": "emphasis", "phrase": e.get("phrase"), "reason": "trùng sơ đồ / quá sát đầu video"})
            continue
        if any(tnorm(x["text"]) == tnorm(spoken(words, *loc)) for x in emphasis):
            rejected.append({"kind": "emphasis", "phrase": e.get("phrase"), "reason": "trùng chữ nhấn đã có"})
            continue
        if any(abs(t - x["t"]) < 4.0 for x in emphasis):
            rejected.append({"kind": "emphasis", "phrase": e.get("phrase"), "reason": "cách chữ nhấn khác < 4 s"})
            continue
        if len(emphasis) >= budget:
            rejected.append({"kind": "emphasis", "phrase": e.get("phrase"), "reason": f"vượt mật độ ESV ({budget} cho {dur:.0f} s)"})
            continue
        text = spoken(words, *loc)
        emphasis.append({"t": t, "text": text.upper() if len(text) <= 14 else text[:1].upper() + text[1:], "style": "fade", "why": str(e.get("why", ""))[:160]})
    emphasis.sort(key=lambda x: x["t"])
    for k, e in enumerate(emphasis):  # nhịp kiểu: mở đầu nhoè vào, chữ nhấn giữa ánh kim, còn lại hiện mờ
        e["style"] = "blur" if k == 0 else ("shine" if k == len(emphasis) // 2 else "fade")

    # 2b) Trưởng biên tập (mô hình đóng vai người duyệt khắt khe) chấm từng mục; mục bị chấm BỎ thì loại, ghi lý do
    items_ = [("emphasis", e) for e in emphasis] + [("diagram", d) for d in diagrams]
    if items_:
        def ctx(t):  # lời nói ±4 s quanh mục (câu đã chia có thể gãy; người duyệt cần đủ ngữ cảnh)
            return " ".join(w["text"].strip() for w in words if t - 4 <= w["start"] <= t + 4 and not w.get("uncertain"))
        lines = []
        for n, (k, x) in enumerate(items_):
            if k == "emphasis":
                lines.append(f"{n}. CHỮ NHẤN “{x['text']}” — câu nói: “{ctx(x['t'])}”")
            else:
                parts = [x.get("text")] + [x.get(f, {}).get("text") for f in ("wrong", "top", "mid", "bottom")] + [r["text"] for r in x.get("right", []) + x.get("steps", [])]
                lines.append(f"{n}. SƠ ĐỒ {x['type']}: {' | '.join(p for p in parts if p)} — câu nói: “{ctx(x['t0'] + 0.4)}”")
        verdicts = {}
        try:
            got = llm([{"role": "system", "content": JUDGE}, {"role": "user", "content": "\n".join(lines)}], JUDGE_SCHEMA, max_tokens=1600)
            for v in (got.get("verdicts", []) if isinstance(got, dict) else []):
                if isinstance(v, dict) and isinstance(v.get("n"), int) and not isinstance(v.get("n"), bool) and 0 <= v["n"] < len(items_):
                    try:
                        v["score"] = int(v.get("score", 3))
                    except (TypeError, ValueError):
                        continue
                    verdicts[v["n"]] = v
        except Exception as ex:  # bước chấm lỗi → giữ các mục đã qua luật, ghi lý do
            rejected.append({"kind": "judge", "reason": f"bước trưởng biên tập lỗi, bỏ qua bước này: {str(ex)[:120]}"})
        drop = {n for n, v in verdicts.items() if v["score"] < 3}
        for n in sorted(drop):
            k, x = items_[n]
            rejected.append({"kind": k, "phrase": x.get("text") or x.get("type"), "reason": f"trưởng biên tập chấm {verdicts[n].get('score')}/5: {verdicts[n].get('reason', '')[:140]}"})
        emphasis = [x for n, (k, x) in enumerate(items_) if k == "emphasis" and n not in drop]
        diagrams = [x for n, (k, x) in enumerate(items_) if k == "diagram" and n not in drop]
        for k, e in enumerate(emphasis):
            e["style"] = "blur" if k == 0 else ("shine" if k == len(emphasis) // 2 else "fade")

    # 3) Minh hoạ: mô hình chọn theo mô tả thư viện, rồi kiểm riêng từng lựa chọn
    broll = []
    lib = [x for x in (library or []) if str(x.get("license", "")).strip() and not x.get("exclude")]
    try:
        broll = pick_broll(lib, sents, by_id, diagrams, dur, rejected)
    except Exception as ex:  # bước ảnh lỗi → không có ảnh, kế hoạch chữ / sơ đồ vẫn giữ
        broll = []
        rejected.append({"kind": "broll", "reason": f"bước chọn ảnh lỗi, bỏ qua: {str(ex)[:120]}"})
    label = model_label()
    digest = hashlib.sha256(json.dumps([w["text"] for w in words], ensure_ascii=False).encode()).hexdigest()[:12]
    return {
        "by": f"Biên tập AI tại máy ({label})",
        "note": " ".join(x for x in summaries if x)[:600],
        "emphasis": emphasis,
        "diagrams": diagrams,
        "broll": broll,
        "ai": {"model": label, "endpoint": ENDPOINT, "wordsDigest": digest, "seconds": round(time.time() - t_start, 1),
               "analysis": analyses, "proposed": {"emphasis": len(raw_emph), "diagrams": len(raw_dias)}, "kept": {"emphasis": len(emphasis), "diagrams": len(diagrams), "broll": len(broll)},
               "rejected": rejected[:300]},
    }


def self_test():
    """Kiểm lõi không cần mô hình (chạy trong npm run verify qua tests/ai-plan.test.ts)."""
    txt = "và chúng ta sẽ tạo ra cảm giác thân tình với khách hàng bằng lời hứa hẹn tìm một cái điểm chung".split()
    words = [{"text": w, "start": i * 0.3, "end": i * 0.3 + 0.25} for i, w in enumerate(txt)]
    words[19]["uncertain"] = True  # "cái" nghe chưa chắc
    sent = {"id": 1, "idx": list(range(len(words)))}
    cases = [
        ("lời hứa hẹn", 4, "lời hứa hẹn"),
        ("với khách hàng", 4, "khách hàng"),                  # hư từ đầu cụm bị cắt
        ("tạo cảm giác thân tình", 6, "tạo ra cảm giác thân tình"),  # mô hình bỏ chữ → lấy đúng lời nói
        ("hạn chế cảm giác thân tình", 6, "cảm giác thân tình"),     # mô hình thêm 1 từ diễn giải
        ("niềm tin", 4, None),                                 # không có trong lời nói
        ("tìm một điểm chung", 6, "tìm một điểm chung"),       # bỏ "cái" nghe chưa chắc ở giữa
        ("hạn chế cái sự đề phòng", 6, None),                   # không có trong lời nói thử (đối chứng)
    ]
    bad = 0
    for ph, mx, want in cases:
        r = align(ph, sent, words, mx)
        got = spoken(words, *r) if r else None
        if got != want:
            bad += 1
            print(f"SAI align({ph!r}) = {got!r}, cần {want!r}")
    # so khớp GIỮ DẤU: "chung" (điểm chung) không phải đại từ "chúng"; "đề" (đề phòng) không phải hư từ "để"
    for w, s_, want in (("chung", PRONOUN, False), ("chúng", PRONOUN, True), ("hỗ", PRONOUN, False), ("đề", EDGE, False), ("để", EDGE, True)):
        if (tnorm(w) in s_) != want:
            bad += 1
            print(f"SAI tập từ: {w!r}")
    # chia câu: không cắt cứng theo số từ mà ở chỗ ngắt hơi dài nhất
    ws = [{"text": f"t{i}", "start": i * 0.3 + (0.4 if i >= 20 else 0), "end": i * 0.3 + 0.25 + (0.4 if i >= 20 else 0)} for i in range(40)]
    ss = sentences(ws, gap=0.5, max_words=26)
    if [len(x["idx"]) for x in ss] != [20, 20]:
        bad += 1
        print(f"SAI chia câu: {[len(x['idx']) for x in ss]}")
    # plan() với MÔ HÌNH GIẢ: phủ định không bị đảo nghĩa; đầu ra rác không làm hỏng cả kế hoạch
    g = globals()
    real_llm, real_av = g["llm"], g["available"]
    txt2 = "hôm nay các bạn không nên hứa hẹn với khách hàng mà hãy tạo ra cảm giác thân tình rồi chúng ta tìm điểm chung với khách hàng".split()
    w2 = [{"text": x, "start": 1.0 + i * 0.5, "end": 1.0 + i * 0.5 + 0.4} for i, x in enumerate(txt2)]

    def fake(messages, schema, **kw):
        if schema is PLAN_SCHEMA:
            return {"summary": "x", "emphasis": [{"sid": 1, "phrase": "hứa hẹn", "why": ""}, {"sid": 2, "phrase": "điểm chung", "why": ""},
                                                 {"sid": [1], "phrase": "rác"}, "chuỗi rác", {"sid": True, "phrase": "x"}],
                    "diagrams": [{"type": "arrow", "items": [{"sid": 1, "phrase": "không nên hứa hẹn"}, {"sid": 2, "phrase": "khách hàng"}]},
                                 {"type": "lạ", "items": []}, {"type": "steps", "items": None}]}
        if schema is JUDGE_SCHEMA:
            return {"verdicts": [{"n": 99, "score": 1, "reason": "ngoài phạm vi"}, {"n": 0, "score": "cao", "reason": "điểm chữ"}, "rác"]}
        if schema is BROLL_SCHEMA:
            raise TimeoutError("hết giờ")
        return {}
    g["llm"], g["available"] = fake, (lambda timeout=3: True)
    try:
        p = plan(w2, 40.0, [{"file": "anh/a.jpg", "keywords": ["x"], "license": "OWNER"}], log=lambda m: None)
    finally:
        g["llm"], g["available"] = real_llm, real_av
    texts = [e["text"].lower() for e in p["emphasis"]]
    if "hứa hẹn" in texts:
        bad += 1
        print("SAI: “hứa hẹn” (sau “không nên”) lên màn hình — đảo nghĩa")
    if "điểm chung" not in texts:
        bad += 1
        print(f"SAI: mất chữ nhấn hợp lệ khi mô hình trả rác: {texts}")
    tops = [d.get("top", {}).get("text", "") for d in p["diagrams"] if d["type"] == "arrow"]
    if any(t.startswith("hứa") for t in tops) or not any(t.startswith("không nên") for t in tops):
        bad += 1
        print(f"SAI: mũi tên phải giữ “không nên …”: {tops}")
    if not any(r.get("kind") == "broll" and "lỗi" in r.get("reason", "") for r in p["ai"]["rejected"]):
        bad += 1
        print("SAI: bước ảnh lỗi phải được ghi lý do")
    print(f"ai_plan tự kiểm: {'đạt' if not bad else f'{bad} lỗi'}")
    return bad == 0


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    ap = argparse.ArgumentParser()
    ap.add_argument("--words", required=True)
    ap.add_argument("--duration", type=float, required=True)
    ap.add_argument("--library", default="", help="thư mục broll có manifest.json")
    ap.add_argument("--content", default="", help="tóm tắt / kịch bản (tuỳ chọn)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    words = json.load(open(a.words, encoding="utf-8"))
    lib = []
    if a.library and os.path.exists(os.path.join(a.library, "manifest.json")):
        lib = [x for x in json.load(open(os.path.join(a.library, "manifest.json"), encoding="utf-8")) if os.path.isfile(os.path.join(a.library, x.get("file", "")))]
    p = plan(words, a.duration, lib, a.content, log=lambda m: print(m, file=sys.stderr))
    if p is None:
        sys.exit(3)
    json.dump(p, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    k = p["ai"]["kept"]
    print(f"Biên tập AI: {k['emphasis']} chữ nhấn, {k['diagrams']} sơ đồ, {k['broll']} minh hoạ; loại {len(p['ai']['rejected'])} đề xuất; {p['ai']['seconds']} s")


if __name__ == "__main__":
    main()
