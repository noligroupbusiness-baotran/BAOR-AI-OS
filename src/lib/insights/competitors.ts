// Đối thủ: lưu thủ công, so sánh giá với danh mục sản phẩm theo luật (khớp tên, tính chênh lệch).
// AI chỉ được gọi khi người bấm "AI nhận xét" và có khóa; mọi thứ ở đây chạy không cần AI.
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export interface CompetitorChannel {
  platform: string;
  url: string;
  followers: number | null;
}
export interface CompetitorOffer {
  name: string;
  price: number;
  unit: string;
}
export interface Competitor {
  id: string;
  name: string;
  brand: string;
  positioning: string;
  channels: CompetitorChannel[];
  offers: CompetitorOffer[];
  strengths: string[];
  weaknesses: string[];
  note: string;
  lastCheckedAt: string | null;
  active: boolean;
  updatedAt: string;
}

const parse = <T,>(s: string, fb: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fb;
  }
};

function toCompetitor(r: typeof schema.competitors.$inferSelect): Competitor {
  return { ...r, channels: parse<CompetitorChannel[]>(r.channels, []), offers: parse<CompetitorOffer[]>(r.offers, []), strengths: parse<string[]>(r.strengths, []), weaknesses: parse<string[]>(r.weaknesses, []) };
}

export function listCompetitors(includeInactive = false): Competitor[] {
  return getDb()
    .select()
    .from(schema.competitors)
    .orderBy(desc(schema.competitors.updatedAt))
    .all()
    .map(toCompetitor)
    .filter((c) => includeInactive || c.active);
}

export function getCompetitor(id: string): Competitor | undefined {
  const r = getDb().select().from(schema.competitors).where(eq(schema.competitors.id, id)).get();
  return r ? toCompetitor(r) : undefined;
}

export function saveCompetitor(input: Omit<Competitor, "id" | "updatedAt" | "active"> & { id?: string }): Competitor {
  const id = input.id || `cmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const row = {
    id,
    name: input.name,
    brand: input.brand,
    positioning: input.positioning,
    channels: JSON.stringify(input.channels),
    offers: JSON.stringify(input.offers),
    strengths: JSON.stringify(input.strengths),
    weaknesses: JSON.stringify(input.weaknesses),
    note: input.note,
    lastCheckedAt: input.lastCheckedAt,
    active: true,
    updatedAt: new Date().toISOString(),
  };
  getDb()
    .insert(schema.competitors)
    .values(row)
    .onConflictDoUpdate({ target: schema.competitors.id, set: { ...row, id: undefined } })
    .run();
  return toCompetitor(row);
}

export function deleteCompetitor(id: string) {
  getDb().delete(schema.competitors).where(eq(schema.competitors.id, id)).run();
}

// ---------- So sánh giá theo luật ----------

const STOP = new Set(["goi", "lieu", "trinh", "combo", "bo", "chai", "hop", "the", "lan", "luot", "phut", "va", "cho", "cua", "dau"]);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Độ khớp 0–1: tỷ lệ token chung trên token của tên ngắn hơn. */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}


// Đọc danh sách "tên | giá | đơn vị" mỗi dòng từ ô nhập.
export function parseOffers(text: string): CompetitorOffer[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, price, unit] = l.split("|").map((x) => x.trim());
      return { name: name ?? "", price: Number(String(price ?? "").replace(/[^\d]/g, "")) || 0, unit: unit || "lượt" };
    })
    .filter((o) => o.name);
}

// Đọc "nền tảng | url | số theo dõi" mỗi dòng.
export function parseChannels(text: string): CompetitorChannel[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [platform, url, followers] = l.split("|").map((x) => x.trim());
      const n = Number(String(followers ?? "").replace(/[^\d]/g, ""));
      return { platform: platform ?? "", url: url ?? "", followers: n > 0 ? n : null };
    })
    .filter((c) => c.platform);
}

export const lines = (arr: string[]) => arr.join("\n");
export const offerLines = (arr: CompetitorOffer[]) => arr.map((o) => `${o.name} | ${o.price} | ${o.unit}`).join("\n");
export const channelLines = (arr: CompetitorChannel[]) => arr.map((c) => `${c.platform} | ${c.url}${c.followers ? ` | ${c.followers}` : ""}`).join("\n");
export const splitLines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
