# BAOR AI OS

Trung tâm điều hành marketing automation cho fanpage. Giao diện quản trị bám theo quy trình 8 bước:

1. **Research nền tảng** – AI quét xu hướng, định dạng nội dung, đối thủ.
2. **Insight khách hàng** – chân dung khách hàng, nỗi đau, insight; bản đồ Nhóm KH → Vấn đề → Insight → Chủ đề.
3. **Đề xuất & viết nội dung** – AI đề xuất ý tưởng có điểm ưu tiên, viết nháp.
4. **Bạn hoàn thiện nội dung** – bàn làm việc, duyệt cuối cùng.
5. **Tự động đăng bài** – lịch tuần, hàng đợi, kết quả bài đăng.
6. **Tự chạy quảng cáo** – chiến dịch, ngân sách và rào chắn (luôn cần duyệt trước khi tiêu tiền).
7. **Kết nối khách hàng** – hộp thư & bình luận, lead/CRM, quy tắc trả lời tự động.
8. **Email marketing** – chuỗi tự động, chiến dịch.

Kèm **Hộp chờ duyệt** gom mọi việc cần chủ fanpage quyết định, và **Cài đặt** (kết nối API, tự động hóa, tài khoản).

## Chạy thử

Tạo tệp `.env.local` ở thư mục gốc (tệp này không đưa lên git):

```bash
ADMIN_EMAIL=ban@email.com
ADMIN_PASSWORD=mat-khau-cua-ban
AUTH_SECRET=chuoi-ngau-nhien-dai      # sinh bằng: openssl rand -hex 32
```

Rồi chạy:

```bash
npm install
npm run dev                  # http://localhost:3000
```

Chưa có `.env.local` (hoặc thiếu ADMIN_EMAIL / ADMIN_PASSWORD) thì mọi đăng nhập đều bị từ chối.

## Công nghệ

- Next.js 16 (App Router, Server Actions, `proxy.ts` bảo vệ route) + TypeScript
- Tailwind CSS 4, giao diện tiếng Việt, tone xanh ngọc / xương trắng, chữ Be Vietnam Pro
- Cơ sở dữ liệu SQLite (Drizzle ORM) trong thư mục `data/`, tự tạo bảng và nạp dữ liệu mẫu lần đầu
- Phiên đăng nhập: cookie HTTP-only ký bằng `jose`; mật khẩu đổi trong Cài đặt được băm scrypt
- AI: Claude API (`claude-opus-5`) cho đề xuất ý tưởng, viết nháp, gợi ý trả lời khách; nhập khóa ở Cài đặt › Kết nối

## Cấu trúc

```
src/app/(admin)/*      các trang quản trị (dashboard, research, content, publishing, customers, settings)
src/app/login          đăng nhập (Server Action)
src/components/ui      pill, button, card, stat, segment, table, toast, platform
src/components/layout  sidebar, topbar, nav
src/db/*               schema, kết nối SQLite, nạp dữ liệu mẫu
src/lib/actions/*      hành động server: nội dung, quảng cáo, khách hàng, cài đặt
src/lib/queries.ts     truy vấn đọc cho các trang
src/lib/ai.ts          gọi Claude API
src/lib/data/*         dữ liệu mẫu ban đầu
src/lib/auth.ts        phiên đăng nhập; src/lib/admin.ts tài khoản quản trị
```

## Đã hoạt động thật

Nhận ý tưởng, soạn và lưu nháp, gửi duyệt, duyệt, lên lịch đăng; duyệt / tạm dừng / sửa ngân sách ads; trả lời khách, đổi giai đoạn lead, bật tắt quy tắc và chuỗi email; kết nối (lưu khóa), bật tắt tự động hóa, thương hiệu, đổi email/mật khẩu; xóa hoặc nạp lại dữ liệu mẫu. AI đề xuất ý tưởng, viết nháp và gợi ý trả lời khi có khóa Claude.

## Giai đoạn tiếp theo

- Nối Meta Graph API để đăng bài thật, nhận webhook inbox/bình luận, đọc số liệu; Marketing API cho ads.
- Bộ chạy nền theo lịch (đăng bài đúng giờ, AI trả lời tự động, chuỗi email).
- Gửi email thật qua SMTP.

## Chạy trên VPS (Docker + tự cập nhật khi push)

Cài lần đầu trên VPS Ubuntu/Debian (SSH vào VPS rồi chạy):

```bash
curl -fsSL https://raw.githubusercontent.com/noligroupbusiness-baotran/BAOR-AI-OS/main/deploy/install.sh | bash
```

Script tự cài Docker, tải code về `/opt/baor-ai-os`, tạo `.env` và khởi động.
- VPS đã có Caddy/Nginx giữ cổng 80/443 (trường hợp mkt.baor.vn): chỉ chạy app ở `127.0.0.1:3200`; thêm khối trong `deploy/caddy-host-snippet.txt` vào Caddyfile của máy chủ.
- VPS trống: script tự chạy kèm Caddy trong Docker (`--profile caddy`) và cấp HTTPS cho `DOMAIN`.

Cập nhật bản mới: `bash /opt/baor-ai-os/deploy/update.sh` (giữ chỉnh sửa cục bộ vào git stash trước khi cập nhật).

Tự cập nhật khi có commit mới trên GitHub (không cần secret): `install.sh` đã bật sẵn; VPS cài từ bản cũ thì chạy một lần `bash /opt/baor-ai-os/deploy/enable-auto-update.sh`. VPS kiểm tra GitHub mỗi 2 phút (systemd timer `baor-auto-update.timer`), có bản mới thì tự build lại. Xem nhật ký: `journalctl -u baor-auto-update -n 50`.

Cách khác qua GitHub Actions: thêm `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` trong GitHub > Settings > Secrets and variables > Actions; chưa có secret thì workflow `Deploy to VPS` chỉ ghi chú và kết thúc thành công.
