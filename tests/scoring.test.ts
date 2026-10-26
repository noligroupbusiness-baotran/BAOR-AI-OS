// Chấm điểm ưu tiên theo luật (OWNER 26/10: "không có đánh giá ưu tiên bài nào hay dở") + luồng chủ đề một bước tiếp theo. Hàm thuần.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTopic, parseSupport, scoreHook, scoreInsight, scoreTopic, similarity, syllableSet, topicIndex, topPicks } from "../src/lib/content/scoring";
import { nextStep, progress, type TopicCounts } from "../src/lib/content/flow";

const now = new Date("2026-10-26T08:00:00Z");

test("trùng chủ đề: chuẩn hoá bỏ hoa thường, khoảng trắng, tiền tố “Chủ đề:” nhưng GIỮ dấu; gõ không dấu thì so không dấu (phản biện P2)", () => {
  assert.equal(normalizeTopic("  Bán   hàng "), normalizeTopic("bán hàng"));
  assert.equal(normalizeTopic("Chủ đề: Bán Hàng!"), "bán hàng");
  assert.notEqual(normalizeTopic("Học bơi"), normalizeTopic("Học bói"));
  assert.notEqual(normalizeTopic("bán hàng online"), normalizeTopic("bán hàng"));
  const find = topicIndex([{ id: "new", name: "Bán hàng" }, { id: "boi", name: "Học bơi" }, { id: "old", name: "bán hàng" }]);
  assert.equal(find("  BÁN hàng "), "new", "trùng khít → chủ đề mới nhất");
  assert.equal(find("ban hang"), "new", "gõ không dấu → so không dấu");
  assert.equal(find("Bàn hàng"), null, "có dấu mà khác dấu là chủ đề khác");
  assert.equal(find("Học bói"), null);
  assert.equal(find("hoc boi"), "boi");
  assert.equal(find("Chủ đề:"), null);
});

test("insight: lời khách Việt có nỗi đau + nhiều bình luận > nguồn nước ngoài chung chung; chưa đủ căn cứ bị trừ; điểm 0–100 kèm ≤ 3 lý do", () => {
  const strong = scoreInsight({ statement: "6/40 bình luận nói về khó khăn / nỗi lo: “em sợ bị từ chối lắm”, “tốn tiền rồi chưa chắc bán được”", sourceType: "social", url: "https://www.youtube.com/watch?v=1", date: "2026-10-20T00:00:00Z", confidence: "medium", verifyOk: true, knowledgeHits: 2, now });
  const weak = scoreInsight({ statement: "[Nước ngoài] Thương mại điện tử toàn cầu tăng trưởng đều", sourceType: "research", url: "https://baymard.com/x", grade: "B", date: "2024-01-01T00:00:00Z", confidence: "medium", verifyOk: true, now });
  assert.ok(strong.score > weak.score + 25, `${strong.score} vs ${weak.score}`);
  assert.ok(strong.score >= 0 && strong.score <= 100);
  assert.ok(strong.reasons.length > 0 && strong.reasons.length <= 3);
  assert.ok(strong.reasons.some((r) => /Nỗi đau|bình luận nhắc tới|Lời khách Việt/.test(r)), strong.reasons.join());
  assert.ok(weak.reasons.includes("Nguồn nước ngoài") || weak.score < 50);
  const vn = scoreInsight({ statement: "Người bán hỏi cách hạn chế bom hàng", sourceType: "news", url: "https://znews.vn/a", verifyOk: true, now });
  const foreign = scoreInsight({ statement: "Người bán hỏi cách hạn chế bom hàng", sourceType: "news", url: "https://example.com/a", verifyOk: true, now });
  assert.ok(vn.score > foreign.score, "nguồn .vn hơn nguồn nước ngoài");
  const unverified = scoreInsight({ statement: "6/40 bình luận nói “em sợ bị từ chối lắm”", sourceType: "social", verifyOk: false, now });
  const verified = scoreInsight({ statement: "6/40 bình luận nói “em sợ bị từ chối lắm”", sourceType: "social", verifyOk: true, now });
  assert.equal(verified.score - unverified.score, 15);
  assert.equal(unverified.reasons[0], "Chưa đủ căn cứ", "cảnh báo trừ điểm đứng đầu lý do");
  assert.deepEqual(parseSupport("Ví dụ (4/120 bình luận)"), { n: 4, total: 120 });
});

test("hook: ngắn, gợi tò mò, bám insight mạnh, ≤ 60 giây thắng hook dài / vướng luật / trùng bài đã làm", () => {
  const good = scoreHook({ hook: "Mới bán online, mình sai ở đâu đầu tiên?", durationSec: 45, policyIssues: [], basisInsightScore: 85, hasBasis: true, existing: ["Cách đóng gói hàng"] });
  const long = scoreHook({ hook: "Hôm nay chúng ta sẽ cùng nhau tìm hiểu về rất nhiều vấn đề khác nhau trong kinh doanh online mà nhiều người hay gặp phải", durationSec: 150, policyIssues: [], basisInsightScore: null, hasBasis: false });
  const policy = scoreHook({ hook: "Cam kết 100% khách nghe máy", durationSec: 30, policyIssues: ["khẳng định tuyệt đối"], basisInsightScore: 85, hasBasis: true });
  const dup = scoreHook({ hook: "Mới bán online, mình sai ở đâu đầu tiên?", durationSec: 45, policyIssues: [], basisInsightScore: 85, hasBasis: true, existing: ["Mới bán online mình sai ở đâu đầu tiên"] });
  assert.ok(good.score >= 75, `good ${good.score}`);
  assert.ok(long.score < 40, `long ${long.score}`);
  assert.ok(policy.score <= good.score - 30, "mỗi lỗi luật nền tảng trừ 30");
  assert.equal(policy.reasons[0], "Vướng luật nền tảng");
  assert.ok(dup.score < good.score && dup.reasons.includes("Trùng bài đã làm"));
  assert.ok(long.reasons.includes("Dài hơn 1 phút") && long.reasons.includes("Chưa gắn insight"));
  assert.ok(similarity("Gọi nhiều, liệu đơn có tăng?", "gọi nhiều liệu đơn có tăng") > 0.9);
});

test("hook: KHÔNG thưởng ngôi thứ nhất; chuyện riêng (“mình từng mất…”) không có căn cứ OWNER bị trừ 10 và nhắc xác nhận (phản biện P2)", () => {
  const base = { durationSec: 45, policyIssues: [], basisInsightScore: 80, hasBasis: true };
  const vlog = (h: string) => scoreHook({ ...base, hook: h }).parts.find((p) => p.key === "vlog")!.points;
  assert.equal(vlog("Mình hay gặp khách cúp máy giữa chừng?"), vlog("Khách hay cúp máy giữa chừng, vì sao?"), "ngôi thứ nhất không được cộng");
  const claim = "Mình từng mất 5 triệu vì bom hàng, sự thật là gì?";
  const noOwner = scoreHook({ ...base, hook: claim });
  const owner = scoreHook({ ...base, hook: claim, ownerBasis: true });
  assert.equal(owner.score - noOwner.score, 10);
  assert.equal(noOwner.reasons[0], "Chuyện riêng — OWNER xác nhận");
  assert.ok(!owner.reasons.includes("Chuyện riêng — OWNER xác nhận"));
  assert.ok(!scoreHook({ ...base, hook: "Nhiều bạn hỏi mình: bom hàng xử lý sao?" }).reasons.includes("Chuyện riêng — OWNER xác nhận"), "dẫn dắt ngôi thứ nhất không phải chuyện riêng");
});

test("hook: chấm 500 hook × 2000 bài đã làm (tách âm tiết sẵn) đủ nhanh cho một lần tải trang (phản biện P2)", () => {
  const sets = Array.from({ length: 2000 }, (_, i) => syllableSet(`Kịch bản số ${i} mất khách vì gọi điện sai giờ, bài học đắt giá`));
  const t = performance.now();
  for (let i = 0; i < 500; i++) scoreHook({ hook: `Hook ${i}: vì sao khách mới cúp máy sau 3 giây đầu tiên?`, durationSec: 45, policyIssues: [], hasBasis: true, existingSets: sets });
  const ms = performance.now() - t;
  assert.ok(ms < 1500, `${Math.round(ms)} ms`);
});

test("chủ đề: tiềm năng + nhu cầu + độ mới; chưa có insight thấp; đã xong (có kịch bản, hết hook chờ) bị trừ", () => {
  const fresh = scoreTopic({ bestInsight: 80, bestHook: 85, usableInsights: 5, pendingInsights: 0, lastActivity: "2026-10-25T00:00:00Z", scripts: 0, hooksNew: 8, now });
  const empty = scoreTopic({ bestInsight: null, bestHook: null, usableInsights: 0, pendingInsights: 0, lastActivity: "2026-10-25T00:00:00Z", scripts: 0, hooksNew: 0, now });
  const done = scoreTopic({ bestInsight: 80, bestHook: null, usableInsights: 5, pendingInsights: 0, lastActivity: "2026-10-25T00:00:00Z", scripts: 2, hooksNew: 0, now });
  assert.ok(fresh.score >= 80, `${fresh.score}`);
  assert.ok(empty.score <= 20 && empty.reasons[0] === "Chưa có insight");
  assert.ok(done.score < fresh.score && done.reasons.includes("Đã có kịch bản"));
  const picks = topPicks([{ id: "a", score: 90 }, { id: "b", score: 70 }, { id: "c", score: 65 }, { id: "d", score: 61 }, { id: "e", score: 40 }]);
  assert.deepEqual([...picks], ["a", "b", "c"], "tối đa 3 “Nên làm”, từ 60 điểm");
  assert.equal(topPicks([{ id: "x", score: 59 }]).size, 0);
});

test("luồng chủ đề: MỘT bước tiếp theo theo trạng thái + tiến độ insight → hook → kịch bản", () => {
  const c = (o: Partial<TopicCounts>): TopicCounts => ({ insights: 0, usable: 0, pending: 0, hooks: 0, hooksNew: 0, scripts: 0, ...o });
  assert.equal(nextStep(c({})), "insight");
  assert.equal(nextStep(c({ insights: 3, pending: 3 })), "approve", "chỉ có insight chờ duyệt → duyệt trước");
  assert.equal(nextStep(c({ insights: 3, usable: 2 })), "hook");
  assert.equal(nextStep(c({ insights: 3, usable: 2, hooks: 10, hooksNew: 10 })), "script");
  assert.equal(nextStep(c({ insights: 3, usable: 2, hooks: 1, hooksNew: 0, scripts: 1 })), "view");
  assert.equal(nextStep(c({ insights: 3, usable: 2, hooks: 0, hooksNew: 0 })), "hook", "bỏ hết hook → tạo lại");
  assert.deepEqual(progress(c({ usable: 2, hooks: 10, scripts: 0 })).map((s) => s.done), [true, true, false]);
});
