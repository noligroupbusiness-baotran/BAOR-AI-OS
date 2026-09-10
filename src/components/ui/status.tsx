import { Pill, type Tone } from "@/components/ui/pill";

// Nhãn trạng thái dùng chung: thành công, chờ duyệt, lỗi, vô hiệu hóa, sắp triển khai...
export type UiStatus = "success" | "pending" | "error" | "disabled" | "loading" | "planned" | "active";

const map: Record<UiStatus, { label: string; tone: Tone; live?: boolean }> = {
  success: { label: "Thành công", tone: "jade" },
  pending: { label: "Chờ phê duyệt", tone: "amber" },
  error: { label: "Có lỗi", tone: "brick" },
  disabled: { label: "Vô hiệu hóa", tone: "neutral" },
  loading: { label: "Đang tải", tone: "neutral" },
  planned: { label: "Sắp triển khai", tone: "neutral" },
  active: { label: "Đang hoạt động", tone: "jade", live: true },
};

export function StatusPill({ status, label }: { status: UiStatus; label?: string }) {
  const m = map[status];
  return (
    <Pill tone={m.tone}>
      {m.live && <span className="live" style={{ width: 6, height: 6 }} />}
      {label ?? m.label}
    </Pill>
  );
}
