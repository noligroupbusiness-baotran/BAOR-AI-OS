import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { setLibraryMusicApproval } from "@/lib/actions/media";
import { musicLibrary, sfxCount, type MusicTrack } from "@/lib/video/music-library";
import { can, currentActor } from "@/lib/permissions";
import { MoreOptions } from "./setting-item";

// Cài đặt › Thư viện nhạc nền: bài nạp từ kho tư liệu (scripts/video/library_sync.py). OWNER nghe thử từng bài rồi duyệt;
// bộ dựng chỉ TỰ chọn bài đã duyệt, theo loại nhạc biên tập AI chọn cho nội dung video.
const GENRE: Record<string, string> = {
  "lofi-chill": "Lofi · thư giãn",
  upbeat: "Sôi động",
  cinematic: "Điện ảnh · kịch tính",
  "nhe-nhang-piano": "Piano nhẹ nhàng",
  "corporate-truyen-cam-hung": "Doanh nghiệp · truyền cảm hứng",
  acoustic: "Acoustic · ấm áp",
};

const mmss = (s: number | null) => (s == null ? "" : s < 10 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const needsCredit = (t: MusicTrack) => /ĐỀ NGHỊ|đề nghị|Credit/i.test(t.credit);

export async function MusicLibraryPanel() {
  // Chỉ OWNER (quyền quản trị) duyệt / bỏ duyệt; vai trò khác chỉ nghe thử (máy chủ vẫn chặn trong setLibraryMusicApproval)
  const isOwner = can(await currentActor(), "admin");
  const tracks = musicLibrary();
  const approved = tracks.filter((t) => t.approved).length;
  const groups = new Map<string, MusicTrack[]>();
  for (const t of tracks) groups.set(t.genre || "khac", [...(groups.get(t.genre || "khac") ?? []), t]);
  return (
    <Panel id="music-library">
      <PanelHeader
        title="Thư viện nhạc nền"
        sub="Nhạc đã kiểm giấy phép. Nghe thử rồi bấm Duyệt dùng — bộ dựng chỉ tự chọn bài đã duyệt; chưa có bài nào thì video không có nhạc."
        action={<Pill tone={approved > 1 ? "jade" : "amber"}>{approved}/{tracks.length} bài đã duyệt</Pill>}
      />
      {tracks.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-2">Chưa có bài nào. Chạy <code>python3 scripts/video/library_sync.py --catalog …</code> với danh mục của kho tư liệu.</p>
      ) : (
        <div className="grid gap-4 p-4">
          <MoreOptions label="Luật chọn nhạc và hiệu ứng âm thanh">
            <ul className="m-0 grid list-disc gap-1 pl-5 text-[12px] text-ink-2">
              <li>Chỉ nạp bài kho tư liệu ghi ĐỦ-HỒ-SƠ, đúng mã sha256. “ĐỦ-HỒ-SƠ” là đội kiểm giấy phép trên trang nguồn, không phải quét Content ID: vẫn có thể bị nhận bản quyền sau này.</li>
              <li>Bộ dựng chỉ dùng bài đã duyệt VÀ đạt luật A5 của Phần chung (giấy phép rõ, không nhãn AI, đã tra YouTube không thấy bên thứ ba đăng lại). 552792, 241274, 136824 không bao giờ dùng.</li>
              <li>Chưa có bài duyệt hợp loại → bộ dựng tạm dùng một bài kho ĐỦ-HỒ-SƠ (kể cả Mixkit) để video có nhạc; bảng kiểm P chặn ĐĂNG tới khi bạn nghe và duyệt bài đó.</li>
              <li>{sfxCount()} hiệu ứng âm thanh có giấy phép đã nạp: dùng theo vai trò (whoosh chỉ 16:9), mức ≤ −19 dB dưới giọng (A6.3); thiếu vai trò nào thì dùng âm tổng hợp.</li>
            </ul>
          </MoreOptions>
          {[...groups.entries()].map(([g, list]) => (
            <div key={g}>
              <div className="lbl">{GENRE[g] ?? (g === "khac" ? "Khác" : g)} · {list.filter((t) => t.approved).length}/{list.length} đã duyệt</div>
              <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[12.5px]">
                {list.map((t) => (
                  <li key={t.file} data-track={t.file} className="grid gap-2 rounded-md border border-border bg-ground px-3 py-2 md:grid-cols-[1fr_260px_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{t.title}</span>
                        {t.author && <span className="text-ink-2">{t.author}</span>}
                        <span className="text-ink-3">{mmss(t.durationSec)}</span>
                        {t.isDefault && <Pill tone="jade">mặc định</Pill>}
                        <Pill tone={t.approved ? "jade" : "amber"}>{t.approved ? "đã duyệt" : "chờ nghe duyệt"}</Pill>
                        {needsCredit(t) && <Pill tone="amber">tác giả đề nghị ghi công</Pill>}
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-ink-3" title={t.license}>{t.license}</div>
                    </div>
                    <audio controls preload="none" src={`/api/video-assets/music?file=${encodeURIComponent(t.file)}`} className="h-8 w-full" />
                    <div>
                      {!isOwner ? (
                        <span className="text-[11.5px] text-ink-3">chỉ OWNER duyệt</span>
                      ) : !t.approved ? (
                        <form action={setLibraryMusicApproval}>
                          <input type="hidden" name="file" value={t.file} />
                          <input type="hidden" name="approve" value="1" />
                          <SubmitButton variant="outline" pendingText="Đang duyệt…">Duyệt dùng</SubmitButton>
                        </form>
                      ) : t.approvedBy ? (
                        <form action={setLibraryMusicApproval}>
                          <input type="hidden" name="file" value={t.file} />
                          <input type="hidden" name="approve" value="0" />
                          <SubmitButton variant="outline" pendingText="Đang bỏ…">Bỏ duyệt</SubmitButton>
                        </form>
                      ) : (
                        <span className="text-[11.5px] text-ink-3">duyệt trước đây</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
