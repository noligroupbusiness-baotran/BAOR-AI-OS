// Xoay AUTH_SECRET mà không mất token nền tảng:
//   AUTH_SECRET_OLD=<cũ> AUTH_SECRET=<mới> npm run rotate-secret
// Giải mã mọi giá trị bí mật trong bảng integrations bằng khóa cũ, mã hóa lại bằng khóa mới.
// Sau đó đặt AUTH_SECRET mới trong .env / .env.local và khởi động lại ứng dụng (phiên đăng nhập cũ hết hiệu lực).
import { createDecipheriv, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { encryptSecret, isEncrypted } from "../src/lib/secrets";
import { connectorFor } from "../src/lib/connectors/registry";

const oldSecret = process.env.AUTH_SECRET_OLD;
const newSecret = process.env.AUTH_SECRET;
if (!oldSecret || !newSecret) {
  console.error("Cần AUTH_SECRET_OLD (khóa cũ) và AUTH_SECRET (khóa mới).");
  process.exit(1);
}

function decryptWith(secret: string, value: string): string {
  if (!isEncrypted(value)) return value;
  const key = scryptSync(secret, "baor-integrations", 32);
  const [iv, tag, data] = value.slice("enc:v1:".length).split(":");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

const db = getDb();
let n = 0;
for (const row of db.select().from(schema.integrations).all()) {
  const cfg = JSON.parse(row.config || "{}") as Record<string, string>;
  if (Object.keys(cfg).length === 0) continue;
  const secretKeys = new Set((connectorFor(row.key)?.fields ?? []).filter((f) => f.secret).map((f) => f.key));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg)) out[k] = secretKeys.has(k) ? encryptSecret(decryptWith(oldSecret, String(v))) : String(v);
  db.update(schema.integrations).set({ config: JSON.stringify(out) }).where(eq(schema.integrations.key, row.key)).run();
  n++;
}
console.log(`Đã mã hóa lại ${n} kết nối bằng AUTH_SECRET mới. Đặt AUTH_SECRET mới vào môi trường và khởi động lại ứng dụng.`);
