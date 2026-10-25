// Kiểm toán logic 26/10/2026: số MẪU không lẫn số thật, chữ bán hàng của bản ghi mẫu cũ được đổi, lọc theo chiến dịch,
// đề xuất cũ bị ẩn, nút AI biết trước khi nào không gọi được. CSDL tạm (migration + dữ liệu mẫu), không đụng data/baor.db.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-sample-audit-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

let db: typeof import("../src/db");
let seed: typeof import("../src/db/seed");
let sample: typeof import("../src/lib/sample");
let campaigns: typeof import("../src/lib/campaigns/repository");
let filter: typeof import("../src/lib/campaigns/filter");
let reports: typeof import("../src/lib/reports/data");
let analyze: typeof import("../src/lib/learning/analyze");
let roster: typeof import("../src/lib/ai-roster");
let ai: typeof import("../src/lib/ai");
let automation: typeof import("../src/lib/automation/repository");

before(async () => {
  db = await import("../src/db");
  seed = await import("../src/db/seed");
  sample = await import("../src/lib/sample");
  campaigns = await import("../src/lib/campaigns/repository");
  filter = await import("../src/lib/campaigns/filter");
  reports = await import("../src/lib/reports/data");
  analyze = await import("../src/lib/learning/analyze");
  roster = await import("../src/lib/ai-roster");
  ai = await import("../src/lib/ai");
  automation = await import("../src/lib/automation/repository");
  db.getDb();
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("bản ghi mẫu nạp trước 25/10 còn chữ bán hàng → đổi CHỮ HIỂN THỊ sang marketing; chạy lại không đổi gì", () => {
  const sql = db.getSqlite();
  const get = (q: string) => (sql.prepare(q).get() as Record<string, string>) ?? {};
  // Giả lập CSDL production đã nạp dữ liệu mẫu cũ
  sql.prepare("update campaigns set objective = 'Bán 500 combo 3 bước trong tuần Sale 9.9', target_metric = 'đơn hàng', description = 'Tuần khuyến mãi 9.9: đẩy combo 3 bước cho khách đã tương tác với fanpage.' where id = 'cp_sale99'").run();
  sql.prepare("update campaigns set objective = 'Đưa 400 khách cũ quay lại mua trong quý 4', target_metric = 'khách mua lại' where id = 'cp_noli_chamsoc'").run();
  sql.prepare("update automation_rules set name = 'Hỏi giá → trả lời bảng giá', description = 'Giá lấy từ Cài đặt › Sản phẩm, kèm lời mời để lại số điện thoại.' where id = 'ar_price'").run();
  sql.prepare("update ad_campaigns set name = 'Retarget: người đã inbox chưa mua', audience = 'Custom audience: inbox 30 ngày, chưa mua' where id = 'ad3'").run();

  const n = seed.refreshSampleCopy(sql);
  assert.ok(n >= 4, `đã sửa ${n} bản ghi`);
  const s99 = get("select objective, target_metric from campaigns where id = 'cp_sale99'");
  assert.doesNotMatch(s99.objective, /Bán|combo/);
  assert.equal(s99.target_metric, "lead");
  assert.equal(get("select target_metric from campaigns where id = 'cp_noli_chamsoc'").target_metric, "khách tương tác lại");
  const rule = get("select name, description from automation_rules where id = 'ar_price'");
  assert.equal(rule.name, "Hỏi giá → chuyển người tư vấn");
  assert.doesNotMatch(rule.description, /Sản phẩm|bảng giá/);
  assert.doesNotMatch(get("select name from ad_campaigns where id = 'ad3'").name, /chưa mua/);
  assert.equal(seed.refreshSampleCopy(sql), 0, "chạy lại không đổi gì (idempotent)");
  for (const f of seed.sampleCopyFixes()) for (const [col, v] of Object.entries(f.set)) assert.doesNotMatch(v.to, /chưa mua|khách mua|bán thêm|Bán \d|đơn hàng|bảng giá|phí ship/i, `${f.table}.${col} ${f.id}`);
});

test("phản biện P1-1: refresh KHÔNG đổi trường mang hành vi — matchFaq của mọi FAQ mẫu khớp y như trước refresh (CSDL nạp trước 25/10)", () => {
  const sql = db.getSqlite();
  // FAQ ship như CSDL production cũ (từ khoá đã chuẩn hoá không dấu, như seed / saveFaq ghi)
  sql.prepare("update faqs set question = 'Phí ship / giao hàng', keywords = '[\"ship\"]', answer = ? where id = 'faq_ship'").run("Dạ đơn từ 500.000 ₫ được miễn phí giao hàng toàn quốc, dưới mức này phí ship 25.000 ₫ ạ. Anh/chị cho em xin địa chỉ để báo thời gian giao nhé.");
  const faqs = () => sql.prepare("select id, question, keywords, answer from faqs order by id").all() as { id: string; question: string; keywords: string; answer: string }[];
  const messages = ["ship hà nội mấy ngày", "cho em tư vấn với", "mấy giờ mở cửa vậy", "cho xin địa chỉ", "muốn đặt lịch thứ 7"];
  const matchAll = () => messages.map((m) => automation.matchFaq(m)?.id ?? null);
  const before = { rows: faqs(), match: matchAll() };
  seed.refreshSampleCopy(sql);
  assert.deepEqual(matchAll(), before.match, "auto-reply FAQ không đổi hành vi sau refresh");
  assert.deepEqual(faqs(), before.rows, "FAQ (từ khoá / câu trả lời / câu hỏi) không bị refresh đụng tới");
  // Luật automation: trigger / action / condition không đổi
  const rules = () => sql.prepare("select id, trigger, action, condition, params from automation_rules order by id").all();
  const r0 = rules();
  seed.refreshSampleCopy(sql);
  assert.deepEqual(rules(), r0);
  for (const f of seed.sampleCopyFixes()) {
    assert.notEqual(f.table, "faqs", "không refresh bảng faqs");
    // auto_reply_rules (bảng "Quy tắc trả lời" trang Khách hàng): trigger / action chỉ là NHÃN hiển thị, không mã nào so khớp / thực thi
    if (f.table === "auto_reply_rules") continue;
    for (const col of Object.keys(f.set)) assert.ok(!["keywords", "answer", "trigger", "action", "condition", "params", "tags", "audience_json"].includes(col), `${f.table}.${col} là trường hành vi`);
  }
});

test("phản biện P2-1: OWNER sửa BẤT KỲ ô nào của bản ghi mẫu → bỏ qua CẢ bản ghi (không sửa nửa vời)", () => {
  const sql = db.getSqlite();
  // cp_sale99: OWNER đã sửa mô tả, mục tiêu vẫn chữ cũ → không đụng bản ghi
  sql.prepare("update campaigns set description = 'OWNER tự viết', objective = 'Bán 500 combo 3 bước trong tuần Sale 9.9', target_metric = 'đơn hàng' where id = 'cp_sale99'").run();
  // ad3: OWNER sửa tên, đối tượng vẫn chữ cũ
  sql.prepare("update ad_campaigns set name = 'Tên OWNER đặt', audience = 'Custom audience: inbox 30 ngày, chưa mua' where id = 'ad3'").run();
  // Kịch bản rv-faq2: OWNER sửa câu trả lời FAQ ship qua form, giữ câu hỏi + từ khoá cũ
  automation.saveFaq({ id: "faq_ship", question: "Phí ship / giao hàng", keywords: ["ship"], answer: "OWNER: miễn phí ship nội thành, gọi 0909." });
  const snap = () => ({
    c: sql.prepare("select description, objective, target_metric from campaigns where id = 'cp_sale99'").get(),
    a: sql.prepare("select name, audience from ad_campaigns where id = 'ad3'").get(),
    f: sql.prepare("select question, keywords, answer from faqs where id = 'faq_ship'").get(),
  });
  const before = snap();
  seed.refreshSampleCopy(sql);
  assert.deepEqual(snap(), before);
});

test("ngân sách tháng ở /campaigns: chỉ cộng chiến dịch thật, phần mẫu tách riêng", () => {
  const today = "2026-10-26";
  const before = campaigns.campaignRepo.stats(today);
  assert.equal(before.monthBudget, 0, "dữ liệu mẫu không thành số thật");
  assert.ok(before.monthBudgetSample > 0);
  const c = campaigns.campaignRepo.create({ name: "Chiến dịch thật", objective: "Thu 50 lead", targetMetric: "lead", targetValue: 50, description: "", productIds: [], audience: "", location: "", ownerId: "", startDate: "2026-10-01", endDate: "2026-10-31", totalBudget: 7_000_000, budgetNote: "", goals: [] }, "test", "draft");
  campaigns.campaignRepo.setStatus(c.id, "active", "test");
  const after = campaigns.campaignRepo.stats(today);
  assert.equal(after.monthBudget, 7_000_000);
  assert.equal(after.monthBudgetSample, before.monthBudgetSample);
  assert.equal(sample.isSample("campaign", c.id), false);
  assert.equal(sample.isSample("campaign", "cp_sale99"), true);
  // Bài mẫu: theo id bài, nội dung mẫu, hoặc video mẫu; video THẬT dùng kịch bản mẫu không tính là mẫu
  assert.equal(sample.isSamplePost({ id: "sp8" }), true);
  assert.equal(sample.isSamplePost({ id: "sp_x", contentId: "ct2" }), true);
  assert.equal(sample.isSamplePost({ id: "sp_x", contentId: "ct2", videoId: "v_that" }), false);
  assert.equal(sample.isSamplePost({ id: "sp_x", contentId: "ct_that" }), false);
});

test("Số liệu: tổng lead / chi phí chỉ từ chiến dịch thật; chiến dịch mẫu có cờ sample", () => {
  const rows = reports.campaignRows();
  assert.ok(rows.filter((r) => r.sample).length >= 3);
  const t = reports.campaignTotals(rows);
  assert.equal(t.real.spent, rows.filter((r) => !r.sample).reduce((n, r) => n + r.spent, 0));
  assert.ok(t.sample.spent > 0 && t.sample.leads > 0, "phần mẫu vẫn có số, hiện riêng");
  const cost = reports.costSummary();
  assert.equal(cost.spent, t.real.spent);
  assert.equal(cost.adSpent, 0, "quảng cáo mẫu không vào “Đã chi tháng”");
  assert.ok(cost.adSpentSample > 0);
  const ls = reports.leadSummary();
  assert.equal(ls.total, 0, "lead mẫu không vào tổng");
  assert.ok(ls.sample > 0 && ls.byStage.length === 0, "lead mẫu chỉ đếm riêng");
  assert.equal(reports.adSpentForMonth("2099-01", "2026-10-26"), 0, "tháng chưa tới: 0");
});

test("phản biện P2-3: /campaigns đếm Đang thực hiện / Chờ phê duyệt / Cảnh báo chỉ chiến dịch thật; Theo kênh không gộp mục tiêu mẫu; trợ lý không đếm lead mẫu", async () => {
  const st = campaigns.campaignRepo.stats("2026-10-26");
  const real = campaigns.campaignRepo.list().filter((c) => !sample.isSample("campaign", c.id));
  assert.equal(st.pendingApproval, real.filter((c) => c.status === "pending_approval").length);
  assert.ok(st.pendingApprovalSample >= 1, "cp_noli_tuyendung_hcm (mẫu) đếm riêng");
  assert.equal(st.alerts, real.reduce((n, c) => n + c.alerts, 0));
  assert.ok(st.alertsSample > 0, "cảnh báo của chiến dịch mẫu (vd Đã quá hạn) đếm riêng");
  assert.equal(st.active, real.filter((c) => c.status === "active").length);
  // Theo kênh: mỗi dòng hoặc toàn thật hoặc toàn mẫu
  const c = campaigns.campaignRepo.create({ name: "Thật có kênh", objective: "Thu lead", targetMetric: "lead", targetValue: 10, description: "", productIds: [], audience: "", location: "", ownerId: "", startDate: "2026-10-01", endDate: "2026-10-31", totalBudget: 1_000_000, budgetNote: "", goals: [{ channel: "facebook_ads", accountId: "meta_ads", executionType: "lead_gen", objective: "Thu 10 lead", primaryMetric: "leads", targetValue: 10, budget: 1_000_000, ownerId: "", startDate: "2026-10-01", endDate: "2026-10-31" }] }, "test", "draft");
  campaigns.campaignRepo.setStatus(c.id, "active", "test");
  const ch = reports.channelRows();
  assert.ok(ch.some((r) => r.sample));
  for (const r of ch.filter((x) => !x.sample)) assert.equal(r.leads, 0, `${r.label}: dòng thật không chứa lead mẫu`);
  const fb = ch.filter((r) => r.channel === "facebook_ads");
  assert.ok(fb.some((r) => !r.sample) && fb.some((r) => r.sample), "kênh có cả mục tiêu thật và mẫu → hai dòng tách nhau");
  // Trợ lý (làn luật): "Tổng N lead" chỉ lead thật
  const assistant = await import("../src/lib/assistant");
  const ans = assistant.answerByRule("bao nhiêu lead");
  assert.match(ans?.text ?? "", /Tổng 0 lead/);
  assert.match(ans?.text ?? "", /lead mẫu, không tính/);
});

test("lọc theo chiến dịch (?campaign=&goal=): chỉ thực thể đã gắn; không tham số / chiến dịch không có → không lọc", () => {
  const posts = [{ id: "sp1" }, { id: "sp8" }, { id: "sp3" }, { id: "sp_md1" }];
  const f = filter.campaignFilterFor({ campaignId: "cp_sale99", channelGoalId: null }, "publication");
  assert.ok(f);
  assert.deepEqual(filter.keepInCampaign(posts, f).map((p) => p.id).sort(), ["sp1", "sp8"]);
  const byGoal = filter.campaignFilterFor({ campaignId: "cp_mocdiep_t10", channelGoalId: "g_md_page" }, "publication");
  assert.deepEqual(filter.keepInCampaign(posts, byGoal).map((p) => p.id), [], "mục tiêu kênh Fanpage không có sp_md1 (TikTok)");
  const leads = filter.campaignFilterFor({ campaignId: "cp_mocdiep_t10", channelGoalId: null }, "lead");
  assert.deepEqual([...leads!.ids].sort(), ["l_md1", "l_md2", "l_md3"]);
  assert.equal(filter.campaignFilterFor({ campaignId: null, channelGoalId: null }, "lead"), null);
  assert.equal(filter.campaignFilterFor({ campaignId: "khong_co", channelGoalId: null }, "lead"), null);
  assert.equal(filter.keepInCampaign(posts, null).length, posts.length);
});

test("phản biện P2-2: khối Bài video ở /publishing?campaign= chỉ giữ bài gắn chiến dịch hoặc bài của video gắn chiến dịch", () => {
  const f = filter.campaignFilterFor({ campaignId: "cp_mocdiep_t10", channelGoalId: null }, ["publication", "video"]);
  assert.ok(f);
  assert.equal(filter.postInCampaign({ id: "vp_x", videoId: "v_md1" }, f.ids), true, "video v_md1 gắn chiến dịch");
  assert.equal(filter.postInCampaign({ id: "sp_md1", videoId: null }, f.ids), true, "bài gắn trực tiếp");
  assert.equal(filter.postInCampaign({ id: "vp_y", videoId: "v_khac" }, f.ids), false);
  assert.equal(filter.postInCampaign({ id: "vp_y", videoId: "v_khac" }, null), true, "không lọc");
});

test("Đo lường: ẩn đề xuất chờ duyệt đã cũ (phân tích không còn sinh) hoặc trỏ video đã xoá; đề xuất đã quyết giữ lịch sử", () => {
  const stored = [
    { key: "video_skill:qa:P", status: "proposed", evidence: ["v_gone1: font Times New Roman chưa có giấy phép"] },
    { key: "video_skill:qa:J", status: "proposed", evidence: ["v_live: chữ đè mặt", "v_gone2: chữ đè mặt"] },
    { key: "video_skill:qa:F", status: "proposed", evidence: ["v_live: logo lố vùng", "v_live2: logo lố vùng"] },
    { key: "content:topic", status: "accepted", evidence: [] },
    { key: "ai:abc", status: "proposed", evidence: ["facebook: “Bài A”"] },
    { key: "skill:thiếu CTA", status: "proposed", evidence: ["facebook: “Bài B”"] },
  ];
  const live = new Set(["video_skill:qa:J", "video_skill:qa:F"]);
  const exists = (id: string) => id === "v_live" || id === "v_live2";
  const keys = analyze.openProposals(stored, live, exists).map((p) => p.key);
  assert.deepEqual(keys, ["video_skill:qa:F", "content:topic", "ai:abc"]);
  assert.equal(analyze.MEASURE_STEP, "7", "chữ bước theo 7 bước hiển thị, không còn 8.1 / 8.2");
  assert.doesNotMatch(analyze.skillProposals([{ id: "p", title: "Bài", platform: "facebook", caption: "Không CTA", issues: [], views: 1, engagement: 1, reach: 1 }], "skill")[0].detail, /8\.1/);
});

test("nút AI: biết trước khi không gọi được — vị trí đặt ChatGPT mà chỉ có khoá Claude → “Thiếu khoá ChatGPT”; tắt → “AI đang tắt”", () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-khong-goi-that";
  try {
    roster.saveRoleSettings("hooks", { enabled: true, model: "claude-sonnet-5-5" });
    assert.equal(ai.aiReadiness("ideas").ok, true);
    roster.saveRoleSettings("hooks", { model: "gpt-6-luna" });
    const r = ai.aiReadiness("ideas");
    assert.equal(r.ok, false);
    assert.equal(r.ok ? "" : r.label, "Thiếu khoá ChatGPT");
    assert.equal(r.ok ? "" : r.href, ai.AI_TEAM_HREF);
    roster.saveRoleSettings("research", { enabled: true, model: "claude-opus-5-5" });
    assert.equal(ai.aiReadiness("research", { alsoProvider: "anthropic" }).ok, true);
    roster.saveRoleSettings("research", { enabled: false });
    const off = ai.aiReadiness("research");
    assert.equal(off.ok ? "" : off.label, "AI đang tắt");
    delete process.env.ANTHROPIC_API_KEY;
    roster.saveRoleSettings("research", { enabled: true });
    const noKey = ai.aiReadiness("research");
    assert.equal(noKey.ok ? "" : noKey.label, "Thiếu khoá Claude");
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});
