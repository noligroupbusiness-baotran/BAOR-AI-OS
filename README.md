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

## Phân hệ Chiến dịch (trung tâm đặt mục tiêu)

Chiến dịch là mục tiêu Marketing / kinh doanh chung (cấp 1); mỗi chiến dịch có nhiều **mục tiêu kênh** (cấp 2:
Facebook Fanpage, Facebook Ads, TikTok, YouTube, Zalo OA, Website & SEO, Email). Mọi phân hệ khác dùng chung
dữ liệu này qua bảng liên kết `marketing_links` (`campaign_id`, `channel_goal_id`, `entity_type`, `entity_id`):

```
Chiến dịch → Mục tiêu kênh → Insight → Nội dung → Video → Phê duyệt → Đăng bài/Quảng cáo → Lead → Automation → Đơn hàng → Báo cáo
```

- Cấu hình kênh tập trung: `src/config/channels.ts` (thêm kênh = thêm một phần tử).
- Domain model: `src/lib/campaigns/types.ts`; tính toán thuần: `results.ts`; nhãn: `labels.ts`.
- Repository: `src/lib/campaigns/repository.ts` — giao diện chỉ gọi `campaignRepo`; nối API thật thì viết
  implementation khác và đổi dòng export cuối tệp.
- Hành động: `src/lib/actions/campaigns.ts` (tạo 4 bước, gửi duyệt, phê duyệt, kích hoạt, tạm dừng, kết thúc,
  thêm/sửa/tạm dừng mục tiêu kênh). Mọi hành động có nhật ký và khóa chống bấm lặp (`idem`).
- Ngữ cảnh chiến dịch dùng chung: `src/lib/campaigns/context.ts` + `CampaignContextBar`. Ví dụ: mở
  `/content?campaign=<id>&goal=<id>` thì trang Nội dung tự lọc và bài mới tự gắn vào chiến dịch.
- Dữ liệu mẫu: `src/lib/data/campaigns.ts` (4 chiến dịch, liên kết bằng ID thật), `people.ts`, `products.ts`,
  `videos.ts`. Nguồn chuẩn sau này là Cài đặt › Nhân sự, Sản phẩm; Video Studio.
- Chưa nối: API Facebook / TikTok / YouTube / Zalo OA, đăng bài thật, chạy ads thật, thu lead thật, Agent Edit Video,
  doanh thu thật. Tab Kết quả đang dùng số liệu mẫu trong `campaign_results`.

## Cấu trúc

```
src/app/(admin)/*      các trang quản trị (dashboard, campaigns, insights, content, publishing, customers, settings)
src/app/(admin)/campaigns  danh sách, tạo 4 bước (/new), chi tiết 5 tab (/[id]?tab=overview|goals|activity|approvals|results)
src/lib/campaigns/*    domain, repository, tính toán, ngữ cảnh chiến dịch dùng chung
src/config/channels.ts cấu hình kênh Marketing tập trung
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
