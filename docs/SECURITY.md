# Bảo mật BAOR AI OS

Tài liệu vận hành bảo mật: các lớp bảo vệ đang có, cách dùng, và việc phải làm khi có sự cố.
Mã nguồn liên quan nằm ở `src/lib/{session-token,auth,security,totp,rate-limit,password-policy,login-guard,secrets,permissions,env-check}.ts`.

## 1. Mô hình đe dọa (ngắn)

| Rủi ro | Lớp chặn |
| --- | --- |
| Dò mật khẩu | Khóa 5 lần sai / 15 phút theo email và IP; giới hạn 30 lượt đăng nhập / 10 phút theo IP; chính sách mật khẩu 10 ký tự |
| Lộ mật khẩu (phishing, dùng lại) | Xác thực hai lớp TOTP + 10 mã dự phòng; bắt buộc nên bật với Quản trị và Quản lý |
| Cookie phiên bị đánh cắp | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` trên production, hạn 7 ngày; thu hồi tức thì khi đổi mật khẩu, "Đăng xuất mọi thiết bị", ngừng nhân sự, đổi quyền |
| Nhân viên vượt quyền | Mọi Server Action có guard (test tĩnh `tests/action-guards.test.ts` chặn hàm thiếu guard); xuất CSV cần Quản lý; tải sao lưu cần Quản trị |
| Lộ CSDL / sao lưu | Mật khẩu băm scrypt; token nền tảng, khóa TOTP mã hóa AES-256-GCM; mã dự phòng HMAC-SHA256 với khóa suy từ `AUTH_SECRET` (không nằm trong CSDL) |
| Webhook giả mạo / spam | Meta: chữ ký `x-hub-signature-256`; lead: khóa `x-baor-key` so sánh hằng thời gian; giới hạn 120 lượt / phút / IP; thân yêu cầu tối đa 1 MB (Meta) / 64 KB (lead); cắt độ dài từng trường |
| XSS qua tệp tải lên | SVG phục vụ với CSP `sandbox`, `script-src` cấm; loại không phải ảnh/âm thanh/video ép tải về; `nosniff` |
| Clickjacking, script lạ | CSP `default-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, Referrer-Policy (xem `next.config.ts`) |
| Secret lọt vào git | `.gitignore` chặn `.env*`, `data*/`; `npm run security` quét mẫu khóa API / token / private key trên tệp đã theo dõi và chặn gate |
| Thư viện có lỗ hổng | `npm run security` chạy `npm audit --audit-level=high` trên dependency chạy thật |

## 2. Xác thực hai lớp (TOTP)

- Chuẩn RFC 6238, HMAC-SHA1, 6 số, 30 giây, chấp nhận lệch ±1 bước. Tương thích Google Authenticator, Authy, 1Password, Microsoft Authenticator.
- Bật ở **Tài khoản của tôi › Xác thực hai lớp**: Bắt đầu thiết lập → quét QR (hoặc nhập khóa tay) → nhập mã đầu tiên → nhận 10 mã dự phòng (chỉ hiện một lần).
- Đăng nhập: mật khẩu đúng → cookie tạm 5 phút (`baor_mfa`, chỉ có hiệu lực ở `/login`) → `/login/verify` nhập mã → cấp phiên đầy đủ. Sai mã 10 lần / 10 phút thì về bước một.
- Mỗi mã TOTP chỉ dùng một lần (lưu bước thời gian đã dùng); mã dự phòng dùng xong bị xóa.
- Tắt cần mật khẩu hiện tại và một mã hợp lệ. Tạo lại mã dự phòng cũng vậy.
- Khóa TOTP lưu mã hóa bằng khóa suy từ `AUTH_SECRET`. **Xoay `AUTH_SECRET` bằng `npm run rotate-secret` sẽ mã hóa lại token nền tảng nhưng không mã hóa lại khóa TOTP**: sau khi xoay, người dùng phải tắt và bật lại hai lớp (xem mục 6).

### Người dùng mất điện thoại và mất mã dự phòng

Quản trị vào **Cài đặt › Nhân sự**, đặt mật khẩu mới cho người đó (mọi phiên của họ bị thu hồi), rồi tắt hai lớp cho họ bằng cách sửa trực tiếp CSDL trên máy chủ (sao lưu trước):

```bash
sqlite3 data/baor.db "UPDATE security_accounts SET totp_enabled=0, totp_secret=NULL, backup_codes='[]', session_version=session_version+1 WHERE email='nguoi@baor.vn';"
```

Quên mật khẩu quản trị hoặc mất cả điện thoại lẫn mã dự phòng: dùng `scripts/reset-admin.mjs` (thuần Node, không cần tsx),
ghi mật khẩu mới dạng băm, tắt hai lớp, thu hồi mọi phiên, in mật khẩu một lần:

```bash
# máy dev
npm run reset-admin -- ten@email.vn
# VPS (chạy trong container, CSDL nằm ở volume /app/data)
cd /opt/baor-ai-os && docker compose cp scripts/reset-admin.mjs app:/tmp/reset-admin.mjs && docker compose exec app node /tmp/reset-admin.mjs ten@email.vn
```

Với chính tài khoản Quản trị bị mất cả hai: cùng lệnh trên với email quản trị, chạy trên VPS. Đây là thao tác thuộc nhóm 4 điểm cần CEO.

## 3. Phiên đăng nhập và thu hồi

- Token JWT HS256 ký bằng `AUTH_SECRET`, mang `email` và `sv` (phiên bản phiên). `proxy.ts` chỉ kiểm chữ ký và hạn (rẻ); `getCurrentUser()` so `sv` với bảng `security_accounts` — lệch là coi như chưa đăng nhập.
- Tăng `sv` (thu hồi mọi phiên) khi: đổi mật khẩu (tự đổi hoặc quản trị đặt lại), bấm "Đăng xuất mọi thiết bị", ngừng hoạt động nhân sự, đổi quyền, đổi email quản trị.
- Đổi `AUTH_SECRET` cũng làm mọi phiên hết hiệu lực.

## 4. Sự kiện bảo mật

Bảng `security_events` (riêng, không lẫn nhật ký hoạt động): đăng nhập thành công/sai/khóa, mã hai lớp sai, đăng xuất, đổi mật khẩu, bật/tắt hai lớp, tạo lại mã dự phòng, thu hồi phiên, đổi quyền, tải sao lưu, bị giới hạn tần suất. Mỗi dòng có email, IP (từ `x-forwarded-for` / `x-real-ip` do proxy đặt), chi tiết.

- Người dùng xem sự kiện của mình ở Tài khoản của tôi.
- Giữ theo `retention.auditDays` (mặc định 365 ngày), dọn cùng bộ chạy nền.
- Truy vấn nhanh trên máy chủ: `sqlite3 data/baor.db "SELECT at,email,ip,kind,detail FROM security_events ORDER BY at DESC LIMIT 50;"`

## 5. Danh sách trước khi chạy thật (CEO / hạ tầng)

1. `AUTH_SECRET` ≥ 32 ký tự ngẫu nhiên trong `.env` trên VPS (`openssl rand -hex 32`). Không dùng giá trị của máy dev.
2. `PUBLIC_URL=https://...`; Caddy/Nginx cấp HTTPS và đặt `X-Forwarded-For` / `X-Real-IP` (Caddy mặc định có).
3. Đăng nhập quản trị lần đầu bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD`, vào Tài khoản của tôi: **đổi mật khẩu** (để lưu băm trong CSDL, sau đó xóa `ADMIN_PASSWORD` khỏi `.env`) và **bật xác thực hai lớp**; cất 10 mã dự phòng ngoài máy chủ.
4. Mỗi Quản lý trong Nhân sự bật hai lớp. Mục "Tình trạng bảo mật hệ thống" ở Tài khoản của tôi (chỉ Quản trị thấy) liệt kê ai chưa bật.
5. Giám sát: trỏ UptimeRobot / cron vào `GET /api/health` (không cần đăng nhập, không trả dữ liệu nhạy cảm, 60 lượt/phút/IP).
6. Tắt `bypassPermissions` cho session Claude Code của dự án khi bắt đầu chèn dữ liệu thật (quy tắc toàn cục của CEO).
7. Cổng app chỉ mở trên `127.0.0.1` (docker-compose đã đặt); firewall VPS chỉ mở 22/80/443.

## 6. Ứng phó sự cố

| Tình huống | Làm gì |
| --- | --- |
| Nghi lộ mật khẩu một người | Cài đặt › Nhân sự: đặt mật khẩu mới (phiên bị thu hồi); yêu cầu bật hai lớp; xem `security_events` theo email |
| Nghi lộ `AUTH_SECRET` | `AUTH_SECRET_OLD=<cũ> AUTH_SECRET=<mới> npm run rotate-secret` → đặt khóa mới → khởi động lại; mọi người đăng nhập lại; ai bật hai lớp phải tắt/bật lại (khóa TOTP mã hóa bằng khóa cũ); nhập lại token nếu rotate thất bại |
| Nghi lộ token nền tảng (Meta...) | Thu hồi token trên nền tảng, nhập token mới ở Cài đặt › Kết nối |
| Nghi lộ khóa webhook lead | `sqlite3 data/baor.db "DELETE FROM settings WHERE key='webhook.leadKey';"` → hệ thống sinh khóa mới, cập nhật ở form/Zapier |
| Bị dò đăng nhập ồ ạt | Xem `security_events` kind `login_fail`, `rate_limited`; chặn IP ở Caddy/firewall; login-guard và rate limit đã tự khóa |
| Lộ bản sao lưu | Xoay `AUTH_SECRET` (mục trên), đặt lại mọi mật khẩu (băm scrypt vẫn khó dò nhưng không nên tin) |

## 7. Việc chưa làm (nợ kỹ thuật)

- Bộ đếm login-guard và rate limiter nằm trong tiến trình: chạy nhiều bản (replica) thì mỗi bản đếm riêng. Một tiến trình như hiện tại là đủ.
- CSP còn `script-src 'unsafe-inline'` (Next.js không dùng nonce); chuyển sang nonce qua `proxy.ts` là bước tiếp theo.
- Chưa có test đầu cuối Playwright cho luồng đăng nhập hai lớp (test đơn vị đã phủ logic).
- Chưa buộc bật hai lớp; mới cảnh báo ở Tình trạng bảo mật. Có thể thêm cài đặt `security.requireMfa` khi đội đã quen.
