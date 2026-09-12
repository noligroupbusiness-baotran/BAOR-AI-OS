import { Panel, PanelHeader } from "@/components/ui/card";
import { ListFilter } from "@/components/ui/list-filter";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { listFaqs, type Faq } from "@/lib/automation/repository";
import { saveFaqAction, toggleFaqAction } from "@/lib/actions/automation";
import { cn } from "@/lib/format";

// Cài đặt › Câu trả lời chuẩn: nguồn để làn luật trả lời khách mà không gọi AI. ?faq=new | ?faq=<id>.
export function FaqPanel({ editing }: { editing?: string }) {
  const items = listFaqs(true);
  const current = editing && editing !== "new" ? items.find((f) => f.id === editing) : undefined;
  return (
    <Panel id="faq">
      <PanelHeader
        title="Câu trả lời chuẩn cho khách"
        sub="Tin nhắn chứa đủ các từ khóa của một câu sẽ được trả lời ngay bằng câu đã duyệt, không gọi AI. Càng nhiều câu chuẩn, càng ít chi phí AI."
        action={<div className="flex items-center gap-2">{items.length > 5 && <ListFilter target="faq" placeholder="Lọc câu hỏi, từ khóa…" />}{editing !== "new" && <LinkButton href="/settings?faq=new#faq" variant="primary">Thêm câu trả lời</LinkButton>}</div>}
      />
      {editing === "new" && <FaqForm />}
      {items.length === 0 && editing !== "new" ? (
        <EmptyState title="Chưa có câu trả lời chuẩn" hint="Thêm giờ mở cửa, địa chỉ, chính sách đổi trả… để hệ thống trả lời tự động." />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((f) => (
            <li key={f.id} data-search={`${f.question} ${f.keywords.join(" ")} ${f.answer}`} className={cn("border-b border-border last:border-b-0", current?.id === f.id && "bg-jade-soft/20")}>
              <div className="grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-semibold", f.active ? "text-ink" : "text-ink-3 line-through")}>{f.question}</span>
                    {f.keywords.map((k) => <Pill key={k}>{k}</Pill>)}
                    <span className="num text-[11px] text-ink-3">{f.hits} lần dùng</span>
                    {!f.active && <Pill>Đang tắt</Pill>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{f.answer}</p>
                </div>
                <div className="flex gap-1.5">
                  {current?.id !== f.id && <LinkButton href={`/settings?faq=${f.id}#faq`}>Sửa</LinkButton>}
                  <form action={toggleFaqAction}><input type="hidden" name="id" value={f.id} /><Button type="submit" variant="ghost">{f.active ? "Tắt" : "Bật"}</Button></form>
                </div>
              </div>
              {current?.id === f.id && <FaqForm faq={current} />}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FaqForm({ faq }: { faq?: Faq }) {
  return (
    <form action={saveFaqAction} className="grid gap-3 border-t border-border bg-ground px-4 py-3 md:grid-cols-2">
      {faq && <input type="hidden" name="id" value={faq.id} />}
      <Field label="Câu hỏi (tên gợi nhớ)" required><input name="question" required defaultValue={faq?.question ?? ""} className={inputClass} placeholder="VD: Giờ mở cửa" /></Field>
      <Field label="Từ khóa nhận diện (phân cách bằng dấu phẩy)" required hint="Tin nhắn phải chứa đủ mọi từ khóa (không phân biệt dấu). Dùng cụm ngắn: “mở cửa”, “đặt lịch”."><input name="keywords" required defaultValue={faq?.keywords.join(", ") ?? ""} className={inputClass} placeholder="mở cửa, mấy giờ" /></Field>
      <Field label="Câu trả lời" required className="md:col-span-2"><textarea name="answer" required rows={3} defaultValue={faq?.answer ?? ""} className={textareaClass} placeholder="Viết theo giọng thương hiệu, kết bằng lời mời để lại số điện thoại." /></Field>
      <div className="flex gap-2 md:col-span-2">
        <SubmitButton pendingText="Đang lưu…">{faq ? "Lưu thay đổi" : "Thêm câu trả lời"}</SubmitButton>
        <LinkButton href="/settings#faq" variant="ghost">Hủy</LinkButton>
      </div>
    </form>
  );
}
