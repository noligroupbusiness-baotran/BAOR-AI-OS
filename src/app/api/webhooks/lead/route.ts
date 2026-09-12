import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { finishRun, startRun } from "@/lib/connectors/config";
import { ingestLead } from "@/lib/inbound";
import { getLeadWebhookKey } from "@/lib/webhooks";

// Webhook nhận lead từ form website / landing page / Zapier.
// POST https://<tên miền>/api/webhooks/lead  header: x-baor-key: <khóa trong Cài đặt>
// body JSON: { name, phone?, email?, message?, source?, platform?, campaign?, goal?, tags? }
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = getLeadWebhookKey();
  const got = req.headers.get("x-baor-key") ?? "";
  const ok = got.length === key.length && timingSafeEqual(Buffer.from(got), Buffer.from(key));
  const runId = startRun("website", "webhook");
  if (!ok) {
    finishRun(runId, false, "Khóa webhook không đúng.");
    return NextResponse.json({ error: "khóa không đúng" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    finishRun(runId, false, "Payload không phải JSON.");
    return NextResponse.json({ error: "payload" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  if (!name) {
    finishRun(runId, false, "Thiếu tên khách.");
    return NextResponse.json({ error: "thiếu name" }, { status: 400 });
  }
  const lead = ingestLead({
    name,
    phone: body.phone ? String(body.phone) : undefined,
    email: body.email ? String(body.email) : undefined,
    message: body.message ? String(body.message) : "",
    source: body.source ? String(body.source) : "manual",
    platform: body.platform ? String(body.platform) : "facebook",
    campaignId: body.campaign ? String(body.campaign) : undefined,
    channelGoalId: body.goal ? String(body.goal) : undefined,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
  });
  finishRun(runId, true, `Tạo lead ${lead.name}.`, 1);
  return NextResponse.json({ ok: true, leadId: lead.id });
}
