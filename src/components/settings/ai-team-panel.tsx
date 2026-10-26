import { Bot, Users } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Field, inputClass } from "@/components/ui/field";
import { VndCapInput } from "@/components/ui/vnd-cap-input";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { saveAiRole } from "@/lib/actions/settings";
import { AI_ROLES, roleSettings } from "@/lib/ai-roster";
import { AI_MODELS, PROVIDERS, modelInfo, providerConfigured, vndPerUsd, type AiProvider } from "@/lib/ai-providers";
import { formatCurrency } from "@/lib/format";
import { displayStepOf } from "@/config/journey";
import { SettingItem, SettingList } from "./setting-item";

// Cài đặt › Đội AI: mỗi vị trí 1 AI — một dòng "Bật / Tắt · mô hình · trần"; bấm mới chỉnh công tắc, mô hình, trần riêng / tháng.
export function AiTeamPanel() {
  const rate = vndPerUsd();
  return (
    <Panel id="ai-team">
      <PanelHeader title="Đội AI" sub="Mỗi bước một AI" icon={Users} tone="violet" info="Mỗi bước một AI — chọn Claude, ChatGPT hoặc Grok. Tắt thì bước đó chỉ chạy theo luật, không tốn tiền AI." />
      <SettingList>
        {/* Vị trí chưa có chỗ gọi (AI Quảng cáo — quảng cáo đang tự dừng / tăng theo luật) ẩn tới khi nối (OWNER 26/10) */}
        {AI_ROLES.filter((role) => !role.pending).map((role) => {
          const s = roleSettings(role);
          const info = modelInfo(s.model);
          const model = role.local ? "tại máy · ₫0" : info?.label ?? s.model;
          const noKey = !role.local && info && !providerConfigured(info.provider);
          return (
            <SettingItem
              key={role.id}
              title={role.name}
              icon={Bot}
              tone="violet"
              action="Sửa"
              badge={role.pending ? <Pill tone="amber">Chưa nối</Pill> : !s.enabled ? <Pill>Tắt</Pill> : noKey ? <Pill tone="amber">Thiếu khoá {PROVIDERS[info.provider].label}</Pill> : <Pill tone="jade">Bật</Pill>}
              summary={`Bước ${displayStepOf(role.step)} · ${model}${s.monthlyCapVnd ? ` · trần ${formatCurrency(s.monthlyCapVnd)}/tháng` : ""}`}
            >
              <p className="m-0 text-[12px] text-ink-2">{role.job}{role.pending ? " — chưa có chỗ nào gọi AI này, đang chạy theo luật." : ""}</p>
              <form action={saveAiRole} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="role" value={role.id} />
                <label className="flex items-center gap-2 pb-2 text-[12.5px] text-ink">
                  <input type="checkbox" role="switch" name="enabled" defaultChecked={s.enabled} aria-label={`Cho phép gọi AI — ${role.name}`} className="switch" />
                  Bật AI
                </label>
                <Field label="Mô hình">
                  {role.local ? (
                    <input value={s.model} readOnly className={`${inputClass} w-[180px] text-ink-3`} />
                  ) : (
                    <select name="model" defaultValue={s.model} className={`${inputClass} w-[240px]`}>
                      {(Object.keys(PROVIDERS) as AiProvider[]).map((p) => (
                        <optgroup key={p} label={`${PROVIDERS[p].label}${providerConfigured(p) ? "" : " — chưa có khoá"}`}>
                          {AI_MODELS.filter((m) => m.provider === p).map((m) => <option key={m.id} value={m.id}>{m.label} · ${m.usdIn}/${m.usdOut} mỗi 1M token</option>)}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Trần / tháng">
                  <VndCapInput name="monthlyCapVnd" defaultValue={s.monthlyCapVnd} rate={rate} emptyHint="0 = trần chung" className="w-[130px]" />
                </Field>
                <SubmitButton>Lưu</SubmitButton>
              </form>
            </SettingItem>
          );
        })}
      </SettingList>
    </Panel>
  );
}
