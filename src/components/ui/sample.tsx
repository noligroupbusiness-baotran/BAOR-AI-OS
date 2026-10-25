import { Pill } from "./pill";

// Nhãn "Mẫu" dùng chung (cùng kiểu trang Quảng cáo): dữ liệu demo, không phải số thật, không tiêu tiền.
export function SamplePill({ title = "Dữ liệu mẫu, không phải số thật" }: { title?: string }) {
  return (
    <span title={title} className="inline-flex">
      <Pill>Mẫu</Pill>
    </span>
  );
}

/** Dòng phụ "Mẫu · <số>" dưới một chỉ số: phần mẫu tách khỏi số thật. */
export function SampleLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3">
      <SamplePill />
      <span className="num">{children}</span>
    </span>
  );
}
