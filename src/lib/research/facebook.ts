// Đọc bình luận Facebook cho Nghiên cứu — CHỈ bài trên Fanpage OWNER quản lý, qua Graph API bằng Page token đã lưu (Cài đặt › Kết nối).
// Graph API: GET /{object-id}/comments (developers.facebook.com/docs/graph-api/reference/object/comments, đọc 26/10/2026) — "quyền xem đối
// tượng chính cũng là quyền xem bình luận"; filter=toplevel, order=chronological|reverse_chronological, summary. Chỉ xin trường `message`
// (không xin `from`: không đọc tên người bình luận).
// KHÔNG làm: nhóm Facebook (Meta đóng Groups API 2024), bài của người khác / trang cá nhân, cào trang, tự đăng nhập — vi phạm điều khoản
// Meta và có thể khoá tài khoản OWNER. Những link đó → hiện ô dán bình luận.
import { GRAPH, withTimeout, GRAPH_TIMEOUT_MS } from "@/lib/connectors/meta";
import { readIntegrationConfig } from "@/lib/connectors/config";

export type FbRef =
  | { kind: "group" }
  | { kind: "object"; id: string; ownerId?: string } // id đối tượng dùng thẳng được (video / ảnh / bài dạng pageid_postid)
  | { kind: "story"; storyId: string; ownerId?: string } // id bài số trong trang → ghép pageId_storyId
  | { kind: "permalink"; path: string } // pfbid…, /share/…: so với permalink_url bài gần đây của trang
  | { kind: "unknown" };

export function parseFacebookUrl(url: string): FbRef {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { kind: "unknown" };
  }
  const host = u.hostname.toLowerCase().replace(/^(?:www|m|mobile|web|business)\./, "");
  if (host !== "facebook.com" && host !== "fb.com" && host !== "fb.watch") return { kind: "unknown" };
  const p = u.pathname.replace(/\/+$/, "");
  if (/^\/groups\//i.test(p)) return { kind: "group" };
  const q = (k: string) => u.searchParams.get(k) ?? "";
  if (/^\/(?:permalink|story)\.php$/i.test(p) && /^\d+$/.test(q("story_fbid"))) return { kind: "story", storyId: q("story_fbid"), ownerId: /^\d+$/.test(q("id")) ? q("id") : undefined };
  if (/^\/(?:photo|photo\.php)$/i.test(p) && /^\d+$/.test(q("fbid"))) return { kind: "object", id: q("fbid") };
  if (/^\/watch$/i.test(p) && /^\d+$/.test(q("v"))) return { kind: "object", id: q("v") };
  let m = p.match(/^\/(\d+)_(\d+)$/);
  if (m) return { kind: "object", id: `${m[1]}_${m[2]}`, ownerId: m[1] };
  m = p.match(/^\/(?:[^/]+\/)?(?:videos|reel|reels)\/(?:[^/]+\/)?(\d+)$/i);
  if (m) return { kind: "object", id: m[1] };
  m = p.match(/^\/([^/]+)\/posts\/(\d+)$/i);
  if (m) return { kind: "story", storyId: m[2], ownerId: /^\d+$/.test(m[1]) ? m[1] : undefined };
  if (/\/posts\/pfbid|^\/share\//i.test(p) || host === "fb.watch") return { kind: "permalink", path: `${host}${p}`.toLowerCase() };
  return { kind: "unknown" };
}

export type FbComments = { ok: true; comments: string[] } | { ok: false; needPaste: true; reason: string };

const PASTE = (reason: string): FbComments => ({ ok: false, needPaste: true, reason });

type Graph<T> = T & { error?: { message?: string; code?: number } };
async function graphGet<T>(path: string, params: Record<string, string>, token: string, f: typeof fetch): Promise<Graph<T>> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);
  const res = await f(url.toString(), withTimeout(undefined, GRAPH_TIMEOUT_MS));
  const json = (await res.json().catch(() => ({}))) as Graph<T>;
  if (!res.ok && !json.error) json.error = { message: `HTTP ${res.status}` };
  return json;
}

/** Bình luận gốc của một bài / video trên Fanpage đã kết nối (≤ max, tối đa 3 trang kết quả). Không đọc được → báo dán tay. */
export async function fanpageComments(url: string, opts: { fetch?: typeof fetch; config?: Record<string, string>; max?: number } = {}): Promise<FbComments> {
  const ref = parseFacebookUrl(url);
  if (ref.kind === "group") return PASTE("Nhóm Facebook: Meta không cho đọc tự động — dán bình luận vào ô bên dưới.");
  if (ref.kind === "unknown") return PASTE("Không nhận ra link bài Facebook — dán bình luận vào ô bên dưới.");
  const cfg = opts.config ?? readIntegrationConfig("facebook_page");
  const { pageId, pageToken } = cfg;
  if (!pageId || !pageToken) return PASTE("Chưa kết nối Fanpage (Page token) — chỉ đọc tự động được bài trên Fanpage của bạn. Dán bình luận vào ô bên dưới.");
  const f = opts.fetch ?? fetch;
  const max = Math.min(opts.max ?? 300, 300);
  const notMine = PASTE("Bài này không thuộc Fanpage đã kết nối — Meta chỉ cho đọc bình luận bài trên trang của bạn. Dán bình luận vào ô bên dưới.");
  if ((ref.kind === "story" || ref.kind === "object") && ref.ownerId && ref.ownerId !== pageId) return notMine;
  let objectId = ref.kind === "object" ? ref.id : ref.kind === "story" ? `${pageId}_${ref.storyId}` : "";
  try {
    if (ref.kind === "permalink") {
      // Link pfbid / chia sẻ: tìm trong 50 bài gần nhất của trang theo permalink_url
      const posts = await graphGet<{ data?: { id: string; permalink_url?: string }[] }>(`${pageId}/posts`, { fields: "id,permalink_url", limit: "50" }, pageToken, f);
      if (posts.error) return PASTE(`Meta: ${posts.error.message ?? "lỗi"} — dán bình luận vào ô bên dưới.`);
      const norm = (s: string) => s.toLowerCase().replace(/^https?:\/\/(?:www\.|m\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
      objectId = posts.data?.find((p) => p.permalink_url && norm(p.permalink_url) === norm(ref.path))?.id ?? "";
      if (!objectId) return notMine;
    }
    const out: string[] = [];
    let next = "";
    for (let page = 0; page < 3 && out.length < max; page++) {
      const body = next
        ? await graphGet<{ data?: { message?: string }[]; paging?: { next?: string } }>(next, {}, pageToken, f)
        : await graphGet<{ data?: { message?: string }[]; paging?: { next?: string } }>(`${objectId}/comments`, { fields: "message", filter: "toplevel", order: "reverse_chronological", limit: "100" }, pageToken, f);
      if (body.error) return page === 0 ? PASTE(`Meta: ${body.error.message ?? "lỗi"} — dán bình luận vào ô bên dưới.`) : { ok: true, comments: out };
      for (const c of body.data ?? []) if (c.message?.trim()) out.push(c.message);
      // Chỉ theo trang kế của CHÍNH Graph (không theo link lạ)
      next = body.paging?.next && body.paging.next.startsWith("https://graph.facebook.com/") ? body.paging.next : "";
      if (!next) break;
    }
    return { ok: true, comments: out.slice(0, max) };
  } catch (e) {
    return PASTE(`Không gọi được Meta (${e instanceof Error ? e.message : String(e)}) — dán bình luận vào ô bên dưới.`);
  }
}
