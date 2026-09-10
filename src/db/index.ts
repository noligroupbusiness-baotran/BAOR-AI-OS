import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { seedCampaignsIfEmpty, seedCatalogIfEmpty, seedIfEmpty } from "./seed";

// Kết nối SQLite dùng chung cho cả ứng dụng. Tệp DB nằm trong DATA_DIR (mặc định ./data),
// trên Docker là volume /app/data nên dữ liệu không mất khi cập nhật.
export type Db = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __baorDb?: Db; __baorSqlite?: Database.Database };

export function getDb(): Db {
  if (globalForDb.__baorDb) return globalForDb.__baorDb;

  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const file = process.env.DATABASE_PATH ?? path.join(dataDir, "baor.db");

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  seedIfEmpty(db);
  seedCampaignsIfEmpty(db);
  seedCatalogIfEmpty(db);

  globalForDb.__baorDb = db;
  globalForDb.__baorSqlite = sqlite;
  return db;
}

// Kết nối better-sqlite3 thô (dùng cho sao lưu online, pragma).
export function getSqlite(): Database.Database {
  getDb();
  return globalForDb.__baorSqlite!;
}

export { schema };
