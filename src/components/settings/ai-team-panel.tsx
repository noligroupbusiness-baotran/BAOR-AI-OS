import Link from "next/link";
import { Panel, PanelHeader, Rows } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { saveAiRole } from "@/lib/actions/settings";
import { AI_ROLES, CLAUDE_MODELS, roleSettings } from "@/lib/ai-roster";

// Cài đặt › Đội AI: mỗi vị trí 1 AI — công tắc "Cho phép gọi AI", mô hình, trần chi phí riêng / tháng.
export function AiTeamPanel() {
  return (
    <Panel id="ai-team">
      <PanelHeader
        title="Đội AI — mỗi vị trí một AI"
        sub="Việc logic chạy theo quy trình, không gọi AI. Việc cần suy nghĩ mới gọi AI của đúng vị trí. Tắt “Cho phép gọi AI” thì vị trí đó chỉ làm phần theo luật. Trần riêng 0 = chỉ dùng trần chung."
        action={<Link href="/reports?tab=ai" className="text-[12.5px] font-semibold text-accent">Báo cáo chi phí AI ›</Link>}
      />
      <Rows>
        {AI_ROLES.map((role) => {
          const s = roleSettings(role);
          return (
            <li key={role.id} className="px-4 py-3">
              <form action={saveAiRole} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <input type="hidden" name="role" value={role.id} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{role.name}</span>
                    <Pill tone="neutral">Bước {role.step}</Pill>
                    {role.local && <Pill tone="jade">Tại máy · ₫0</Pill>}
                    {role.pending && <Pill tone="amber">Chưa nối · đang theo luật</Pill>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-2">{role.job}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex items-center gap-1.5 pb-2 text-[12.5px] text-ink">
                    <input type="checkbox" name="enabled" defaultChecked={s.enabled} aria-label={`Cho phép gọi AI — ${role.name}`} />
                    Cho phép gọi AI
                  </label>
                  <Field label="Mô hình">
                    {role.local ? (
                      <input value={s.model} readOnly className={`${inputClass} w-[180px] text-ink-3`} />
                    ) : (
                      <select name="model" defaultValue={s.model} className={`${inputClass} w-[180px]`}>
                        {CLAUDE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label="Trần riêng / tháng (₫)">
                    <input name="monthlyCapVnd" inputMode="numeric" defaultValue={s.monthlyCapVnd} className={`${inputClass} w-[130px]`} />
                  </Field>
                  <SubmitButton>Lưu</SubmitButton>
                </div>
              </form>
            </li>
          );
        })}
      </Rows>
    </Panel>
  );
}
