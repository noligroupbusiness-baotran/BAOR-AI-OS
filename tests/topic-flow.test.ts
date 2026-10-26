// Luồng bước 1 → 2 trên CSDL tạm (không gọi AI): chủ đề trùng tên mở chủ đề cũ; bảng chủ đề đếm insight → hook → kịch bản, MỘT bước
// tiếp theo, điểm ưu tiên; hook nối về chủ đề bằng research_id (lô cũ không có id thì theo tên); kịch bản trỏ ngược về chủ đề.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-flow-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;

let topic: typeof import("../src/lib/research/topic");
let hooks: typeof import("../src/lib/content/hooks");
let priority: typeof import("../src/lib/content/priority");

before(async () => {
  topic = await import("../src/lib/research/topic");
  hooks = await import("../src/lib/content/hooks");
  priority = await import("../src/lib/content/priority");
});

const PAINS = ["em sợ bị từ chối lắm", "gọi giờ nào thì hợp?", "khách hay nghĩ là cuộc gọi rác", "làm sao để khách không cúp máy?", "ngại gọi lại khách cũ quá"].join("\n");

test("chủ đề trùng tên (hoa thường / dấu / khoảng trắng) → tìm ra chủ đề cũ", () => {
  const id = topic.createTopic("Gọi điện khách mới", "OWNER");
  assert.equal(topic.findTopicByName("  gọi   điện KHÁCH mới "), id);
  assert.equal(topic.findTopicByName("goi dien khach moi"), id);
  assert.equal(topic.findTopicByName("gọi điện khách cũ"), null);
  assert.equal(topic.findTopicByName("Gọi điên khách mới"), null, "có dấu mà khác dấu là chủ đề khác");
});

test("bảng chủ đề: Lấy insight → Tạo hook → Viết kịch bản → Xem; điểm tăng theo insight; hook nối bằng id và theo tên; kịch bản trỏ về chủ đề", async () => {
  const id = topic.findTopicByName("gọi điện khách mới")!;
  const row = () => priority.topicBoard().find((r) => r.id === id)!;
  assert.equal(row().step, "insight");
  const empty = row().score;

  await topic.addSourceToTopic({ taskId: id, kind: "youtube", url: "https://youtube.com/watch?v=abc", paste: PAINS, topic: "gọi điện khách mới", useAi: false, by: "OWNER" });
  assert.ok(row().counts.usable > 0);
  assert.equal(row().step, "hook");
  assert.ok(row().score > empty, `${row().score} > ${empty}`);

  const finding = topic.topicInsights(id)[0];
  const saved = hooks.saveHooks("gọi điện khách mới", [{ hook: "Gọi khách mới, mình sợ nhất câu gì?", durationSec: 45, basisRefs: [`finding:${finding.id}`] }, { hook: "Hook thứ hai khá dài dòng và không có gì đặc biệt để người xem dừng lại nghe tiếp", durationSec: 120 }], { source: "ai", by: "OWNER", allowed: [{ kind: "finding", id: finding.id, label: finding.statement }], researchId: id });
  // Lô cũ không có research_id, cùng tên chủ đề (viết khác dấu cách / hoa thường) vẫn nối về chủ đề
  hooks.saveHooks("Gọi điện  khách mới", [{ hook: "Hook nhập tay", durationSec: 30 }], { source: "manual", by: "OWNER" });
  const r = row();
  assert.equal(r.step, "script");
  assert.equal(r.counts.hooks, 3);
  const list = priority.topicHooks(id);
  assert.equal(list.length, 3);
  assert.equal(list[0].hook, "Gọi khách mới, mình sợ nhất câu gì?", "hook ngắn, bám insight đứng đầu");
  assert.ok(list[0].score > list.find((h) => h.id === saved.ids[1])!.score);
  assert.ok(list.every((h) => h.topicId === id));

  for (const h of list) {
    if (h.id === list[0].id) hooks.pickHook(h.id);
    else hooks.rejectHook(h.id);
  }
  const done = row();
  assert.equal(done.counts.scripts, 1);
  assert.equal(done.step, "view");
  const contentId = priority.topicHooks(id)[0].contentId!;
  // 600 hook mới hơn của chủ đề khác không đẩy hook của chủ đề này ra khỏi trang chủ đề / bảng (phản biện P3)
  const other = topic.createTopic("chủ đề khác nhiều hook", "OWNER");
  hooks.saveHooks("chủ đề khác nhiều hook", Array.from({ length: 600 }, (_, i) => ({ hook: `Hook khác ${i}` })), { source: "manual", by: "OWNER", researchId: other });
  assert.equal(priority.topicHooks(id).filter((h) => h.status === "picked").length, 1);
  assert.equal(row().counts.scripts, 1);
  assert.equal(priority.topicBoard().find((r) => r.id === other)!.counts.hooks, 600);
  assert.equal(priority.hookOrigins([contentId]).get(contentId)?.topicId, id, "kịch bản trỏ ngược về chủ đề");
});

test("tên trùng được đánh dấu “trùng” trên bảng; chỉ tối đa 3 chủ đề “Nên làm”", () => {
  topic.createTopic("bán hàng", "OWNER");
  topic.createTopic("Bán hàng", "OWNER"); // dữ liệu cũ đã trùng — không xoá, chỉ đánh dấu
  const board = priority.topicBoard();
  assert.equal(board.filter((r) => r.dup).length, 2);
  assert.ok(board.filter((r) => r.top).length <= 3);
  assert.deepEqual(board.map((r) => r.score), [...board.map((r) => r.score)].sort((a, b) => b - a), "xếp theo điểm");
});
