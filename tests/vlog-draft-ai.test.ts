// AI viết kịch bản vlog (thẻ cảnh) + bộ lọc ghi chú nội bộ của AI tạo hook. CSDL tạm, mô hình GIẢ (vá messages.parse): không gọi mạng.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-vlog-ai-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;

let db: typeof import("../src/db");
let ai: typeof import("../src/lib/ai");
let hooks: typeof import("../src/lib/content/hooks");
let roster: typeof import("../src/lib/ai-roster");
let vs: typeof import("../src/lib/content/vlog-script");

before(async () => {
  db = await import("../src/db");
  ai = await import("../src/lib/ai");
  hooks = await import("../src/lib/content/hooks");
  roster = await import("../src/lib/ai-roster");
  vs = await import("../src/lib/content/vlog-script");
  roster.saveRoleSettings("hooks", { model: "claude-sonnet-5-5" }); // đường Claude (mô hình giả)
});

type Body = { model: string; system: string; messages: { content: string }[] };
async function withFakeParse<T>(reply: (body: Body) => unknown, run: () => Promise<T>): Promise<T> {
  const { createRequire } = await import("node:module");
  const esm = (await import("@anthropic-ai/sdk")).default;
  const cjs = createRequire(import.meta.url)("@anthropic-ai/sdk").default;
  const protos = [...new Set([esm.Messages.prototype, cjs.Messages.prototype])] as unknown as { parse: unknown }[];
  const reals = protos.map((p) => p.parse);
  for (const p of protos) p.parse = async (body: Body) => ({ usage: { input_tokens: 100, output_tokens: 100 }, parsed_output: reply(body) });
  process.env.ANTHROPIC_API_KEY = "sk-test-khong-goi-that";
  try {
    return await run();
  } finally {
    protos.forEach((p, i) => (p.parse = reals[i]));
    delete process.env.ANTHROPIC_API_KEY;
  }
}

const scene = (speech: string) => ({ speech, visual: "cận mặt", onScreen: speech.split(" ").slice(0, 4).join(" ") });
const OUT = {
  segment: "Chủ shop mới bán online, tự gọi khách",
  hook: scene("Gọi trăm cuộc mà đơn vẫn lẹt đẹt?"),
  story: scene("Nhiều bạn kể với mình: càng gọi càng mệt. [OWNER KỂ: lần đầu anh gọi khách]"),
  value: scene("Gọi lại đúng người đã hỏi giá, bạn đỡ mệt mà khách nghe máy nhiều hơn."),
  end: scene("Bạn đang gọi kiểu nào? Bình luận cho mình nhé."),
};

function insertScript(id: string, draft: string) {
  db.getDb()
    .insert(db.schema.contentItems)
    .values({ id, title: "Gọi nhiều, đơn có tăng?", format: "script", status: "in_progress", pillar: "bán online", hook: "Gọi nhiều, đơn có tăng?", outline: "[]", draft, createdAt: new Date().toISOString(), source: "manual" } as typeof db.schema.contentItems.$inferInsert)
    .run();
}
const draftOf = (id: string) => db.getDb().select().from(db.schema.contentItems).where(eq(db.schema.contentItems.id, id)).get()!;

test("AI viết kịch bản (thẻ cảnh): MỘT lần gọi qua AI Nội dung, prompt theo công thức Kotler + chặng 5A, ghi lại đúng dạng chữ cảnh", async () => {
  const { vlogTemplate, scriptCheck } = await import("../src/lib/content/formats");
  insertScript("ct_vlog_ai", vlogTemplate({ title: "Gọi nhiều, đơn có tăng?", hook: "Gọi nhiều, đơn có tăng?" }));
  let calls = 0;
  let body: Body | null = null;
  const r = await withFakeParse(
    (b) => {
      calls++;
      body = b;
      return OUT;
    },
    () => ai.writeDraft("ct_vlog_ai", undefined, undefined, { stage: "act" }),
  );
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  assert.equal(calls, 1, "một lần gọi cho cả 4 cảnh");
  const b = body as unknown as Body;
  assert.equal(b.model, "claude-sonnet-5-5", "mô hình của vị trí AI Nội dung");
  assert.match(b.system, /theo nguyên lý marketing của Philip Kotler/);
  assert.match(b.system, /theo phong cách copywriting của David Ogilvy/, "Kotler = nói gì, Ogilvy = viết thế nào");
  assert.ok(b.system.includes(vs.stageInfo("act").cta), "lời mời đúng chặng Làm");
  const row = draftOf("ct_vlog_ai");
  const doc = vs.parseVlogDraft(row.draft ?? "")!;
  assert.deepEqual(doc.cards.map((c) => c.speech), [OUT.hook.speech, OUT.story.speech, OUT.value.speech, OUT.end.speech]);
  assert.equal(doc.segment, OUT.segment);
  assert.equal(doc.stage, "act");
  assert.equal(row.hook, OUT.hook.speech, "cột hook theo câu hook mới");
  assert.match(row.draft ?? "", /Gợi ý OWNER: \[OWNER KỂ:/, "dòng gợi ý OWNER của khung giữ nguyên");
  const check = scriptCheck(row.draft ?? "");
  assert.equal(check.format, "vlog");
  assert.deepEqual(check.missing, []);
  assert.equal(check.hasSpeech, true);
  const last = roster.recentAiCalls(1)[0];
  assert.equal(last.role, "hooks");
});

test("Viết lại MỘT cảnh: cùng lần gọi, chỉ nhận cảnh đó — các cảnh OWNER đã viết không đổi", async () => {
  insertScript("ct_vlog_one", vs.serializeVlog({ ...vs.emptyVlogDoc("x"), cards: vs.emptyVlogDoc().cards.map((c) => ({ ...c, speech: `OWNER viết ${c.key}` })) }));
  const r = await withFakeParse(() => OUT, () => ai.writeDraft("ct_vlog_one", undefined, undefined, { scene: "value" }));
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  const doc = vs.parseVlogDraft(draftOf("ct_vlog_one").draft ?? "")!;
  assert.deepEqual(doc.cards.map((c) => c.speech), ["OWNER viết hook", "OWNER viết story", OUT.value.speech, "OWNER viết end"]);
  assert.equal(doc.stage, "ask", "không chọn chặng → mặc định Hỏi");
});

test("AI Nội dung tắt → không gọi, không ghi; kịch bản cũ 5 cảnh vẫn đi đường cũ (không bị ép thành thẻ)", async () => {
  insertScript("ct_vlog_off", "");
  roster.saveRoleSettings("hooks", { enabled: false });
  let calls = 0;
  const off = await withFakeParse(() => (calls++, OUT), () => ai.writeDraft("ct_vlog_off"));
  roster.saveRoleSettings("hooks", { enabled: true });
  assert.equal(off.ok, false);
  assert.equal(calls, 0);
  assert.equal(draftOf("ct_vlog_off").draft, "");
  assert.equal(ai.isCardVlog("script", "1. HOOK\nLời thoại: a\n2. VẤN ĐỀ\nLời thoại: b", false), false);
  assert.equal(ai.isCardVlog("script", "", true), false, "kịch bản từ brief");
  assert.equal(ai.isCardVlog("post", "", false), false);
  assert.equal(ai.isCardVlog("reel", "", false), true);
});

test("AI tạo hook: nhịp dàn ý là ghi chú nội bộ bị bỏ, hook chỉ còn ghi chú bị bỏ cả; prompt cấm lời rào đón", async () => {
  let system = "";
  const r = await withFakeParse(
    (b) => {
      system = b.system;
      return {
        hooks: [
          { hook: "Gọi trăm cuộc mà đơn vẫn lẹt đẹt?", angle: "nỗi đau", beats: ["Khách kể gọi nhiều vẫn ít đơn", "Ghi chú: được gắn nhãn AI suy luận, chưa kiểm chứng", "Bình luận cách bạn gọi"], durationSec: 50, platforms: ["tiktok"], basisRefs: [] },
          { hook: "Gọi nhiều, liệu đơn có tăng?", angle: "", beats: ["Nói rõ: “Em có một bản nháp nội bộ…”", "Chốt: chưa phải căn cứ để em khuyên"], durationSec: 50, platforms: ["tiktok"], basisRefs: [] },
        ],
      };
    },
    () => ai.generateHooks("gọi điện bán hàng", "OWNER"),
  );
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.equal(r.count, 1);
  assert.equal(r.meta, 3, "số nhịp ghi chú bị bỏ (1 + 2 của hook bị bỏ)");
  assert.equal(r.short, 9, "hook bị bỏ tính vào phần thiếu so với 10");
  const saved = hooks.listHooks().filter((h) => h.batchId === r.batchId);
  assert.deepEqual(saved[0].beats, ["Khách kể gọi nhiều vẫn ít đơn", "Bình luận cách bạn gọi"]);
  assert.match(system, /không viết ghi chú cho biên tập/);
  assert.match(system, /BỎ hook đó/);
  assert.match(system, /phong cách copywriting của David Ogilvy/);
});

test("chọn hook AI cũ có dàn ý ghi chú → kịch bản mới không mang ghi chú; dàn ý OWNER nhập tay không bao giờ bị lọc", () => {
  const beats = ["Nói rõ: bản nháp nội bộ, AI suy luận, chưa kiểm chứng", "Khách kể gọi nhiều vẫn ít đơn", "Bạn gọi kiểu nào?"];
  const ai = hooks.saveHooks("gọi điện", [{ hook: "Gọi nhiều, liệu đơn có tăng?", beats }], { source: "ai", by: "AI" });
  const p = hooks.pickHook(ai.ids[0]);
  assert.equal(p.ok, true);
  const row = draftOf(p.ok ? p.contentId : "");
  assert.ok(!(row.draft ?? "").includes("AI suy luận"));
  assert.deepEqual(JSON.parse(row.outline), beats.slice(1));
  const manual = hooks.saveHooks("gọi điện", [{ hook: "Hook OWNER tự viết", beats }], { source: "manual", by: "OWNER" });
  const pm = hooks.pickHook(manual.ids[0]);
  assert.deepEqual(JSON.parse(draftOf(pm.ok ? pm.contentId : "").outline), beats, "dàn ý OWNER giữ nguyên");
});
