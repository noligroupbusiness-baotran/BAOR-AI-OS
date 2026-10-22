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
import argparse, hashlib, json, os, re, sys, time, unicodedata, urllib.error, urllib.request

ENDPOINT = os.environ.get("BAOR_LLM_URL", "http://127.0.0.1:8091")
MODEL_LABEL = os.environ.get("BAOR_LLM_LABEL", "Qwen2.5-14B-Instruct Q4_K_M (Apache-2.0, llama.cpp tại máy)")


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower()).replace("đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w%]", "", s)


# ---------------------------------------------------------------- câu
def sentences(words, gap=0.7, max_words=28):
    """Gom từ thành câu: hết câu ở dấu . ? ! hoặc ngắt ≥ gap giây, hoặc quá dài."""
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        txt = w["text"].strip()
        nxt = words[i + 1] if i + 1 < len(words) else None
        end = txt.endswith((".", "?", "!")) or nxt is None or (nxt["start"] - w.get("end", w["start"]) >= gap) or len(cur) >= max_words
        if end:
            out.append({"id": len(out) + 1, "idx": cur, "t0": words[cur[0]]["start"], "t1": words[cur[-1]].get("end", words[cur[-1]]["start"]),
                        "text": " ".join(("[?]" if words[j].get("uncertain") else "") + words[j]["text"].strip() for j in cur)})
            cur = []
    return out


def locate(phrase, sent, words):
    """Cụm `phrase` nằm nguyên văn, liền mạch trong câu? → (chỉ số từ đầu, chỉ số từ cuối) hoặc None. Bỏ nếu dính từ chưa chắc."""
    want = [norm(x) for x in str(phrase).split() if norm(x)]
    if not want:
        return None
    toks = [(j, norm(words[j]["text"])) for j in sent["idx"]]
    toks = [(j, t) for j, t in toks if t]
    for k in range(len(toks) - len(want) + 1):
        if all(toks[k + m][1] == want[m] for m in range(len(want))):
            js = [toks[k + m][0] for m in range(len(want))]
            if any(words[j].get("uncertain") for j in js):
                return None
            return js[0], js[-1]
    return None


# Lời đệm / chào / xưng hô: không bao giờ là chữ nhấn (ESV: chữ nhấn là ý chính đáng nhớ)
FILLER = set("da alo a o u ua vang da ha nhe nha nghe ne the thi ma la co khong roi oi chi anh em minh ban cac moi nguoi hat".split())


def content_words(phrase):
    return [w for w in (norm(x) for x in str(phrase).split()) if w and w not in FILLER]


def spoken(words, a, b):
    return " ".join(words[j]["text"].strip(",.?!") for j in range(a, b + 1))


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

SYSTEM = """Bạn là biên tập viên video ngắn tiếng Việt theo "Skill ESV" (video dạy kỹ năng bán hàng, 1 người nói trước máy quay).
Nhiệm vụ: đọc lời nói đã chia CÂU (mỗi câu có số [n] và mốc giây) và chọn chỗ đặt đồ hoạ giúp người xem hiểu ý chính.
LUẬT BẮT BUỘC:
- Mọi chữ bạn đưa ra phải CHÉP NGUYÊN VĂN, LIỀN MẠCH từ đúng câu được nêu số. Không viết lại, không tóm tắt, không thêm chữ.
- Bỏ qua từ có dấu [?] (nghe chưa chắc).
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
  key_ideas → chữ nhấn (lấy đúng cụm từ khoá trong câu đó).
""" + EXAMPLE

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "emphasis": {"type": "array", "maxItems": 14, "items": {"type": "object", "properties": {"sid": {"type": "integer"}, "phrase": {"type": "string"}, "why": {"type": "string"}}, "required": ["sid", "phrase"]}},
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


def sent_block(sents):
    return "\n".join(f"[{s['id']}] ({s['t0']:.1f}s) {s['text']}" for s in sents)


# ---------------------------------------------------------------- lập kế hoạch
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
                + f"Chọn khoảng {max(1, round((chunk[-1]['t1'] - chunk[0]['t0']) / 15))} chữ nhấn và các sơ đồ thật sự có trong đoạn này.")
        ana = llm([{"role": "system", "content": ANALYZE}, {"role": "user", "content": sent_block(chunk)}], ANALYZE_SCHEMA, max_tokens=1400)
        analyses.append(ana)
        user += "\n\nPHÂN TÍCH CẤU TRÚC (đã làm ở bước trước):\n" + json.dumps(ana, ensure_ascii=False)
        out = llm([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}], PLAN_SCHEMA)
        summaries.append(out.get("summary", ""))
        raw_emph += out.get("emphasis", [])
        raw_dias += out.get("diagrams", [])

    # 2) Kiểm nguyên văn + đặt mốc từ chính lời nói
    def ground(sid, phrase, maxw=None):
        s = by_id.get(sid)
        if not s:
            return None, f"câu {sid} không tồn tại"
        if maxw and len(str(phrase).split()) > maxw:
            return None, f"“{phrase}” dài quá {maxw} tiếng"
        loc = locate(phrase, s, words)
        if not loc:
            return None, f"“{phrase}” không nằm nguyên văn trong câu {sid} (hoặc có từ nghe chưa chắc)"
        return loc, ""

    diagrams = []
    for d in raw_dias:
        typ, items = d.get("type"), d.get("items", [])
        need = {"steps": (2, 4), "compare": (2, 3), "arrow": (2, 2), "mechanism": (3, 3), "quote": (1, 1), "chapter": (1, 1)}[typ]
        if not (need[0] <= len(items) <= need[1]):
            rejected.append({"kind": "diagram", "type": typ, "reason": f"{typ} cần {need[0]}–{need[1]} mục, có {len(items)}"})
            continue
        if typ == "quote" and len(str((items or [{}])[0].get("phrase", "")).split()) < 5:
            rejected.append({"kind": "diagram", "type": typ, "reason": "trích dẫn quá ngắn (< 5 tiếng): không phải câu chốt"})
            continue
        locs, bad = [], ""
        for it in items:
            loc, why = ground(it.get("sid"), it.get("phrase", ""), 14 if typ == "quote" else 6)
            if not loc:
                bad = why
                break
            locs.append(loc)
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
        if not content_words(e.get("phrase", "")) or norm(str(e.get("phrase", "")).split()[0]) in FILLER:
            rejected.append({"kind": "emphasis", "phrase": e.get("phrase"), "reason": "lời đệm / chào / xưng hô, không phải ý chính"})
            continue
        t = round(words[loc[0]]["start"], 2)
        if t < 0.8 or any(dd["t0"] - 0.5 <= t <= dd["t1"] + 0.5 for dd in diagrams):
            rejected.append({"kind": "emphasis", "phrase": e.get("phrase"), "reason": "trùng sơ đồ / quá sát đầu video"})
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

    # 3) Minh hoạ: mô hình chọn theo mô tả thư viện, rồi kiểm riêng từng lựa chọn
    broll = []
    lib = [x for x in (library or []) if str(x.get("license", "")).strip() and not x.get("exclude")]
    if lib:
        catalog = "\n".join(f"#{i}: {os.path.splitext(os.path.basename(x['file']))[0].replace('_', ' ').replace('-', ' ')} — {', '.join(x.get('keywords', []))} — {x.get('source', '')[-60:]}" for i, x in enumerate(lib))
        user = (f"Thư viện ảnh / clip minh hoạ (chỉ được chọn số trong danh sách):\n{catalog}\n\nLời nói:\n{sent_block(sents)}\n\n"
                "Chọn tối đa 6 chỗ mà một ảnh trong thư viện minh hoạ ĐÚNG NGHĨA câu nói (đúng đối tượng / bối cảnh được nói tới). "
                "Không chọn nếu chỉ trùng chữ mà khác nghĩa. Không chọn câu trong 3 giây đầu.")
        picks = llm([{"role": "system", "content": "Bạn là biên tập viên hình ảnh, rất khắt khe về việc ảnh khớp nghĩa câu nói."}, {"role": "user", "content": user}], BROLL_SCHEMA, max_tokens=900).get("picks", [])
        used, last = set(), -1e9
        for p in sorted(picks, key=lambda p: by_id.get(p.get("sid"), {"t0": 1e9})["t0"]):
            s, a = by_id.get(p.get("sid")), p.get("asset")
            if not s or not isinstance(a, int) or not (0 <= a < len(lib)):
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

    digest = hashlib.sha256(json.dumps([w["text"] for w in words], ensure_ascii=False).encode()).hexdigest()[:12]
    return {
        "by": f"Biên tập AI tại máy ({MODEL_LABEL})",
        "note": " ".join(x for x in summaries if x)[:600],
        "emphasis": emphasis,
        "diagrams": diagrams,
        "broll": broll,
        "ai": {"model": MODEL_LABEL, "endpoint": ENDPOINT, "wordsDigest": digest, "seconds": round(time.time() - t_start, 1),
               "analysis": analyses, "proposed": {"emphasis": len(raw_emph), "diagrams": len(raw_dias)}, "kept": {"emphasis": len(emphasis), "diagrams": len(diagrams), "broll": len(broll)},
               "rejected": rejected[:80]},
    }


def main():
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
