"use server";

// Bảng Hook & kịch bản (Personal Brand System bước 3): AI tạo 10 hook / lần, nhập hook tay, chọn hook → kịch bản, bỏ hook.
import { done, logActivity } from "./common";
import { generateHooks } from "@/lib/ai";
import { currentActor } from "@/lib/permissions";
import { HOOK_PLATFORMS, pickHook, rejectHook, saveHooks } from "@/lib/content/hooks";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function aiGenerateHooks(fd: FormData) {
  const actor = await currentActor();
  const topic = str(fd, "topic");
  if (topic.length < 4) return done("/content/hooks?tone=error", "Nhập chủ đề (ít nhất 4 ký tự)");
  const r = await generateHooks(topic, actor.name);
  if (!r.ok) return done(`/content/hooks?tone=error&topic=${encodeURIComponent(topic)}`, r.error);
  logActivity("ai", `AI Hook tạo ${r.count} hook cho “${topic.slice(0, 80)}”.`, "content");
  done("/content/hooks", `AI vừa tạo ${r.count} hook${r.short ? ` (thiếu ${r.short} so với 10)` : ""}${r.dropped ? ` · bỏ ${r.dropped} căn cứ không có trong ngữ cảnh` : ""}`);
}

export async function addManualHook(fd: FormData) {
  const actor = await currentActor();
  const hook = str(fd, "hook");
  if (!hook) return done("/content/hooks?tone=error", "Nhập câu hook");
  const platforms = HOOK_PLATFORMS.filter((p) => fd.get(`p_${p}`) === "on");
  saveHooks(str(fd, "topic"), [{ hook, angle: str(fd, "angle"), beats: str(fd, "beats").split("\n"), durationSec: Number(str(fd, "durationSec")) || 60, platforms }], { source: "manual", by: actor.name });
  done("/content/hooks", "Đã thêm hook");
}

export async function pickHookAction(fd: FormData) {
  await currentActor();
  const r = pickHook(str(fd, "id"));
  if (!r.ok) return done("/content/hooks?tone=error", r.error);
  done(`/content?tab=mine&open=${r.contentId}`, "Đã tạo kịch bản từ hook");
}

export async function rejectHookAction(fd: FormData) {
  await currentActor();
  rejectHook(str(fd, "id"));
  done("/content/hooks", "Đã bỏ hook");
}
