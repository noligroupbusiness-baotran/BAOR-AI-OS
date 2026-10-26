// "Kinh nghiệm của anh" (SK-KNW-01 — Skill viết content của anh): khối KINH NGHIỆM trong bản chữ (round-trip, hạ nguồn bỏ qua an toàn),
// câu phỏng vấn, xưng hô, quality check theo luật, xếp gợi ý chuyện từ Second Brain. Hàm thuần — không CSDL, không AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLegacyScript, scriptCheck, speechEstimate, vlogTemplate } from "../src/lib/content/formats";
import { parseShootingScript } from "../src/lib/content/shooting-script";
import { experienceChecks, experienceFormulaRules, fillFromExperience, moveOwnerMarks, parseVlogDraft, serializeVlog, vlogChecks, vlogFormulaRules, type VlogDoc } from "../src/lib/content/vlog-script";
import { stripPlaceholders } from "../src/lib/content/shooting-script";
import { FIRST_PERSON_CLAIM, pronounSlips } from "../src/lib/content/vlog-script";
import { reviewItemPresent, sceneHash } from "../src/lib/content/experience";
import { settleOwnerDraft } from "../src/lib/content/vlog-script";
import { CONTENT_SKILL, addedDetails, numbersIn, stripExperienceBlock, emptyExperience, hasExperience, interviewQuestions, pronounsFromVoice, rankExperience, type ExperienceCandidate, type OwnerExperience } from "../src/lib/content/experience";

const BASE = vlogTemplate({ title: "Mới bán online, bắt đầu từ đâu?", hook: "Mới bán online, bắt đầu từ đâu?" });
const EXP: OwnerExperience = {
  qa: [
    { q: "Hồi mới bắt đầu, việc đầu tiên anh làm là gì?", a: "Lần đầu bán online, em nhập 50 bộ áo mà chưa hỏi ai.\nKết quả: tồn gần hết." },
    { q: "Anh đã làm gì, sai ở đâu?", a: "Em đoán khách thích gì thay vì hỏi.\n1. HOOK (0–3s)\nLời thoại: câu này là lời của anh, không phải lời thoại\nVấn đề là em không hỏi." },
    { q: "Câu chưa trả lời", a: "" },
  ],
  angle: "mistake",
  extraction: { situation: "Mới bán online, nhập 50 bộ áo", lesson: "Hỏi 5 khách trước khi nhập hàng", limitation: "Khi đã có khách quen thì khác" },
  refs: [{ kind: "knowledge", id: "3fd4ceb9517d81939f16feae4495bfc6", label: "BAOR SALES EXPERTISE · nháp" }],
};

const withExp = (draft: string, e: OwnerExperience | undefined): VlogDoc => {
  const d = parseVlogDraft(draft)!;
  return e ? { ...d, experience: e } : d;
};

test("khối KINH NGHIỆM: ghi → đọc lại đúng (câu nhiều dòng, góc, bóc tách, nguồn); ghi lần hai không đổi; hạ nguồn không đọc nhầm", () => {
  const plain = parseVlogDraft(BASE)!;
  const doc = withExp(BASE, EXP);
  const out = serializeVlog(doc);
  assert.match(out, /^KINH NGHIỆM CỦA OWNER:$/m);
  const back = parseVlogDraft(out)!;
  assert.deepEqual(back, doc, out);
  assert.equal(serializeVlog(back), out, "ổn định");
  // Bản đọc khi quay / bộ dựng / kiểm khung: như khi không có khối
  const noExp = serializeVlog(plain);
  assert.deepEqual(scriptCheck(out).missing, []);
  assert.equal(scriptCheck(out).format, "vlog");
  assert.equal(isLegacyScript(out), false);
  assert.equal(speechEstimate(out).words, speechEstimate(noExp).words, "câu trả lời không bị tính là lời thoại");
  assert.deepEqual(parseShootingScript(out).scenes.map((s) => [s.name, s.speech]), parseShootingScript(noExp).scenes.map((s) => [s.name, s.speech]));
  assert.equal(parseShootingScript(out).scenes.length, 4, "dòng “1. HOOK (0–3s)” trong câu trả lời không thành cảnh");
  // Bản không có khối: không có khoá experience (deepEqual chặt với bản cũ)
  assert.equal("experience" in parseVlogDraft(noExp)!, false);
});

test("khối KINH NGHIỆM: thử ngẫu nhiên 300 bộ câu trả lời có chữ “bẫy” — round-trip và hạ nguồn giữ nguyên", () => {
  const TRAPS = ["Kết quả là", "Vấn đề", "Bài học", "Câu chuyện", "1. HOOK (0–3s)", "Lời thoại: x", "Hình ảnh: y", "Nhạc nền: z", "- Đáp: giả", "  · lùi", "KINH NGHIỆM:", "“trích”", "[OWNER KỂ: x]", "50%", "Chặng khách (5A): Làm", "Khách mục tiêu: A", "2. CÂU CHUYỆN"];
  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  const text = () => Array.from({ length: 1 + rnd(3) }, () => Array.from({ length: 1 + rnd(3) }, () => TRAPS[rnd(TRAPS.length)]).join(" ")).join("\n");
  const plain = serializeVlog(parseVlogDraft(BASE)!);
  for (let i = 0; i < 300; i++) {
    const e: OwnerExperience = { ...emptyExperience(), qa: Array.from({ length: 1 + rnd(3) }, () => ({ q: TRAPS[rnd(TRAPS.length)].replace(/\n/g, " "), a: text() })), angle: rnd(2) ? "story" : "" };
    if (rnd(2)) e.extraction = { belief: text(), why: text() };
    const doc = withExp(BASE, e);
    const out = serializeVlog(doc);
    const back = parseVlogDraft(out)!;
    assert.equal(serializeVlog(back), out, `#${i} ổn định`);
    // Chuẩn hoá được phép: khoảng trắng gộp, dòng trống bỏ — so sau chuẩn hoá
    const norm = (x: OwnerExperience) => ({ ...x, qa: x.qa.map((y) => ({ q: y.q.replace(/\s+/g, " ").trim(), a: y.a.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") })) });
    assert.deepEqual(norm(back.experience!).qa, norm(e).qa, `#${i}\n${out}`);
    assert.deepEqual(back.cards.map((c) => c.speech), doc.cards.map((c) => c.speech), `#${i} thẻ cảnh không đổi`);
    assert.deepEqual(scriptCheck(out).missing, [], `#${i}`);
    assert.equal(speechEstimate(out).words, speechEstimate(plain).words, `#${i}`);
    assert.equal(parseShootingScript(out).scenes.length, 4, `#${i}`);
  }
});

test("INTERVIEW MODE: 1–2 câu theo chủ đề hook; hỏi thêm ra câu mới, không lặp", () => {
  const q = interviewQuestions("Mới bán online, bắt đầu từ đâu?");
  assert.equal(q.length, 2);
  assert.match(q[0], /mới bắt đầu/);
  const next = interviewQuestions("Mới bán online, bắt đầu từ đâu?", q, 1);
  assert.equal(next.length, 1);
  assert.ok(!q.includes(next[0]));
  assert.match(interviewQuestions("Khách chê đắt rồi từ chối")[0], /từ chối/);
  assert.match(interviewQuestions("Đào tạo seller mới")[0], /đào tạo Sales/);
  assert.equal(interviewQuestions("chủ đề lạ").length, 2, "không khớp chủ đề → câu chung");
});

test("xưng hô từ giọng thương hiệu: “xưng 'em' với khách” → em – anh chị; mặc định em – anh chị", () => {
  assert.deepEqual(pronounsFromVoice("Gần gũi, xưng 'em' với khách, luôn có bằng chứng, không hứa suông."), { self: "em", audience: "anh chị" });
  assert.deepEqual(pronounsFromVoice(""), { self: "em", audience: "anh chị" });
  assert.deepEqual(pronounsFromVoice("Thân thiện, xưng mình, gọi khách là bạn"), { self: "mình", audience: "bạn" });
  assert.deepEqual(pronounsFromVoice("xưng tôi"), { self: "tôi", audience: "bạn" });
});

const P = { self: "em", audience: "anh chị" };
const mk = (speech: [string, string, string, string], e?: OwnerExperience): VlogDoc => {
  const d = parseVlogDraft(BASE)!;
  return { ...d, ...(e ? { experience: e } : {}), cards: d.cards.map((c, i) => ({ ...c, speech: speech[i] })) };
};
const GOOD: [string, string, string, string] = [
  "Lần đầu bán online, em nhập 50 bộ áo mà chưa hỏi ai.",
  "Em đoán khách thích gì thay vì hỏi. Kết quả: tồn gần hết.",
  "Nhiều người nghĩ cứ nhập hàng rẻ là bán được. Em thấy khác: hãy hỏi 5 khách trước khi nhập, anh chị đỡ tồn hàng.",
  "Anh chị đã từng nhập hàng theo cảm tính chưa? Kể em nghe ở phần bình luận nhé.",
];
const ANSWERS: OwnerExperience = { ...emptyExperience(), qa: [{ q: "q", a: "Lần đầu bán online, em nhập 50 bộ áo mà chưa hỏi ai. Tồn gần hết." }, { q: "q2", a: "Em đoán khách thích gì. Bài học: hỏi 5 khách trước khi nhập." }] };

test("QUALITY CHECK SK-KNW-01: chuyện thật, đã xác nhận, không thêm chuyện, không phổ quát hoá, ví dụ, bài học, POV, không chung chung, ngôi thứ nhất, xưng hô", () => {
  const ok = experienceChecks(mk(GOOD, ANSWERS), P);
  assert.ok(ok.every((c) => c.ok), JSON.stringify(ok.filter((c) => !c.ok)));
  const get = (d: VlogDoc, k: string, opts = {}) => experienceChecks(d, P, opts).find((c) => c.key === k)!;
  assert.equal(get(mk(GOOD), "real").ok, false, "không có câu trả lời → chưa có chuyện thật");
  assert.equal(get(mk(GOOD), "example").ok, false);
  // AI thêm con số / câu trích không có trong câu trả lời
  const added = get(mk([GOOD[0].replace("50", "80"), `${GOOD[1]} Khách bảo “áo này xấu quá em ơi”.`, GOOD[2], GOOD[3]], ANSWERS), "added");
  assert.equal(added.ok, false);
  assert.match(added.why ?? "", /80/);
  assert.match(added.why ?? "", /áo này xấu/);
  // Kinh nghiệm riêng nói như sự thật toàn thị trường
  assert.equal(get(mk([GOOD[0], GOOD[1], "90% khách mua vì giá. Hãy giảm giá.", GOOD[3]], ANSWERS), "scope").ok, false);
  assert.equal(get(mk([GOOD[0], GOOD[1], "Em thấy ai cũng sợ hỏi khách. Hãy hỏi trước.", GOOD[3]], ANSWERS), "scope").ok, true, "có phạm vi “em thấy”");
  // Xưng hô lẫn
  const slip = get(mk([GOOD[0], "Mình đoán khách thích gì.", GOOD[2], "Bạn đã từng chưa? Kể em nghe nhé."], ANSWERS), "pronoun");
  assert.equal(slip.ok, false);
  assert.match(slip.why ?? "", /mình/);
  assert.match(slip.why ?? "", /bạn/);
  assert.equal(get(mk([GOOD[0], GOOD[1], `${GOOD[2]} Có bạn chia sẻ là cũng từng như vậy.`, GOOD[3]], ANSWERS), "pronoun").ok, true, "“Có bạn chia sẻ…” là ngôi thứ ba");
  assert.equal(get(mk([GOOD[0], GOOD[1], `${GOOD[2]} Đừng lấy điều mình đoán thay cho nhu cầu của khách.`, GOOD[3]], ANSWERS), "pronoun").ok, true, "“mình” phản thân (lần chạy thật 26/10)");
  assert.equal(get(mk([GOOD[0], "Khách đoán sai.", GOOD[2], GOOD[3]], ANSWERS), "first").ok, false);
  assert.equal(get(mk(["5 cách chốt sales hiệu quả", GOOD[1], GOOD[2], GOOD[3]], ANSWERS), "generic").ok, false);
  assert.equal(get(mk([GOOD[0], GOOD[1], "Hỏi khách.", GOOD[3]], ANSWERS), "pov").ok, false);
  assert.equal(get(mk([GOOD[0], GOOD[1], "Nhập nhiều.", GOOD[3]], ANSWERS), "lesson").ok, false);
  // Chỉ dựa trên trang Second Brain còn DRAFT → chưa xác nhận
  const refOnly = { ...emptyExperience(), refs: [{ kind: "knowledge" as const, id: "abc", label: "x" }] };
  assert.equal(get(mk(GOOD, refOnly), "confirmed", { draftRefs: 1 }).ok, false);
  assert.equal(get(mk(GOOD, refOnly), "confirmed", { draftRefs: 0 }).ok, true);
  assert.equal(hasExperience(refOnly), true);
  assert.equal(hasExperience({ ...emptyExperience(), qa: [{ q: "chỉ có câu hỏi", a: " " }] }), false);
});

test("không bao giờ có chỗ trống trong lời nói: [OWNER KỂ: …] giữa câu được dời ra; công thức ghi luật này", () => {
  const m = moveOwnerMarks("Một người hỏi trên VOZ viết: “chưa có kinh nghiệm”. [OWNER KỂ: một lần cùng người mới.] Em gợi ý ba ô.");
  assert.deepEqual(m.marks, ["[OWNER KỂ: một lần cùng người mới.]"]);
  assert.equal(m.speech, "Một người hỏi trên VOZ viết: “chưa có kinh nghiệm”. Em gợi ý ba ô.");
  assert.equal(moveOwnerMarks("Không có dấu").speech, "Không có dấu");
  const rules = experienceFormulaRules("ask", "xưng 'em' với khách");
  assert.match(rules, /SK-KNW-01/);
  assert.match(rules, /KHÔNG thêm sự việc, con số/);
  assert.match(rules, /không giả lập kinh nghiệm/);
  assert.match(rules, /BÓC TÁCH TRƯỚC KHI VIẾT/);
  assert.match(rules, /Situation[\s\S]*Customer[\s\S]*Problem[\s\S]*BAOR Action[\s\S]*Result[\s\S]*Lesson[\s\S]*Principle[\s\S]*Limitation[\s\S]*Content Potential/);
  assert.match(rules, /Common View[\s\S]*BAOR Belief[\s\S]*Why[\s\S]*Example/);
  assert.match(rules, /HOOK → REAL SITUATION → COMMON MISTAKE → BAOR OBSERVATION → WHY → BETTER APPROACH → EXAMPLE → LESSON → CTA/);
  assert.match(rules, /90% khách/);
  assert.match(rules, /Có bạn chia sẻ/);
  assert.match(rules, /xưng "em", gọi người xem là "anh chị"/);
  assert.match(rules, /KHÔNG BAO GIỜ chứa chỗ trống/);
  assert.ok(rules.indexOf("SK-KNW-01") < rules.indexOf("David Ogilvy"), "skill của OWNER trước, luật nghề sau");
  assert.match(vlogFormulaRules("ask"), /TUYỆT ĐỐI không đặt \[OWNER KỂ: …\] hay chỗ trống nào trong lời nói/);
  assert.equal(CONTENT_SKILL.label, "Skill viết content của anh (SK-KNW-01)");
});

test("điền theo luật từ câu trả lời: chỉ thẻ trống, đúng chữ OWNER, bỏ gợi ý OWNER kể của thẻ đã điền", () => {
  const d = withExp(BASE, ANSWERS);
  const f = fillFromExperience({ ...d, cards: d.cards.map((c) => (c.key === "hook" ? { ...c, speech: "Hook OWNER viết" } : c)) }, "ask", P);
  assert.equal(f.cards[0].speech, "Hook OWNER viết", "thẻ đã có chữ không đổi");
  assert.equal(f.cards[1].speech, ANSWERS.qa[0].a);
  assert.equal(f.cards[2].speech, ANSWERS.qa[1].a);
  assert.match(f.cards[3].speech, /^Anh chị đã từng gặp chuyện này chưa\? Kể em nghe/);
  assert.equal(f.cards[1].ownerHints.some((h) => h.includes("[OWNER KỂ")), false);
  assert.ok(f.cards.every((c) => !c.speech.includes("[")), "không chỗ trống");
  assert.ok(vlogChecks(f).find((c) => c.key === "cta")!.ok);
  assert.deepEqual(fillFromExperience(parseVlogDraft(BASE)!, "ask", P), parseVlogDraft(BASE), "không có câu trả lời → không đổi");
});

test("gợi ý chuyện từ Second Brain: Case Study / OWNER_VIEW trước, rồi [OWNER], rồi N1 / N2; ACTIVE > VERIFIED > DRAFT; Skill / ARCHIVED / nghiên cứu bị loại", () => {
  const c = (o: Partial<ExperienceCandidate> & { id: string }): ExperienceCandidate => ({ kind: "knowledge", title: o.id, labels: [], pageKind: "Insight", area: "", section: "01 KIẾN THỨC", status: "ACTIVE", text: "bán online bắt đầu từ hỏi khách", ...o });
  const cands = [
    c({ id: "n2-active", area: "N2 Bán hàng & tư duy kinh doanh" }),
    c({ id: "owner-draft", labels: ["[OWNER]"], status: "DRAFT" }),
    c({ id: "owner-verified", labels: ["[OWNER]"], status: "VERIFIED" }),
    c({ id: "case", title: "[Case Study] Shop mới bán online", status: "DRAFT", labels: ["[OWNER]"] }),
    c({ id: "skill", labels: ["[OWNER]"], pageKind: "Skill", section: "02 SKILL" }),
    c({ id: "archived", labels: ["[OWNER]"], status: "ARCHIVED" }),
    c({ id: "research", area: "N2 Bán hàng", labels: ["[NGHIÊN CỨU]"] }),
    c({ id: "nothing", area: "N3 Edit video" }),
    c({ id: "off-topic", labels: ["[OWNER]"], text: "quản lý kho" }),
    { ...c({ id: "fd_owner" }), kind: "finding" as const, pageKind: "OWNER_VIEW", status: "VERIFIED", title: "Quan điểm OWNER: hỏi khách trước" },
  ];
  const r = rankExperience(cands, "Mới bán online, bắt đầu từ đâu?", 10);
  assert.deepEqual(r.map((x) => x.id), ["fd_owner", "case", "owner-verified", "owner-draft", "n2-active"]);
  assert.deepEqual(r.map((x) => x.tag), ["Quan điểm OWNER", "Case Study", "OWNER", "OWNER", "N2 Bán hàng"]);
  assert.equal(r.find((x) => x.id === "owner-draft")!.draft, true, "DRAFT dùng được nhưng đánh dấu nháp");
  assert.equal(r.find((x) => x.id === "owner-verified")!.draft, false);
  assert.equal(rankExperience(cands, "Mới bán online, bắt đầu từ đâu?").length, 3, "tối đa 3 gợi ý");
  assert.ok(r[0].snippet.length > 0 && r[0].snippet.length <= 220);
});

test("phản biện 26/10 P2: con số so theo giá trị (chữ = số, 5 ≠ 150), ngoặc ‘’ «», cảnh Kết + chữ trên màn hình, tên riêng", () => {
  assert.deepEqual(numbersIn("em mất năm triệu, nhập ba trăm bộ, hai mươi lăm khách, 1,5 triệu, 50.000 đồng"), [5_000_000, 300, 25, 1_500_000, 50_000]);
  assert.deepEqual(numbersIn("năm ngoái ba mẹ em đi một lần"), [], "“năm ngoái”, “ba mẹ”, “một lần” không phải số liệu");
  assert.deepEqual(numbersIn("sau 3 năm"), [3]);
  const src = "Lần đầu bán online, em nhập 150 bộ áo mà chưa hỏi ai. Tồn gần hết.";
  assert.deepEqual(addedDetails("Em nhập 150 bộ áo.", src), []);
  assert.deepEqual(addedDetails("Em lỗ 5 tháng, nhập 15 bộ.", src), ["5", "15"]);
  assert.deepEqual(addedDetails("Em mất năm triệu ở chợ Bến Thành, chị Lan bảo đừng.", src), ["5.000.000", "Bến Thành", "Lan"]);
  assert.equal(addedDetails("Em nhập một trăm năm mươi bộ áo.", src).length, 0, "chữ = số");
  assert.deepEqual(addedDetails("Khách bảo «áo này xấu quá em ơi» và ‘không mua đâu em nhé’.", src), ["“áo này xấu quá em ơi”", "“không mua đâu em nhé”"]);
  assert.deepEqual(addedDetails("Em thấy Facebook và TikTok khác nhau. BAOR giúp.", src), [], "tên nền tảng / thương hiệu được phép");
  const doc = { ...parseVlogDraft(BASE)!, experience: { ...emptyExperience(), qa: [{ q: "q", a: src }] } };
  const withEnd = { ...doc, cards: doc.cards.map((c, i) => (i === 3 ? { ...c, speech: "Sau 3 năm em có 2000 khách.", onScreen: "Lỗ 80 triệu" } : c)) };
  assert.match(experienceChecks(withEnd, P).find((c) => c.key === "added")!.why ?? "", /2\.000.*80\.000\.000|80\.000\.000.*2\.000/);
});

test("phản biện 26/10 P1/P2: trang đã gỡ không tính là chuyện thật; “Đã xác nhận” tắt khi có trang đã gỡ hoặc cần OWNER xác nhận", () => {
  const dead = { ...emptyExperience(), refs: [{ kind: "knowledge" as const, id: "dead", label: "x" }] };
  const live = (r: { id: string }) => r.id !== "dead";
  assert.equal(hasExperience(dead, live), false);
  const get = (e: OwnerExperience, k: string) => experienceChecks(mk(GOOD, e), P, { live }).find((c) => c.key === k)!;
  assert.equal(get(dead, "real").ok, false);
  assert.equal(get({ ...ANSWERS, refs: dead.refs }, "confirmed").ok, false);
  assert.match(get({ ...ANSWERS, refs: dead.refs }, "confirmed").why ?? "", /đã gỡ/);
  // Trạng thái "Cần xác nhận" của máy chủ (owner-review.ts) đưa vào nhãn kiểm
  const g = (k: string, review: { items: string[]; valid: boolean }) => experienceChecks(mk(GOOD, ANSWERS), P, { live, review }).find((c) => c.key === k)!;
  assert.equal(g("confirmed", { items: ["Bến Thành"], valid: false }).ok, false);
  assert.equal(g("added", { items: ["Bến Thành"], valid: false }).ok, false);
  assert.equal(g("confirmed", { items: ["Bến Thành"], valid: true }).ok, true);
  // Dòng trạng thái cũ trong chữ: đọc thành legacyReview, KHÔNG ghi lại; dấu xác nhận cũ bị bỏ
  const legacy = serializeVlog(withExp(BASE, ANSWERS)).replace("- Đáp:", "- Cần xác nhận: Bến Thành\n- OWNER xác nhận: có · owner@baor.vn · 2026-10-26T00:00:00Z\n- Đáp:");
  const back = parseVlogDraft(legacy)!;
  assert.deepEqual(back.experience?.legacyReview, ["Bến Thành"]);
  assert.doesNotMatch(serializeVlog(back), /Cần xác nhận|OWNER xác nhận/);
});

test("phản biện 26/10 P2/P3: chỗ trống nhận lỏng ([owner ke: …], (chèn …), […]) dời khỏi lời nói và bị bỏ khỏi script.txt; dòng “KINH NGHIỆM:” của OWNER không bị nuốt", () => {
  for (const s of ["Em [Owner kể: chuyện] nói.", "Em [OWNER KE: chuyện] nói.", "Em (chèn chuyện) nói.", "Em [...] nói.", "Em […] nói."]) {
    const m = moveOwnerMarks(s);
    assert.equal(m.speech, "Em nói.", s);
    assert.match(m.marks[0], /^\[OWNER KỂ: /, s);
    assert.equal(stripPlaceholders(s), "Em nói.", s);
  }
  assert.deepEqual(moveOwnerMarks("Em (chèn chuyện) nói.").marks, ["[OWNER KỂ: chuyện]"]);
  const bad = { ...parseVlogDraft(BASE)!, cards: parseVlogDraft(BASE)!.cards.map((c, i) => (i === 1 ? { ...c, speech: "Em (chèn chuyện) nói." } : c)) };
  assert.ok(vlogChecks(bad).some((c) => c.key === "owner" && !c.ok), "kiểm nhanh nhận dạng lỏng");
  const d = "KINH NGHIỆM:\nGhi chú của anh\n\n" + BASE;
  const out = serializeVlog(parseVlogDraft(d)!);
  assert.ok(out.includes("KINH NGHIỆM:\nGhi chú của anh"), out);
  assert.equal(stripExperienceBlock(serializeVlog(withExp(BASE, EXP))).includes("KINH NGHIỆM CỦA OWNER"), false);
});

test("phản biện lần 2 P2.1: câu kể chuyện riêng — em / mình / tôi / anh / chị + việc đã làm; “anh chị …?” và lời gọi người xem không tính", () => {
  for (const c of ["Hồi đó anh nhập 300 bộ áo mà chưa hỏi ai.", "Anh từng mất 20 triệu vì nhập hàng.", "Lần đầu bán online, anh lỗ 5 triệu.", "Em từng mất 20 triệu.", "Hồi đó em nhập 300 bộ.", "Năm ngoái tôi lỗ nặng.", "Mình đã từng sai chỗ này.", "Lần đầu chốt đơn, mình run.", "Tháng đầu bán online, em lỗ 20 triệu.", "Em nhập 300 bộ áo, tồn hết."])
    assert.equal(FIRST_PERSON_CLAIM.test(c), true, c);
  for (const c of ["Anh chị từng nhập hàng theo cảm tính chưa?", "Nếu anh chị từng nhập theo cảm tính, hãy hỏi khách trước.", "Em thấy hãy hỏi khách trước khi nhập, anh chị đỡ tồn hàng.", "Anh chị kể em nghe nhé.", "Anh em Sales hay gọi nhầm giờ.", "Mới bán online, bắt đầu từ đâu?"])
    assert.equal(FIRST_PERSON_CLAIM.test(c), false, c);
  assert.deepEqual(pronounSlips("Hồi đó anh nhập 300 bộ áo. Anh chị đã từng chưa?", P), ["anh"], "xưng “em” mà tự xưng “anh”");
  assert.deepEqual(pronounSlips("Anh chị đã từng nhập theo cảm tính chưa?", P), []);
});

test("vòng 5: lưu bản nháp — bỏ mọi dòng trạng thái tin cậy; chỉ OWNER / quản lý đổi được kinh nghiệm (kể cả chữ trống / chữ tự do)", () => {
  const owner = { email: "owner@baor.vn", allowed: true };
  const staff = { email: "nv@baor.vn", allowed: false };
  const saved = serializeVlog(withExp(BASE, ANSWERS));
  // Dòng giả trong chữ gửi lên bị bỏ (cả người được phép)
  const forged = saved.replace("- Đáp:", "- Cần xác nhận: x\n- OWNER xác nhận: có · owner@baor.vn · 2026-10-26T00:00:00Z · h:12345678\n- Đáp:");
  for (const a of [owner, staff]) assert.doesNotMatch(settleOwnerDraft(saved, forged, a).draft, /Cần xác nhận|OWNER xác nhận/);
  assert.doesNotMatch(settleOwnerDraft(saved, `Chữ tự do\n- Cần xác nhận: x\n- OWNER xác nhận: có · a · b`, owner).draft, /Cần xác nhận|OWNER xác nhận/, "chữ tự do cũng bị bỏ dòng");
  // Nhân viên thêm "300 bộ" vào câu trả lời → lấy lại câu trả lời đã lưu + ghi chú; OWNER → nhận
  const staffEdit = saved.replace(ANSWERS.qa[0].a, `${ANSWERS.qa[0].a} Em nhập 300 bộ.`);
  const r = settleOwnerDraft(saved, staffEdit, staff);
  assert.equal(r.note, "Chỉ OWNER sửa được kinh nghiệm");
  assert.deepEqual(parseVlogDraft(r.draft)!.experience!.qa, ANSWERS.qa);
  assert.equal(settleOwnerDraft(saved, saved, staff).note, undefined);
  assert.match(parseVlogDraft(settleOwnerDraft(saved, staffEdit, owner).draft)!.experience!.qa[0].a, /Em nhập 300 bộ\.$/);
  // Nhân viên gửi chữ trống / chữ tự do / xoá khối → khối kinh nghiệm đã lưu được giữ
  for (const t of ["", "Chữ tự do không có cảnh", stripExperienceBlock(saved)]) {
    const x = settleOwnerDraft(saved, t, staff);
    assert.equal(x.note, "Chỉ OWNER sửa được kinh nghiệm", JSON.stringify(t));
    assert.match(x.draft, /^KINH NGHIỆM CỦA OWNER:/m, JSON.stringify(t));
  }
  assert.equal(settleOwnerDraft(saved, "", owner).draft, "", "OWNER xoá trắng thì được");
  assert.equal(reviewItemPresent("5.000.000", "em mất năm triệu"), true);
  assert.equal(reviewItemPresent("“áo xấu quá”", "Khách bảo «áo xấu quá»."), true);
  assert.equal(reviewItemPresent("Lan", "chị Hoa"), false);
  assert.equal(sceneHash(parseVlogDraft(saved)!.cards).length, 8);
});
