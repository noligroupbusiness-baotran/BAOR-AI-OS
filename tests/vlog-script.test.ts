// Trình soạn kịch bản vlog bằng thẻ cảnh: đọc / ghi bản chữ cảnh (round-trip), nhận kịch bản cũ, lọc ghi chú nội bộ, chặng khách 5A,
// kiểm nhanh theo công thức. Hàm thuần — không CSDL, không AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scriptCheck, speechEstimate, vlogTemplate } from "../src/lib/content/formats";
import { buildShootingScript, parseShootingScript } from "../src/lib/content/shooting-script";
import {
  PATH_STAGES,
  cleanBeats,
  isMetaNote,
  ogilvyCopyRules,
  parseVlogDraft,
  spokenSentences,
  serializeVlog,
  stageFromGoal,
  stripMetaHooks,
  vlogChecks,
  vlogFormulaRules,
  vlogTimeline,
  type VlogDoc,
} from "../src/lib/content/vlog-script";

const roundTrip = (doc: VlogDoc) => assert.deepEqual(parseVlogDraft(serializeVlog(doc)), doc, "đọc lại bản đã ghi phải ra đúng thẻ cảnh");

// Bản AI viết trước đây (tiêu đề cảnh in đậm Markdown, lời thoại trong ngoặc kép)
const AI_MARKDOWN = [
  "**1. HOOK (0–3s)**",
  "Hình ảnh: Em nhìn vào máy quay.",
  "Lời thoại: “Mới bán online, bắt đầu từ đâu?”",
  "Chữ trên màn hình: Bắt đầu từ đâu?",
  "",
  "**2. CÂU CHUYỆN (3–25s)**",
  "Hình ảnh: Em phác ba ô trên giấy.",
  "Lời thoại: “Nhiều bạn hỏi mình: chưa có kinh nghiệm thì bán gì trước?”",
  "Chữ trên màn hình: Bán gì trước?",
  "",
  "**3. BÀI HỌC (25–50s)**",
  "Hình ảnh: Em khoanh một ô.",
  "Lời thoại: Hỏi khách lần gần nhất họ mua ở đâu.",
  "nhờ vậy bạn bớt đoán mò.",
  "Chữ trên màn hình: Hỏi về lần mua thật",
  "",
  "**4. KẾT (50–60s)**",
  "Hình ảnh: Em đặt bút xuống.",
  "Lời thoại: Lưu lại để thử nhé.",
  "Chữ trên màn hình: Lưu lại",
].join("\n");

const LEGACY_5 = "1. HOOK (0–3s)\nLời thoại: Bạn có biết…\n\n2. VẤN ĐỀ (3–10s)\nLời thoại: Khách sợ cuộc gọi rác.\n\n3. GIẢI PHÁP (10–30s)\nLời thoại: …\n\n4. BẰNG CHỨNG (30–45s)\nLời thoại: …\n\n5. KÊU GỌI (45–60s)\nLời thoại: Bình luận nhé.";

test("khung vlog mặc định → 4 thẻ cảnh; ghi lại → đọc lại không đổi; scriptCheck / ước tính thời lượng giữ nguyên", () => {
  const tpl = vlogTemplate({ title: "Gọi nhiều, đơn có tăng?", hook: "Gọi nhiều, đơn có tăng?", beats: ["Khách kể gọi trăm cuộc vẫn ít đơn", "Gọi lại người đã hỏi giá", "Bạn gọi kiểu nào?"] });
  const doc = parseVlogDraft(tpl);
  assert.ok(doc);
  assert.deepEqual(doc.cards.map((c) => c.key), ["hook", "story", "value", "end"]);
  assert.equal(doc.cards[0].speech, "Gọi nhiều, đơn có tăng?");
  assert.equal(doc.cards[0].visual, "cận mặt, nói thẳng vào camera");
  assert.deepEqual(doc.cards[1].notes, ["Khách kể gọi trăm cuộc vẫn ít đơn"]);
  assert.match(doc.cards[1].ownerHints[0], /^\[OWNER KỂ:/);
  assert.equal(doc.cards[1].speech, "", "khung trống: không viết câu chuyện thay OWNER");
  assert.deepEqual(doc.head, ["KỊCH BẢN VLOG: Gọi nhiều, đơn có tăng?", "Dạng: vlog chia sẻ, nói ngôi thứ nhất · dưới 60 giây · ~130–160 từ lời thoại"]);
  assert.deepEqual(doc.tail, ["Nhạc nền: (chọn trong Cài đặt › Kho nhạc)", "Ghi chú dựng:"]);
  roundTrip(doc);
  const out = serializeVlog(doc);
  assert.equal(scriptCheck(out).format, "vlog");
  assert.deepEqual(scriptCheck(out).missing, []);
  assert.equal(speechEstimate(out).words, speechEstimate(tpl).words);
  assert.match(out, /Gợi ý OWNER: \[OWNER KỂ:/, "dòng gợi ý OWNER (luật chống bịa) còn nguyên");
});

test("bản AI cũ (tiêu đề in đậm, ngoặc kép, lời thoại xuống dòng) → thẻ cảnh; bản ghi lại đọc được ở bản đọc khi quay", () => {
  const doc = parseVlogDraft(AI_MARKDOWN);
  assert.ok(doc);
  assert.equal(doc.cards[0].speech, "“Mới bán online, bắt đầu từ đâu?”", "chữ OWNER giữ nguyên ngoặc kép (chỉ bỏ ngoặc khi AI vừa viết)");
  assert.equal(doc.cards[2].speech, "Hỏi khách lần gần nhất họ mua ở đâu.\nnhờ vậy bạn bớt đoán mò.", "dòng nối tiếp là lời thoại, giữ xuống dòng");
  assert.equal(doc.cards[3].onScreen, "Lưu lại");
  roundTrip(doc);
  const out = serializeVlog(doc);
  const shot = parseShootingScript(out);
  assert.deepEqual(shot.scenes.map((s) => s.speech), doc.cards.map((c) => c.speech.replace(/\n/g, " ")), "bản đọc khi quay ghép lời thoại nhiều dòng");
  assert.deepEqual(shot.scenes.map((s) => s.visual), doc.cards.map((c) => c.visual), "hình ảnh không lẫn dòng dàn ý");
  assert.equal(speechEstimate(out).words, vlogTimeline(doc).words, "thời lượng trên thẻ = thời lượng scriptCheck");
});

test("nhận kịch bản KHÔNG soạn bằng thẻ: khung cũ 5 cảnh, chữ tự do, cảnh lặp → null; bản trống → 4 thẻ trống", () => {
  assert.equal(parseVlogDraft(LEGACY_5), null);
  // Kịch bản quay từ brief (CP02) luôn là khung cũ 5 cảnh — giữ ô chữ + bảng kiểm CP02 như cũ
  const brief = { topic: "Chào hỏi", goal: "Video ngắn", audience: "Sales", keyMessage: "Lời chào không phải để chốt.", angle: "Seller mới hay hỏi câu rỗng.", points: [{ text: "Ba nhịp.", classification: "PROCEDURE" as const, findingIds: [], knowledgeIds: [], sourceIds: [] }], gaps: [] };
  assert.equal(parseVlogDraft(buildShootingScript(brief, [], [])), null);
  assert.equal(parseVlogDraft("Hôm nay mình kể chuyện bán hàng, không theo cảnh nào."), null);
  assert.equal(parseVlogDraft("1. HOOK\nLời thoại: a\n\n1. HOOK\nLời thoại: b"), null, "một cảnh hai lần → không đoán");
  const empty = parseVlogDraft("   ");
  assert.ok(empty);
  assert.equal(empty.cards.length, 4);
  assert.ok(empty.cards.every((c) => !c.speech));
  // Thiếu cảnh → thẻ trống cho cảnh đó, ghi lại đủ 4 cảnh
  const partial = parseVlogDraft("1. HOOK (0–3s)\nLời thoại: Một câu hook\n\n3. BÀI HỌC\nLời thoại: Một bài học");
  assert.ok(partial);
  assert.deepEqual(scriptCheck(serializeVlog(partial)).missing, []);
  assert.equal(partial.cards[1].speech, "");
});

test("chữ lạ trong cảnh, dòng Căn cứ, ghi chú dựng nhiều dòng, khách mục tiêu + chặng khách: giữ nguyên qua ghi / đọc", () => {
  const draft = [
    "KỊCH BẢN VLOG: Thử",
    "Khách mục tiêu: chủ shop mới bán online",
    "Chặng khách (5A): Làm (Act)",
    "",
    "1. HOOK (0–3s)",
    "Hình ảnh: cận mặt",
    "Lời thoại: Gọi trăm cuộc vẫn ít đơn?",
    "Chữ trên màn hình: Ít đơn?",
    "Căn cứ: [S1]",
    "",
    "2. CÂU CHUYỆN (3–25s)",
    "Lời thoại: Nhiều bạn kể với mình như vậy.",
    "Chữ trên màn hình: Kể",
    "",
    "(cắt cảnh nhanh)",
    "",
    "Nhạc nền: nhạc nhẹ",
    "Ghi chú dựng: cắt nhanh",
    "thêm phụ đề",
  ].join("\n");
  const doc = parseVlogDraft(draft);
  assert.ok(doc);
  assert.equal(doc.segment, "chủ shop mới bán online");
  assert.equal(doc.stage, "act");
  assert.deepEqual(doc.cards[0].extra, ["Căn cứ: [S1]"]);
  assert.deepEqual(doc.cards[1].extra, ["(cắt cảnh nhanh)"]);
  assert.deepEqual(doc.tail, ["Nhạc nền: nhạc nhẹ", "Ghi chú dựng: cắt nhanh", "thêm phụ đề"]);
  roundTrip(doc);
  // Sửa thẻ (lời nói nhiều dòng) → ghi một dòng "Lời thoại:" để scriptCheck đếm đủ
  // Lời nói nhiều dòng (kể cả dòng trống) → giữ xuống dòng; scriptCheck đếm cả dòng nối tiếp
  const edited = { ...doc, cards: doc.cards.map((c) => (c.key === "end" ? { ...c, speech: "Bạn gọi kiểu nào?\n\nBình luận nhé.\n2. Nhớ lưu lại" } : c)) };
  const out = serializeVlog(edited);
  assert.match(out, /Lời thoại: Bạn gọi kiểu nào\?\nBình luận nhé\. 2\. Nhớ lưu lại/, "dòng dễ bị đọc nhầm thành tiêu đề cảnh được nối vào dòng trước");
  assert.equal(parseVlogDraft(out)!.cards[3].speech, "Bạn gọi kiểu nào?\nBình luận nhé. 2. Nhớ lưu lại");
  assert.equal(speechEstimate(out).words, vlogTimeline(parseVlogDraft(out)!).words);
});

test("ghi chú nội bộ của AI (ảnh chụp OWNER 26/10) bị nhận ra; câu nội dung thật (phản biện 26/10) không bị bắt; đọc thẻ không xoá Ý chính", () => {
  const meta = [
    "Nói rõ: “Em có một bản nháp nội bộ ghi ‘gọi nhiều chưa chắc bán nhiều’, nhưng nó được gắn nhãn AI suy luận, chưa kiểm chứng.”",
    "Chốt: “Hiện tại đây là câu hỏi để kiểm tra, chưa phải căn cứ để em khuyên tăng hay giảm số cuộc gọi.”",
    "Giải thích rằng dữ liệu cold call được nhắc đến không trực tiếp chứng minh kết luận.",
    "Nếu muốn kiểm tra, đề xuất ghi nhận số lần liên hệ; nêu rõ cần dữ liệu phù hợp trước khi kết luận.",
    "Em chưa có căn cứ để nói món nào sẽ bán được.",
    "Phát hiện này còn chưa được kiểm chứng.",
  ];
  for (const m of meta) assert.equal(isMetaNote(m), true, m);
  const real = [
    "Khách kể gọi cả trăm cuộc mà đơn vẫn lẹt đẹt",
    "Gọi lại đúng người đã hỏi giá để bớt mệt",
    "Bạn đang gọi kiểu nào? Bình luận nhé",
    "Quy trình chăm khách nội trong 24 giờ",
    // 9 câu nội dung thật phản biện độc lập chỉ ra
    "Nêu rõ một lợi ích khách nhận được",
    "Nói rõ ràng giá trị thay vì tính năng",
    "Trước khi kết luận khách không mua, hãy hỏi lại",
    "Bạn bán mà không có dữ liệu khách",
    "Đừng gắn nhãn khách khó tính",
    "Để AI đoán ý khách là sai",
    "Viết bản nháp caption trước khi quay",
    "Thông tin chưa kiểm chứng trên mạng làm bạn mất tiền",
    "Giả thuyết sai khiến bạn mất khách",
  ];
  for (const r of real) assert.equal(isMetaNote(r), false, r);
  assert.deepEqual(cleanBeats([...meta, ...real]), { beats: real, dropped: meta.length });
  // Khung cũ có "Ý chính:" là ghi chú → đọc vào thẻ KHÔNG xoá (trình soạn đánh dấu, OWNER tự bỏ); lưu lại vẫn còn
  const doc = parseVlogDraft(vlogTemplate({ hook: "Gọi nhiều, đơn có tăng?", beats: [meta[0], real[0], meta[1]] }));
  assert.ok(doc);
  assert.ok(doc.cards.flatMap((c) => c.notes).some(isMetaNote));
  assert.ok(serializeVlog(doc).includes("AI suy luận"));
});

test("bộ lọc sau AI tạo hook: bỏ nhịp ghi chú; hook chỉ còn ghi chú thì bỏ cả hook", () => {
  const r = stripMetaHooks([
    { hook: "Gọi trăm cuộc vẫn ít đơn?", angle: "nỗi đau", beats: ["Khách kể gọi nhiều vẫn ít đơn", "Dữ liệu này là AI suy luận, chưa kiểm chứng", "Bình luận cách bạn gọi"] },
    { hook: "Gọi nhiều, liệu đơn có tăng?", angle: "", beats: ["Nói rõ: bản nháp nội bộ chưa kiểm chứng", "Chưa phải căn cứ để khuyên"] },
    { hook: "Hook không dàn ý", beats: [] },
    { hook: "Đừng gắn nhãn khách khó tính", angle: "AI suy luận, chưa kiểm chứng", beats: ["Khách kể bị gọi là khó tính"] },
  ]);
  assert.equal(r.items.length, 3, "góc (angle) không bao giờ làm bỏ cả hook");
  assert.deepEqual(r.items[0].beats, ["Khách kể gọi nhiều vẫn ít đơn", "Bình luận cách bạn gọi"]);
  assert.equal(r.metaHooks, 1);
  assert.equal(r.metaBeats, 3);
});

test("chặng khách 5A từ mục tiêu nội dung; công thức ghi rõ 'theo nguyên lý marketing của Philip Kotler' và lời mời đúng chặng", () => {
  assert.equal(stageFromGoal(""), "ask", "mặc định: Hỏi");
  assert.equal(stageFromGoal("lead_gen Thu lead leads"), "act");
  assert.equal(stageFromGoal("nurture Chăm sóc khách cũ contacts"), "advocate");
  assert.equal(stageFromGoal("organic Tăng độ phủ reach"), "aware");
  assert.equal(stageFromGoal("organic Tương tác engagement"), "ask");
  assert.equal(stageFromGoal("Tăng người theo dõi"), "appeal");
  for (const p of PATH_STAGES) {
    const rules = vlogFormulaRules(p.key);
    assert.match(rules, /theo nguyên lý marketing của Philip Kotler/);
    assert.ok(rules.includes(p.cta), `lời mời chặng ${p.label}`);
    assert.match(rules, /\[OWNER KỂ:/, "giữ luật chống bịa chuyện");
    assert.match(rules, /AI suy luận/, "cấm ghi chú nội bộ trong lời thoại");
  }
  assert.ok(!/Kotler (?:soạn|viết|tạo)/.test(vlogFormulaRules("ask")), "không nói Kotler là tác giả khung");
});

test("kiểm nhanh theo công thức: hook ≤ 15 chữ, một ý, lợi ích, lời mời, không chào bán; thời lượng > 60 giây", () => {
  const good = parseVlogDraft(serializeVlog({
    head: [], segment: "", stage: "ask", tail: [],
    cards: [
      { key: "hook", speech: "Gọi trăm cuộc mà đơn vẫn lẹt đẹt?", visual: "", onScreen: "", notes: [], ownerHints: [], extra: [] },
      { key: "story", speech: "Nhiều bạn kể với mình: càng gọi càng mệt.", visual: "", onScreen: "", notes: [], ownerHints: [], extra: [] },
      { key: "value", speech: "Gọi lại đúng người đã hỏi giá, bạn đỡ mệt mà khách nghe máy nhiều hơn.", visual: "", onScreen: "", notes: [], ownerHints: [], extra: [] },
      { key: "end", speech: "Bạn gọi kiểu nào? Bình luận cho mình nhé.", visual: "", onScreen: "", notes: [], ownerHints: [], extra: [] },
    ],
  }))!;
  assert.ok(vlogChecks(good).every((c) => c.ok), JSON.stringify(vlogChecks(good).filter((c) => !c.ok)));
  const bad = { ...good, cards: good.cards.map((c) => ({ ...c })) };
  bad.cards[0].speech = "Hôm nay mình sẽ cùng các bạn tìm hiểu thật kỹ về chuyện gọi điện cho khách hàng mới mỗi ngày";
  bad.cards[2].speech = "Thứ nhất gọi lại. Thứ hai nhắn tin.";
  bad.cards[3].speech = "Mua ngay hôm nay, cam kết hiệu quả 100%.";
  const fail = new Set(vlogChecks(bad).filter((c) => !c.ok).map((c) => c.key));
  for (const k of ["benefit", "cta", "hook", "idea", "policy"] as const) assert.ok(fail.has(k), k);
  bad.cards[1].speech = "[OWNER KỂ: lần đầu gọi khách] " + "chữ ".repeat(200);
  assert.ok(vlogChecks(bad).some((c) => c.key === "owner" && !c.ok), "còn chỗ OWNER kể");
  assert.equal(vlogTimeline(bad).over, true);
  assert.equal(vlogTimeline(good).over, false);
});

test("phong cách copywriting của David Ogilvy: hook cụ thể, không nói quá (trừ khi có bằng chứng), câu ngắn — kiểm theo luật", () => {
  const mk = (hook: string, story: string, value: string, end = "Bạn gọi kiểu nào? Bình luận cho mình nhé."): VlogDoc => ({
    head: [], segment: "", stage: "ask", tail: [],
    cards: [hook, story, value, end].map((speech, i) => ({ key: (["hook", "story", "value", "end"] as const)[i], speech, visual: "", onScreen: "", notes: [], ownerHints: [], extra: [] })),
  });
  const get = (d: VlogDoc, k: string) => vlogChecks(d).find((c) => c.key === k)!;
  const good = mk("3 câu mở đầu giúp khách bớt cúp máy", "Nhiều bạn kể khách cúp máy sau vài giây.", "Nói tên và lý do gọi ngay câu đầu, bạn đỡ bị cúp máy.");
  for (const k of ["specific", "hype", "short"]) assert.equal(get(good, k).ok, true, k);
  // Hook chung chung, không lợi ích, không chi tiết
  assert.equal(get(mk("Chuyện gọi điện cho khách", "a.", "b."), "specific").ok, false);
  assert.equal(get(mk("Gọi lại khách cũ mỗi tuần", "a.", "b."), "specific").ok, true, "chi tiết thời gian là cụ thể");
  // Thổi phồng không bằng chứng → cảnh báo; có "theo …" trong câu thì không
  const hype = mk("3 câu mở đầu", "Đây là cách tuyệt vời nhất mà mình từng thấy.", "Kết quả đỉnh cao.");
  assert.equal(get(hype, "hype").ok, false);
  assert.match(get(hype, "hype").why ?? "", /tuyệt vời|nhất|đỉnh cao/);
  assert.equal(get(mk("3 câu mở đầu", "Theo khảo sát của nhóm, đây là lý do bị cúp máy nhiều nhất.", "b."), "hype").ok, true, "có nguồn trong câu");
  for (const ok of ["Thứ nhất, nói tên mình.", "Nhất là khi khách đang bận.", "Mình nhất định sẽ thử.", "Giữ giọng thống nhất."]) {
    assert.equal(get(mk("3 câu mở đầu", ok, "b."), "hype").ok, true, ok);
  }
  // Câu dài: phần lớn câu > 20 chữ → cảnh báo
  const longS = Array.from({ length: 24 }, () => "chữ").join(" ");
  assert.equal(get(mk("3 câu mở đầu", `${longS}. ${longS}.`, `${longS}.`), "short").ok, false);
  assert.equal(get(mk("3 câu mở đầu", `${longS}. Ngắn thôi. Ngắn nữa.`, "Câu ngắn. Rõ ràng."), "short").ok, true, "≤ 25% câu dài vẫn đạt");
  assert.deepEqual(spokenSentences("Một câu. [OWNER KỂ: x] Hai câu? Ba!"), ["Một câu", "Hai câu", "Ba"]);
  // Luật viết vào prompt: ghi đúng nhãn, có giọng thương hiệu, không nói Ogilvy là tác giả khung
  const rules = vlogFormulaRules("ask", "gần gũi, thẳng thắn");
  assert.match(rules, /theo phong cách copywriting của David Ogilvy/);
  assert.match(rules, /gần gũi, thẳng thắn/);
  assert.match(rules, /không so sánh nhất/);
  assert.ok(rules.indexOf("Philip Kotler") < rules.indexOf("David Ogilvy"), "Kotler = nói gì, Ogilvy = viết thế nào");
  assert.ok(ogilvyCopyRules().every((l) => !/Ogilvy (?:nói|viết|soạn)/.test(l)));
});

// ---------- Phản biện độc lập 26/10 (P1): mở + Lưu không được làm mất chữ của OWNER ----------
// Chuẩn hoá được phép (ghi trong vlog-script.ts): tiêu đề cảnh / nhãn trường viết lại theo dạng chuẩn, dòng chặng khách 5A nhận ra
// được viết lại theo nhãn chuẩn, khoảng trắng / dòng trống gộp lại, "Ý chính: a · b" tách thành từng dòng, thứ tự trường trong cảnh
// theo dạng chuẩn. Ngoài ra: MỌI chữ của mọi dòng không trống phải còn sau một lần đọc → ghi.
const LABEL = /^(?:hình ảnh|lời thoại|lời nói|chữ trên màn hình|gợi ý owner|ý chính|căn cứ|khách mục tiêu|chặng khách)(?:\s*\([^)]*\))?\s*:\s*/iu;
const norm = (s: string) => s.normalize("NFC").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function contentPieces(line: string): string[] {
  const t = line.replace(/^[-•*#\s]+/u, "").replace(/\*\*/g, "").trim();
  if (/^(?:\d+\s*[.)]\s*)?(?:hook|câu chuyện|bài học|giá trị|kết)(?:\s*\([^)]*\))?[\s:]*$/iu.test(t)) return []; // tiêu đề cảnh: chuẩn hoá
  if (/^chặng khách(?:\s*\(5a\))?\s*:\s*(?:biết|thích|hỏi|làm|giới thiệu|aware|appeal|ask|act|advocate)\b/iu.test(t)) return []; // nhãn chuẩn
  const qualifier = t.match(/^[^:(]{1,30}\(([^)]*)\)\s*:/u)?.[1];
  const body = t.replace(LABEL, "");
  return [...(qualifier ? [qualifier] : []), ...body.split(/\s+·\s+/u)].map(norm).filter(Boolean);
}
const SAVE_CORPUS: Record<string, string> = {
  twoSpeech: "1. HOOK\nLời thoại: phần A\nHình ảnh: x\nLời thoại: phần B\nHình ảnh: y\nChữ trên màn hình: c1\nChữ trên màn hình: c2",
  multiline: "1. HOOK (0–3s)\nLời thoại: Dòng một\ndòng hai\n\ndòng ba sau dòng trống\nChữ trên màn hình: abc\n2. CÂU CHUYỆN (3–25s)\nLời thoại: “Em bán mãi không ai mua”\n3. BÀI HỌC\nLời thoại: x\n4. KẾT\nLời thoại: y",
  stageUnknown: "Chặng khách (5A): Cân nhắc mua\nKhách mục tiêu: A\nKhách mục tiêu: B\n1. HOOK\nLời thoại: h",
  fieldVariant: "1. HOOK (0–3s)\nHình ảnh: cận mặt\nLời thoại (giọng ấm): xin chào\nLời thoại: thật\n2. CÂU CHUYỆN\nÝ chính: Nêu rõ một lợi ích khách nhận được · Trước khi kết luận khách không mua, hỏi lại · Kể chuyện\nÝ chính: Ghi chú: được gắn nhãn AI suy luận, chưa kiểm chứng\nLời thoại: s",
  tailEarly: "1. HOOK\nLời thoại: h\nNhạc nền: abc\n2. CÂU CHUYỆN\nLời thoại: owner story\nGhi chú dựng: cắt nhanh\nthêm phụ đề",
  aiMarkdown: AI_MARKDOWN,
  template: vlogTemplate({ title: "T", hook: "Mình từng mất 5 triệu", beats: ["Khách kể", "Bài học", "Bạn thấy sao?"] }),
};

test("mở + Lưu một lần: mọi dòng không trống của bản gốc còn nguyên chữ (chỉ chuẩn hoá đã ghi) — và ghi lần hai không đổi", () => {
  for (const [name, original] of Object.entries(SAVE_CORPUS)) {
    const doc = parseVlogDraft(original);
    assert.ok(doc, name);
    const saved = serializeVlog(doc);
    const hay = norm(saved.replace(/\n/g, " "));
    for (const line of original.split("\n").filter((l) => l.trim())) {
      for (const piece of contentPieces(line)) assert.ok(hay.includes(piece), `${name}: mất “${piece}” (dòng “${line}”)\n---\n${saved}`);
    }
    assert.equal(serializeVlog(parseVlogDraft(saved)!), saved, `${name}: ghi lần hai phải ổn định`);
  }
});
