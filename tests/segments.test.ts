import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedSegments, dynamicSegments, leadsToCsv, spendByLead, type Lead } from "../src/lib/customers/segments";
import type { OrderRecord } from "../src/lib/orders/repository";

const NOW = Date.parse("2026-09-11T00:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const lead = (id: string, stage: string, daysAgo: number, extra: Partial<Lead> = {}): Lead => ({ id, name: id, source: "inbox", platform: "facebook", stage, lastMessage: "", lastMessageAt: ago(daysAgo), tags: [], ...extra });
const order = (leadId: string, total: number, status: OrderRecord["status"] = "paid"): OrderRecord => ({ id: `o_${leadId}_${total}`, leadId, leadName: leadId, campaignId: null, campaignName: null, channelGoalId: null, productId: null, productName: "x", quantity: 1, unitPrice: total, total, status, note: "", createdBy: "t", createdAt: ago(1), updatedAt: ago(1) });

test("phân nhóm theo giai đoạn và thời gian im lặng", () => {
  const leads = [lead("a", "new", 0), lead("b", "contacted", 3), lead("c", "qualified", 10), lead("d", "contacted", 45), lead("e", "won", 2), lead("f", "lost", 90)];
  const seg = Object.fromEntries(fixedSegments(leads, [], NOW).map((s) => [s.key, s.leads.map((l) => l.id)]));
  assert.deepEqual(seg.new, ["a"]);
  assert.deepEqual(seg.hot, ["b"]);
  assert.deepEqual(seg.quiet, ["c"]);
  assert.deepEqual(seg.cold, ["d"]);
  assert.deepEqual(seg.won, ["e"]);
  assert.deepEqual(seg.lost, ["f"]);
});

test("nhóm mua hàng: mua từ 2 lần, đã mua chưa có đơn, doanh thu chỉ tính đơn đã trả", () => {
  const leads = [lead("x", "won", 1), lead("y", "won", 1), lead("z", "contacted", 1)];
  const orders = [order("x", 100), order("x", 200), order("z", 50), order("y", 999, "new")];
  const spend = spendByLead(orders);
  assert.equal(spend.get("x")?.count, 2);
  assert.equal(spend.get("y"), undefined, "đơn chưa trả không tính");
  const seg = Object.fromEntries(fixedSegments(leads, orders, NOW).map((s) => [s.key, s]));
  assert.deepEqual(seg.repeat.leads.map((l) => l.id), ["x"]);
  assert.deepEqual(seg.won_noorder.leads.map((l) => l.id), ["y"]);
  assert.equal(seg.won.revenue, 300);
});

test("nhóm động theo kênh và thẻ, chỉ hiện nhóm có khách, xếp theo số lượng", () => {
  const leads = [lead("a", "new", 0, { platform: "facebook", tags: ["vip"] }), lead("b", "new", 0, { platform: "zalo", tags: ["vip", "spa"] }), lead("c", "new", 0, { platform: "facebook" })];
  const dyn = dynamicSegments(leads, []);
  assert.deepEqual(dyn.filter((s) => s.group === "channel").map((s) => [s.key, s.leads.length]), [["platform:facebook", 2], ["platform:zalo", 1]]);
  assert.deepEqual(dyn.filter((s) => s.group === "tag").map((s) => [s.key, s.leads.length]), [["tag:vip", 2], ["tag:spa", 1]]);
});

test("CSV: có BOM, thoát dấu phẩy và ngoặc kép, đủ cột", () => {
  const csv = leadsToCsv([lead("a", "won", 1, { name: 'Nguyễn "Bé" A', phone: "0909", lastMessage: "giá, bao nhiêu?" })], spendByLead([order("a", 150000)]));
  assert.ok(csv.startsWith("﻿"));
  const [head, row] = csv.trim().split("\r\n");
  assert.equal(head.split(",").length, 11);
  assert.ok(row.includes('"Nguyễn ""Bé"" A"'));
  assert.ok(row.includes('"giá, bao nhiêu?"'));
  assert.ok(row.endsWith(",1,150000"));
});
