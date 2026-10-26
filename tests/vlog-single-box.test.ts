// Trình soạn vlog MỘT ô chữ (OWNER 26/10): lời nói 4 cảnh ↔ các đoạn trong một ô. Hàm thuần — không CSDL, không AI.
// Bất biến: mở rồi lưu không sửa → bản chữ y hệt; sửa chỉ đổi lời nói, mọi trường khác của cảnh giữ nguyên đúng cảnh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { vlogTemplate } from "../src/lib/content/formats";
import { applyScriptText, draftHash, editorDraft, emptyVlogDoc, fillFromExperience, parseVlogDraft, scenesShifted, serializeVlog, speechesToText, textToSpeeches, type VlogDoc } from "../src/lib/content/vlog-script";
import { emptyExperience, sceneHash } from "../src/lib/content/experience";

const emptyDoc = () => emptyVlogDoc();

// PRNG cố định để lần chạy nào cũng giống nhau
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 0x100000000;
  };
}
const WORDS = ["Hồi", "đó", "em", "nhập", "300", "bộ", "khách", "hỏi", "giá", "rồi", "im.", "Bài học:", "lưu", "lại", "nhé?", "“Mới”", "[OWNER KỂ: chuyện]", "—", "5%"];
function speech(r: () => number): string {
  if (r() < 0.3) return ""; // cảnh trống (kể cả ở đầu / giữa)
  const lines = 1 + Math.floor(r() * 3);
  return Array.from({ length: lines }, () => Array.from({ length: 1 + Math.floor(r() * 6) }, () => WORDS[Math.floor(r() * WORDS.length)]).join(" ")).join("\n");
}

test("lời nói 4 cảnh → ô chữ → lời nói: trả lại đúng (kể cả cảnh trống ở đầu / giữa / cuối, lời nói nhiều dòng) — 2000 ca ngẫu nhiên", () => {
  const r = rng(26102026);
  for (let n = 0; n < 2000; n++) {
    const sp = [speech(r), speech(r), speech(r), speech(r)];
    assert.deepEqual(textToSpeeches(speechesToText(sp)), sp, JSON.stringify(sp));
  }
});

test("đoạn 1 = Hook, 2 = Câu chuyện, 3 = Bài học, 4…n = Kết; thiếu đoạn thì cảnh sau để trống", () => {
  assert.deepEqual(textToSpeeches("Hook\n\nChuyện\n\nBài học\n\nKết 1\n\nKết 2"), ["Hook", "Chuyện", "Bài học", "Kết 1\nKết 2"]);
  assert.deepEqual(textToSpeeches("Hook\n\nChuyện"), ["Hook", "Chuyện", "", ""]);
  assert.deepEqual(textToSpeeches(""), ["", "", "", ""]);
  assert.deepEqual(textToSpeeches("  Hook  \n  dòng 2 \n \n\nChuyện\n"), ["Hook\ndòng 2", "Chuyện", "", ""], "1–2 dòng trống = ranh giới thường; bỏ khoảng trắng đầu / cuối dòng");
  assert.deepEqual(textToSpeeches("Hook\n\n\n\nBài học\n\nKết"), ["Hook", "", "Bài học", "Kết"], "thêm 2 dòng trống = giữ chỗ cảnh trống");
  assert.deepEqual(textToSpeeches("\n\nChuyện\n\nBài học\n\nKết"), ["", "Chuyện", "Bài học", "Kết"]);
  assert.equal(speechesToText(["Hook", "", "Bài học", ""]), "Hook\n\n\n\nBài học");
});

const DOC_TEXT = [
  "KỊCH BẢN VLOG: Gọi nhiều, đơn có tăng?",
  "Khách mục tiêu: người mới bán online",
  "Chặng khách (5A): Hỏi (Ask)",
  "",
  "1. HOOK (0–3s)",
  "Hình ảnh: cận mặt",
  "Lời thoại: Gọi trăm cuộc, được mấy đơn?",
  "Chữ trên màn hình: Trăm cuộc gọi",
  "",
  "2. CÂU CHUYỆN (3–25s)",
  "Ý chính: Khách kể gọi trăm cuộc",
  "Hình ảnh: em cầm điện thoại",
  "Gợi ý OWNER: [OWNER KỂ: lần đầu gọi khách]",
  "Lời thoại: ",
  "Chữ trên màn hình: ",
  "",
  "3. BÀI HỌC (25–50s)",
  "Căn cứ: tin nhắn khách 12/10",
  "Hình ảnh: em khoanh một ô",
  "Lời thoại: Gọi lại người đã hỏi giá.",
  "nhờ vậy bạn bớt đoán mò.",
  "Chữ trên màn hình: Gọi đúng người",
  "",
  "4. KẾT (50–60s)",
  "Hình ảnh: em cười",
  "Lời thoại: Bạn gọi kiểu nào? Bình luận nhé.",
  "Chữ trên màn hình: Bình luận",
  "",
  "Nhạc nền: nhẹ",
].join("\n");

const reopenSave = (draft: string) => {
  const doc = parseVlogDraft(draft) as VlogDoc;
  return serializeVlog(applyScriptText(doc, speechesToText(doc.cards.map((c) => c.speech))));
};

test("mở rồi lưu không sửa: bản chữ y hệt (bản đã chuẩn hoá, khung mẫu, cảnh Câu chuyện trống chờ OWNER kể)", () => {
  for (const draft of [DOC_TEXT, serializeVlog(parseVlogDraft(vlogTemplate({ title: "T", hook: "Gọi nhiều, đơn có tăng?", beats: ["a", "b", "c"] })) as VlogDoc)]) {
    assert.equal(serializeVlog(parseVlogDraft(draft) as VlogDoc), draft, "tiền đề: bản đã chuẩn hoá đọc / ghi lại y hệt");
    assert.equal(reopenSave(draft), draft);
  }
  const doc = parseVlogDraft(DOC_TEXT) as VlogDoc;
  const same = applyScriptText(doc, speechesToText(doc.cards.map((c) => c.speech)));
  doc.cards.forEach((c, i) => assert.equal(same.cards[i], c, "cảnh không sửa giữ nguyên đối tượng"));
});

test("sửa trong ô chỉ đổi lời nói; Hình ảnh / Chữ / Ý chính / Gợi ý OWNER / Căn cứ / đầu / cuối giữ đúng cảnh", () => {
  const doc = parseVlogDraft(DOC_TEXT) as VlogDoc;
  const text = speechesToText(doc.cards.map((c) => c.speech));
  assert.equal(text, "Gọi trăm cuộc, được mấy đơn?\n\n\n\nGọi lại người đã hỏi giá.\nnhờ vậy bạn bớt đoán mò.\n\nBạn gọi kiểu nào? Bình luận nhé.");
  // OWNER kể chuyện vào chỗ trống của cảnh 2 → các đoạn sau KHÔNG dồn cảnh
  const told = text.replace("\n\n\n\n", "\n\nLần đầu em gọi 100 cuộc, được 2 đơn.\n\n");
  const next = applyScriptText(doc, told);
  assert.deepEqual(next.cards.map((c) => c.speech), ["Gọi trăm cuộc, được mấy đơn?", "Lần đầu em gọi 100 cuộc, được 2 đơn.", "Gọi lại người đã hỏi giá.\nnhờ vậy bạn bớt đoán mò.", "Bạn gọi kiểu nào? Bình luận nhé."]);
  next.cards.forEach((c, i) => assert.deepEqual({ ...c, speech: "" }, { ...doc.cards[i], speech: "" }));
  assert.deepEqual([next.head, next.tail, next.segment, next.stage], [doc.head, doc.tail, doc.segment, doc.stage]);
  const out = serializeVlog(next);
  assert.match(out, /Gợi ý OWNER: \[OWNER KỂ: lần đầu gọi khách\]/);
  assert.match(out, /Căn cứ: tin nhắn khách 12\/10/);
  assert.deepEqual(parseVlogDraft(out)?.cards.map((c) => c.speech), next.cards.map((c) => c.speech));
  // Xoá hết chữ: lời nói trống, các trường khác còn
  const empty = applyScriptText(doc, "");
  assert.deepEqual(empty.cards.map((c) => [c.speech, c.visual]), doc.cards.map((c) => ["", c.visual]));
});

// Hook dự phòng: trình soạn tự điền hook của bài vào cảnh 1 khi Hook đã lưu trống (vlog-editor.tsx)
const withFallbackHook = (d: VlogDoc, hook: string): VlogDoc => ({ ...d, cards: d.cards.map((c, i) => (i === 0 && !c.speech.trim() && hook ? { ...c, speech: hook } : c)) });

test("P2-1: Hook đã lưu trống + hook dự phòng → lưu không sửa vẫn GHI hook đang thấy; mã xác nhận trình duyệt = mã máy chủ băm, sau khi tải lại vẫn khớp", () => {
  const raw = serializeVlog({ ...emptyDoc(), cards: emptyDoc().cards.map((c) => (c.key === "story" ? { ...c, speech: "Em gọi 100 cuộc" } : c)) });
  const saved = parseVlogDraft(raw) as VlogDoc;
  const base = withFallbackHook(saved, "Hook dự phòng");
  const sent = editorDraft(raw, saved, base, true);
  assert.notEqual(sent, raw, "có tự điền lời nói thì không gửi lại bản cũ");
  assert.equal(parseVlogDraft(sent)?.cards[0].speech, "Hook dự phòng", "hook đang thấy được lưu");
  // Máy chủ lưu `sent` rồi băm (confirmStory → draftHash); tải lại: không còn tự điền → gửi lại đúng bản đã lưu, mã khớp
  const serverHash = draftHash(sent);
  const reSaved = parseVlogDraft(sent) as VlogDoc;
  const again = editorDraft(sent, reSaved, withFallbackHook(reSaved, "Hook dự phòng"), true);
  assert.equal(again, sent);
  assert.equal(draftHash(again), serverHash, "xác nhận còn hiệu lực sau khi tải lại → Gửi duyệt mở được");
  assert.equal(sceneHash(withFallbackHook(reSaved, "Hook dự phòng").cards), serverHash);
});

test("P2-1: không tự điền, chưa sửa → gửi lại y hệt bản đã lưu (kể cả bản chưa chuẩn hoá); đã sửa → ghi từ thẻ cảnh", () => {
  const legacy = "KỊCH BẢN VLOG: X\n\n1. HOOK (0–3s)\nHình ảnh: \nÝ chính: a · b\nLời thoại: Gọi nhiều?\nChữ trên màn hình: \n\n2. CÂU CHUYỆN (3–25s)\nLời thoại: \n";
  const saved = parseVlogDraft(legacy) as VlogDoc;
  assert.notEqual(serializeVlog(saved), legacy, "tiền đề: bản này chưa chuẩn hoá");
  assert.equal(editorDraft(legacy, saved, withFallbackHook(saved, "Hook khác"), true), legacy);
  const edited = applyScriptText(saved, "Gọi nhiều không?");
  assert.equal(editorDraft(legacy, saved, edited, false), serializeVlog(edited));
});

test("P2-2: lời nói có dòng trống bên trong (câu trả lời nhiều đoạn được điền vào) → ô chữ gộp thành một đoạn; gõ tiếp không dồn sang Bài học", () => {
  const sp = ["Hook", "Hồi đó em nhập 300 bộ.\n\nKhách hỏi giá rồi im.", "Bài học: gọi lại người hỏi giá.", "Bạn thì sao?"];
  const text = speechesToText(sp);
  assert.equal(text, "Hook\n\nHồi đó em nhập 300 bộ.\nKhách hỏi giá rồi im.\n\nBài học: gọi lại người hỏi giá.\n\nBạn thì sao?");
  assert.deepEqual(textToSpeeches(text + "!"), ["Hook", "Hồi đó em nhập 300 bộ.\nKhách hỏi giá rồi im.", "Bài học: gọi lại người hỏi giá.", "Bạn thì sao?!"]);
  // Điền từ kinh nghiệm thật (fillFromExperience) với câu trả lời nhiều đoạn — giống trình soạn: gộp rồi ghi lại
  const exp = { ...emptyExperience(), qa: [{ q: "q1", a: "Hồi đó em nhập 300 bộ.\n\nKhách hỏi giá rồi im." }, { q: "q2", a: "Bài học: gọi lại người hỏi giá." }] };
  const filled = fillFromExperience({ ...emptyDoc(), experience: exp }, "ask");
  const t = speechesToText(filled.cards.map((c) => c.speech));
  const doc = applyScriptText(filled, t);
  assert.deepEqual(applyScriptText(doc, t + " ").cards.map((c) => c.speech), doc.cards.map((c) => c.speech), "gõ thêm một ký tự không đổi cảnh nào");
  assert.ok(doc.cards.every((c) => !/\n\s*\n/.test(c.speech)));
});

test("P3: phát hiện cả đoạn dời cảnh (xoá / chèn đoạn giữa), sửa trong đoạn thì không", () => {
  const p = ["Hook", "Chuyện", "Bài học", "Kết"];
  assert.equal(scenesShifted(p, textToSpeeches("Hook\n\nBài học\n\nKết")), true, "xoá đoạn 2 sạch");
  assert.equal(scenesShifted(p, ["Hook", "Mới", "Chuyện", "Bài học\nKết"]), true, "chèn đoạn");
  assert.equal(scenesShifted(p, textToSpeeches("Hook\n\n\n\nBài học\n\nKết")), false, "xoá chữ, giữ chỗ cảnh trống");
  assert.equal(scenesShifted(p, ["Hook!", "Chuyện hay", "Bài học", "Kết"]), false);
});
