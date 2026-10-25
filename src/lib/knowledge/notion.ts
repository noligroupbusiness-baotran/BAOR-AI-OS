// Đọc Second Brain trên Notion qua API chính thức, CHỈ ĐỌC. Không gọi bất kỳ endpoint ghi nào.
// Cần token "Internal Integration" chỉ có quyền đọc nội dung, được chia sẻ riêng trang BAOR TRAN (OWNER tạo, nhập ở Cài đặt › Kết nối).
// Đồng bộ tăng dần: trang không đổi last_edited_time thì không tải lại nội dung.
import type { CheckResult, Connector, ConnectorContext } from "@/lib/connectors/types";
import type { PageInput } from "./index";

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

/** Kho BAOR TRAN: các database (data source) và trang quy tắc cần đọc. Theo kiểm toán CP00 ngày 21/10/2026. */
export const SECOND_BRAIN = {
  root: "3fd4ceb9517d8193b4f2d7161e7b6e55",
  dataSources: [
    { id: "9b34f69d-6714-4631-95f3-59f6bc2cd88d", section: "01 KIẾN THỨC" },
    { id: "83503e65-1a62-4e7d-aef4-2247f208e7f3", section: "02 SKILL" },
    { id: "e38f0a39-cf79-4b81-99d5-1f22b371ffd6", section: "03 QUYẾT ĐỊNH OWNER" },
  ],
  pages: [
    { id: "3fd4ceb9517d81d5b176ef9b6fe01b19", section: "00 START HERE" },
    { id: "3fd4ceb9517d813e8e3efe93cf72e891", section: "00 QUẢN TRỊ KIẾN THỨC" },
    // Phần chung (A) của skill dựng video (TỔNG HỢP EDIT VIDEO): trang lẻ, không nằm trong database 02 SKILL — máy dựng theo dõi
    { id: "4014ceb9517d81b3bdc0f9917b05c190", section: "02 SKILL", kind: "Skill" },
  ],
} as const;

interface RichText {
  plain_text?: string;
}
interface NotionProp {
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  status?: { name: string } | null;
}
interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  in_trash?: boolean;
  archived?: boolean;
  properties: Record<string, NotionProp>;
}
interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [k: string]: unknown;
}

class NotionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(ctx: ConnectorContext, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const token = ctx.config.token;
  if (!token) throw new NotionError(0, "Chưa có token Notion.");
  const res = await ctx.fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* không có JSON */
    }
    throw new NotionError(res.status, msg);
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plain = (rt?: RichText[]) => (rt ?? []).map((t) => t.plain_text ?? "").join("");

/** Đọc thuộc tính theo tên cột của kho (Tên, Trạng thái, Nhóm, Loại, Nhãn tri thức, Hạng nguồn). */
export function pageProps(p: NotionPage) {
  const props = p.properties ?? {};
  const byName = (name: string) => props[name];
  const sel = (name: string) => {
    const v = byName(name);
    return v?.select?.name ?? v?.status?.name ?? "";
  };
  const titleProp = Object.values(props).find((v) => v.type === "title");
  const multi = (name: string) => (byName(name)?.multi_select ?? []).map((m) => m.name);
  return {
    title: plain(titleProp?.title).trim() || "(không tiêu đề)",
    status: sel("Trạng thái") || "DRAFT",
    area: sel("Nhóm") || sel("Phạm vi"),
    kind: sel("Loại") || (byName("Skill ID") ? "Skill" : byName("Mã quyết định") ? "Quyết định" : ""),
    labels: multi("Nhãn tri thức"),
    sourceGrade: sel("Hạng nguồn"),
  };
}

/** Chữ thuần của một khối Notion (đoạn, tiêu đề, gạch đầu dòng, bảng, chú thích…). */
export function blockText(b: NotionBlock): string {
  const v = b[b.type] as { rich_text?: RichText[]; cells?: RichText[][]; title?: string } | undefined;
  if (!v) return "";
  if (b.type === "table_row" && Array.isArray(v.cells)) return v.cells.map((c) => plain(c)).join(" | ");
  if (b.type === "child_page" || b.type === "child_database") return v.title ? `[${v.title}]` : "";
  const t = plain(v.rich_text);
  if (b.type.startsWith("heading")) return `\n${t}`;
  if (b.type === "bulleted_list_item" || b.type === "numbered_list_item" || b.type === "to_do") return `- ${t}`;
  return t;
}

async function pageBody(ctx: ConnectorContext, pageId: string, depth = 0): Promise<string> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await call<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }>(ctx, "GET", `/blocks/${pageId}/children${q}`);
    for (const b of res.results) {
      const t = blockText(b);
      if (t) out.push(t);
      if (b.has_children && depth < 3 && b.type !== "child_page" && b.type !== "child_database") out.push(await pageBody(ctx, b.id, depth + 1));
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    await sleep(350); // giới hạn tốc độ Notion ~3 yêu cầu/giây
  } while (cursor);
  return out.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface SyncResult {
  pages: PageInput[];
  fetchedBodies: number;
  skipped: number;
  errors: string[];
}

/**
 * Đọc kho BAOR TRAN. `known` = thời điểm sửa đã có trong chỉ mục (id → last_edited_time) để bỏ qua trang không đổi.
 * Trang bị bỏ qua vẫn được trả về với `body` undefined — người gọi giữ nội dung cũ.
 */
export async function readSecondBrain(ctx: ConnectorContext, known: Map<string, string | null>): Promise<SyncResult> {
  const pages: PageInput[] = [];
  const errors: string[] = [];
  let fetchedBodies = 0;
  let skipped = 0;
  const norm = (id: string) => id.replace(/-/g, "");

  for (const ds of SECOND_BRAIN.dataSources) {
    let cursor: string | undefined;
    try {
      do {
        const res = await call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(ctx, "POST", `/data_sources/${ds.id}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
        for (const p of res.results) {
          if (p.in_trash || p.archived) continue;
          const pr = pageProps(p);
          const id = norm(p.id);
          const same = known.get(id) === p.last_edited_time;
          let body: string | undefined;
          if (!same) {
            try {
              body = await pageBody(ctx, p.id);
              fetchedBodies++;
            } catch (e) {
              errors.push(`${pr.title}: ${e instanceof Error ? e.message : String(e)}`);
              continue;
            }
          } else skipped++;
          pages.push({ id, url: p.url, section: ds.section, notionEditedAt: p.last_edited_time, body, ...pr });
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
        await sleep(350);
      } while (cursor);
    } catch (e) {
      errors.push(`${ds.section}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const pg of SECOND_BRAIN.pages) {
    try {
      const p = await call<NotionPage>(ctx, "GET", `/pages/${pg.id}`);
      const id = norm(p.id);
      const same = known.get(id) === p.last_edited_time;
      const body = same ? undefined : await pageBody(ctx, p.id);
      if (same) skipped++;
      else fetchedBodies++;
      pages.push({ id, url: p.url, section: pg.section, notionEditedAt: p.last_edited_time, body, ...pageProps(p), status: "ACTIVE", kind: "kind" in pg ? pg.kind : "Quy tắc kho" });
    } catch (e) {
      errors.push(`${pg.section}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { pages, fetchedBodies, skipped, errors };
}

export const notionConnector: Connector = {
  key: "notion",
  channels: [],
  fields: [{ key: "token", label: "Internal Integration Token (chỉ đọc)", secret: true, hint: "ntn_… — tạo ở notion.so/my-integrations, chia sẻ trang BAOR TRAN cho integration" }],
  async check(ctx): Promise<CheckResult> {
    if (!ctx.config.token) return { ok: false, message: "Chưa nhập token Notion." };
    try {
      const me = await call<{ name?: string; bot?: { workspace_name?: string } }>(ctx, "GET", "/users/me");
      await call(ctx, "GET", `/pages/${SECOND_BRAIN.root}`);
      return { ok: true, account: me.bot?.workspace_name ?? me.name ?? "Notion", message: `Đọc được kho BAOR TRAN (${me.bot?.workspace_name ?? "workspace"}).` };
    } catch (e) {
      const status = e instanceof NotionError ? e.status : 0;
      if (status === 404) return { ok: false, message: "Token hợp lệ nhưng chưa được chia sẻ trang BAOR TRAN. Mở trang trên Notion › Connections › thêm integration." };
      if (status === 401) return { ok: false, message: "Token Notion không hợp lệ." };
      return { ok: false, message: e instanceof Error ? e.message : "Không kiểm tra được Notion." };
    }
  },
};
