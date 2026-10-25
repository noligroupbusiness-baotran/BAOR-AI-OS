import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { finishRun, startRun } from "@/lib/connectors/config";
import { ingestLead } from "@/lib/inbound";
import { getLeadWebhookKey, WEBHOOK_BAD_JSON_MSG, WEBHOOK_BAD_KEY_MSG, WEBHOOK_MISSING_NAME_MSG, WEBHOOK_TOO_LARGE_MSG } from "@/lib/webhooks";
import { clientIp } from "@/lib/login-guard";
import { RATE_RULES, limitOr429 } from "@/lib/rate-limit";

const MAX_BODY = 64 * 1024; // 64 KB là quá đủ cho một lead

// Webhook nhận lead từ form website / landing page / Zapier.
// POST https://<tên miền>/api/webhooks/lead  header: x-baor-key: <khóa trong Cài đặt>
// body JSON: { name, phone?, email?, message?, source?, platform?, campaign?, goal?, tags? }
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = limitOr429(`webhook:${clientIp((n) => req.headers.get(n))}`, RATE_RULES.webhook);
  if (limited) return limited;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "payload quá lớn" }, { status: 413 });
  const key = getLeadWebhookKey();
  const got = req.headers.get("x-baor-key") ?? "";
  const ok = got.length === key.length && timingSafeEqual(Buffer.from(got), Buffer.from(key));
  const runId = startRun("website", "webhook");
  if (!ok) {
    finishRun(runId, false, WEBHOOK_BAD_KEY_MSG);
    return NextResponse.json({ error: "khóa không đúng" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) {
      // Run đã mở ở trên: đóng (lỗi dữ liệu của gói này), không để run mở mãi
      finishRun(runId, false, WEBHOOK_TOO_LARGE_MSG);
      return NextResponse.json({ error: "payload quá lớn" }, { status: 413 });
    }
    body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not object");
  } catch {
    finishRun(runId, false, WEBHOOK_BAD_JSON_MSG);
    return NextResponse.json({ error: "payload" }, { status: 400 });
  }
  const s = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  const name = s(body.name, 200).trim();
  if (!name) {
    finishRun(runId, false, WEBHOOK_MISSING_NAME_MSG);
    return NextResponse.json({ error: "thiếu name" }, { status: 400 });
  }
  const lead = ingestLead({
    name,
    phone: body.phone ? s(body.phone, 40) : undefined,
    email: body.email ? s(body.email, 200) : undefined,
    message: body.message ? s(body.message, 4000) : "",
    source: body.source ? s(body.source, 60) : "manual",
    platform: body.platform ? s(body.platform, 40) : "facebook",
    campaignId: body.campaign ? s(body.campaign, 60) : undefined,
    channelGoalId: body.goal ? s(body.goal, 60) : undefined,
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t) => s(t, 40)) : [],
  });
  finishRun(runId, true, `Tạo lead ${lead.name}.`, 1);
  return NextResponse.json({ ok: true, leadId: lead.id });
}
