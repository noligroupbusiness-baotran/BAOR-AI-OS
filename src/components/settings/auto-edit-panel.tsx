import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { runAutoEditNow, saveAutoEdit } from "@/lib/actions/media";
import { inboxDir, pendingInbox, toolCheck } from "@/lib/video/auto-edit";
import { engineLabel, brollDir, brollLibrary, editSettings } from "@/lib/video/jobs";
import { listUploads } from "@/lib/uploads";
import { BrollDrop } from "@/components/video/broll-drop";
import { MoreOptions } from "./setting-item";

// Cài đặt › Video › Cách dựng video: luật dựng cố định theo skill; ở đây chỉ chỉnh từ khoá nhấn, sửa chữ nghe sai, nhạc nền
// (bắt buộc có giấy phép), cắt lặng, SFX (#78c). B-roll, hộp thư vào, công cụ, bộ nhận lời: gập trong "Nâng cao".
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
        title="Cách dựng video"
        sub="Từ khoá nhấn, sửa chữ nghe sai, nhạc, cắt lặng — áp cho các lần dựng sau."
        action={<Pill tone={ready ? "jade" : "amber"}>{ready ? "Công cụ sẵn sàng" : "Thiếu công cụ"}</Pill>}
      />
      <form action={saveAutoEdit} className="grid gap-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Từ khoá nhấn" hint="Mỗi dòng một từ. Giúp nghe đúng từ chuyên ngành và chọn chữ nhấn.">
            <textarea name="keywords" rows={4} defaultValue={s.keywords.split(",").join("\n")} className={textareaClass} placeholder={"chào hỏi\nlắng nghe\nkhách hàng"} />
          </Field>
          <Field label="Sửa chữ nghe sai" hint={'Mỗi dòng "chữ máy nghe => chữ đúng", cùng số tiếng.'}>
            <textarea name="corrections" rows={4} defaultValue={s.corrections} className={textareaClass} placeholder={"thái độc => thải độc\ncân ngặn => cân nặng"} />
          </Field>
        </div>
        <Field label="Nhạc nền" hint="Chỉ bài có giấy phép. Nhạc tự hạ khi có tiếng nói.">
          <select name="musicUploadId" defaultValue={s.musicUploadId} className={inputClass}>
            <option value="">Tự chọn theo nội dung (chỉ bài đã duyệt trong Thư viện nhạc nền)</option>
            <option value="none">Không dùng nhạc</option>
            {music.map((m) => <option key={m.id} value={m.id}>{String(m.meta.title || m.name)}{String(m.meta.license ?? "").trim() ? "" : " (chưa có giấy phép)"}</option>)}
          </select>
        </Field>
        <label className="flex items-start gap-2 text-[13px] text-ink">
          <input type="checkbox" name="cutSilence" defaultChecked={s.cutSilence} className="mt-0.5 h-3.5 w-3.5 accent-[var(--jade)]" />
          <span>Cắt khoảng lặng cho video mới</span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-ink">
          <input type="checkbox" name="sfx" defaultChecked={s.sfx} className="mt-0.5 h-3.5 w-3.5 accent-[var(--jade)]" />
          <span>Hiệu ứng âm thanh (tiếng “tách” ở chữ nhấn, ngân nhẹ ở chuyển cảnh lớn)</span>
        </label>
        <MoreOptions label="Bộ nhận lời">
          <Field label="Bộ nhận lời" hint="medium: cân bằng; large: chính xác hơn, chậm hơn">
            <select name="model" defaultValue={s.model} className={`${inputClass} max-w-[240px]`}><option value="small">small (nhanh)</option><option value="medium">medium</option><option value="large">large (chậm)</option></select>
          </Field>
          <p className="m-0 text-[12px] text-ink-3">Cắt lặng: lặng ≥ 0,28 s dưới −42 dB, chừa 90 ms mỗi bên. Theo {engineLabel()}.</p>
        </MoreOptions>
        <div><SubmitButton pendingText="Đang lưu…">Lưu</SubmitButton></div>
      </form>
      <div className="grid gap-3 border-t border-border px-4 py-3">
        <MoreOptions label={`Thư viện B-roll · ${usable.length}/${broll.length} clip dùng được`}>
          <p className="m-0 text-[12px] text-ink-2">Clip được chèn 2,5 giây khi lời nói nhắc đúng từ khoá, không chèn ở 3 giây đầu. Clip thiếu giấy phép hoặc từ khoá không bao giờ được dùng.</p>
          {broll.length > 0 && (
            <ul className="m-0 grid list-none gap-1 p-0 text-[12px]">
              {broll.slice(0, 12).map((b) => (
                <li key={b.file} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-ground px-2.5 py-1.5">
                  <span className="font-medium text-ink">{b.file}</span>
                  <span className="text-ink-2">{b.keywords.join(", ") || "chưa có từ khoá"}</span>
                  <Pill tone={b.exists && b.license.trim() && b.keywords.length ? "jade" : "brick"}>{!b.exists ? "thiếu tệp" : b.license.trim() ? (b.keywords.length ? "dùng được" : "thiếu từ khoá") : "chưa có giấy phép"}</Pill>
                  {b.license && <span className="text-ink-3">{b.license}</span>}
                </li>
              ))}
            </ul>
          )}
          {broll.length > 12 && <div className="text-[12px] text-ink-3">… và {broll.length - 12} mục khác trong manifest.json</div>}
          <BrollDrop />
          <div className="text-[11px] text-ink-3">Thư mục: <code className="break-all">{brollDir()}</code></div>
        </MoreOptions>
        <MoreOptions label={`Hộp thư vào · ${pending.length} tệp đang chờ`}>
          <code className="block break-all rounded-md border border-border bg-ground px-2.5 py-1.5 text-[11.5px] text-ink">{dir}</code>
          <p className="m-0 text-[12px] text-ink-3">Thả video vào thư mục này (kèm tệp .txt cùng tên chứa kịch bản nếu có): mỗi phút hệ thống nhận tệp mới vào hàng dựng.</p>
          {pending.length > 0 && <ul className="m-0 list-disc pl-4 text-[12px] text-ink">{pending.slice(0, 5).map((p) => <li key={p}>{p.split("/").pop()}</li>)}{pending.length > 5 && <li className="text-ink-3">và {pending.length - 5} tệp khác</li>}</ul>}
          <form action={runAutoEditNow}><SubmitButton variant="outline" pendingText="Đang nhận…">Nhận tệp ngay</SubmitButton></form>
        </MoreOptions>
        <MoreOptions label="Công cụ dựng trên máy này">
          <div className="flex flex-wrap gap-1.5">
            {([["ffmpeg", tools.ffmpeg], ["Python + Pillow", tools.python], ["Whisper", tools.whisper], ["OpenCV (dò mặt)", tools.opencv], ["Font phụ đề", tools.fonts]] as [string, boolean][]).map(([n, ok]) => <Pill key={n} tone={ok ? "jade" : "brick"}>{n}</Pill>)}
          </div>
          {!ready && <div className="text-[12px] text-ink-3">Cài theo scripts/video/README.md.</div>}
        </MoreOptions>
      </div>
    </Panel>
  );
}
