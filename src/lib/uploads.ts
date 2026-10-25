// Tệp tải lên (logo, nhạc, video, ảnh): lưu trong DATA_DIR/uploads (trên Docker là volume /app/data),
// danh mục ở bảng uploads. Phục vụ qua /api/files/<id> (chỉ khi đã đăng nhập).
import path from "node:path";
import fs from "node:fs";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type UploadKind = "logo" | "music" | "video" | "image";

export interface UploadRecord {
  id: string;
  kind: UploadKind;
  name: string;
  fileName: string;
  mime: string;
  size: number;
  meta: Record<string, string | number>;
  uploadedBy: string;
  createdAt: string;
}

const LIMITS: Record<UploadKind, { maxBytes: number; mimes: string[] }> = {
  logo: { maxBytes: 3 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] },
  image: { maxBytes: 8 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp"] },
  music: { maxBytes: 25 * 1024 * 1024, mimes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac", "audio/mp4"] },
  video: { maxBytes: 500 * 1024 * 1024, mimes: ["video/mp4", "video/quicktime", "video/webm"] },
};

export function uploadsDir(): string {
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  const dir = path.join(dataDir, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const newId = () => `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export async function saveUpload(kind: UploadKind, file: File, uploadedBy: string, meta: Record<string, string | number> = {}): Promise<{ ok: true; upload: UploadRecord } | { ok: false; error: string }> {
  const limit = LIMITS[kind];
  if (!file || file.size === 0) return { ok: false, error: "Chưa chọn tệp." };
  if (file.size > limit.maxBytes) return { ok: false, error: `Tệp vượt ${Math.round(limit.maxBytes / 1024 / 1024)} MB.` };
  const mime = file.type || "";
  if (limit.mimes.length && !limit.mimes.includes(mime)) return { ok: false, error: `Định dạng ${mime || "không rõ"} không được hỗ trợ.` };
  const id = newId();
  const ext = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "") || "";
  const fileName = `${id}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(uploadsDir(), fileName), buf);
  const row = { id, kind, name: file.name.slice(0, 200), fileName, mime, size: buf.byteLength, meta: JSON.stringify(meta), uploadedBy, createdAt: new Date().toISOString() };
  getDb().insert(schema.uploads).values(row).run();
  return { ok: true, upload: { ...row, meta } };
}

export function listUploads(kind?: UploadKind): UploadRecord[] {
  return getDb()
    .select()
    .from(schema.uploads)
    .orderBy(desc(schema.uploads.createdAt))
    .all()
    .filter((u) => (kind ? u.kind === kind : true))
    .map((u) => ({ ...u, kind: u.kind as UploadKind, meta: JSON.parse(u.meta || "{}") as Record<string, string | number> }));
}

export function getUpload(id: string): UploadRecord | undefined {
  return listUploads().find((u) => u.id === id);
}

export function uploadPath(u: UploadRecord): string | null {
  const p = path.join(uploadsDir(), u.fileName);
  return fs.existsSync(p) ? p : null;
}

export function deleteUpload(id: string): boolean {
  const u = getUpload(id);
  if (!u) return false;
  const p = uploadPath(u);
  if (p) fs.unlinkSync(p);
  getDb().delete(schema.uploads).where(eq(schema.uploads.id, id)).run();
  return true;
}

export function fileUrl(id: string): string {
  return `/api/files/${id}`;
}
