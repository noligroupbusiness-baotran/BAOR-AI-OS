import { NextResponse, type NextRequest } from "next/server";
import { readIntegrationConfig, finishRun, startRun } from "@/lib/connectors/config";
import { parseMessengerWebhook, verifyMetaSignature } from "@/lib/connectors/meta";
import { ingestInboundMessages } from "@/lib/inbound";
import { getMetaVerifyToken } from "@/lib/webhooks";

// Webhook Meta (Messenger). Địa chỉ đăng ký trong Meta App: https://<tên miền>/api/webhooks/meta
// GET: Meta xác minh bằng verify token (hiện trong Cài đặt › Kết nối). POST: tin nhắn khách, có chữ ký.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === getMetaVerifyToken()) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verify token không khớp" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const { appSecret } = readIntegrationConfig("facebook_page");
  const runId = startRun("facebook_page", "webhook");
  if (!verifyMetaSignature(appSecret ?? "", raw, req.headers.get("x-hub-signature-256"))) {
    finishRun(runId, false, "Chữ ký webhook không hợp lệ (kiểm tra App Secret).");
    return NextResponse.json({ error: "chữ ký không hợp lệ" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    finishRun(runId, false, "Payload không phải JSON.");
    return NextResponse.json({ error: "payload" }, { status: 400 });
  }
  const messages = parseMessengerWebhook(body);
  const n = ingestInboundMessages(messages);
  finishRun(runId, true, `Nhận ${messages.length} tin, tạo/cập nhật ${n} hội thoại.`, n);
  return NextResponse.json({ ok: true, received: messages.length });
}
