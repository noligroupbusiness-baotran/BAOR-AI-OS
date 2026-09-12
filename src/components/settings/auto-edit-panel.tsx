import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { runAutoEditNow, saveAutoEdit } from "@/lib/actions/media";
import { autoEditSettings, inboxDir, pendingInbox, toolCheck } from "@/lib/video/auto-edit";
import { listUploads } from "@/lib/uploads";

// Cài đặt › Dựng video tự động: thả clip quay thô vào hộp thư vào, Agent Edit Video dựng theo luật, không AI sinh nội dung.
export function AutoEditPanel() {
  const s = autoEditSettings();
  const tools = toolCheck();
  const pending = pendingInbox();
  const music = listUploads("music");
  const dir = inboxDir();
  const ready = tools.ffmpeg && tools.magick && tools.python && tools.whisper;
  return (
    <Panel id="auto-edit">
      <PanelHeader
        title="Dựng video tự động"
        sub="Thả clip quay thô (.mov, .mp4) vào hộp thư vào. Mỗi phút bộ chạy nền lấy một tệp: chuyển lời nói thành chữ tại máy chủ, cắt khoảng lặng, phụ đề nhấn từ khóa, logo, nhạc nền, rồi đưa vào Video Studio › Chờ kiểm tra. Toàn bộ theo luật, không gọi AI."
        action={<Pill tone={ready ? "jade" : "amber"}>{ready ? "Công cụ sẵn sàng" : "Thiếu công cụ"}</Pill>}
      />
      <div className="grid gap-0 md:grid-cols-[1fr_320px]">
        <form action={saveAutoEdit} className="grid gap-3 border-b border-border p-4 md:border-b-0 md:border-r">
          <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-3.5 w-3.5 accent-jade" /> Bật dựng tự động từ hộp thư vào</label>
          <Field label="Từ khóa nhấn" hint="Mỗi dòng hoặc cách nhau bằng dấu phẩy. Số, năm, phần trăm luôn được nhấn. Càng đúng từ thương hiệu, phụ đề càng giống video mẫu.">
            <textarea name="keywords" rows={4} defaultValue={s.keywords.split(",").join("\n")} className={textareaClass} placeholder={"chi phí\ntiết kiệm\nGội dưỡng sinh\nMộc Diệp Spa"} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Màu nhấn" hint="Trống = màu phụ thương hiệu"><input name="accent" defaultValue={s.accent ? `#${s.accent}` : ""} placeholder="#F2C94C" className={inputClass} /></Field>
            <Field label="Vị trí chữ" hint="0.6 = giữa dưới mặt, 0.75 = thấp hơn"><input name="captionY" type="number" step="0.05" min="0.3" max="0.9" defaultValue={s.captionY} className={inputClass} /></Field>
            <Field label="Bộ nhận dạng" hint="medium: cân bằng; large: chính xác hơn, chậm hơn">
              <select name="model" defaultValue={s.model} className={inputClass}><option value="small">small (nhanh)</option><option value="medium">medium</option><option value="large">large (chậm)</option></select>
            </Field>
          </div>
          <Field label="Nhạc nền" hint="Chọn từ Kho nhạc; tự hạ âm khi có tiếng nói.">
            <select name="musicUploadId" defaultValue={s.musicUploadId} className={inputClass}>
              <option value="">Không dùng nhạc</option>
              {music.map((m) => <option key={m.id} value={m.id}>{String(m.meta.title || m.name)}</option>)}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2"><SubmitButton pendingText="Đang lưu…">Lưu cấu hình</SubmitButton></div>
        </form>
        <div className="grid content-start gap-3 p-4 text-[12.5px]">
          <div>
            <div className="lbl">Hộp thư vào</div>
            <code className="mt-1 block break-all rounded-md border border-border bg-ground px-2.5 py-1.5 text-[11.5px] text-ink">{dir}</code>
            <div className="mt-1 text-ink-3">Tệp cùng tên đuôi .txt (tùy chọn) chứa kịch bản hoặc từ chuyên ngành để nhận dạng đúng hơn. Tệp xong chuyển vào <span className="num">da-xu-ly</span>, tệp lỗi vào <span className="num">loi</span>.</div>
          </div>
          <div>
            <div className="lbl">Đang chờ</div>
            {pending.length === 0 ? <div className="mt-1 text-ink-2">Không có tệp nào.</div> : <ul className="mt-1 m-0 list-disc pl-4 text-ink">{pending.slice(0, 5).map((p) => <li key={p}>{p.split("/").pop()}</li>)}{pending.length > 5 && <li className="text-ink-3">và {pending.length - 5} tệp khác</li>}</ul>}
            <form action={runAutoEditNow} className="mt-2"><SubmitButton variant="outline" pendingText="Đang dựng, có thể mất vài phút…">Dựng tệp đầu tiên ngay</SubmitButton></form>
          </div>
          <div>
            <div className="lbl">Công cụ trên máy chủ</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {([["ffmpeg", tools.ffmpeg], ["ImageMagick", tools.magick], ["Python 3", tools.python], ["Whisper", tools.whisper]] as [string, boolean][]).map(([n, ok]) => <Pill key={n} tone={ok ? "jade" : "brick"}>{n}</Pill>)}
            </div>
            {!ready && <div className="mt-1 text-ink-3">Cài: <span className="num">brew install ffmpeg imagemagick</span> và <span className="num">pip3 install openai-whisper</span> (Docker: xem scripts/video/README.md).</div>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
