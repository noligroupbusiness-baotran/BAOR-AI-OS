import { and, desc, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { CALL_COUNT, vnMonthStartIso, type RuleResult } from "@/lib/router";
import { MODEL_IDS } from "@/lib/ai-providers";

// Đội AI theo Personal Brand System (sơ đồ OWNER 25/10/2026): việc LOGIC chạy theo quy trình (không AI); việc PHI LOGIC mới gọi AI,
// và khi gọi thì: mỗi vị trí 1 AI, mỗi AI một trần chi phí riêng, mọi chi phí AI hiện trên MỘT màn hình báo cáo chung.
// Mỗi vị trí có công tắc "Cho phép gọi AI": tắt thì hệ thống chỉ làm phần theo luật, không gọi mô hình.

export type AiRoleId = "research" | "hooks" | "video_edit" | "broll_describe" | "caption" | "ads" | "measure" | "reply" | "assistant";

export interface AiRole {
  id: AiRoleId;
  name: string; // tên AI hiện trên báo cáo
  step: string; // bước trong sơ đồ
  job: string;
  defaultModel: string;
  local?: boolean; // mô hình chạy tại máy: không tốn tiền API, không đổi mô hình trong app
  pending?: boolean; // chưa có chỗ nào trong hệ thống gọi AI vị trí này (việc đang làm theo luật) — công tắc / trần áp dụng khi nối
}


// Mặc định ChatGPT cho mọi vị trí (OWNER 26/10/2026: "các gói API kết nối với GPT hết đi"); việc nhẹ GPT-6 Luna, việc viết GPT-6.1 Sol.
// Tìm nguồn web của Nghiên cứu chạy đúng hãng của vị trí (ChatGPT: tool web_search của Responses API; Claude: web_search của Anthropic;
// Grok chưa nối → Claude — src/lib/ai.ts › webSearchProvider). Mô tả ảnh (gửi ảnh) vẫn cần Claude.
export const AI_ROLES: AiRole[] = [
  { id: "research", name: "AI Nghiên cứu", step: "2", job: "Nghiên cứu chủ đề, lấy insight từ các nền tảng", defaultModel: "gpt-6-luna" },
  // OWNER 26/10/2026: gộp "AI Hook & Ý tưởng" + "AI Kịch bản" (cùng bước, cùng mô hình) thành một vị trí; sổ cũ role "script" tính vào đây
  { id: "hooks", name: "AI Nội dung", step: "3", job: "Hook, ý tưởng và nháp kịch bản vlog chia sẻ (< 1 phút)", defaultModel: "gpt-6-luna" },
  { id: "video_edit", name: "AI Edit Video", step: "4.2", job: "Biên tập video theo Skill ESV / Edit Video Ngang", defaultModel: "qwen2.5-32b (tại máy)", local: true },
  // Chỉ gọi khi OWNER bấm "Tự mô tả bằng AI" trên từng ảnh (Tư liệu › Ảnh / B-roll); gửi ảnh thu nhỏ ≤ 480 px, luôn chạy Claude (ảnh)
  { id: "broll_describe", name: "AI Mô tả ảnh", step: "4.1", job: "Tả nội dung ảnh B-roll khi OWNER bấm, để bộ dựng chọn đúng ảnh", defaultModel: "claude-haiku-5-5" },
  { id: "caption", name: "AI Viết bài đăng", step: "6.1", job: "Viết nội dung bài đăng theo hook / video", defaultModel: "gpt-6.1-sol" },
  { id: "ads", name: "AI Quảng cáo", step: "7", job: "Đề xuất và tối ưu quảng cáo", defaultModel: "gpt-6.1-sol", pending: true },
  { id: "measure", name: "AI Đo lường", step: "8.2", job: "Đề xuất cải tiến nội dung từ số liệu đã đăng (sau bước kiểm theo skill)", defaultModel: "gpt-6.1-sol" },
  { id: "reply", name: "AI Trả lời khách", step: "—", job: "Gợi ý trả lời khách hàng (người duyệt trước khi gửi)", defaultModel: "gpt-6.1-sol" },
  { id: "assistant", name: "AI Trợ lý", step: "—", job: "Trả lời câu hỏi của OWNER trong app", defaultModel: "gpt-6.1-sol" },
];

// Mục đích gọi cũ (cột purpose trong sổ ai_calls) → vị trí
const PURPOSE_ROLE: Record<string, AiRoleId> = { research: "research", ideas: "hooks", draft: "hooks", reply: "reply", assistant: "assistant", caption: "caption", ads: "ads", measure: "measure", video_plan: "video_edit" };

// Vị trí đã gộp: id cũ trong sổ ai_calls / cài đặt → vị trí hiện tại
const ROLE_ALIAS: Record<string, AiRoleId> = { script: "hooks" };
const roleIdsOf = (id: AiRoleId): string[] => [id, ...Object.entries(ROLE_ALIAS).filter(([, r]) => r === id).map(([old]) => old)];

// Mục đích cũ thuộc vị trí (để trần riêng tính cả bản ghi trước khi có cột role, khớp với báo cáo)
function purposesOf(id: AiRoleId): string[] {
  return [id, ...Object.entries(PURPOSE_ROLE).filter(([, r]) => r === id).map(([p]) => p)];
}

export function roleForPurpose(purpose: string): AiRole {
  const id = PURPOSE_ROLE[purpose] ?? (AI_ROLES.some((r) => r.id === purpose) ? (purpose as AiRoleId) : "assistant");
  return AI_ROLES.find((r) => r.id === id)!;
}

export function roleById(id: string): AiRole | undefined {
  const cur = ROLE_ALIAS[id] ?? id;
  return AI_ROLES.find((r) => r.id === cur);
}

export interface RoleSettings {
  enabled: boolean;
  model: string;
  monthlyCapVnd: number; // 0 = không trần riêng (vẫn chịu trần chung ngày / tháng)
}

export function roleSettings(role: AiRole): RoleSettings {
  const model = getSetting(`ai.role.${role.id}.model`) ?? "";
  return {
    enabled: getSetting(`ai.role.${role.id}.enabled`) !== "0",
    model: !role.local && MODEL_IDS.includes(model) ? model : role.defaultModel,
    monthlyCapVnd: Math.max(0, Number(getSetting(`ai.role.${role.id}.monthlyCapVnd`) ?? 0) || 0),
  };
}

export function saveRoleSettings(id: AiRoleId, s: Partial<RoleSettings>): void {
  const role = roleById(id);
  if (!role) throw new Error(`Không có vị trí AI ${id}`);
  if (s.enabled !== undefined) setSetting(`ai.role.${role.id}.enabled`, s.enabled ? "1" : "0");
  if (s.model !== undefined && !role.local) {
    if (!MODEL_IDS.includes(s.model)) throw new Error(`Mô hình không hợp lệ: ${s.model}`);
    setSetting(`ai.role.${role.id}.model`, s.model);
  }
  if (s.monthlyCapVnd !== undefined) setSetting(`ai.role.${role.id}.monthlyCapVnd`, String(Math.max(0, Math.round(s.monthlyCapVnd) || 0)));
}

// Tháng theo giờ Việt Nam (cùng mốc với trần tháng chung ở router.getAiBudget)
function monthStart(): string {
  return vnMonthStartIso();
}

// Luật trước khi gọi AI của một vị trí: công tắc "Cho phép gọi AI" + trần riêng của vị trí (trần chung kiểm ở router).
export function roleAllows(role: AiRole): RuleResult<RoleSettings> {
  const s = roleSettings(role);
  if (!s.enabled) return { ok: false, value: s, reason: `${role.name} đang TẮT “Cho phép gọi AI” (Cài đặt › Đội AI) — chỉ làm phần theo luật.` };
  if (s.monthlyCapVnd > 0) {
    const [m] = getDb()
      .select({ c: sql<number>`coalesce(sum(cost_vnd),0)` })
      .from(schema.aiCalls)
      .where(and(gte(schema.aiCalls.at, monthStart()), or(inArray(schema.aiCalls.role, roleIdsOf(role.id)), and(isNull(schema.aiCalls.role), inArray(schema.aiCalls.purpose, purposesOf(role.id))))))
      .all();
    if (m.c >= s.monthlyCapVnd) return { ok: false, value: s, reason: `${role.name} đã chạm trần riêng tháng này (${s.monthlyCapVnd.toLocaleString("vi-VN")} ₫).` };
  }
  return { ok: true, value: s, reason: "Được phép, trong trần." };
}

export interface RoleSpend {
  role: AiRole;
  settings: RoleSettings;
  calls: number;
  failed: number;
  costVnd: number;
  avgVnd: number;
  lastAt: string | null;
}

// Màn hình báo cáo chung: chi phí tháng này theo từng AI ([Tên AI] – chi phí mỗi lần gọi).
export function roleSpendThisMonth(): RoleSpend[] {
  const rows = getDb()
    .select({ role: schema.aiCalls.role, purpose: schema.aiCalls.purpose, ok: schema.aiCalls.ok, n: CALL_COUNT, c: sql<number>`coalesce(sum(cost_vnd),0)`, last: sql<string>`max(at)` })
    .from(schema.aiCalls)
    .where(gte(schema.aiCalls.at, monthStart()))
    .groupBy(schema.aiCalls.role, schema.aiCalls.purpose, schema.aiCalls.ok)
    .all();
  return AI_ROLES.map((role) => {
    const mine = rows.filter((r) => (r.role ? (ROLE_ALIAS[r.role] ?? r.role) : roleForPurpose(r.purpose).id) === role.id);
    // calls = MỌI lần gọi (thành công + lỗi), cùng định nghĩa với "lần gọi hôm nay" (router.getAiBudget) — trước đây chỉ đếm thành công
    // nên "tháng" có thể nhỏ hơn "hôm nay". failed = phần lỗi trong số đó; chi phí = tổng sổ; avgVnd = chi phí / mọi lần gọi.
    const calls = mine.reduce((a, r) => a + r.n, 0);
    const costVnd = mine.reduce((a, r) => a + r.c, 0);
    const last = mine.map((r) => r.last).sort().at(-1) ?? null;
    return { role, settings: roleSettings(role), calls, failed: mine.filter((r) => !r.ok).reduce((a, r) => a + r.n, 0), costVnd, avgVnd: calls ? Math.round(costVnd / calls) : 0, lastAt: last };
  });
}

export function recentAiCalls(limit = 30) {
  return getDb()
    .select()
    .from(schema.aiCalls)
    .orderBy(desc(schema.aiCalls.at))
    .limit(limit)
    .all()
    .map((c) => ({ ...c, roleName: (c.role ? roleById(c.role) : roleForPurpose(c.purpose))?.name ?? c.purpose }));
}
