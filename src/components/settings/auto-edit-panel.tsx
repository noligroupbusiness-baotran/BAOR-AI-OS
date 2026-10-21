import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { runAutoEditNow, saveAutoEdit } from "@/lib/actions/media";
import { inboxDir, pendingInbox, toolCheck } from "@/lib/video/auto-edit";
import { SKILL, engineLabel, brollDir, brollLibrary, editSettings } from "@/lib/video/jobs";
import { listUploads } from "@/lib/uploads";
import { BrollDrop } from "@/components/video/broll-drop";

// Cài đặt › Dựng video: luật dựng cố định theo Skill Edit video Vlog (scripts/video/skill-vlog.json).
// Ở đây chỉ chỉnh từ khoá nhấn, bộ nhận lời, nhạc nền (bắt buộc có giấy phép), SFX (#78c) và thư viện B-roll.
export function AutoEditPanel() {
  const s = editSettings();
  const tools = toolCheck();
  const pending = pendingInbox();
  const music = listUploads("music");
  const dir = inboxDir();
  const broll = brollLibrary();
  const usable = broll.filter((b) => b.exists && b.license.trim() && b.keywords.length);
  const ready = tools.ffmpeg && tools.python && tools.whisper && tools.opencv;
  return (
    <Panel id="auto-edit">
      <PanelHeader
        title="Dựng video tự động"
        sub={`Thêm nguồn ở Video Studio (hoặc thả vào hộp thư vào): hệ thống nghe lời, dựng phụ đề, chữ nhấn, zoom theo mặt, B-roll, logo, nhạc, chuẩn âm, rồi chạy bảng kiểm A–Q. Theo ${engineLabel()}. Dựng chạy ngầm, không chặn máy chủ.`}
        action={<Pill tone={ready ? "jade" : "amber"}>{ready ? "Công cụ sẵn sàng" : "Thiếu công cụ"}</Pill>}
      />
      <div className="grid gap-0 md:grid-cols-[1fr_340px]">
        <form action={saveAutoEdit} className="grid gap-3 border-b border-border p-4 md:border-b-0 md:border-r">
          <Field label="Từ khoá nhấn" hint="Mỗi dòng hoặc cách nhau bằng dấu phẩy. Giúp nhận lời đúng từ chuyên ngành và chọn chữ nhấn.">
            <textarea name="keywords" rows={4} defaultValue={s.keywords.split(",").join("\n")} className={textareaClass} placeholder={"chào hỏi\nlắng nghe\nkhách hàng"} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bộ nhận lời" hint="medium: cân bằng; large: chính xác hơn, chậm hơn">
              <select name="model" defaultValue={s.model} className={inputClass}><option value="small">small (nhanh)</option><option value="medium">medium</option><option value="large">large (chậm)</option></select>
            </Field>
            <Field label="Nhạc nền" hint="Chỉ bài đã ghi giấy phép. Nhạc tự hạ khi có tiếng nói.">
              <select name="musicUploadId" defaultValue={s.musicUploadId} className={inputClass}>
                <option value="">Không dùng nhạc</option>
                {music.map((m) => <option key={m.id} value={m.id}>{String(m.meta.title || m.name)}{String(m.meta.license ?? "").trim() ? "" : " (chưa có giấy phép)"}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-start gap-2 text-[13px] text-ink">
            <input type="checkbox" name="sfx" defaultChecked={s.sfx} className="mt-0.5 h-3.5 w-3.5 accent-[var(--jade)]" />
            <span>Âm “pop” ở chữ nhấn <span className="text-ink-3">(#78c chờ OWNER quyết; âm tổng hợp tại chỗ, không cần giấy phép; mặc định tắt)</span></span>
          </label>
          <div className="flex flex-wrap gap-2"><SubmitButton pendingText="Đang lưu…">Lưu cấu hình</SubmitButton></div>
          <div className="border-t border-border pt-3">
            <div className="lbl">Thư viện B-roll · {usable.length}/{broll.length} clip dùng được</div>
            <p className="mt-1 text-[12px] text-ink-2">Clip được chèn 2,5 giây khi lời nói nhắc đúng từ khoá, không chèn ở 3 giây đầu. Clip thiếu giấy phép hoặc từ khoá không bao giờ được dùng.</p>
            {broll.length > 0 && (
              <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[12px]">
                {broll.map((b) => (
                  <li key={b.file} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-ground px-2.5 py-1.5">
                    <span className="font-medium text-ink">{b.file}</span>
                    <span className="text-ink-2">{b.keywords.join(", ") || "chưa có từ khoá"}</span>
                    <Pill tone={b.exists && b.license.trim() && b.keywords.length ? "jade" : "brick"}>{!b.exists ? "thiếu tệp" : b.license.trim() ? (b.keywords.length ? "dùng được" : "thiếu từ khoá") : "chưa có giấy phép"}</Pill>
                    {b.license && <span className="text-ink-3">{b.license}</span>}
                  </li>
                ))}
              </ul>
            )}
            <BrollDrop />
            <div className="mt-1 text-[11px] text-ink-3">Thư mục: <code className="break-all">{brollDir()}</code></div>
          </div>
        </form>
        <div className="grid content-start gap-3 p-4 text-[12.5px]">
          <div>
            <div className="lbl">Hộp thư vào</div>
            <code className="mt-1 block break-all rounded-md border border-border bg-ground px-2.5 py-1.5 text-[11.5px] text-ink">{dir}</code>
            <div className="mt-1 text-ink-3">Tệp cùng tên đuôi .txt (tùy chọn) chứa kịch bản hoặc từ chuyên ngành để nhận lời đúng hơn. Mỗi phút bộ chạy nền nhận tệp mới vào hàng dựng.</div>
          </div>
          <div>
            <div className="lbl">Đang chờ</div>
            {pending.length === 0 ? <div className="mt-1 text-ink-2">Không có tệp nào.</div> : <ul className="m-0 mt-1 list-disc pl-4 text-ink">{pending.slice(0, 5).map((p) => <li key={p}>{p.split("/").pop()}</li>)}{pending.length > 5 && <li className="text-ink-3">và {pending.length - 5} tệp khác</li>}</ul>}
            <form action={runAutoEditNow} className="mt-2"><SubmitButton variant="outline" pendingText="Đang nhận…">Nhận tệp ngay</SubmitButton></form>
          </div>
          <div>
            <div className="lbl">Công cụ trên máy dựng</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {([["ffmpeg", tools.ffmpeg], ["Python + Pillow", tools.python], ["Whisper", tools.whisper], ["OpenCV (dò mặt)", tools.opencv], ["Font phụ đề", tools.fonts]] as [string, boolean][]).map(([n, ok]) => <Pill key={n} tone={ok ? "jade" : "brick"}>{n}</Pill>)}
            </div>
            {!ready && <div className="mt-1 text-ink-3">Cài theo scripts/video/README.md.</div>}
          </div>
          <div>
            <div className="lbl">Chưa tự động (cần người)</div>
            <ul className="m-0 mt-1 list-disc space-y-0.5 pl-4 text-ink-2">{SKILL.notYetAutomated.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </div>
      </div>
    </Panel>
  );
}
