// Chống gửi chéo trang cho các route nhận tệp (loại khỏi proxy): chỉ nhận yêu cầu có Origin trùng host của chính hệ thống.
// Origin thiếu / "null" (trang sandbox, file://) / sai dạng → false (route trả 403), không ném lỗi thành 500.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || origin === "null") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
