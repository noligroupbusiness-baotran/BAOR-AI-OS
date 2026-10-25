"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/format";
import { IconChip } from "@/components/ui/icon-chip";
import { ASSET_ANCHORS, SETTINGS_ANCHORS, SETTINGS_GROUPS, isSettingsGroup, type SettingsGroupId } from "@/config/settings-groups";

// Nút chọn nhóm cài đặt + nhóm đang hiện (cấu hình nhóm: src/config/settings-groups.ts).

const Active = createContext<SettingsGroupId | null>(null);

export function SettingsTabs({ initial, children }: { initial: SettingsGroupId; children: ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState<SettingsGroupId>(initial);
  // Máy chủ đổi nhóm (?tab= mới sau khi chuyển / lưu) → theo nhóm đó (điều chỉnh state lúc render, không dùng effect)
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setActive(initial);
  }

  // #mục nằm ở nhóm KHÁC nhóm đang hiện → chuyển sang ?tab=<nhóm>#mục: máy chủ hiện sẵn đúng nhóm, Next tự cuộn tới mục như
  // liên kết thường (tự cuộn sau khi đổi nhóm ở phía trình duyệt bị router cuộn đè). Giữ tham số khác (?tone=, ?person=…).
  // Chạy lúc mở trang, mỗi khi máy chủ đổi nhóm (liên kết / redirect không phát hashchange) và khi bấm liên kết # trong trang.
  useEffect(() => {
    const follow = () => {
      const id = decodeURIComponent(location.hash.slice(1)).split("?")[0];
      // Mục đã chuyển sang trang Tư liệu: liên kết cũ /settings#<mục> mở /assets#<mục> (giữ ?toast=…, bỏ ?tab=)
      if ((ASSET_ANCHORS as readonly string[]).includes(id)) {
        const url = new URL(location.href);
        url.searchParams.delete("tab");
        router.replace(`/assets${url.search}#${id}`);
        return;
      }
      const group = id ? (SETTINGS_ANCHORS[id] ?? document.getElementById(id)?.closest<HTMLElement>("[data-settings-group]")?.dataset.settingsGroup) : undefined;
      const shown = document.querySelector<HTMLElement>("[data-settings-group]:not([hidden])")?.dataset.settingsGroup;
      // Mục đích nằm trong dòng gập (SettingItem = <details>, kể cả lồng nhau): mở sẵn để thấy phần nhập
      const el = id ? document.getElementById(id) : null;
      for (let d = el?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
      if (!isSettingsGroup(group) || group === shown) return;
      const url = new URL(location.href);
      url.searchParams.set("tab", group);
      router.replace(url.pathname + url.search + url.hash);
    };
    // Lúc vừa hydrate, router.replace gọi ngay trong effect bị bỏ qua → hoãn một nhịp
    const t = setTimeout(follow, 0);
    window.addEventListener("hashchange", follow);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", follow);
    };
  }, [router, initial]);

  const pick = (id: SettingsGroupId) => {
    setActive(id);
    const url = new URL(location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    history.replaceState(null, "", url);
  };

  return (
    <>
      <nav aria-label="Nhóm cài đặt" className="mb-1">
        <ul role="tablist" className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 xl:grid-cols-6">
          {SETTINGS_GROUPS.map((g) => {
            const on = g.id === active;
            return (
              <li key={g.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={`tab-${g.id}`}
                  aria-controls={`nhom-${g.id}`}
                  aria-selected={on}
                  onClick={() => pick(g.id)}
                  className={cn(
                    "chip-host flex h-full w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-jade",
                    `tone-${g.tone}`,
                    on ? "metal-pill rounded-lg" : "card lift text-ink",
                  )}
                >
                  <IconChip icon={g.icon} size="md" className={on ? "border-white/25 bg-white/10 text-white" : undefined} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{g.label}</span>
                    <span className={cn("line-clamp-2 block text-[11.5px] leading-snug", on ? "text-white/80" : "text-ink-3")}>{g.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <Active.Provider value={active}>{children}</Active.Provider>
    </>
  );
}

/** Một nhóm cài đặt: chỉ hiện khi đang chọn; nhóm ẩn vẫn ở trong trang để liên kết #mục tìm được. */
export function SettingsGroup({ id, children }: { id: SettingsGroupId; children: ReactNode }) {
  const active = useContext(Active);
  return (
    <section id={`nhom-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} data-settings-group={id} hidden={id !== active} className="appear appear--soft grid gap-3.5">
      {children}
    </section>
  );
}
