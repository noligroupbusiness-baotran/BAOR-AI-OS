// Một luồng duy nhất cho mỗi chủ đề (OWNER 26/10: "mục 1 và 2 chưa liên kết chặt chẽ"): insight → hook → kịch bản.
// Hàm thuần: từ số đếm của chủ đề ra MỘT bước tiếp theo + tiến độ ba chặng. Trang danh sách và trang chủ đề dùng chung.

export interface TopicCounts {
  insights: number; // mọi insight của chủ đề
  usable: number; // đạt kiểm + đã duyệt (vào được hook)
  pending: number; // AI tự nghiên cứu đề xuất, chờ duyệt
  hooks: number; // hook chưa bỏ (mới + đã chọn)
  hooksNew: number; // hook chờ chọn
  scripts: number; // hook đã thành kịch bản
}

export type NextStepKey = "insight" | "approve" | "hook" | "script" | "view";

export const NEXT_LABEL: Record<NextStepKey, string> = {
  insight: "Lấy insight",
  approve: "Duyệt insight",
  hook: "Tạo hook",
  script: "Viết kịch bản",
  view: "Xem",
};

export function nextStep(c: TopicCounts): NextStepKey {
  if (c.usable === 0) return c.pending > 0 ? "approve" : "insight";
  if (c.hooksNew > 0) return "script";
  if (c.scripts > 0) return "view";
  return "hook";
}

/** Ba chặng: đã xong chặng nào (insight dùng được / có hook / có kịch bản). */
export function progress(c: TopicCounts): { key: "insight" | "hook" | "script"; label: string; n: number; done: boolean }[] {
  return [
    { key: "insight", label: "Insight", n: c.usable, done: c.usable > 0 },
    { key: "hook", label: "Hook", n: c.hooks, done: c.hooks > 0 },
    { key: "script", label: "Kịch bản", n: c.scripts, done: c.scripts > 0 },
  ];
}
