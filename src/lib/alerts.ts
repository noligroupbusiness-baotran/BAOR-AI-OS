// Cảnh báo ra ngoài hệ thống: gửi JSON tới một webhook do quản trị đặt (Zalo bot, Discord, Slack, n8n...).
// Không có địa chỉ thì chỉ ghi nhật ký. Mọi lần gửi đều vào sync_runs (kind = alert).
import { getSetting } from "@/lib/admin";
import { finishRun, startRun } from "@/lib/connectors/config";
import { logActivity } from "@/lib/activity";

export type AlertLevel = "info" | "warn" | "error";

export interface AlertPayload {
  level: AlertLevel;
  title: string;
  text: string;
  href?: string;
}

export function alertConfig() {
  return { webhookUrl: getSetting("alerts.webhookUrl") ?? "", minLevel: (getSetting("alerts.minLevel") as AlertLevel | undefined) ?? "error" };
}

const rank: Record<AlertLevel, number> = { info: 0, warn: 1, error: 2 };

export async function sendAlert(a: AlertPayload): Promise<{ sent: boolean; message: string }> {
  const cfg = alertConfig();
  logActivity("system", `[${a.level}] ${a.title}: ${a.text}`, "alerts");
  if (!cfg.webhookUrl) return { sent: false, message: "Chưa đặt địa chỉ webhook cảnh báo." };
  if (rank[a.level] < rank[cfg.minLevel]) return { sent: false, message: `Mức ${a.level} dưới ngưỡng gửi (${cfg.minLevel}).` };
  const runId = startRun("alerts", "alert");
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "BAOR AI OS", level: a.level, title: a.title, text: a.text, href: a.href ?? null, at: new Date().toISOString(), content: `[${a.level.toUpperCase()}] ${a.title}\n${a.text}${a.href ? `\n${a.href}` : ""}` }),
      signal: AbortSignal.timeout(10_000),
    });
    const ok = res.ok;
    finishRun(runId, ok, ok ? `Đã gửi: ${a.title}` : `Webhook trả ${res.status}`, 1);
    return { sent: ok, message: ok ? "Đã gửi cảnh báo." : `Webhook trả mã ${res.status}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    finishRun(runId, false, msg);
    return { sent: false, message: `Không gửi được: ${msg}` };
  }
}
