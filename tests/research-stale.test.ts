// Kiểm toán độc lập 26/10/2026 (mục 9): nhiệm vụ nghiên cứu kẹt "running" vĩnh viễn khi máy chủ khởi động lại giữa chừng.
// Có mốc bắt đầu; quá RESEARCH_STALE_MS (hoặc bản ghi cũ không có mốc) mà không chạy trong tiến trình này → lỗi, chạy lại được;
// lỗi bất ngờ giữa chừng không để kẹt (try/finally). Phí web_search vào sổ: tests/ai-gate-served-model.test.ts. CSDL tạm.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-research-stale-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-khong-goi-that";

let db: typeof import("../src/db");
let research: typeof import("../src/lib/research");
let admin: typeof import("../src/lib/admin");
const realFetch = globalThis.fetch;

before(async () => {
  db = await import("../src/db");
  research = await import("../src/lib/research");
  admin = await import("../src/lib/admin");
});

const status = (id: string) => db.getDb().select().from(db.schema.researchTasks).where(eq(db.schema.researchTasks.id, id)).get()!;
const newTask = (q: string) => research.createResearchTask({ question: q, purposeKind: "content", purpose: "Kịch bản", by: "OWNER" });
const setRunning = (id: string) => db.getDb().update(db.schema.researchTasks).set({ status: "running" }).where(eq(db.schema.researchTasks.id, id)).run();

test("bản ghi 'running' không có mốc bắt đầu (máy chủ khởi động lại giữa chừng) → lỗi, chạy lại được", () => {
  const id = newTask("Câu hỏi kẹt");
  setRunning(id);
  const t = research.listResearchTasks().find((x) => x.id === id)!;
  assert.equal(t.status, "error");
  assert.equal(t.error, research.STALE_RESEARCH_ERROR);
});

test("mốc bắt đầu còn mới → giữ 'running'; quá RESEARCH_STALE_MS → lỗi", () => {
  const id = newTask("Câu hỏi đang chạy ở tiến trình khác");
  setRunning(id);
  admin.setSetting(`research.startedAt.${id}`, new Date(Date.now() - 60_000).toISOString());
  assert.equal(research.getResearchTask(id)!.task.status, "running", "mới chạy 1 phút: chưa coi là kẹt");
  admin.setSetting(`research.startedAt.${id}`, new Date(Date.now() - research.RESEARCH_STALE_MS - 60_000).toISOString());
  assert.equal(research.getResearchTask(id)!.task.status, "error");
});

test("lỗi bất ngờ giữa lúc chạy → nhiệm vụ rời 'running' (try/finally), chạy lại được", async () => {
  const id = newTask("Câu hỏi lỗi mạng");
  // Hãng trả JSON hỏng ở bước 1 → cổng AI báo lỗi; nhiệm vụ phải thành "error", không kẹt
  globalThis.fetch = (async () => new Response("không phải json", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const r = await research.runResearchWithAi(id, "OWNER");
    assert.equal(r.ok, false);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(status(id).status, "error");
  assert.equal(admin.getSetting(`research.startedAt.${id}`) ?? "", "", "đã xoá mốc bắt đầu");
  // chạy lại không bị chặn "Nhiệm vụ đang chạy"
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  try {
    const r2 = await research.runResearchWithAi(id, "OWNER");
    assert.ok(!r2.ok && r2.error !== "Nhiệm vụ đang chạy");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("phản biện P2-3: nhiệm vụ đang chạy TRONG tiến trình này không bị thu hồi, kể cả khi mốc bắt đầu đã quá hạn / mất", async () => {
  const id = newTask("Câu hỏi đang chạy thật");
  let release: (r: Response) => void = () => {};
  const hanging = new Promise<Response>((r) => (release = r));
  globalThis.fetch = (async () => hanging) as typeof fetch;
  const p = research.runResearchWithAi(id, "OWNER");
  try {
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(status(id).status, "running");
    admin.setSetting(`research.startedAt.${id}`, new Date(Date.now() - research.RESEARCH_STALE_MS - 60_000).toISOString());
    assert.equal(research.recoverStaleResearch(), 0, "đang chạy ở đây → không thu hồi");
    assert.equal(research.listResearchTasks().find((t) => t.id === id)!.status, "running");
    admin.setSetting(`research.startedAt.${id}`, "");
    assert.equal(research.getResearchTask(id)!.task.status, "running", "mất mốc nhưng vẫn đang chạy ở đây → không thu hồi");
  } finally {
    // nhả lần gọi đang treo kể cả khi kiểm ở trên đỏ (không để tiến trình test chờ mãi)
    release(new Response("{}", { status: 500 }));
    await p.catch(() => undefined);
    globalThis.fetch = realFetch;
  }
  assert.equal(status(id).status, "error");
});
