// Đã xoá dữ liệu mẫu (cờ data.sampleCleared) thì khởi động lại không tự nạp lại dữ liệu mẫu khi bảng trống.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baor-reseed-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");

test("cờ đã xoá dữ liệu mẫu chặn tự nạp lại khi khởi động", async () => {
  const { getDb, getSqlite, schema } = await import("../src/db");
  const db = getDb();
  assert.ok(db.select().from(schema.contentItems).all().length > 0, "CSDL mới: có dữ liệu mẫu");
  const sqlite = getSqlite();
  sqlite.exec("delete from content_items; delete from campaigns; delete from videos; insert into settings(key,value) values('data.sampleCleared','1') on conflict(key) do update set value='1';");
  // Giả lập khởi động lại: bỏ kết nối đã nhớ
  sqlite.close();
  const g = globalThis as unknown as { __baorDb?: unknown; __baorSqlite?: unknown };
  delete g.__baorDb;
  delete g.__baorSqlite;
  const db2 = getDb();
  assert.equal(db2.select().from(schema.contentItems).all().length, 0);
  assert.equal(db2.select().from(schema.campaigns).all().length, 0);
  assert.equal(db2.select().from(schema.videos).all().length, 0);
});
