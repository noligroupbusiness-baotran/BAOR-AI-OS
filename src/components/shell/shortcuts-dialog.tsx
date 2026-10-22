"use client";

import { Dialog } from "@/components/ui/dialog";
import { menu } from "@/config/menu";

// Bảng phím tắt: mở bằng phím ? hoặc từ menu tài khoản. Chỉ liệt kê phím thật sự có trong vỏ ứng dụng.
function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border-2 bg-ground px-1.5 font-sans text-[11px] leading-[18px] text-ink">{children}</kbd>;
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const general: { keys: React.ReactNode; what: string }[] = [
    { keys: <><Key>/</Key> hoặc <Key>Ctrl</Key>+<Key>K</Key></>, what: "Nhảy vào ô tìm kiếm toàn hệ thống (trên điện thoại: mở trang tìm kiếm)" },
    { keys: <Key>Esc</Key>, what: "Đóng hộp thoại, bảng thông báo, trợ lý AI hoặc menu đang mở" },
    { keys: <Key>?</Key>, what: "Mở hoặc đóng bảng phím tắt này" },
    { keys: <Key>Enter</Key>, what: "Trong ô tìm kiếm: tìm; trong biểu mẫu tạo chiến dịch: sang bước tiếp theo" },
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Phím tắt">
      <div className="grid gap-4">
        <section>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Chung</div>
          <dl className="grid gap-1.5">
            {general.map((g, i) => (
              <div key={i} className="grid grid-cols-[150px_1fr] items-start gap-2">
                <dt className="flex flex-wrap items-center gap-1 text-ink-2">{g.keys}</dt>
                <dd className="text-ink">{g.what}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Chuyển phân hệ</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {menu.filter((m) => m.hotkey).map((m) => (
              <div key={m.key} className="flex items-center gap-2">
                <dt className="flex items-center gap-0.5 text-ink-2"><Key>Alt</Key>+<Key>{m.hotkey}</Key></dt>
                <dd className="truncate text-ink">{m.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11.5px] text-ink-3">Trên máy Mac dùng phím Option thay cho Alt.</p>
        </section>
      </div>
    </Dialog>
  );
}
