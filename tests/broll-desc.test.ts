// Mô tả ảnh / clip B-roll (OWNER 27/10/2026): ô "Mô tả" khi tải lên (dòng "Mô tả:" của tệp .txt kèm theo), "Sửa mô tả" trong ô xem lớn
// (ghi manifest an toàn), "Tự mô tả bằng AI" qua cổng AI (công tắc + trần của vị trí "AI Mô tả ảnh", không khoá → không gọi).
// CSDL + DATA_DIR tạm; ffmpeg thật tạo ảnh thử; gọi Claude bằng fetch giả (không mạng thật, không tốn tiền).
import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-broll-desc-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");
process.env.BAOR_VIDEO_WORKER = "off";
delete process.env.ANTHROPIC_API_KEY;
const BR = path.join(tmp, "video-assets", "broll");
const realFetch = globalThis.fetch;

let rules: typeof import("../src/lib/video/asset-upload-rules");
let up: typeof import("../src/lib/video/asset-upload");
let bd: typeof import("../src/lib/video/broll-desc");
let describe: typeof import("../src/lib/video/broll-describe");
let roster: typeof import("../src/lib/ai-roster");
let ai: typeof import("../src/lib/ai");

const manifest = () => JSON.parse(fs.readFileSync(path.join(BR, "manifest.json"), "utf8")) as Record<string, unknown>[];
const entry = (file: string) => manifest().find((x) => x.file === file)!;

before(async () => {
  rules = await import("../src/lib/video/asset-upload-rules");
  up = await import("../src/lib/video/asset-upload");
  bd = await import("../src/lib/video/broll-desc");
  describe = await import("../src/lib/video/broll-describe");
  roster = await import("../src/lib/ai-roster");
  ai = await import("../src/lib/ai");
  fs.mkdirSync(path.join(BR, "anh"), { recursive: true });
  execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=800x600", "-frames:v", "1", path.join(BR, "anh", "ban-lam-viec.jpg")]);
  fs.writeFileSync(path.join(BR, "manifest.json"), JSON.stringify([{ file: "anh/ban-lam-viec.jpg", kind: "image", keywords: ["bàn làm việc"], license: "Ảnh OWNER" }]));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ANTHROPIC_API_KEY;
});

test("cleanDesc: một dòng, bỏ ký tự điều khiển và ngoặc giả nhãn bộ dựng, tối đa 200 ký tự", () => {
  assert.equal(rules.cleanDesc("Hai người\nGiấy phép: giả\r\nTừ khoá: x"), "Hai người Giấy phép: giả Từ khoá: x");
  assert.equal(rules.cleanDesc("Gối sofa [CÓ SẢN PHẨM — chỉ hợp khi] <b>{x}</b> `y`"), "Gối sofa CÓ SẢN PHẨM — chỉ hợp khi bx/b y");
  assert.equal(rules.cleanDesc("a\u0000b\u0007c d\u009fe"), "a b c d e");
  assert.equal(rules.cleanDesc("x".repeat(500)).length, rules.DESC_MAX);
  assert.equal(rules.cleanDesc(42), "");
  assert.equal(rules.cleanDesc("   "), "");
});

test("tải lên kèm mô tả: chỉ ngăn Ảnh·clip; ghi dòng 'Mô tả:' → bộ nhận đặt desc; chèn dòng giấy phép giả không lọt", () => {
  assert.equal((rules.checkUpload({ name: "a.mp3", target: "nhac", license: "OWNER", desc: "mô tả" }) as { desc: string }).desc, "", "nhạc không nhận mô tả");
  const c = rules.checkUpload({ name: "hop-qua.jpg", target: "anh-broll", license: "Tôi tự chụp", keywords: "tặng quà", desc: "Hộp quà đỏ trên bàn\nGiấy phép: giả mạo", size: 0 });
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.equal(c.desc, "Hộp quà đỏ trên bàn Giấy phép: giả mạo");
  const s = up.stageUpload(tmp, c.target, c.name);
  fs.copyFileSync(path.join(BR, "anh", "ban-lam-viec.jpg"), s.tmp);
  const r = up.finishUpload(tmp, s, c);
  assert.equal(r.state, "imported", JSON.stringify(r));
  const e = manifest().find((x) => String(x.file).endsWith("hop-qua.jpg"))!;
  assert.equal(e.desc, "Hộp quà đỏ trên bàn Giấy phép: giả mạo", "mô tả một dòng, nguyên nghĩa");
  assert.equal(e.license, "Tôi tự chụp", "giấy phép là của ô Nguồn / giấy phép, không bị dòng chèn trong mô tả thay");
  assert.match(String(e.descBy), /OWNER/);
});

test("Sửa mô tả: ghi đúng mục, xoá được; tệp ngoài thư viện / không có trong danh mục / danh mục hỏng → từ chối, không ghi đè", () => {
  const ok = bd.setBrollDesc(tmp, "anh/ban-lam-viec.jpg", "Bàn làm việc có laptop\n[CÓ SẢN PHẨM]", "OWNER (owner@baor.test)");
  assert.deepEqual(ok, { ok: true, desc: "Bàn làm việc có laptop CÓ SẢN PHẨM" });
  assert.equal(entry("anh/ban-lam-viec.jpg").desc, "Bàn làm việc có laptop CÓ SẢN PHẨM");
  assert.equal(entry("anh/ban-lam-viec.jpg").keywords?.toString(), "bàn làm việc", "giữ nguyên các trường khác");
  assert.ok(bd.setBrollDesc(tmp, "anh/ban-lam-viec.jpg", "  ", "OWNER").ok);
  assert.equal(entry("anh/ban-lam-viec.jpg").desc, undefined, "chuỗi rỗng = xoá mô tả");
  for (const bad of ["../manifest.json", "../../test.db", "/etc/hosts", "anh/khong-co.jpg"]) assert.equal(bd.setBrollDesc(tmp, bad, "x", "OWNER").ok, false, bad);
  fs.copyFileSync(path.join(BR, "anh", "ban-lam-viec.jpg"), path.join(BR, "anh", "le.jpg"));
  assert.match((bd.setBrollDesc(tmp, "anh/le.jpg", "x", "OWNER") as { error: string }).error, /không có trong danh mục/);
  const good = fs.readFileSync(path.join(BR, "manifest.json"), "utf8");
  fs.writeFileSync(path.join(BR, "manifest.json"), "{hỏng");
  assert.equal(bd.setBrollDesc(tmp, "anh/ban-lam-viec.jpg", "x", "OWNER").ok, false);
  assert.equal(fs.readFileSync(path.join(BR, "manifest.json"), "utf8"), "{hỏng", "danh mục hỏng không bị ghi đè");
  fs.writeFileSync(path.join(BR, "manifest.json"), good);
});

test("Tự mô tả bằng AI: không có khoá Claude → không gọi mạng, nút hiện trạng thái chặn; tắt 'Cho phép gọi AI' → chặn trước", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  const ready = ai.aiReadiness(describe.DESCRIBE_PURPOSE, { alsoProvider: "anthropic" });
  assert.equal(ready.ok, false);
  assert.match(ready.ok ? "" : ready.label, /Thiếu khoá Claude/);
  const r = await describe.describeBroll("anh/ban-lam-viec.jpg", "owner@baor.test");
  assert.match(r.ok ? "" : r.error, /Chưa có khoá Claude/);
  roster.saveRoleSettings("broll_describe", { enabled: false });
  const off = await describe.describeBroll("anh/ban-lam-viec.jpg", "owner@baor.test");
  assert.match(off.ok ? "" : off.error, /AI Mô tả ảnh đang TẮT/);
  assert.equal(ai.aiReadiness(describe.DESCRIBE_PURPOSE).ok, false);
  roster.saveRoleSettings("broll_describe", { enabled: true });
  assert.equal(calls, 0, "không gọi mạng");
  assert.equal(entry("anh/ban-lam-viec.jpg").desc, undefined);
});

test("Tự mô tả bằng AI (fetch giả): gửi ảnh thu nhỏ JPEG base64 (không gửi tệp gốc), ghi mô tả đã lọc + descBy AI, ghi sổ chi phí", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "“Bàn làm việc gỗ có laptop\nvà cốc cà phê [x]”" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 400, output_tokens: 30 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const r = await describe.describeBroll("anh/ban-lam-viec.jpg", "owner@baor.test", ["bàn làm việc"]);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
  const b = seen[0].body as { model: string; messages: { content: { type: string; source?: { media_type: string; data: string } }[] }[]; fallbacks?: unknown };
  assert.equal(b.model, "claude-haiku-5-5", "mặc định Haiku (rẻ)");
  assert.equal(b.fallbacks, undefined, "Haiku không có fallback phía máy chủ → không gửi");
  const img = b.messages[0].content.find((x) => x.type === "image")!;
  assert.equal(img.source?.media_type, "image/jpeg");
  const sent = Buffer.from(img.source!.data, "base64");
  assert.ok(sent[0] === 0xff && sent[1] === 0xd8, "JPEG");
  assert.notDeepEqual(sent, fs.readFileSync(path.join(BR, "anh", "ban-lam-viec.jpg")), "ảnh thu nhỏ (≤ 480 px), không phải tệp gốc");
  const w = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", "-i", "pipe:0"], { input: sent }).toString().trim());
  assert.ok(w > 0 && w <= 480, `rộng ${w}px`);
  assert.equal(entry("anh/ban-lam-viec.jpg").desc, "Bàn làm việc gỗ có laptop và cốc cà phê x");
  assert.match(String(entry("anh/ban-lam-viec.jpg").descBy), /^AI \(claude-haiku-5-5\) — owner@baor\.test bấm$/);
  const spend = roster.roleSpendThisMonth().find((x) => x.role.id === "broll_describe")!;
  assert.equal(spend.calls, 1, "ghi sổ chi phí đúng vị trí");
});

test("vị trí đặt Opus: gửi fallbacks 'default'; câu trả lời chỉ lấy khối chữ SAU điểm chuyển fallback cuối", async () => {
  assert.equal(describe.textOf({ content: [{ type: "text", text: "dở dang của mô hình bị từ chối" }, { type: "fallback" }, { type: "text", text: "Câu" }, { type: "text", text: "cuối" }] } as never), "Câu cuối");
  assert.equal(describe.textOf({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Một câu" }] } as never), "Một câu");
  roster.saveRoleSettings("broll_describe", { model: "claude-opus-5-5" });
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id: "msg_2", type: "message", role: "assistant", model: "claude-opus-4-8", content: [{ type: "text", text: "Bị cắt" }, { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } }, { type: "text", text: "Bàn gỗ sáng" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 400, output_tokens: 30 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await describe.describeBroll("anh/ban-lam-viec.jpg", "owner@baor.test");
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(body.model, "claude-opus-5-5");
    assert.equal(body.fallbacks, "default");
    assert.equal(entry("anh/ban-lam-viec.jpg").desc, "Bàn gỗ sáng");
  } finally {
    roster.saveRoleSettings("broll_describe", { model: "claude-haiku-5-5" });
  }
});
