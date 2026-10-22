import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { setLibraryMusicApproval } from "@/lib/actions/media";
import { musicLibrary, sfxCount, type MusicTrack } from "@/lib/video/music-library";
import { can, currentActor } from "@/lib/permissions";

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
        sub={`Nạp từ kho tư liệu (chỉ bài kho ghi ĐỦ-HỒ-SƠ, đúng sha256). Biên tập AI chọn loại nhạc hợp nội dung; bộ dựng ưu tiên bài anh đã nghe duyệt. Chưa có bài duyệt thì dùng một bài kho hợp loại để anh nghe thử ngay trong video, và bảng kiểm P chặn đăng tới khi anh duyệt bài đó. Bài 552792 và 241274 đã bị LOẠI theo luật A5. ${sfxCount()} SFX có giấy phép đã nạp (chưa dùng: bộ dựng vẫn dùng SFX tổng hợp OWNER đã duyệt).`}
        action={<Pill tone={approved > 1 ? "jade" : "amber"}>{approved}/{tracks.length} bài đã duyệt</Pill>}
      />
      {tracks.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-2">Chưa có bài nào. Chạy <code>python3 scripts/video/library_sync.py --catalog …</code> với danh mục của kho tư liệu.</p>
      ) : (
        <div className="grid gap-4 p-4">
          <p className="m-0 text-[12px] text-ink-3">
            “ĐỦ-HỒ-SƠ” là đội kiểm giấy phép trên trang nguồn, không phải quét Content ID: vẫn có thể bị nhận bản quyền sau này. Bài chưa duyệt mà được chọn tay → bảng kiểm P chặn đăng.
          </p>
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
