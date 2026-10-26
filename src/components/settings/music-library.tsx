import { AudioLines, Library, Lock, ShieldAlert, Undo2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill, type Tone } from "@/components/ui/pill";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { InfoTip } from "@/components/ui/info-tip";
import { LicenseTag } from "@/components/assets/track-row";
import { AssetTile, TILE_GRID } from "@/components/assets/asset-tile";
import { FacetList, type Facet } from "@/components/assets/facet-list";
import { DecisionErrorTag, ORIGIN_LABEL, OriginTag, PendingTag } from "@/components/assets/asset-tags";
import { CancelTrashButton, DeleteAssetButton, OWNER_MAC_TRASH_NOTE } from "@/components/assets/delete-asset-button";
import { setAssetApproval, trashAssetAction } from "@/lib/actions/asset-catalog";
import type { AssetEntry } from "@/lib/video/asset-catalog";
import { can, currentActor } from "@/lib/permissions";

// Tư liệu › Thư viện nhạc nền — danh mục hợp nhất (listAssetCatalog): bài trên máy chủ + bài "Máy của anh" (máy dựng báo lên).
// OWNER nghe thử rồi duyệt; bộ dựng chỉ TỰ chọn bài đã duyệt. Bài máy chủ duyệt ngay; bài máy của anh ghi quyết định, máy dựng
// áp ở lần đồng bộ kế ("Đang chờ máy dựng áp dụng", huỷ được). Chữ "chờ nghe duyệt", "x/y bài đã duyệt", "Duyệt dùng",
// "Bỏ duyệt", data-track (= tên tệp với bài máy chủ) và thẻ <audio> trong ô được tests-e2e/music-library.spec.ts chọn — giữ nguyên.
// 26/10: lưới ô gọn như Hiệu ứng âm thanh (AssetTile, 1/2/3 cột) thay cho danh sách dòng dài.
const GENRE: Record<string, string> = {
  "lofi-chill": "Lofi",
  upbeat: "Sôi động",
  cinematic: "Điện ảnh",
  "nhe-nhang-piano": "Piano",
  "corporate-truyen-cam-hung": "Doanh nghiệp",
  acoustic: "Acoustic",
};
const SFX_KIND: Record<string, string> = { moi: "Mới tải lên", whoosh: "Whoosh", swoosh: "Swoosh", pop: "Pop", click: "Click", "riser-impact": "Riser · impact" };
const BACK = "/assets#music-library";

const mmss = (s: number | null) => (s == null ? "" : s < 10 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const sourceFacet: Facet = { key: "source", label: "Nguồn", options: [{ key: "server", label: ORIGIN_LABEL.server }, { key: "owner_mac", label: ORIGIN_LABEL.owner_mac }] };
const trackKey = (e: AssetEntry) => (e.source === "server" ? e.file.replace(/^music\//, "") : e.id);
/** Bài tính vào "x/y bài đã duyệt": bỏ bài bị loại / đã gỡ khỏi máy của anh. */
const counted = (e: AssetEntry) => e.status !== "excluded" && e.status !== "removed";

function musicStatus(e: AssetEntry): { label: string; tone: Tone } {
  if (e.status === "approved") return { label: "đã duyệt", tone: "jade" };
  if (e.status === "pending") return { label: "chờ nghe duyệt", tone: "amber" };
  return { label: e.statusLabel, tone: e.status === "removed" ? "neutral" : "brick" };
}

function ApprovalForm({ e, approve, label, pendingText, variant }: { e: AssetEntry; approve: boolean; label: string; pendingText: string; variant: "outline" | "ghost" }) {
  return (
    <form action={setAssetApproval}>
      <input type="hidden" name="id" value={e.id} />
      <input type="hidden" name="approve" value={approve ? "1" : "0"} />
      <input type="hidden" name="back" value={BACK} />
      <SubmitButton variant={variant} pendingText={pendingText}>{label}</SubmitButton>
    </form>
  );
}

function musicAction(e: AssetEntry, isOwner: boolean) {
  if (e.pendingDecision) {
    if (!isOwner) return null;
    if (e.pendingDecision.action === "trash") return <CancelTrashButton action={trashAssetAction} id={e.id} name={shortName(e)} />;
    return (
      <form action={setAssetApproval}>
        <input type="hidden" name="id" value={e.id} />
        <input type="hidden" name="cancel" value="1" />
        <input type="hidden" name="back" value={BACK} />
        <SubmitButton variant="ghost" pendingText="Đang huỷ…" title={`Huỷ quyết định ${e.pendingDecision.action === "approve" ? "duyệt" : "bỏ duyệt"} chưa áp`}><Undo2 size={13} aria-hidden />Huỷ</SubmitButton>
      </form>
    );
  }
  if (e.status === "excluded" || e.status === "removed") return null;
  if (!isOwner) return <Pill><Lock size={11} aria-hidden />chỉ OWNER duyệt</Pill>;
  if (e.canApprove) return <ApprovalForm e={e} approve label="Duyệt dùng" pendingText="Đang duyệt…" variant="outline" />;
  if (e.canUnapprove) return <ApprovalForm e={e} approve={false} label="Bỏ duyệt" pendingText="Đang bỏ…" variant="ghost" />;
  if (e.status === "approved") return <span className="text-[11.5px] text-ink-3">duyệt trước đây</span>;
  return null;
}

const shortName = (e: AssetEntry) => e.file.replace(/^(sfx-owner\/moi|music|sfx)\//, "");

/** Thùng rác (OWNER): máy chủ → Đã xoá ngay; "Máy của anh" → lệnh xoá cho máy dựng (đang chờ → nút Huỷ xoá; nhạc có nút này ở ô hành động). */
function removeButton(e: AssetEntry, isOwner: boolean) {
  if (!isOwner) return null;
  if (e.pendingDecision?.action === "trash") return e.type === "music" ? null : <CancelTrashButton action={trashAssetAction} id={e.id} name={shortName(e)} />;
  if (!e.canTrash) return null;
  return <DeleteAssetButton action={trashAssetAction} fields={{ id: e.id }} name={shortName(e)} note={e.source === "owner_mac" ? OWNER_MAC_TRASH_NOTE : undefined} />;
}

export async function MusicLibraryPanel({ entries, ownerSynced }: { entries: AssetEntry[]; ownerSynced: boolean }) {
  // Chỉ OWNER (quyền quản trị) duyệt / bỏ duyệt; vai trò khác chỉ nghe thử (máy chủ vẫn chặn trong setAssetApproval)
  const isOwner = can(await currentActor(), "admin");
  const tracks = entries.filter((e) => e.type === "music");
  const total = tracks.filter(counted);
  const approved = total.filter((e) => e.status === "approved").length;
  const genres = [...new Set(tracks.map((e) => e.tags[0] || "khac"))];
  return (
    <Panel id="music-library">
      <PanelHeader
        title="Thư viện nhạc nền"
        sub="Nghe thử rồi duyệt"
        icon={Library}
        tone="indigo"
        info={
          <ul className="m-0 grid list-disc gap-1 pl-4 text-[12px]">
            <li>Bộ dựng chỉ tự chọn bài đã duyệt, hợp loại nhạc của video.</li>
            <li>Bài “Máy của anh”: bấm duyệt trên web, máy dựng áp ở lần đồng bộ kế (thường dưới 1 phút khi máy rảnh).</li>
            <li>Chỉ nạp bài kho tư liệu ghi ĐỦ-HỒ-SƠ, đúng mã sha256. ĐỦ-HỒ-SƠ là đội kiểm giấy phép trên trang nguồn, không phải quét Content ID: vẫn có thể bị nhận bản quyền sau này.</li>
            <li>Bài dùng phải đạt luật A5 của Phần chung (giấy phép rõ, không nhãn AI, đã tra YouTube không thấy bên thứ ba đăng lại). 552792, 241274, 136824 không bao giờ dùng.</li>
            <li>Chưa có bài duyệt hợp loại → bộ dựng tạm dùng một bài ĐỦ-HỒ-SƠ để video có nhạc; bảng kiểm P chặn ĐĂNG tới khi bạn nghe và duyệt bài đó.</li>
          </ul>
        }
        tags={approved < total.length ? <Pill tone="amber"><ShieldAlert size={11} aria-hidden />Dùng bài chưa duyệt = chặn đăng</Pill> : undefined}
        action={<Pill tone={approved > 1 ? "jade" : "amber"}>{approved}/{total.length} bài đã duyệt</Pill>}
      />
      {tracks.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-2">Chưa có bài nào. Chạy <code>python3 scripts/video/library_sync.py --catalog …</code> với danh mục của kho tư liệu.</p>
      ) : (
        <div className="p-4">
          <FacetList
            countDone
            groupBy="genre"
            always={ownerSynced ? ["source"] : []}
            listClassName={TILE_GRID}
            facets={[sourceFacet, { key: "genre", label: "Thể loại nhạc", options: genres.map((g) => ({ key: g, label: GENRE[g] ?? (g === "khac" ? "Khác" : g) })) }]}
            items={tracks.map((e) => ({
              id: e.id,
              values: { source: e.source, genre: e.tags[0] || "khac" },
              done: e.status === "approved",
              node: (
                <AssetTile
                  stacked
                  data={{ "data-track": trackKey(e) }}
                  title={e.title}
                  previewUrl={e.previewUrl}
                  duration={mmss(e.durationSec)}
                  tags={
                    <>
                      <Pill tone={musicStatus(e).tone}>{musicStatus(e).label}</Pill>
                      {e.note && <InfoTip label="Lý do">{e.note}</InfoTip>}
                      <PendingTag pending={!!e.pendingDecision} action={e.pendingDecision?.action} />
                      {e.isDefault && <Pill tone="jade">mặc định</Pill>}
                      {/ĐỀ NGHỊ|đề nghị|Credit/i.test(e.license) && <Pill tone="amber">cần ghi công</Pill>}
                      <DecisionErrorTag error={e.decisionError} />
                      {e.source === "owner_mac" && <OriginTag origin="owner_mac" />}
                      {e.licenseShort && <LicenseTag short={e.licenseShort} full={[e.author && `Tác giả: ${e.author}`, e.license].filter(Boolean).join(" · ") || undefined} />}
                    </>
                  }
                  action={musicAction(e, isOwner)}
                  remove={removeButton(e, isOwner)}
                />
              ),
            }))}
          />
        </div>
      )}
    </Panel>
  );
}

// Tư liệu › Hiệu ứng âm thanh: chỉ nghe thử (bộ dựng dùng theo vai trò, mức ≤ −19 dB dưới giọng; whoosh chỉ 16:9).
export async function SfxPanel({ entries, ownerSynced }: { entries: AssetEntry[]; ownerSynced: boolean }) {
  const isOwner = can(await currentActor(), "admin");
  const sfx = entries.filter((e) => e.type === "sfx");
  if (!sfx.length) return null;
  const kinds = [...new Set(sfx.map((e) => e.tags[0] || "khac"))];
  return (
    <Panel id="sfx">
      <PanelHeader
        title="Hiệu ứng âm thanh"
        sub={`${sfx.length} hiệu ứng · nghe thử`}
        icon={AudioLines}
        tone="indigo"
        info="Bộ dựng dùng theo vai trò (whoosh chỉ cho video 16:9), mức ≤ −19 dB dưới giọng. Thiếu vai trò nào thì dùng âm tổng hợp."
      />
      <div className="p-4">
        <FacetList
          groupBy="kind"
          always={ownerSynced ? ["source"] : []}
          listClassName={TILE_GRID}
          facets={[sourceFacet, { key: "kind", label: "Loại hiệu ứng", options: kinds.map((k) => ({ key: k, label: SFX_KIND[k] ?? (k === "khac" ? "Khác" : k) })) }]}
          items={sfx.map((e) => ({
            id: e.id,
            values: { source: e.source, kind: e.tags[0] || "khac" },
            node: (
              <AssetTile
                stacked={e.file.startsWith("sfx-owner/moi/") || !!e.pendingDecision}
                data={{ "data-sfx": e.file }}
                title={e.title}
                previewUrl={e.previewUrl}
                duration={e.durationSec != null ? mmss(e.durationSec) : undefined}
                tags={
                  <>
                    {e.file.startsWith("sfx-owner/moi/") && <Pill tone="sky">{e.statusLabel}</Pill>}
                    <PendingTag pending={!!e.pendingDecision} action={e.pendingDecision?.action} />
                    {e.source === "owner_mac" && <OriginTag origin="owner_mac" />}
                    {e.licenseShort ? <LicenseTag short={e.licenseShort} full={e.license} /> : <Pill tone="brick">chưa có giấy phép</Pill>}
                  </>
                }
                remove={removeButton(e, isOwner)}
              />
            ),
          }))}
        />
      </div>
    </Panel>
  );
}
