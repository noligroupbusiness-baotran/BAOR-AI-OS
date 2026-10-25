// Kho video (OWNER 25/10/2026): video vừa Duyệt → tự viết bài đăng (tiêu đề + nội dung); AI tắt / thiếu khoá → bản nháp theo luật,
// ghi rõ nguồn; cổng AI từ chối KHÔNG làm hỏng việc duyệt; bản nháp OWNER đã có thì giữ. Gợi ý giờ đăng theo giờ vàng (múi giờ VN).
// CSDL tạm, không gọi AI thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-postdraft-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.XAI_API_KEY;

let db: typeof import("../src/db");
let tr: typeof import("../src/lib/videos/transition");
let draft: typeof import("../src/lib/publishing/post-draft");
let cap: typeof import("../src/lib/publishing/caption");
let roster: typeof import("../src/lib/ai-roster");
let times: typeof import("../src/lib/publishing/post-times");

const NOTE = "Đã tự kiểm phụ đề, nhạc có giấy phép";

function video(id: string, status = "review") {
  const now = new Date().toISOString();
  db.getDb().insert(db.schema.contentItems).values({ id: `c_${id}`, title: `Kịch bản ${id}`, format: "script", status: "approved", hook: `Hook của ${id}`, draft: "Thông điệp chính: Chào hỏi phá băng", createdAt: now, updatedAt: now } as typeof db.schema.contentItems.$inferInsert).run();
  db.getDb().insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: `c_${id}`, agent: "Agent Edit Video", status, platforms: "[]", version: 1, note: "", uploadId: `up_${id}`, updatedAt: now }).run();
}
const status = (id: string) => db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, id)).get()!.status;

before(async () => {
  db = await import("../src/db");
  tr = await import("../src/lib/videos/transition");
  draft = await import("../src/lib/publishing/post-draft");
  cap = await import("../src/lib/publishing/caption");
  roster = await import("../src/lib/ai-roster");
  times = await import("../src/lib/publishing/post-times");
});

test("duyệt → có bản nháp bài đăng; thiếu khoá AI (cổng từ chối) → bản nháp theo luật, ghi lý do; video vẫn Đã phê duyệt", async () => {
  video("v_a");
  assert.equal(tr.runVideoTransition({ id: "v_a", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true }).ok, true);
  draft.markPostDraftPending("v_a");
  assert.equal(draft.postDraftPending("v_a"), true);
  const r = await draft.draftPostForApprovedVideo("v_a");
  assert.equal(r.source, "rule");
  assert.match(r.reason ?? "", /khoá/);
  assert.equal(status("v_a"), "approved", "cổng AI từ chối không làm hỏng việc duyệt");
  assert.equal(cap.captionDraft("v_a"), cap.buildCaption("v_a").text);
  assert.equal(cap.postTitle("v_a"), "Hook của v_a", "tiêu đề theo luật = hook kịch bản đã duyệt");
  assert.match(cap.postDraftSource("v_a") ?? "", /^rule: .*khoá/);
  assert.equal(draft.postDraftPending("v_a"), false, "xong thì hết trạng thái đang viết");
});

test("AI Viết bài đăng TẮT → bản nháp theo luật, nguồn ghi rõ đang tắt; bản nháp đã có thì giữ nguyên", async () => {
  video("v_b");
  roster.saveRoleSettings("caption", { enabled: false });
  try {
    assert.equal(tr.runVideoTransition({ id: "v_b", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true }).ok, true);
    const r = await draft.draftPostForApprovedVideo("v_b");
    assert.equal(r.source, "rule");
    assert.match(cap.postDraftSource("v_b") ?? "", /TẮT/);
    assert.ok(cap.captionDraft("v_b"));
    // OWNER đã sửa bản nháp → lần chạy sau không ghi đè
    cap.saveCaptionDraft("v_b", "OWNER tự viết");
    assert.equal((await draft.draftPostForApprovedVideo("v_b")).source, "kept");
    assert.equal(cap.captionDraft("v_b"), "OWNER tự viết");
  } finally {
    roster.saveRoleSettings("caption", { enabled: true });
  }
});

test("AI nền lỗi trong lúc OWNER đã có bản nháp (vd bấm 'Viết lại bằng AI') → không ghi đè bằng bản theo luật (phản biện 25/10 P2-2)", async () => {
  video("v_c");
  assert.equal(tr.runVideoTransition({ id: "v_c", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true }).ok, true);
  const run = draft.draftPostForApprovedVideo("v_c"); // dừng ở lần gọi AI (thiếu khoá → lỗi) — chưa tới bước dự phòng
  cap.saveCaptionDraft("v_c", "Bản AI OWNER vừa bấm viết lại");
  assert.equal((await run).source, "kept");
  assert.equal(cap.captionDraft("v_c"), "Bản AI OWNER vừa bấm viết lại");
});

test("gợi ý giờ đăng: khung giờ vàng sắp tới theo giờ Việt Nam, bỏ giờ đã qua / quá sát", () => {
  const hours = ["20:30", "07:30", "12:00", "x", "25:00"];
  // 19:00 giờ VN ngày 25/10/2026 = 12:00 UTC
  const at19 = new Date("2026-10-25T12:00:00Z");
  assert.deepEqual(times.suggestPostTimes(hours, at19), [
    { value: "2026-10-25T20:30", label: "Hôm nay 20:30" },
    { value: "2026-10-26T07:30", label: "Mai 07:30" },
    { value: "2026-10-26T12:00", label: "Mai 12:00" },
  ]);
  // 20:20 giờ VN: 20:30 còn 10 phút (< 15 phút chuẩn bị) → bỏ
  assert.equal(times.suggestPostTimes(hours, new Date("2026-10-25T13:20:00Z"))[0].label, "Mai 07:30");
  // 23:30 giờ VN = 16:30 UTC cùng ngày → "Mai" là 26/10 theo giờ VN (không lệch ngày theo UTC)
  assert.deepEqual(times.suggestPostTimes(hours, new Date("2026-10-25T16:30:00Z"), 4).map((s) => s.label), ["Mai 07:30", "Mai 12:00", "Mai 20:30", "27/10 07:30"]);
  // 00:30 giờ VN 26/10 = 17:30 UTC 25/10 → "Hôm nay" là 26/10
  assert.equal(times.suggestPostTimes(hours, new Date("2026-10-25T17:30:00Z"))[0].value, "2026-10-26T07:30");
  assert.deepEqual(times.suggestPostTimes([], at19), []);
  // Nguồn: giờ vàng của kênh trong Insights › Kênh phù hợp, không có thì khung mặc định
  const g = times.goldenHours("facebook_page_2");
  assert.ok(g.hours.length > 0);
});
