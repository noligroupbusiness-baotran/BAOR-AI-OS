// Nghiên cứu bản đơn giản (Personal Brand System 1 → 2 → 3): chủ đề → cộng dồn insight từ nhiều nguồn → hook dùng đúng insight của chủ đề.
// CSDL tạm, mô hình giả: không gọi Claude thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-topic-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;

let topic: typeof import("../src/lib/research/topic");
let hooks: typeof import("../src/lib/content/hooks");
let roster: typeof import("../src/lib/ai-roster");

before(async () => {
  topic = await import("../src/lib/research/topic");
  hooks = await import("../src/lib/content/hooks");
  roster = await import("../src/lib/ai-roster");
  roster.saveRoleSettings("research", { model: "claude-sonnet-5-5" }); // ca dưới thử đường Claude (mô hình giả); mặc định từ 26/10 là ChatGPT
});

const FB = ["Làm sao để khách không cúp máy?", "em sợ bị từ chối lắm", "gọi giờ nào thì hợp?", "khách hay nghĩ là cuộc gọi rác"].join("\n");
const YT = ["Video hay quá, nhưng em vẫn ngại gọi", "có nên gọi buổi trưa không ạ?", "cảm ơn anh nhiều"].join("\n");

test("chủ đề: ngắn vẫn tạo được; nguồn CỘNG DỒN (nhóm FB + YouTube), không ghi đè; đếm insight theo nguồn", async () => {
  assert.throws(() => topic.createTopic("ab", "OWNER"), /quá ngắn/);
  const id = topic.createTopic("gọi điện", "OWNER");
  const a = await topic.addSourceToTopic({ taskId: id, kind: "fb_group", url: "https://facebook.com/groups/x/posts/1", paste: FB, topic: "gọi điện", useAi: false, by: "OWNER" });
  const b = await topic.addSourceToTopic({ taskId: id, kind: "youtube", url: "https://youtube.com/watch?v=1", paste: YT, topic: "gọi điện", useAi: false, by: "OWNER" });
  assert.equal(a.ok && b.ok, true);
  const row = topic.listTopics().find((t) => t.id === id)!;
  assert.equal(row.topic, "gọi điện", "bỏ tiền tố “Chủ đề:” khi hiển thị");
  assert.ok((row.sources["Nhóm Facebook"] ?? 0) > 0 && (row.sources["Bình luận YouTube"] ?? 0) > 0, JSON.stringify(row.sources));
  assert.equal(row.insights, topic.topicInsights(id).length);
  // dán lại cùng link: không nhân đôi nguồn
  await topic.addSourceToTopic({ taskId: id, kind: "fb_group", url: "https://facebook.com/groups/x/posts/1", paste: FB, topic: "gọi điện", useAi: false, by: "OWNER" });
  const { getDb, schema } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  assert.equal(getDb().select().from(schema.researchSources).where(eq(schema.researchSources.taskId, id)).all().length, 2);
  assert.equal(topic.topicInsights(id).length, row.insights, "dán lại cùng bình luận không nhân đôi insight (phản biện P2)");
  // cùng link nhưng khác nguồn (YouTube dán vào link đã dùng cho nhóm FB) → nhãn đúng nguồn mới
  await topic.addSourceToTopic({ taskId: id, kind: "youtube", url: "https://facebook.com/groups/x/posts/1", paste: "khác một\nkhác hai\nkhác ba có không?", topic: "gọi điện", useAi: false, by: "OWNER" });
  assert.ok(topic.topicInsights(id).some((i) => i.source === "Bình luận YouTube" && /khác/.test(i.statement)));
});

test("hook gắn chủ đề bằng id (không so chuỗi): saveHooks lưu researchId", async () => {
  const id = topic.createTopic("chủ đề gắn hook", "OWNER");
  const r = hooks.saveHooks("chủ đề đã sửa chữ khác", [{ hook: "Hook A" }], { source: "manual", by: "OWNER", researchId: id });
  assert.equal(hooks.listHooks().find((h) => h.id === r.ids[0])!.researchId, id);
});

test("hook từ chủ đề: chỉ dùng insight của chính chủ đề đó", async () => {
  const id1 = topic.createTopic("chủ đề một thử", "OWNER");
  const id2 = topic.createTopic("chủ đề hai thử", "OWNER");
  await topic.addSourceToTopic({ taskId: id1, kind: "facebook", url: "https://facebook.com/p/1", paste: FB, topic: "một", useAi: false, by: "OWNER" });
  await topic.addSourceToTopic({ taskId: id2, kind: "facebook", url: "https://facebook.com/p/2", paste: YT, topic: "hai", useAi: false, by: "OWNER" });
  const ctx = hooks.hookContext("bất kỳ", id1);
  const own = new Set(topic.topicInsights(id1).map((i) => i.id));
  const findingRefs = ctx.basis.filter((b) => b.kind === "finding");
  assert.ok(findingRefs.length > 0 && findingRefs.every((b) => own.has(b.id)));
});

test("bỏ insight: chỉ bỏ được insight của đúng chủ đề", async () => {
  const id = topic.createTopic("chủ đề bỏ insight", "OWNER");
  const other = topic.createTopic("chủ đề khác nữa", "OWNER");
  await topic.addSourceToTopic({ taskId: id, kind: "facebook", url: "https://facebook.com/p/3", paste: FB, topic: "", useAi: false, by: "OWNER" });
  const first = topic.topicInsights(id)[0];
  topic.deleteInsight(other, first.id);
  assert.ok(topic.topicInsights(id).some((i) => i.id === first.id), "chủ đề khác không xoá được");
  topic.deleteInsight(id, first.id);
  assert.ok(!topic.topicInsights(id).some((i) => i.id === first.id));
});

test("AI Nghiên cứu: tắt → chỉ theo luật, không gọi; bật (mô hình giả) → insight AI cộng thêm, chỉ gửi bình luận ĐÃ làm sạch", async () => {
  const id = topic.createTopic("chủ đề có AI thử", "OWNER");
  roster.saveRoleSettings("research", { enabled: false });
  const off = await topic.addSourceToTopic({ taskId: id, kind: "facebook", url: "https://facebook.com/p/4", paste: FB, topic: "t", useAi: true, by: "OWNER" });
  assert.equal(off.ok && off.aiInsights, 0);
  assert.match(off.ok ? off.aiError ?? "" : "", /TẮT/);
  roster.saveRoleSettings("research", { enabled: true });
  const { createRequire } = await import("node:module");
  const esm = (await import("@anthropic-ai/sdk")).default;
  const cjs = createRequire(import.meta.url)("@anthropic-ai/sdk").default;
  const protos = [...new Set([esm.Messages.prototype, cjs.Messages.prototype])] as unknown as { parse: unknown }[];
  const reals = protos.map((p) => p.parse);
  let sent = "";
  const fake = async (body: { messages: { content: string }[] }) => {
    sent = body.messages[0].content;
    return { usage: { input_tokens: 300, output_tokens: 100 }, parsed_output: { insights: [{ statement: "Khán giả sợ bị từ chối ngay câu đầu", application: "Hook nói thẳng nỗi sợ này", count: 9 }] } };
  };
  for (const p of protos) p.parse = fake;
  process.env.ANTHROPIC_API_KEY = "sk-test-khong-goi-that";
  try {
    const r = await topic.addSourceToTopic({ taskId: id, kind: "facebook", url: "https://facebook.com/p/5", paste: `${FB}\n@Nguyễn An gọi 0912345678 nhé`, topic: "t", useAi: true, by: "OWNER" });
    assert.equal(r.ok && r.aiInsights, 1);
    assert.doesNotMatch(sent, /Nguyễn An|0912/);
    const ai = topic.topicInsights(id).find((i) => i.byAi)!;
    assert.match(ai.statement, /\(5\/5 bình luận\)$/, "số bình luận AI báo bị chặn trên bằng số bình luận thật");
    assert.equal(roster.recentAiCalls(1)[0].role, "research");
  } finally {
    protos.forEach((p, i) => (p.parse = reals[i]));
    delete process.env.ANTHROPIC_API_KEY;
  }
});
