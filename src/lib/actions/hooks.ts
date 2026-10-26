"use server";

// Bảng Hook & kịch bản (Personal Brand System bước 3): AI tạo 10 hook / lần, nhập hook tay, chọn hook → kịch bản, bỏ hook.
import { done, logActivity, withQuery } from "./common";
import { findTopicByName } from "@/lib/research/topic";
import { generateHooks } from "@/lib/ai";
import { currentActor } from "@/lib/permissions";
import { HOOK_PLATFORMS, pickHook, rejectHook, saveHooks } from "@/lib/content/hooks";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// Trang chủ đề (/insights/research/<id>) gọi cùng hành động: quay về đúng trang đó (#hooks). Chỉ nhận đường dẫn nội bộ đã biết.
const safeBack = (v: string) => (/^\/(?:insights\/research\/[\w-]+|content\/hooks)(?:[?#][\w=&#%-]*)?$/.test(v) ? v : "");

export async function aiGenerateHooks(fd: FormData) {
  const actor = await currentActor();
  const topic = str(fd, "topic");
  const back = safeBack(str(fd, "back"));
  if (topic.length < 4) return done(back ? withQuery(back, "tone", "error") : "/content/hooks?tone=error", "Nhập chủ đề (ít nhất 4 ký tự)");
  // Gõ đúng tên một chủ đề đã có → dùng insight của chủ đề đó (nối bước 1 → 2 bằng id, không tạo lô hook "mồ côi")
  const research = str(fd, "research") || findTopicByName(topic) || "";
  const r = await generateHooks(topic, actor.name, research || undefined);
  if (!r.ok) return done(back ? withQuery(back, "tone", "error") : `/content/hooks?tone=error&topic=${encodeURIComponent(topic)}${research ? `&research=${encodeURIComponent(research)}` : ""}`, r.error);
  logActivity("ai", `AI Hook tạo ${r.count} hook cho “${topic.slice(0, 80)}”.`, "content");
  done(back || (research ? `/content/hooks?research=${encodeURIComponent(research)}` : "/content/hooks"), `AI vừa tạo ${r.count} hook${r.short ? ` (thiếu ${r.short} so với 10)` : ""}${r.dropped ? ` · bỏ ${r.dropped} căn cứ không có trong ngữ cảnh` : ""}${r.meta ? ` · bỏ ${r.meta} ghi chú nội bộ` : ""}`);
}

export async function addManualHook(fd: FormData) {
  const actor = await currentActor();
  const hook = str(fd, "hook");
  if (!hook) return done("/content/hooks?tone=error", "Nhập câu hook");
  const platforms = HOOK_PLATFORMS.filter((p) => fd.get(`p_${p}`) === "on");
  const topic = str(fd, "topic");
  const research = str(fd, "research") || (topic ? findTopicByName(topic) : null) || undefined;
  saveHooks(topic, [{ hook, angle: str(fd, "angle"), beats: str(fd, "beats").split("\n"), durationSec: Number(str(fd, "durationSec")) || 45, platforms }], { source: "manual", by: actor.name, researchId: research });
  done(research ? `/content/hooks?research=${encodeURIComponent(research)}` : "/content/hooks", "Đã thêm hook");
}

export async function pickHookAction(fd: FormData) {
  await currentActor();
  const r = pickHook(str(fd, "id"));
  const back = safeBack(str(fd, "back"));
  if (!r.ok) return done(back ? withQuery(back, "tone", "error") : "/content/hooks?tone=error", r.error);
  done(`/content?tab=mine&open=${r.contentId}`, "Đã tạo kịch bản vlog từ hook");
}

export async function rejectHookAction(fd: FormData) {
  await currentActor();
  rejectHook(str(fd, "id"));
  done(safeBack(str(fd, "back")) || "/content/hooks", "Đã bỏ hook");
}
