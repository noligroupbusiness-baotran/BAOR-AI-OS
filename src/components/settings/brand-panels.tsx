import { BellRing, ImageIcon, MessageSquareQuote, Music, Palette, SwatchBook, TriangleAlert } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { saveBrand } from "@/lib/actions/settings";
import { deleteMusic, removeAppLogo, saveAlerts, saveAppLogo, saveBrandIdentity, testAlert, uploadMusic } from "@/lib/actions/media";
import { getBrand } from "@/lib/queries";
import { getSetting } from "@/lib/admin";
import { fileUrl, getUpload, listUploads } from "@/lib/uploads";
import { alertConfig } from "@/lib/alerts";
import { listRuns } from "@/lib/connectors/config";
import { formatDateTime, cn } from "@/lib/format";
import { MoreOptions, SettingItem, SettingList } from "./setting-item";

const fileInputClass = "block w-full text-[12.5px] text-ink-2 file:mr-2 file:rounded-full file:border file:border-border-2 file:bg-surface file:px-2.5 file:py-1 file:text-[12px] file:text-ink";

// Cài đặt › Thương hiệu › Logo trong app: chỉ dùng cho góc trái sidebar/topbar của hệ thống này.
// Không liên quan tới logo in lên ảnh/video. Mỗi nền một tệp riêng.
export function AppLogoItem() {
  const lightId = getSetting("ui.logoLightUploadId") ?? "";
  const light = lightId ? getUpload(lightId) : undefined;
  const darkId = getSetting("ui.logoDarkUploadId") ?? "";
  const dark = darkId ? getUpload(darkId) : undefined;
  return (
    <SettingItem id="app-logo" title="Logo trong app" badge={light || dark ? <Pill tone="jade">Đã có</Pill> : <Pill>Chưa có</Pill>} icon={ImageIcon} tone="orange" action="Sửa">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-3">Chỉ dùng trong giao diện app<InfoTip label="Logo trong app dùng ở đâu">Logo ở góc trên bên trái hệ thống — không dùng cho ảnh, video.</InfoTip></div>
      <form action={saveAppLogo} className="grid gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-[#f5f2ea] p-1">
            {light ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(light.id)} alt="Logo cho nền sáng" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[11px] text-[#5e655f]">Chưa có</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Field label="Nền sáng (chữ tối)" hint="PNG/SVG/WebP nền trong suốt, tối đa 3 MB."><input type="file" name="logoLight" accept="image/png,image/jpeg,image/svg+xml,image/webp" className={fileInputClass} /></Field>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-[#121713] p-1">
            {dark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(dark.id)} alt="Logo cho nền tối" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[11px] text-[#aab2ab]">Chưa có</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Field label="Nền tối (chữ sáng)" hint="Bỏ trống thì dùng logo nền sáng cho cả hai."><input type="file" name="logoDark" accept="image/png,image/jpeg,image/svg+xml,image/webp" className={fileInputClass} /></Field>
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><SubmitButton pendingText="Đang tải lên…">Lưu logo</SubmitButton></div>
      </form>
      {(light || dark) && (
        <div className="flex gap-2">
          {light && <form action={removeAppLogo}><input type="hidden" name="variant" value="light" /><Button type="submit" variant="ghost">Gỡ logo nền sáng</Button></form>}
          {dark && <form action={removeAppLogo}><input type="hidden" name="variant" value="dark" /><Button type="submit" variant="ghost">Gỡ logo nền tối</Button></form>}
        </div>
      )}
    </SettingItem>
  );
}

// Cài đặt › Thương hiệu: giọng văn + nhận diện (màu, font, khẩu hiệu) cho nội dung, ảnh và video do AI/Agent tạo.
export function BrandPanel() {
  const brand = getBrand();
  const primary = getSetting("brand.primaryColor") || "#1e7a4b";
  const secondary = getSetting("brand.secondaryColor") || "#b7791f";
  const font = getSetting("brand.font") || "";
  const tagline = getSetting("brand.tagline") || "";
  const input = `${inputClass}`;
  return (
    <Panel id="brand">
      <PanelHeader title="Thương hiệu" sub="Giọng văn, màu, logo" icon={Palette} tone="orange" info="Giọng văn để AI viết; màu, font, khẩu hiệu để dựng ảnh và video." />
      <SettingList>
        <SettingItem title="Giọng văn" badge={brand.voice.trim() ? <Pill tone="jade">Đã có</Pill> : <Pill tone="amber">Chưa có</Pill>} summary={brand.name || undefined} icon={MessageSquareQuote} tone="orange" action="Sửa">
          <form action={saveBrand} className="grid gap-3">
            <Field label="Tên thương hiệu"><input name="name" defaultValue={brand.name} className={input} placeholder="VD: Mộc Diệp Spa" /></Field>
            <Field label="Lĩnh vực / dịch vụ chính" hint="Chỉ để AI hiểu bối cảnh (không chào bán, không báo giá)."><input name="products" defaultValue={brand.products} className={input} /></Field>
            <Field label="Giọng văn"><textarea name="voice" rows={3} defaultValue={brand.voice} className={textareaClass} /></Field>
            <div><SubmitButton>Lưu</SubmitButton></div>
          </form>
        </SettingItem>
        <SettingItem
          title="Màu, font, khẩu hiệu"
          icon={SwatchBook}
          tone="orange"
          action="Sửa"
          summary={
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: primary }} />
              <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: secondary }} />
              {font || "chưa chọn font"}
            </span>
          }
        >
          <form action={saveBrandIdentity} className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Màu chính"><div className="flex items-center gap-2"><input type="color" name="primaryColor" defaultValue={primary} className="h-8 w-12 cursor-pointer rounded border border-border-2 bg-surface" /><span className="num text-[12px] text-ink-2">{primary}</span></div></Field>
              <Field label="Màu phụ"><div className="flex items-center gap-2"><input type="color" name="secondaryColor" defaultValue={secondary} className="h-8 w-12 cursor-pointer rounded border border-border-2 bg-surface" /><span className="num text-[12px] text-ink-2">{secondary}</span></div></Field>
            </div>
            <Field label="Font chữ" hint="Dùng trên ảnh và phụ đề video (VD: Be Vietnam Pro)."><input name="font" defaultValue={font} className={input} placeholder="Be Vietnam Pro" /></Field>
            <Field label="Câu khẩu hiệu"><input name="tagline" defaultValue={tagline} className={input} placeholder="VD: Thư giãn đúng nghĩa sau giờ làm" /></Field>
            <div><SubmitButton pendingText="Đang lưu…">Lưu</SubmitButton></div>
          </form>
        </SettingItem>
      </SettingList>
    </Panel>
  );
}

// Cài đặt › Kho nhạc: Agent Edit Video chỉ được dùng nhạc trong kho (có ghi bản quyền).
export function MusicPanel() {
  const tracks = listUploads("music");
  return (
    <Panel id="music">
      <PanelHeader title="Nhạc anh tải lên" sub="Nhạc anh có quyền dùng" icon={Music} tone="pink" info="Bài anh tự có (đã mua / có quyền dùng). Ghi rõ nguồn để tránh bị gỡ video." />
      <form action={uploadMusic} className="grid gap-3 border-b border-border bg-ground px-4 py-3 md:grid-cols-4">
        <Field label="Tệp nhạc" hint="MP3 / WAV / AAC ≤ 25 MB" className="md:col-span-2"><input type="file" name="file" required accept="audio/*" className="block w-full text-[12.5px] text-ink-2 file:mr-2 file:rounded-full file:border file:border-border-2 file:bg-surface file:px-2.5 file:py-1 file:text-[12px] file:text-ink" /></Field>
        <Field label="Tên hiển thị"><input name="title" className={inputClass} placeholder="VD: Nhẹ nhàng buổi sáng" /></Field>
        <Field label="Tâm trạng">
          <select name="mood" defaultValue="chung" className={inputClass}>
            {["chung", "nhẹ nhàng", "sôi động", "cảm xúc", "sang trọng", "hài hước"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Nguồn / bản quyền" className="md:col-span-3"><input name="license" className={inputClass} placeholder="VD: Mua trên Epidemic Sound, giấy phép đến 12/2027" /></Field>
        <div className="flex items-end"><SubmitButton pendingText="Đang tải…">Thêm vào kho</SubmitButton></div>
      </form>
      {tracks.length === 0 ? (
        <EmptyState title="Kho nhạc trống" />
      ) : (
        <ul className="m-0 list-none p-0">
          {tracks.map((t) => (
            <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{String(t.meta.title || t.name)}</span><Pill>{String(t.meta.mood || "chung")}</Pill><span className="num text-[11px] text-ink-3">{Math.round(t.size / 1024 / 1024 * 10) / 10} MB</span></div>
                <div className="text-[12px] text-ink-2">{t.meta.license ? String(t.meta.license) : <span className="text-amber">Chưa ghi nguồn</span>} · {formatDateTime(t.createdAt)}</div>
                <audio controls preload="none" src={fileUrl(t.id)} className="mt-1.5 h-8 w-full max-w-[420px]" aria-label={`Nghe thử ${String(t.meta.title || t.name)}`} />
              </div>
              <form action={deleteMusic}><input type="hidden" name="id" value={t.id} /><Button type="submit" variant="ghost">Xóa</Button></form>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Cài đặt › Cảnh báo ra ngoài: webhook nhận JSON khi có lỗi đăng bài, đồng bộ, AI chạm trần.
export function AlertsPanel() {
  const cfg = alertConfig();
  const recent = listRuns(30).filter((r) => r.kind === "alert").slice(0, 5);
  return (
    <Panel id="alerts">
      <PanelHeader
        title="Báo lỗi ra ngoài"
        sub="Zalo bot / Discord / Slack"
        icon={BellRing}
        tone="yellow"
        info={<>Gửi cảnh báo tới Zalo bot / Discord / Slack… khi đăng bài, đồng bộ lỗi hoặc AI chạm trần. Để trống: chỉ báo trong app.<br />Webhook nhận JSON: {"{source, level, title, text, href, at, content}"}.</>}
      />
      <form action={saveAlerts} className="grid gap-3 p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
        <Field label="Địa chỉ webhook"><input name="webhookUrl" defaultValue={cfg.webhookUrl} className={inputClass} placeholder="https://hooks.example.com/..." /></Field>
        <Field label="Mức tối thiểu">
          <select name="minLevel" defaultValue={cfg.minLevel} className={inputClass}>
            <option value="error">Chỉ lỗi</option>
            <option value="warn">Cảnh báo và lỗi</option>
            <option value="info">Mọi thông báo</option>
          </select>
        </Field>
        <div className="flex gap-2"><SubmitButton>Lưu</SubmitButton></div>
      </form>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5">
        <form action={testAlert}><SubmitButton variant="soft" pendingText="Đang gửi…">Gửi cảnh báo thử</SubmitButton></form>
        {!cfg.webhookUrl && <Pill><TriangleAlert size={11} aria-hidden />Chỉ ghi nhật ký</Pill>}
      </div>
      {recent.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <MoreOptions label={`Lần gửi gần đây (${recent.length})`}>
            <ul className="m-0 list-none rounded-md border border-border p-0">
              {recent.map((r) => (
                <li key={r.id} className={cn("flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-[12px] last:border-b-0", !r.ok && "text-brick")}><Pill tone={r.ok ? "jade" : "brick"}>{r.ok ? "đã gửi" : "lỗi"}</Pill><span className="text-ink">{r.message}</span><span className="num ml-auto text-ink-3">{formatDateTime(r.startedAt)}</span></li>
              ))}
            </ul>
          </MoreOptions>
        </div>
      )}
    </Panel>
  );
}
