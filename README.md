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

## Nhiều session làm song song (mỗi vị trí một session)

`.claude/launch.json` (đã đưa vào repo) có sẵn một cấu hình dev server cho mỗi vị trí, mỗi cấu hình một cổng và một thư mục
dữ liệu riêng để hai tiến trình không ghi cùng một tệp SQLite:

| Cấu hình | Cổng | DATA_DIR | Vị trí |
|---|---|---|---|
| `baor-dev` | 3010 | `data` | dùng chung / điều phối |
| `baor-campaigns` | 3011 | `data-campaigns` | Chiến dịch và Báo cáo |
| `baor-content` | 3012 | `data-content` | Nội dung và Video |
| `baor-ads` | 3013 | `data-ads` | Đăng bài và Quảng cáo |
| `baor-customers` | 3014 | `data-customers` | Khách hàng và Automation |
| `baor-infra` | 3015 | `data-infra` | Hạ tầng, bảo mật, deploy |

Thư mục dữ liệu mới tự tạo với dữ liệu mẫu giống nhau. Mỗi session làm trên nhánh riêng (`feature/<vị trí>`), chỉ `git add`
đúng tệp của mình, không sửa `src/db/schema.ts`, `drizzle/`, `src/db/seed.ts`, `src/config/`, `src/components/shell`,
`next.config.ts` khi chưa báo session điều phối. Tài khoản dev: xem `.env.local`.

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
- Cài đặt là nguồn chuẩn: bảng `products` (sản phẩm & bảng giá) và `people` (nhân sự & phân quyền) qua
  `src/lib/catalog/repository.ts`; thêm/sửa/ngừng dùng ở `/settings#products`, `/settings#people`.
- Video Studio: bảng `videos` (`src/lib/videos/repository.ts`, `src/lib/actions/videos.ts`): kiểm tra → gửi phê duyệt →
  phê duyệt / yêu cầu chỉnh sửa; đồng bộ với Chờ phê duyệt của chiến dịch. Không tự đăng.
- Gắn thực thể vào chiến dịch ngay tại phân hệ (Insight, Nội dung, Video, Quảng cáo, Lead) bằng
  `LinkToCampaignForm`; nhãn chiến dịch hiện bằng `CampaignTags`. Bài đăng kế thừa liên kết của nội dung khi lên lịch.
- Dữ liệu mẫu nạp lần đầu: `src/lib/data/campaigns.ts` (4 chiến dịch, liên kết bằng ID thật), `people.ts`,
  `products.ts`, `videos.ts`. Sau khi nạp, sửa trong giao diện, không sửa tệp.
- Chưa nối: API Facebook / TikTok / YouTube / Zalo OA, đăng bài thật, chạy ads thật, thu lead thật, Agent Edit Video,
  doanh thu thật. Tab Kết quả đang dùng số liệu mẫu trong `campaign_results`.

- Danh sách chiến dịch: lọc theo tên, trạng thái, sản phẩm, người phụ trách, tháng, "chỉ chiến dịch có cảnh báo"; sắp xếp theo
  mới cập nhật / trạng thái / sắp kết thúc / ngân sách / tiến độ; mỗi dòng có nhãn "còn N ngày", "bắt đầu sau N ngày", "đã qua hạn".
- Trang chi tiết có **Nhân bản** (tạo bản nháp mới kèm mục tiêu kênh, không kèm liên kết) và **Xóa nháp** (chỉ Nháp / Cần chỉnh sửa,
  chưa gắn hoạt động, cần Quản lý). Chiến dịch đã duyệt thì dùng Kết thúc, không xóa.

## Bộ định tuyến luật / AI và lớp kết nối nền tảng

- **Bộ định tuyến** (`src/lib/router`): việc có dữ liệu nguồn và công thức → làn "rule", xử lý ngay (hạn mức quảng cáo,
  CPL, đủ điều kiện đăng, tin nhắn có số điện thoại / khiếu nại / hỏi giá). Thiếu dữ liệu nguồn → làn "ai" qua cổng
  chung trong `src/lib/ai.ts`: kiểm tra trần chi phí (Cài đặt › AI), ghi sổ `ai_calls`, ghi quyết định
  `marketing_decisions` với nhãn "cần người duyệt". AI chỉ được dùng giá / công dụng trong danh mục sản phẩm.
- **Connector** (`src/lib/connectors`): giao diện chung `Connector` (kiểm tra, số liệu, đăng bài, webhook), danh bạ
  `registry.ts`, cấu hình mã hóa AES-GCM bằng khóa suy từ `AUTH_SECRET` (`src/lib/secrets.ts`). Đã có adapter thật:
  **Facebook Page** và **Meta Ads** (`meta.ts`). Các nền tảng khác khai báo trường nhưng adapter chưa xây.
- **Bộ chạy nền** (`src/lib/scheduler.ts`, bật trong `instrumentation.ts`): mỗi phút đăng bài đến giờ (chỉ khi nội dung
  đã duyệt và tài khoản đã kết nối), mỗi giờ đồng bộ số liệu về mục tiêu kênh và áp luật CPL. Nhật ký ở Cài đặt › Nhật ký hệ thống.
- **Webhook**: `POST /api/webhooks/meta` (Messenger, xác minh chữ ký App Secret; `GET` trả challenge với verify token trong
  Cài đặt) và `POST /api/webhooks/lead` (form website, header `x-baor-key`). Tin nhắn đến đi qua bộ định tuyến:
  hỏi giá → trả lời từ bảng giá; có số điện thoại → lead “Đã liên hệ”; khiếu nại → chuyển người; còn lại → AI gợi ý.
- Đặt `PUBLIC_URL=https://mkt.baor.vn` (hoặc `DOMAIN`) trên VPS để Cài đặt hiện đúng địa chỉ webhook.
- Kiểm thử phần thuần: `npm test` (node:test + tsx). Gate đầy đủ: `npm run gate`.

## Vỏ ứng dụng, đăng nhập theo nhân sự và phân quyền

- Đăng nhập: tài khoản quản trị (`.env.local` hoặc Cài đặt › Tài khoản) là quyền Quản trị; nhân sự trong Cài đặt ›
  Nhân sự có email + mật khẩu riêng (cấp trong biểu mẫu) đăng nhập với quyền Quản trị / Quản lý / Nhân viên.
  `src/lib/permissions.ts` (`requirePermission`) chặn ở máy chủ: phê duyệt, kích hoạt, kết thúc chiến dịch, duyệt nội dung,
  video, duyệt chạy quảng cáo cần Quản lý; kết nối nền tảng, trần AI, nhân sự, tài khoản cần Quản trị.
- Thanh trên: tìm kiếm toàn hệ thống (`/search`, không dấu), menu Tạo mới mở thẳng chức năng, chỉ báo sức khỏe hệ thống
  (kết nối, bộ chạy nền, AI, lỗi 24h), chuông thông báo tính từ dữ liệu thật (`src/lib/shell-data.ts`, đã đọc lưu ở trình
  duyệt), nút chuyển **giao diện trang xem** (ẩn thanh bên, nội dung rộng) ↔ **giao diện dashboard**.
- Thanh bên chia 3 nhóm: Điều hành (Điều hành, Chiến dịch, Báo cáo), Marketing, Hệ thống. Phím tắt: `/` hoặc `Ctrl+K`
  vào ô tìm kiếm (điện thoại: nút kính lúp mở trang tìm kiếm), `Alt+1…9, 0` nhảy phân hệ, `?` mở bảng phím tắt, `Esc` đóng.
- Chế độ màu ba trạng thái (nút trên thanh trên xoay vòng): theo hệ thống → sáng → tối; theo hệ thống đổi ngay khi máy đổi.
- Menu tài khoản có **Tài khoản của tôi** (`/account`): ai đăng nhập cũng tự đổi mật khẩu (cần mật khẩu hiện tại, mới ≥ 8 ký tự)
  và xem sự kiện bảo mật của mình. Quản trị mới thấy mục Nhân sự và phân quyền.
- Vỏ ứng dụng tự làm mới dữ liệu mỗi 60 giây khi tab đang mở. Chân thanh bên hiện tình trạng thật và người đang đăng nhập.
- Điều hành không còn dữ liệu mẫu: việc chờ xử lý, lịch hôm nay, trạng thái Agent đều suy ra từ CSDL, bộ chạy nền, sổ AI.
- "Xóa dữ liệu mẫu" chỉ xóa bản ghi có ID mẫu, giữ dữ liệu người dùng tự tạo. Danh sách dài phân trang 25 mục (`?page=`).

## Đơn hàng, Automation, Báo cáo, Trợ lý, Thương hiệu, Cảnh báo

- **Đơn hàng** (`src/lib/orders`): tạo từ lead, giá theo danh mục (Quản lý mới được ghi giá khác), đơn thanh toán cập
  nhật lead “Đã mua” và doanh thu chiến dịch. Kết quả chiến dịch tính từ lead / đơn / chi phí thật, chỉ dùng mẫu khi trống.
- **Automation** (`src/lib/automation`): quy tắc “khi X thì Y” (tin nhắn, lead mới, lead im lặng, bài tương tác cao,
  chiến dịch chậm, CPL cao) chạy ở làn luật; hành động tiêu tiền tạo đề xuất chờ duyệt. Kho câu trả lời chuẩn ở Cài đặt › FAQ.
  Trang Automation có “Thử với một tin nhắn” (chạy khô).
- **Nội dung theo loại** (`src/lib/content/formats.ts`): bài viết, kịch bản video (reel / story / script), caption, hình ảnh; lọc
  bằng `?kind=`. Kịch bản: khung 5 cảnh Hook / Vấn đề / Giải pháp / Bằng chứng / Kêu gọi, mỗi cảnh ba dòng Hình ảnh / Lời thoại /
  Chữ trên màn hình, bảng kiểm tra cảnh còn thiếu, kịch bản đã duyệt có nút "Tạo video" sang Video Studio. Caption: đếm ký tự,
  hashtag, câu đầu 125 ký tự, CTA, giới hạn từng nền tảng (theo luật, không AI). Hình ảnh: brief điền sẵn màu / font / khẩu hiệu
  từ Thương hiệu, kích thước từng nền tảng, đính kèm ảnh (`content_items.asset_upload_id`, migration 0009). AI viết nháp theo đúng loại.
- **Phân Data** (`src/lib/customers/segments.ts`, Khách hàng › Phân data): chia khách theo luật, không AI: lead mới, đang chăm sóc
  (tin cuối ≤ 7 ngày), im lặng 7–30 ngày, nguội > 30 ngày, đã mua, mua từ 2 lần, đã mua chưa có đơn, mất; thêm nhóm động theo kênh
  và theo thẻ. Mỗi nhóm: xem danh sách, tải CSV (`/api/export/leads?segment=`, cần Quản lý), gắn thẻ cả nhóm, chuyển giai đoạn cả nhóm.
- **Báo cáo** (`src/lib/reports`): mục tiêu so với kết quả theo chiến dịch, kênh, nội dung, video, lead, đơn hàng, chi phí, ROAS.
- **Trợ lý AI** (`src/lib/assistant.ts`): câu hỏi vận hành trả lời từ dữ liệu (làn luật); câu khác gọi Claude với ảnh chụp
  hệ thống. **Insight**: AI rút từ inbox / lead / bài đăng kèm bằng chứng, trạng thái chờ duyệt.
- **Thương hiệu**: logo, màu, font, khẩu hiệu, kho nhạc (tệp trong `DATA_DIR/uploads`, phục vụ qua `/api/files/<id>`).
  Video Studio nhận tải video lên (500 MB).
- **Cảnh báo ra ngoài**: Cài đặt › Cảnh báo, webhook JSON khi đăng bài lỗi, đồng bộ lỗi, AI chạm trần, bộ chạy nền lỗi.
- **Xoay khóa**: `AUTH_SECRET_OLD=<cũ> AUTH_SECRET=<mới> npm run rotate-secret` mã hóa lại token rồi đặt khóa mới.
- Token Meta: nhập “Token hết hạn ngày” trong Kết nối để hệ thống nhắc trước 7 ngày.

## Bảo vệ và vận hành lâu dài

- **Chặn dò mật khẩu** (`src/lib/login-guard.ts`): 5 lần sai trong 15 phút (theo email và theo IP) thì khóa 15 phút; lần khóa ghi vào
  nhật ký hoạt động (bước `security`), lần sai lẻ chỉ in ra log máy chủ. Bộ đếm nằm trong tiến trình, khởi động lại là xóa.
- **Header bảo mật** (`next.config.ts`): Content-Security-Policy (chỉ mã, font, ảnh từ chính hệ thống và Google Fonts),
  không cho nhúng iframe, nosniff, Referrer-Policy, HSTS.
- **Kiểm tra cấu hình lúc khởi động** (`src/lib/env-check.ts`): thiếu hoặc yếu `AUTH_SECRET`, thiếu `ADMIN_EMAIL`,
  `PUBLIC_URL`, `ANTHROPIC_API_KEY` → in cảnh báo ra log và hiện ở Tình trạng hệ thống (không làm sập server).
- **Dọn dữ liệu cũ** (`src/lib/retention.ts`, chạy mỗi ngày trong bộ chạy nền): nhật ký hoạt động, quyết định router,
  lịch sử automation, lần đồng bộ giữ 90 ngày; nhật ký chiến dịch và chi phí AI giữ 365 ngày (đổi bằng cài đặt
  `retention.logsDays`, `retention.auditDays`, tối thiểu 7). Tệp tải lên không có bản ghi (và ngược lại) được dọn.
- **Trang 404 / lỗi** theo giao diện: `src/app/not-found.tsx` (ngoài), `src/app/(admin)/not-found.tsx` (trong vỏ ứng dụng),
  `src/app/global-error.tsx` (lỗi tầng root).
- **Máy trạng thái chiến dịch** tách ở `src/lib/campaigns/transitions.ts`, có test (`tests/transitions.test.ts`).
- Test: `npm test` chạy trên CSDL SQLite tạm (`tests/db.test.ts`) cho automation, router, phân quyền, dọn dữ liệu.

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

## Sao lưu dữ liệu (tự động 20 phút/lần)

Server tự sao lưu toàn bộ CSDL SQLite ngay trong tiến trình app (`src/instrumentation.ts` → `src/lib/backup.ts`),
không cần cron hay dịch vụ ngoài:

- Chu kỳ mặc định 20 phút; bản đầu tiên 15 giây sau khi khởi động. Dùng API online backup của SQLite nên bản sao luôn
  nhất quán dù app đang ghi. Dữ liệu không đổi kể từ lần trước thì bỏ qua.
- Tệp `baor-YYYYMMDD-HHMMSS.db` (giờ UTC) trong `data/backups/` (Docker: volume `/app/data/backups`, không mất khi
  cập nhật). Giữ 72 bản gần nhất (24 giờ) và mỗi ngày 1 bản trong 30 ngày, còn lại tự xóa.
- Cài đặt › **Sao lưu dữ liệu**: xem trạng thái, bấm **Sao lưu ngay**, tải bản bất kỳ về máy (`/backups/<tên tệp>`).
- Đẩy lên GitHub: đặt `BACKUP_GITHUB_REPO=owner/repo` (repo **private**, vì CSDL chứa khóa API và token) và
  `BACKUP_GITHUB_TOKEN` (fine-grained PAT, quyền *Contents: Read and write* trên repo đó). Mỗi bản được nén gzip và
  tải lên thư mục `backups/` qua GitHub Contents API, áp cùng chính sách giữ bản. Repo đã tạo sẵn:
  `noligroupbusiness-baotran/BAOR-AI-OS-backups`.
- Biến tùy chọn: `BACKUP_INTERVAL_MINUTES`, `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_KEEP_DAYS`, `BACKUP_GITHUB_BRANCH`,
  `BACKUP_GITHUB_DIR`, `BACKUP_DISABLED=1`.

Khôi phục: dừng app, chép bản sao lưu đè lên `data/baor.db` (xóa `baor.db-wal`, `baor.db-shm` nếu có), khởi động lại.
Bản trên GitHub thì `gunzip` trước. Trên VPS:

```bash
cd /opt/baor-ai-os && docker compose stop app && docker run --rm -v baor-ai-os_app_data:/d alpine sh -c 'cp /d/backups/baor-YYYYMMDD-HHMMSS.db /d/baor.db && rm -f /d/baor.db-wal /d/baor.db-shm' && docker compose start app
```

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
