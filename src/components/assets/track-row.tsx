import type { ReactNode } from "react";
import { Pill, type Tone } from "@/components/ui/pill";
import { InfoTip } from "@/components/ui/info-tip";
import { PlayButton } from "./play-button";
import { OriginTag, PendingTag, type AssetOrigin } from "./asset-tags";

/** Một bài nghe thử ở dạng chung (thư viện nhạc máy chủ, nhạc tải lên, sau này danh mục "Máy của anh"). */
export interface TrackView {
  /** Khoá ổn định; với thư viện nhạc = tên tệp (data-track, E2E chọn theo thuộc tính này). */
  id: string;
  title: string;
  author?: string;
  duration?: string;
  /** null = không có bản nghe thử (vd máy dựng chưa gửi đoạn nghe thử). */
  previewUrl: string | null;
  /** Nhãn trạng thái ngắn ("chờ nghe duyệt" / "đã duyệt" …) và màu. */
  status?: { label: string; tone: Tone };
  /** Nhãn nguồn giấy phép ngắn ("Mixkit" / "Pixabay" / "OWNER") + câu đầy đủ trong (i). */
  licenseShort?: string;
  licenseFull?: string;
  licenseCredit?: string;
  origin?: AssetOrigin;
  pendingDecision?: boolean;
  /** Lý do ngắn (bị loại / chưa dùng được) → (i) cạnh nhãn trạng thái. */
  note?: string;
  /** Nhãn phụ (mặc định, cần ghi công, tâm trạng…). */
  extra?: ReactNode;
  /** Nút chính bên phải (Duyệt dùng / Bỏ duyệt / Xóa…). */
  action?: ReactNode;
}

/** Nhãn nguồn ngắn + (i) mở câu giấy phép đầy đủ. */
export function LicenseTag({ short, full, credit, tone = "neutral" }: { short: string; full?: string; credit?: string; tone?: Tone }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Pill tone={tone}>{short}</Pill>
      {full && (
        <InfoTip label="Giấy phép đầy đủ">
          <span className="block text-[12px] text-ink">{full}</span>
          {credit && <span className="mt-1.5 block text-[11.5px] text-ink-3">Ghi công: {credit}</span>}
        </InfoTip>
      )}
    </span>
  );
}

// Dòng gọn: ▶ to · tên (đậm) · tác giả · thời lượng · nhãn · nút chính. Một dòng phụ, không đoạn văn.
export function TrackRow({ t, dataAttr = "data-track" }: { t: TrackView; dataAttr?: string }) {
  return (
    <li {...{ [dataAttr]: t.id }} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-ground px-2.5 py-2">
      {t.previewUrl ? <PlayButton src={t.previewUrl} label={t.title} /> : <span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-border-2 text-[10px] text-ink-3" title="Chưa có bản nghe thử">—</span>}
      <div className="min-w-0">
        <div className="truncate font-semibold text-ink" title={t.title}>{t.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
          {t.author && <span className="max-w-[16ch] truncate sm:max-w-none">{t.author}</span>}
          {t.duration && <span className="num">{t.duration}</span>}
          {t.status && <Pill tone={t.status.tone}>{t.status.label}</Pill>}
          {t.note && <InfoTip label="Lý do">{t.note}</InfoTip>}
          <PendingTag pending={t.pendingDecision} />
          {t.extra}
          <OriginTag origin={t.origin} />
          {t.licenseShort && <LicenseTag short={t.licenseShort} full={t.licenseFull} credit={t.licenseCredit} />}
        </div>
      </div>
      <div className="justify-self-end">{t.action}</div>
    </li>
  );
}
