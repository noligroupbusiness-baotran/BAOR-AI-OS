import { Pill, type Tone } from "@/components/ui/pill";
import { InfoTip } from "@/components/ui/info-tip";

// 26/10: dòng nhạc dài (TrackRow) đã thay bằng ô gọn AssetTile (./asset-tile.tsx) ở thư viện nhạc, nhạc tải lên và hiệu ứng.

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
