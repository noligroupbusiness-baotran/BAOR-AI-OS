// Lớp bảo mật tài khoản: xác thực hai lớp (TOTP + mã dự phòng), thu hồi phiên (đăng xuất mọi thiết bị),
// lần đăng nhập gần nhất, và nhật ký sự kiện bảo mật riêng. Dùng bảng security_accounts / security_events.
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAdminEmail, getSetting, setSetting } from "@/lib/admin";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { generateBackupCodes, generateTotpSecret, normalizeBackupCode, otpauthUri, verifyTotp } from "@/lib/totp";

export type SecurityEventKind =
  | "login_ok"
  | "login_fail"
  | "login_locked"
  | "mfa_fail"
  | "logout"
  | "password_changed"
  | "password_set_by_admin"
  | "mfa_enabled"
  | "mfa_disabled"
  | "backup_codes_regenerated"
  | "sessions_revoked"
  | "permission_changed"
  | "backup_downloaded"
  | "rate_limited";

export const securityEventLabel: Record<SecurityEventKind, string> = {
  login_ok: "Đăng nhập thành công",
  login_fail: "Đăng nhập sai",
  login_locked: "Khóa đăng nhập tạm thời",
  mfa_fail: "Mã xác thực hai lớp sai",
  logout: "Đăng xuất",
  password_changed: "Đổi mật khẩu",
  password_set_by_admin: "Quản trị đặt lại mật khẩu",
  mfa_enabled: "Bật xác thực hai lớp",
  mfa_disabled: "Tắt xác thực hai lớp",
  backup_codes_regenerated: "Tạo lại mã dự phòng",
  sessions_revoked: "Đăng xuất mọi thiết bị",
  permission_changed: "Đổi quyền",
  backup_downloaded: "Tải bản sao lưu",
  rate_limited: "Bị giới hạn tần suất",
};

export interface SecurityAccount {
  email: string;
  totpEnabled: boolean;
  /** Đã tạo khóa nhưng chưa xác nhận bằng mã đầu tiên. */
  totpPending: boolean;
  backupCodesLeft: number;
  sessionVersion: number;
  lastLoginAt: string | null;
  lastLoginIp: string;
}

const norm = (email: string) => email.trim().toLowerCase();
const nowIso = () => new Date().toISOString();

function row(email: string) {
  return getDb().select().from(schema.securityAccounts).where(eq(schema.securityAccounts.email, norm(email))).get();
}

function ensureRow(email: string) {
  const e = norm(email);
  const r = row(e);
  if (r) return r;
  getDb().insert(schema.securityAccounts).values({ email: e, updatedAt: nowIso() }).onConflictDoNothing().run();
  return row(e)!;
}

function update(email: string, set: Partial<typeof schema.securityAccounts.$inferInsert>) {
  ensureRow(email);
  getDb().update(schema.securityAccounts).set({ ...set, updatedAt: nowIso() }).where(eq(schema.securityAccounts.email, norm(email))).run();
}

export function securityAccount(email: string): SecurityAccount {
  const r = row(email);
  const codes = r ? (JSON.parse(r.backupCodes || "[]") as string[]) : [];
  return {
    email: norm(email),
    totpEnabled: r?.totpEnabled ?? false,
    totpPending: !!r && !r.totpEnabled && !!r.totpSecret,
    backupCodesLeft: codes.length,
    sessionVersion: r?.sessionVersion ?? 1,
    lastLoginAt: r?.lastLoginAt ?? null,
    lastLoginIp: r?.lastLoginIp ?? "",
  };
}

// ---- Phiên ----------------------------------------------------------------

/** Phiên bản phiên hiện tại; chưa có dòng = 1 (token cũ không mang sv cũng được coi là 1). */
export function sessionVersionFor(email: string): number {
  return row(email)?.sessionVersion ?? 1;
}

/** Tăng phiên bản: mọi cookie đã cấp trước đó cho email này hết hiệu lực. Trả về phiên bản mới. */
export function revokeAllSessions(email: string): number {
  const r = ensureRow(email);
  const next = r.sessionVersion + 1;
  update(email, { sessionVersion: next });
  return next;
}

/** Đổi email đăng nhập của quản trị: mang theo hai lớp, mã dự phòng, phiên bản phiên sang email mới. */
export function renameSecurityAccount(oldEmail: string, newEmail: string) {
  const o = norm(oldEmail);
  const n = norm(newEmail);
  if (!o || !n || o === n) return;
  const db = getDb();
  const from = row(o);
  if (!from) return;
  db.delete(schema.securityAccounts).where(eq(schema.securityAccounts.email, n)).run();
  db.update(schema.securityAccounts).set({ email: n, updatedAt: nowIso() }).where(eq(schema.securityAccounts.email, o)).run();
  const last = getSetting(`mfa.lastStep.${o}`);
  if (last) setSetting(`mfa.lastStep.${n}`, last);
}

export function recordLogin(email: string, ip: string) {
  update(email, { lastLoginAt: nowIso(), lastLoginIp: ip.slice(0, 64) });
}

// ---- Nhật ký sự kiện --------------------------------------------------------

export function logSecurityEvent(kind: SecurityEventKind, opts: { email?: string; ip?: string; detail?: string } = {}) {
  getDb()
    .insert(schema.securityEvents)
    .values({ at: nowIso(), email: norm(opts.email ?? ""), ip: (opts.ip ?? "").slice(0, 64), kind, detail: (opts.detail ?? "").slice(0, 500) })
    .run();
}

export interface SecurityEventRow {
  id: number;
  at: string;
  email: string;
  ip: string;
  kind: SecurityEventKind;
  label: string;
  detail: string;
}

export function listSecurityEvents(opts: { email?: string; limit?: number } = {}): SecurityEventRow[] {
  const db = getDb();
  const q = db.select().from(schema.securityEvents);
  const rows = (opts.email ? q.where(eq(schema.securityEvents.email, norm(opts.email))) : q)
    .orderBy(desc(schema.securityEvents.at), desc(schema.securityEvents.id))
    .limit(opts.limit ?? 20)
    .all();
  return rows.map((r) => ({ ...r, kind: r.kind as SecurityEventKind, label: securityEventLabel[r.kind as SecurityEventKind] ?? r.kind }));
}

/** Dọn sự kiện bảo mật cũ hơn mốc (gọi từ retention). */
export function pruneSecurityEvents(beforeIso: string): number {
  return getDb().delete(schema.securityEvents).where(lt(schema.securityEvents.at, beforeIso)).run().changes;
}

/** Số lần đăng nhập sai gần đây của một email (để hiện cảnh báo). */
export function recentFailures(email: string, sinceMs: number): number {
  const since = new Date(Date.now() - sinceMs).toISOString();
  return getDb()
    .select()
    .from(schema.securityEvents)
    .where(and(eq(schema.securityEvents.email, norm(email)), eq(schema.securityEvents.kind, "login_fail")))
    .all()
    .filter((r) => r.at >= since).length;
}

// ---- Xác thực hai lớp -------------------------------------------------------

function backupKey(): Buffer {
  // HMAC với khóa suy từ AUTH_SECRET: lộ CSDL không đủ để dò ngược mã dự phòng (40 bit) ngoại tuyến.
  const secret = process.env.AUTH_SECRET || "dev-secret-change-me-in-production";
  return scryptSync(secret, "baor-backup-codes", 32);
}

function hashBackupCode(code: string): string {
  return createHmac("sha256", backupKey()).update(normalizeBackupCode(code)).digest("hex");
}

export function mfaRequired(email: string): boolean {
  return row(email)?.totpEnabled ?? false;
}

/** Bước 1 bật hai lớp: tạo khóa mới (chưa có hiệu lực), trả về khóa và otpauth URI để quét QR. */
export function beginTotpSetup(email: string): { secret: string; uri: string } {
  const r = ensureRow(email);
  if (r.totpEnabled) throw new Error("Xác thực hai lớp đã bật. Tắt trước khi tạo khóa mới.");
  const secret = generateTotpSecret();
  update(email, { totpSecret: encryptSecret(secret) });
  return { secret, uri: otpauthUri(secret, norm(email)) };
}

/** Khóa đang chờ xác nhận (để vẽ lại QR khi tải lại trang). */
export function pendingTotpSetup(email: string): { secret: string; uri: string } | null {
  const r = row(email);
  if (!r || r.totpEnabled || !r.totpSecret) return null;
  const secret = decryptSecret(r.totpSecret);
  return { secret, uri: otpauthUri(secret, norm(email)) };
}

export function cancelTotpSetup(email: string) {
  const r = row(email);
  if (r && !r.totpEnabled) update(email, { totpSecret: null });
}

/** Bước 2: người dùng nhập mã đầu tiên đúng thì bật, cấp 10 mã dự phòng (chỉ hiện một lần). */
export function confirmTotpSetup(email: string, code: string, nowMs = Date.now()): { ok: true; backupCodes: string[] } | { ok: false; error: string } {
  const r = row(email);
  if (!r || !r.totpSecret) return { ok: false, error: "Chưa tạo khóa. Bấm “Bắt đầu thiết lập” trước." };
  if (r.totpEnabled) return { ok: false, error: "Xác thực hai lớp đã bật." };
  const step = verifyTotp(decryptSecret(r.totpSecret), code, nowMs);
  if (step === null) return { ok: false, error: "Mã không đúng. Kiểm tra giờ trên điện thoại và thử mã mới nhất." };
  const codes = generateBackupCodes();
  update(email, { totpEnabled: true, backupCodes: JSON.stringify(codes.map(hashBackupCode)) });
  setSetting(`mfa.lastStep.${norm(email)}`, String(step));
  return { ok: true, backupCodes: codes };
}

export function disableTotp(email: string) {
  update(email, { totpEnabled: false, totpSecret: null, backupCodes: "[]" });
}

export function regenerateBackupCodes(email: string): string[] {
  const r = row(email);
  if (!r?.totpEnabled) throw new Error("Chưa bật xác thực hai lớp.");
  const codes = generateBackupCodes();
  update(email, { backupCodes: JSON.stringify(codes.map(hashBackupCode)) });
  return codes;
}

export type SecondFactorResult = { ok: true; method: "totp" | "backup"; backupCodesLeft: number } | { ok: false; error: string };

/**
 * Kiểm tra mã ở bước hai của đăng nhập (hoặc khi tắt hai lớp): mã 6 số từ ứng dụng, hoặc một mã dự phòng.
 * Mỗi mã TOTP chỉ dùng một lần (ghi bước thời gian đã dùng); mã dự phòng dùng xong bị xóa.
 */
export function verifySecondFactor(email: string, input: string, nowMs = Date.now()): SecondFactorResult {
  const r = row(email);
  if (!r?.totpEnabled || !r.totpSecret) return { ok: false, error: "Tài khoản chưa bật xác thực hai lớp." };
  const raw = input.trim();
  if (/^\d{6}$/.test(raw.replace(/\s+/g, ""))) {
    const step = verifyTotp(decryptSecret(r.totpSecret), raw, nowMs);
    if (step === null) return { ok: false, error: "Mã không đúng hoặc đã hết hạn." };
    const lastKey = `mfa.lastStep.${norm(email)}`;
    const last = Number(getSetting(lastKey) ?? "0");
    if (step <= last) return { ok: false, error: "Mã này vừa được dùng. Chờ mã mới trên ứng dụng." };
    setSetting(lastKey, String(step));
    return { ok: true, method: "totp", backupCodesLeft: (JSON.parse(r.backupCodes || "[]") as string[]).length };
  }
  const hashes = JSON.parse(r.backupCodes || "[]") as string[];
  const h = hashBackupCode(raw);
  const idx = hashes.findIndex((x) => x.length === h.length && timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  if (idx < 0) return { ok: false, error: "Mã không đúng hoặc đã hết hạn." };
  hashes.splice(idx, 1);
  update(email, { backupCodes: JSON.stringify(hashes) });
  return { ok: true, method: "backup", backupCodesLeft: hashes.length };
}

// ---- Tình trạng bảo mật (cho quản trị) ----------------------------------------

export interface PostureItem {
  level: "ok" | "warn" | "error";
  text: string;
}

/** Danh sách điểm cần chú ý về cấu hình bảo mật, hiện ở Tài khoản của tôi cho quản trị. */
export function securityPosture(): PostureItem[] {
  const items: PostureItem[] = [];
  const prod = process.env.NODE_ENV === "production";
  const admin = getAdminEmail();
  if (!admin) items.push({ level: "error", text: "Chưa có email tài khoản quản trị (ADMIN_EMAIL hoặc Cài đặt › Tài khoản quản trị)." });
  else if (!mfaRequired(admin)) items.push({ level: prod ? "error" : "warn", text: `Tài khoản quản trị ${admin} chưa bật xác thực hai lớp.` });
  else items.push({ level: "ok", text: `Tài khoản quản trị ${admin} đã bật xác thực hai lớp.` });
  if (admin && !getSetting("admin.passwordHash")) items.push({ level: "warn", text: "Mật khẩu quản trị đang lấy từ biến môi trường ADMIN_PASSWORD. Đổi mật khẩu ở Tài khoản của tôi để lưu dạng băm trong hệ thống." });
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret || secret === "dev-secret-change-me-in-production" || secret.length < 32) items.push({ level: prod ? "error" : "warn", text: "AUTH_SECRET chưa đặt hoặc quá ngắn (cần ít nhất 32 ký tự)." });
  else items.push({ level: "ok", text: "AUTH_SECRET đã đặt đủ mạnh." });
  if (prod && !(process.env.PUBLIC_URL ?? "").startsWith("https://")) items.push({ level: "warn", text: "PUBLIC_URL chưa là https://; cookie phiên cần HTTPS để an toàn." });
  const managers = getDb().select().from(schema.people).all().filter((p) => p.active && p.passwordHash && (p.permission === "manager" || p.permission === "admin"));
  const noMfa = managers.filter((p) => !mfaRequired(p.email));
  if (noMfa.length) items.push({ level: "warn", text: `${noMfa.length} tài khoản Quản lý/Quản trị trong Nhân sự chưa bật xác thực hai lớp: ${noMfa.map((p) => p.email).join(", ")}.` });
  return items;
}
