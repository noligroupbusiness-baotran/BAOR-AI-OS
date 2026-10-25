import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedSegments, dynamicSegments, leadsToCsv, type Lead } from "../src/lib/customers/segments";

const NOW = Date.parse("2026-09-11T00:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const lead = (id: string, stage: string, daysAgo: number, extra: Partial<Lead> = {}): Lead => ({ id, name: id, source: "inbox", platform: "facebook", stage, lastMessage: "", lastMessageAt: ago(daysAgo), tags: [], ...extra });

test("phân nhóm theo giai đoạn và thời gian im lặng", () => {
  const leads = [lead("a", "new", 0), lead("b", "contacted", 3), lead("c", "qualified", 10), lead("d", "contacted", 45), lead("e", "won", 2), lead("f", "lost", 90)];
  const seg = Object.fromEntries(fixedSegments(leads, NOW).map((s) => [s.key, s.leads.map((l) => l.id)]));
  assert.deepEqual(seg.new, ["a"]);
  assert.deepEqual(seg.hot, ["b"]);
  assert.deepEqual(seg.quiet, ["c"]);
  assert.deepEqual(seg.cold, ["d"]);
  assert.deepEqual(seg.won, ["e"]);
  assert.deepEqual(seg.lost, ["f"]);
});

test("chỉ marketing: không còn nhóm theo đơn hàng / doanh thu (OWNER 25/10/2026)", () => {
  const keys = fixedSegments([lead("x", "won", 1)], NOW).map((s) => s.key);
  assert.ok(!keys.includes("repeat") && !keys.includes("won_noorder"));
  assert.ok(fixedSegments([lead("x", "won", 1)], NOW).every((s) => !("revenue" in s)));
});

test("nhóm động theo kênh và thẻ, chỉ hiện nhóm có khách, xếp theo số lượng", () => {
  const leads = [lead("a", "new", 0, { platform: "facebook", tags: ["vip"] }), lead("b", "new", 0, { platform: "zalo", tags: ["vip", "spa"] }), lead("c", "new", 0, { platform: "facebook" })];
  const dyn = dynamicSegments(leads);
  assert.deepEqual(dyn.filter((s) => s.group === "channel").map((s) => [s.key, s.leads.length]), [["platform:facebook", 2], ["platform:zalo", 1]]);
  assert.deepEqual(dyn.filter((s) => s.group === "tag").map((s) => [s.key, s.leads.length]), [["tag:vip", 2], ["tag:spa", 1]]);
});

test("CSV: có BOM, thoát dấu phẩy và ngoặc kép, đủ cột", () => {
  const csv = leadsToCsv([lead("a", "won", 1, { name: 'Nguyễn "Bé" A', phone: "0909", lastMessage: "giá, bao nhiêu?" })]);
  assert.ok(csv.startsWith("﻿"));
  const [head, row] = csv.trim().split("\r\n");
  assert.equal(head.split(",").length, 9);
  assert.ok(row.includes('"Nguyễn ""Bé"" A"'));
  assert.ok(row.includes('"giá, bao nhiêu?"'));
  assert.ok(!/Doanh thu|Số đơn/.test(head));
});
