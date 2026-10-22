// CP01: Second Brain (chỉ mục) + nghiên cứu + brief. Chạy trên CSDL tạm, không gọi mạng thật.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-kb-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");

let kb: typeof import("../src/lib/knowledge");
let types: typeof import("../src/lib/knowledge/types");
let research: typeof import("../src/lib/research");
let notion: typeof import("../src/lib/knowledge/notion");
let db: typeof import("../src/db");

const P = (n: number) => `3fd4ceb9517d81${String(n).padStart(18, "0")}`;

before(async () => {
  kb = await import("../src/lib/knowledge");
  types = await import("../src/lib/knowledge/types");
  research = await import("../src/lib/research");
  notion = await import("../src/lib/knowledge/notion");
  db = await import("../src/db");
  kb.importKnowledgeSnapshot({
    takenAt: "2026-10-21T10:00:00Z",
    takenBy: "test",
    pages: [
      { id: P(1), title: "[SOP] Quy trình mẫu gọi điện", url: "https://n/1", section: "01 KIẾN THỨC", area: "N2 Bán hàng & tư duy kinh doanh", kind: "SOP", status: "DRAFT", labels: ["[OWNER]"], body: "Bước chào hỏi: giới thiệu mình là ai, gọi từ đâu, gọi để hỗ trợ gì." },
      { id: P(2), title: "[Principle] Nguyên tắc mẫu", url: "https://n/2", section: "01 KIẾN THỨC", area: "N2 Bán hàng & tư duy kinh doanh", kind: "Principle", status: "VERIFIED", labels: ["[OWNER]"], body: "Hiểu khách trước khi đề xuất. Chào hỏi tôn trọng thời gian khách." },
      { id: P(3), title: "[Skill] Kỹ năng mẫu", url: "https://n/3", section: "02 SKILL", area: "N3 Edit video", kind: "Skill", status: "ACTIVE", labels: ["[OWNER]", "[AI SUY LUẬN]"], body: "Phụ đề Times New Roman nghiêng. Chào hỏi không liên quan." },
      { id: P(4), title: "Bản cũ chào hỏi", url: "https://n/4", section: "03 QUYẾT ĐỊNH OWNER", area: "N2", kind: "Quyết định", status: "ARCHIVED", labels: ["[OWNER]"], body: "chào hỏi kiểu cũ" },
      { id: P(5), title: "[Rule] Quy tắc mẫu", url: "https://n/5", section: "03 QUYẾT ĐỊNH OWNER", area: "N2", kind: "Quyết định", status: "VERIFIED", labels: ["[OWNER]"], body: "Tôn trọng khách hàng trong mọi cuộc gọi." },
      { id: "khong-hop-le", title: "Sai id", url: "https://n/x", body: "chào hỏi" },
    ],
  });
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("ảnh chụp: bỏ trang có id không hợp lệ, đếm đúng theo trạng thái", () => {
  const s = kb.knowledgeStats();
  assert.equal(s.total, 5);
  assert.equal(s.byStatus.ARCHIVED, 1);
  assert.deepEqual(s.origins, ["snapshot"]);
});

test("tìm kiếm: gõ không dấu vẫn ra, ARCHIVED bị loại, ACTIVE/VERIFIED đứng trước DRAFT", () => {
  const hits = kb.searchKnowledge("chao hoi");
  const ids = hits.map((h) => h.page.id);
  assert.ok(!ids.includes(P(4)), "trang ARCHIVED không được làm nguồn");
  assert.ok(ids.includes(P(1)) && ids.includes(P(2)) && ids.includes(P(3)));
  assert.ok(ids.indexOf(P(3)) < ids.indexOf(P(1)), "ACTIVE xếp trước DRAFT");
  assert.ok(ids.indexOf(P(2)) < ids.indexOf(P(1)), "VERIFIED xếp trước DRAFT");
  assert.ok(hits.find((h) => h.page.id === P(1))?.snippet.includes("["), "có đoạn trích đánh dấu từ khớp");
});

test("tìm kiếm: không khớp đủ mọi từ thì nới sang bất kỳ từ nào; chuỗi lạ không làm hỏng truy vấn", () => {
  assert.ok(kb.searchKnowledge("chào hỏi xyzkhongco").length > 0);
  assert.deepEqual(kb.searchKnowledge('" OR 1=1 --'), []);
  assert.equal(types.ftsQuery("a"), "");
});

test("cập nhật lại trang không đổi nội dung thì không ghi lại chỉ mục tìm kiếm", () => {
  const r = kb.upsertPages([{ id: P(2), title: "[Principle] Nguyên tắc mẫu", url: "https://n/2", status: "VERIFIED", labels: ["[OWNER]"], section: "01 KIẾN THỨC", area: "N2 Bán hàng & tư duy kinh doanh", kind: "Principle", body: "Hiểu khách trước khi đề xuất. Chào hỏi tôn trọng thời gian khách." }], "snapshot");
  assert.equal(r.unchanged, 1);
  // body undefined (trang không đổi trên Notion) giữ nội dung cũ
  kb.upsertPages([{ id: P(2), title: "[Principle] Nguyên tắc mẫu", url: "https://n/2", status: "VERIFIED", labels: ["[OWNER]"], section: "01 KIẾN THỨC" }], "notion_sync");
  assert.ok(kb.getKnowledgePages([P(2)])[0].body.includes("Hiểu khách"));
});

test("luật phân loại: sự thật cần nguồn mạnh, quan điểm OWNER chỉ từ trang [OWNER], số liệu phải có nguồn", () => {
  const pages = kb.getKnowledgePages([P(1), P(2), P(3), P(5)]);
  const src = [{ id: "s1", grade: "A" }, { id: "s2", grade: "C" }];
  const v = (c: import("../src/lib/knowledge/types").Classification, statement: string, sourceIds: string[], knowledgeIds: string[]) => types.verifyFinding({ statement, classification: c, sourceIds, knowledgeIds }, src, pages);
  assert.equal(v("FACT", "Khách quyết định trong vài giây đầu", ["s1"], []).ok, true);
  assert.equal(v("FACT", "Khách quyết định trong vài giây đầu", ["s2"], []).ok, false, "chỉ nguồn hạng C thì chưa đủ");
  assert.equal(v("FACT", "Hiểu khách trước khi đề xuất", [], [P(2)]).ok, true, "Second Brain VERIFIED đủ làm căn cứ");
  assert.equal(v("OWNER_VIEW", "Bảo cho rằng nên mở đầu bằng câu hỏi", ["s1"], []).ok, false, "nguồn ngoài không thành quan điểm OWNER");
  assert.equal(v("OWNER_VIEW", "Hiểu khách trước khi đề xuất", [], [P(2)]).ok, true);
  assert.equal(v("BUSINESS_DECISION", "Tôn trọng khách", [], [P(5)]).ok, true);
  assert.equal(v("BUSINESS_DECISION", "Tôn trọng khách", [], [P(2)]).ok, false, "quyết định phải ở 03 QUYẾT ĐỊNH OWNER");
  const proc = v("PROCEDURE", "Giới thiệu mình là ai", [], [P(1)]);
  assert.equal(proc.ok, true);
  assert.ok(proc.notes.some((n) => n.includes("DRAFT")), "quy trình chỉ có DRAFT phải ghi là nháp");
  assert.equal(v("HYPOTHESIS", "73% khách cúp máy", [], []).ok, false, "câu có số liệu không nguồn");
});

test("lưu kết quả nghiên cứu: bỏ URL bịa (không có trong kết quả tìm), chuẩn hóa id Second Brain, kiểm brief", async () => {
  const taskId = research.createResearchTask({ question: "Mở đầu cuộc gọi tư vấn thế nào?", purposeKind: "content", purpose: "Kịch bản B1", by: "test" });
  const r = research.saveResearchResult(
    taskId,
    {
      summary: "Tóm tắt",
      sources: [
        { url: "https://a.example/research", title: "Nghiên cứu A", author: "Tổ chức A", publisher: "A", publishedAt: "2024-05-01", sourceType: "research", grade: "A", excerpt: "x", limits: "" },
        { url: "https://bia.example/khong-co", title: "Bịa", author: "", publisher: "", publishedAt: null, sourceType: "blog", grade: "B", excerpt: "", limits: "" },
        { url: "javascript:alert(1)", title: "xấu", author: "", publisher: "", publishedAt: null, sourceType: "other", grade: "D", excerpt: "", limits: "" },
      ],
      findings: [
        { statement: "Lời mở đầu nêu rõ lý do gọi giúp giữ người nghe", classification: "FACT", sourceUrls: ["https://a.example/research"], knowledgeIds: [], counterView: "", limits: "", application: "", contentTopics: [], confidence: "high" },
        { statement: "Bảo luôn mở đầu bằng lời khen", classification: "OWNER_VIEW", sourceUrls: ["https://a.example/research"], knowledgeIds: [], counterView: "", limits: "", application: "", contentTopics: [], confidence: "low" },
        { statement: "Giới thiệu mình là ai, gọi từ đâu", classification: "PROCEDURE", sourceUrls: ["https://bia.example/khong-co"], knowledgeIds: ["3fd4ceb9-517d-81" + "0".repeat(17) + "1"], counterView: "", limits: "", application: "", contentTopics: [], confidence: "medium" },
      ],
      brief: {
        topic: "B1 Chào hỏi phá băng",
        goal: "Kịch bản video",
        audience: "Sales mới",
        keyMessage: "30 giây đầu là để khách hiểu bạn là ai và vì sao gọi",
        angle: "Thấu hiểu trước khi đề xuất",
        points: [
          { text: "Nêu rõ lý do gọi", classification: "FACT", findingRefs: [0], knowledgeIds: [], sourceUrls: ["https://a.example/research"] },
          { text: "Giới thiệu mình là ai, gọi từ đâu", classification: "PROCEDURE", findingRefs: [2], knowledgeIds: [P(1)], sourceUrls: [] },
        ],
        gaps: [],
      },
    },
    { runner: "ai", allowedUrls: new Set(["https://a.example/research"]), by: "test" },
  );
  assert.equal(r.sources, 1, "chỉ giữ URL có trong kết quả tìm kiếm và là http(s)");
  assert.equal(r.dropped.length, 2);
  assert.equal(r.findings, 3);
  assert.equal(r.verified, 2, "quan điểm OWNER từ nguồn ngoài bị đánh chưa đạt");
  const t = research.getResearchTask(taskId)!;
  const proc = t.findings.find((f) => f.classification === "PROCEDURE")!;
  assert.deepEqual(proc.knowledgeIds, [P(1)], "id có gạch được chuẩn hóa");
  assert.ok(proc.verifyNotes.some((n) => n.includes("Bỏ 1 tham chiếu")));
  assert.ok(t.brief && t.brief.qa.ok, `brief đạt kiểm: ${t.brief?.qa.issues.join("; ")}`);
  assert.equal(t.brief!.status, "ready");

  const contentId = research.createContentFromBrief(t.brief!.id, "test");
  const c = db.getDb().select().from(db.schema.contentItems).all().find((x) => x.id === contentId)!;
  assert.equal(c.format, "script");
  assert.equal(c.status, "in_progress");
  assert.ok(c.draft?.startsWith("KỊCH BẢN QUAY: B1 Chào hỏi phá băng"), "CP02: bản nháp là kịch bản quay");
  assert.ok(c.draft?.includes("Giới thiệu mình là ai"));
  assert.ok(c.draft?.includes("[S1] Nghiên cứu A"), "nguồn ngoài được đánh thẻ");
  assert.equal(research.createContentFromBrief(t.brief!.id, "test"), contentId, "bấm lại không tạo trùng");
  // Kịch bản sinh ra đạt kiểm; dấu OWNER lọt vào lời thoại thì chặn.
  const qa1 = research.briefScriptQa(contentId, c.draft!)!;
  assert.equal(qa1.ok, true, qa1.blocking.join("; "));
  const badDraft = c.draft!.replace("Lời thoại: ", "Lời thoại: [OWNER KỂ: chuyện bịa] ");
  assert.equal(research.briefScriptQa(contentId, badDraft)!.ok, false);
  // Cổng gửi duyệt / duyệt (cùng hàm server action dùng)
  const gate = await import("../src/lib/content/review-gate");
  assert.match(gate.submitBlock(c, badDraft) ?? "", /OWNER/);
  assert.equal(gate.submitBlock(c, c.draft!), null);
  assert.match(gate.approveBlock(c) ?? "", /đang chờ duyệt/, "chưa gửi duyệt thì không duyệt được");
  assert.equal(gate.approveBlock({ ...c, status: "review" }), null);
  assert.match(gate.approveBlock({ ...c, status: "review", draft: badDraft }) ?? "", /OWNER/);
  // Phiên bản: bản đầu từ brief, lưu trùng không tạo bản mới, sửa thì có bản mới
  const versions = await import("../src/lib/content/versions");
  assert.equal(versions.listContentVersions(contentId).length, 1);
  assert.equal(versions.listContentVersions(contentId)[0].reason, "brief");
  assert.equal(versions.recordContentVersion(contentId, { hook: c.hook, draft: c.draft!, reason: "save", by: "test" }), 1);
  assert.equal(versions.recordContentVersion(contentId, { hook: c.hook, draft: `${c.draft}\nsửa`, reason: "save", by: "test" }), 2);
  assert.equal(research.briefScriptQa("ct_khong_co_brief", "x"), null, "nội dung ngoài brief giữ luồng cũ");
});

test("brief gom bằng luật (không AI): chỉ lấy phát hiện đạt kiểm, phần chưa đạt vào 'còn thiếu'", () => {
  const taskId = research.createResearchTask({ question: "Xử lý lời từ chối đầu cuộc gọi?", purposeKind: "verify", purpose: "Kiểm chứng", by: "test" });
  research.saveResearchResult(taskId, {
    summary: "",
    sources: [{ url: "https://b.example/x", title: "B", author: "", publisher: "B", publishedAt: null, sourceType: "news", grade: "B", excerpt: "", limits: "" }],
    findings: [
      { statement: "Làm rõ lời từ chối trước khi xử lý", classification: "FACT", sourceUrls: ["https://b.example/x"], knowledgeIds: [], counterView: "", limits: "", application: "", contentTopics: [], confidence: "medium" },
      { statement: "90% khách từ chối lần đầu", classification: "OBSERVATION", sourceUrls: [], knowledgeIds: [], counterView: "", limits: "", application: "", contentTopics: [], confidence: "low" },
    ],
  }, { runner: "import", by: "test" });
  const briefId = research.buildBriefDeterministic(taskId, { topic: "Từ chối", goal: "", audience: "" }, "test");
  const b = research.getBrief(briefId)!;
  assert.equal(b.points.length, 1);
  assert.equal(b.gaps.length, 1);
  assert.equal(b.qa.ok, false, "chưa có thông điệp chính và chưa dùng Second Brain");
  assert.throws(() => research.createContentFromBrief(briefId, "test"), /chưa đạt kiểm/, "máy chủ chặn brief chưa đạt kiểm");
});

test("Notion: đọc thuộc tính kho, chữ của khối, và đồng bộ tăng dần bỏ qua trang không đổi", async () => {
  const page = (id: string, edited: string) => ({ id, url: `https://www.notion.so/${id}`, last_edited_time: edited, properties: { Tên: { type: "title", title: [{ plain_text: "SOP chào hỏi" }] }, "Trạng thái": { type: "select", select: { name: "VERIFIED" } }, Nhóm: { type: "select", select: { name: "N2 Bán hàng & tư duy kinh doanh" } }, "Nhãn tri thức": { type: "multi_select", multi_select: [{ name: "[OWNER]" }] }, Loại: { type: "select", select: { name: "SOP" } } } });
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const u = String(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/data_sources/9b34f69d")) return json({ results: [page("aaaa1111aaaa1111aaaa1111aaaa1111", "2026-10-20T00:00:00.000Z"), page("bbbb2222bbbb2222bbbb2222bbbb2222", "2026-10-21T00:00:00.000Z")], has_more: false, next_cursor: null });
    if (u.includes("/data_sources/")) return json({ results: [], has_more: false, next_cursor: null });
    if (u.includes("/blocks/")) return json({ results: [{ id: "b1", type: "heading_2", heading_2: { rich_text: [{ plain_text: "Bước 1" }] } }, { id: "b2", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "Giới thiệu mình là ai" }] } }], has_more: false, next_cursor: null });
    if (u.includes("/pages/")) return json(page("cccc3333cccc3333cccc3333cccc3333", "2026-10-19T00:00:00.000Z"));
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const known = new Map([["aaaa1111aaaa1111aaaa1111aaaa1111", "2026-10-20T00:00:00.000Z"]]);
  const r = await notion.readSecondBrain({ config: { token: "t" }, fetch: fakeFetch }, known);
  assert.equal(r.errors.length, 0);
  const a = r.pages.find((p) => p.id.startsWith("aaaa"))!;
  const b = r.pages.find((p) => p.id.startsWith("bbbb"))!;
  assert.equal(a.body, undefined, "trang không đổi không tải lại nội dung");
  assert.ok(b.body?.includes("- Giới thiệu mình là ai"));
  assert.equal(b.status, "VERIFIED");
  assert.deepEqual(b.labels, ["[OWNER]"]);
  assert.equal(b.area, "N2 Bán hàng & tư duy kinh doanh");
  assert.ok(calls.every((c) => c.startsWith("GET") || c.includes("/query")), "chỉ đọc: không có lời gọi ghi");
});
