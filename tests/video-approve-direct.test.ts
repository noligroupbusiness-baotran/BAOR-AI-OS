// "Duyệt" thẳng (Video Studio, OWNER 25/10/2026): người có quyền phê duyệt đi thẳng tới Đã phê duyệt; thiếu quyền bị từ chối;
// còn điểm chặn đăng mà không ghi cách xử lý bị từ chối (không ghi gì); hợp lệ → approved + lịch sử đủ các bước.
// CSDL + thư mục dữ liệu tạm; bộ dựng tắt.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-approve-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";

let db: typeof import("../src/db");
let tr: typeof import("../src/lib/videos/transition");

function video(id: string, status: string) {
  // Có tệp nhưng không qua bảng kiểm của hệ thống → 1 điểm chặn đăng ("Video không qua bảng kiểm A–Q…")
  db.getDb().insert(db.schema.videos).values({ id, title: `Video ${id}`, contentId: null, agent: "Agent Edit Video", status, platforms: "[]", version: 2, note: "", uploadId: `up_${id}`, updatedAt: new Date().toISOString() }).run();
}
const status = (id: string) => db.getDb().select().from(db.schema.videos).where(eq(db.schema.videos.id, id)).get()!.status;
const history = (id: string) => db.getDb().select().from(db.schema.videoFeedback).where(eq(db.schema.videoFeedback.videoId, id)).all().map((f) => f.kind);

const NOTE = "Đã tự kiểm phụ đề, nhạc có giấy phép";

before(async () => {
  db = await import("../src/db");
  tr = await import("../src/lib/videos/transition");
  video("v_review", "review");
  video("v_changes", "needs_changes");
  video("v_pending", "pending_approval");
  video("v_editing", "editing");
});

test("duyệt thẳng: không có quyền phê duyệt → từ chối, không đổi gì", () => {
  const r = tr.runVideoTransition({ id: "v_review", kind: "approve_direct", note: NOTE, by: "Nhân viên", canApprove: false });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /quyền/);
  assert.equal(status("v_review"), "review");
  assert.deepEqual(history("v_review"), []);
  // Nút "Phê duyệt" cũ cũng cùng cổng quyền
  assert.equal(tr.runVideoTransition({ id: "v_pending", kind: "approve", note: NOTE, by: "Nhân viên", canApprove: false }).ok, false);
});

test("duyệt thẳng: còn điểm chặn đăng mà chưa ghi cách xử lý → từ chối TRƯỚC khi ghi bước nào", () => {
  const r = tr.runVideoTransition({ id: "v_review", kind: "approve_direct", note: "", by: "OWNER", canApprove: true });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /điểm chặn đăng/);
  assert.equal(status("v_review"), "review", "không kẹt ở Chờ phê duyệt");
  assert.deepEqual(history("v_review"), []);
});

test("duyệt thẳng hợp lệ: Chờ kiểm tra → Đã phê duyệt, lịch sử 2 bước (gửi phê duyệt + phê duyệt)", () => {
  const r = tr.runVideoTransition({ id: "v_review", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true });
  assert.equal(r.ok, true);
  assert.equal(status("v_review"), "approved");
  assert.deepEqual(history("v_review").sort(), ["approve", "send_approval"]);
  const fb = db.getDb().select().from(db.schema.videoFeedback).where(eq(db.schema.videoFeedback.videoId, "v_review")).all();
  assert.match(fb.find((f) => f.kind === "approve")!.note, /Đã tự kiểm phụ đề[\s\S]*Điểm chặn lúc duyệt/, "ghi chú duyệt + điểm chặn lúc duyệt");
});

test("duyệt thẳng: Cần chỉnh sửa → 3 bước; Chờ phê duyệt → 1 bước; Đang dựng không duyệt thẳng được", () => {
  assert.equal(tr.runVideoTransition({ id: "v_changes", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true }).ok, true);
  assert.equal(status("v_changes"), "approved");
  assert.deepEqual(history("v_changes").sort(), ["approve", "send_approval", "send_review"]);
  assert.equal(tr.runVideoTransition({ id: "v_pending", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true }).ok, true);
  assert.deepEqual(history("v_pending"), ["approve"]);
  assert.equal(tr.runVideoTransition({ id: "v_editing", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true }).ok, false);
  assert.equal(status("v_editing"), "editing");
});

test("duyệt thẳng: lỗi ghi ở bước SAU (lịch sử bước phê duyệt) → quay lui cả chuỗi: trạng thái, lịch sử, phê duyệt chiến dịch, nhật ký không đổi", async () => {
  const { campaignRepo } = await import("../src/lib/campaigns/repository");
  video("v_fail", "review");
  campaignRepo.addLink({ campaignId: "cp_fail", channelGoalId: null, entityType: "video", entityId: "v_fail", status: "review", ownerId: null, viaType: null, viaId: null });
  const sqlite = db.getSqlite();
  const activityBefore = (sqlite.prepare("select count(*) n from activity").get() as { n: number }).n;
  // Giả lập lỗi CSDL đúng ở bước cuối: ghi lịch sử "approve" (sau khi bước gửi phê duyệt đã ghi trạng thái + lịch sử + phê duyệt chiến dịch)
  sqlite.exec(`create trigger t_fail_approve before insert on video_feedback when new.video_id = 'v_fail' and new.kind = 'approve' begin select raise(abort, 'giả lập lỗi ghi lịch sử'); end;`);
  try {
    const r = tr.runVideoTransition({ id: "v_fail", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true });
    assert.equal(r.ok, false, "báo lỗi, không ném ra ngoài");
    assert.match((r as { error: string }).error, /giữ nguyên/);
  } finally {
    sqlite.exec("drop trigger t_fail_approve");
  }
  assert.equal(status("v_fail"), "review", "không kẹt ở Chờ phê duyệt");
  assert.deepEqual(history("v_fail"), [], "lịch sử bước gửi phê duyệt cũng quay lui");
  const link = db.getDb().select().from(db.schema.marketingLinks).where(eq(db.schema.marketingLinks.entityId, "v_fail")).get()!;
  assert.equal(link.status, "review", "trạng thái liên kết chiến dịch quay lui");
  assert.equal(db.getDb().select().from(db.schema.campaignApprovals).where(eq(db.schema.campaignApprovals.entityId, "v_fail")).all().length, 0, "không để lại yêu cầu phê duyệt mồ côi");
  assert.equal(db.getDb().select().from(db.schema.campaignLogs).where(eq(db.schema.campaignLogs.campaignId, "cp_fail")).all().length, 0);
  assert.equal((sqlite.prepare("select count(*) n from activity").get() as { n: number }).n, activityBefore, "nhật ký hoạt động chỉ ghi sau khi ghi xong");
  // Hết lỗi → duyệt lại được bình thường
  assert.equal(tr.runVideoTransition({ id: "v_fail", kind: "approve_direct", note: NOTE, by: "OWNER", canApprove: true }).ok, true);
  assert.equal(status("v_fail"), "approved");
  assert.equal(db.getDb().select().from(db.schema.campaignApprovals).where(eq(db.schema.campaignApprovals.entityId, "v_fail")).get()!.status, "approved");
});
