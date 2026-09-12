# Bàn giao theo vị trí (session)

Mỗi vị trí là một session Claude Code làm trong cùng repo, trên nhánh riêng, với dev server và thư mục dữ liệu riêng
(xem `.claude/launch.json`). Tệp này là lời mở đầu chuẩn cho từng phiên: copy khối "Câu mở đầu" dán vào phiên mới.

## Quy ước chung cho mọi vị trí

- Nhánh: `feature/<vị-trí>` tách từ `feature/campaigns` (hoặc `develop` khi đã có). PR về nhánh gộp, **không bao giờ push `main`**
  (`main` tự deploy production sau 2 phút).
- `git add` đúng tệp của mình; không `git add -A`. Commit kết thúc bằng dòng Co-Authored-By theo quy ước phiên.
- Không sửa vùng dùng chung khi chưa báo vị trí điều phối: `src/db/schema.ts`, `drizzle/`, `src/db/seed.ts`, `src/config/`,
  `src/components/shell/`, `next.config.ts`, `src/proxy.ts`. Cần cột mới thì mô tả trong PR, điều phối gộp migration.
- Gate trước khi mở PR: `npx tsc --noEmit -p .` 0 lỗi, `npx eslint .` 0 lỗi, `npm test` xanh, `npx next build` xanh.
- Luật sản phẩm: AI chỉ đề xuất, người phê duyệt; việc có dữ liệu và công thức thì xử lý theo luật không gọi AI; hành động
  tiêu tiền, xuất bản, gửi ra ngoài luôn qua phê duyệt. Màu đỏ chỉ cho lỗi thật, vàng cho việc cần chú ý. Không emoji.
- Client component chỉ import các module `*-types.ts` hoặc thuần client; không import repository hay `@/db`.
- Tài khoản dev: `.env.local` (`dev@local.test`); đặt `DEV_AUTO_LOGIN_EMAIL` để khỏi đăng nhập khi `next dev`.
- Đọc `README.md` và bộ nhớ dự án trước khi bắt đầu. Báo cáo cuối phiên: đã làm gì, gate thật, nợ kỹ thuật, việc cần CEO.

## 1. Chiến dịch và Báo cáo — `baor-campaigns`, cổng 3011, nhánh `feature/campaign-reports`

Sở hữu: `src/app/(admin)/campaigns`, `src/app/(admin)/reports`, `src/components/campaigns`, `src/lib/campaigns`, `src/lib/reports`.

Làm ngay (không cần khóa):
1. Mẫu chiến dịch dựng sẵn: spa dịch vụ, tuyển dụng, chăm sóc khách cũ, ra mắt sản phẩm; chọn mẫu trong bước 1 wizard,
   điền sẵn mục tiêu, kênh, phân bổ ngân sách theo tỷ lệ.
2. So sánh hai chiến dịch (cùng loại hoặc tự chọn) trên trang Báo cáo: mục tiêu, lead, đơn, chi phí, ROAS cạnh nhau.
3. Cảnh báo tiến độ: khi phần trăm thời gian đã trôi lớn hơn phần trăm mục tiêu đạt được quá 20 điểm thì thêm cảnh báo
   vào `campaignAlerts` và thông báo cho người phụ trách.
4. Báo cáo tuần tự sinh: job trong scheduler mỗi thứ hai tóm tắt tuần trước, ghi vào activity và gửi qua webhook cảnh báo.
5. Xuất PDF cho trang Báo cáo (HTML in ra PDF phía server, không thư viện nặng).

Sau khi có khóa Meta: kiểm tra `syncChannelMetrics` với số liệu thật, bỏ dần nguồn số mẫu.

Câu mở đầu:
> Bạn là session "Chiến dịch và Báo cáo" của BAOR AI OS. Đọc README.md, docs/SESSIONS.md mục 1 và bộ nhớ dự án. Tạo nhánh
> feature/campaign-reports từ feature/campaigns, mở giao diện bằng cấu hình baor-campaigns, rồi làm lần lượt 5 việc trong
> mục "Làm ngay", mỗi việc một commit, gate xanh, mở PR về feature/campaigns khi xong.

## 2. Nội dung và Video — `baor-content`, cổng 3012, nhánh `feature/content-video`

Sở hữu: `src/app/(admin)/content`, `src/app/(admin)/video-studio`, `src/components/content`, `src/lib/content`,
`src/lib/videos`, `src/lib/actions/content.ts`, `src/lib/actions/videos.ts`.

Làm ngay:
1. Lịch biên tập theo trụ cột: đặt chỉ tiêu mỗi tuần (VD 2 niềm tin, 2 giáo dục, 1 bằng chứng), hiện thiếu đủ so với bài
   đã duyệt hoặc lên lịch trong tuần.
2. Kho mẫu hook và cấu trúc bài (theo luật, không AI): chèn vào ô nháp như "Chèn khung mẫu" của kịch bản.
3. Phiên bản bản nháp: lưu lịch sử mỗi lần "Lưu nháp", xem và khôi phục bản trước.
4. Kiểm tra bài viết theo luật giống caption: độ dài theo định dạng, có CTA, không dùng từ cấm về công dụng (danh sách
   từ cấm trong Cài đặt › Thương hiệu).
5. Video Studio: đính kèm tệp cho từng phiên bản nền tảng (9:16, 1:1, 16:9), checklist kiểm tra trước khi gửi duyệt
   (có phụ đề, có nhạc trong kho, có CTA, thời lượng).

Sau khi có khóa Anthropic: kiểm tra chất lượng AI viết nháp theo từng loại, AI đề xuất ý tưởng từ insight thật.

Câu mở đầu:
> Bạn là session "Nội dung và Video" của BAOR AI OS. Đọc README.md, docs/SESSIONS.md mục 2 và bộ nhớ dự án. Tạo nhánh
> feature/content-video từ feature/campaigns, mở giao diện bằng cấu hình baor-content, làm lần lượt 5 việc "Làm ngay",
> mỗi việc một commit, gate xanh, mở PR về feature/campaigns.

## 3. Đăng bài và Quảng cáo — `baor-ads`, cổng 3013, nhánh `feature/publishing-ads`

Sở hữu: `src/app/(admin)/publishing`, `src/components/publishing`, `src/lib/actions/ads.ts`, `src/lib/connectors/`
(trừ `config.ts` và `registry.ts` phần khai báo chung), `src/app/api/webhooks/`.

Làm ngay:
1. Giờ vàng đề xuất: tính từ bài đã đăng (reach theo giờ và thứ), hiện gợi ý khi lên lịch.
2. Hàng chờ đăng thử lại tự động: lỗi tạm thời (mạng, 5xx) thử lại 3 lần cách 10 phút rồi mới đánh dấu lỗi.
3. So sánh CPL giữa quảng cáo cùng chiến dịch; luật đề xuất tăng 20% ngân sách khi CPL thấp hơn trung bình 30% và ngược
   lại, tạo đề xuất chờ duyệt, không tự đổi.
4. Lịch tháng: kéo thả để đổi giờ đăng (server action đổi `scheduledFor`, ghi nhật ký).
5. Chuẩn bị adapter Instagram dùng chung token Facebook Page (đọc số liệu, đăng ảnh), chờ khóa để thử.

Sau khi có khóa Meta: kiểm tra `facebook_page` và `meta_ads` với trang thật, webhook nhận tin nhắn và số liệu; rồi TikTok,
YouTube, Zalo OA theo thứ tự có tài khoản.

Câu mở đầu:
> Bạn là session "Đăng bài và Quảng cáo" của BAOR AI OS. Đọc README.md, docs/SESSIONS.md mục 3 và bộ nhớ dự án. Tạo nhánh
> feature/publishing-ads từ feature/campaigns, mở giao diện bằng cấu hình baor-ads, làm 5 việc "Làm ngay", mỗi việc một
> commit, gate xanh, PR về feature/campaigns. Không nhập khóa thật vào mã hay chat.

## 4. Khách hàng và Automation — `baor-customers`, cổng 3014, nhánh `feature/customers-automation`

Sở hữu: `src/app/(admin)/customers`, `src/app/(admin)/automation`, `src/components/customers`, `src/lib/customers`,
`src/lib/orders`, `src/lib/automation`, `src/lib/inbound.ts`, `src/lib/actions/customers.ts`, `src/lib/actions/automation.ts`.

Làm ngay:
1. Hồ sơ khách hàng: trang `/customers/[id]` gộp tin nhắn, đơn, thẻ, chiến dịch, nhật ký chăm sóc, ghi chú nội bộ.
2. Nhắc gọi lại: đặt lịch gọi cho lead, hiện trong "Chờ tôi xử lý" của người phụ trách khi đến hạn.
3. Chuỗi email chạy thật: adapter SMTP (nodemailer) hoặc Resend, cấu hình trong Cài đặt › Kết nối, gửi theo lịch từ
   scheduler, ghi log gửi và lỗi; chỉ cần tài khoản email, không cần khóa nền tảng.
4. Nhập khách từ CSV (tên, điện thoại, email, thẻ, nguồn), kiểm tra trùng số điện thoại.
5. Quy tắc mới trong Automation: theo giờ (VD 9h mỗi ngày gửi danh sách nguội), theo thẻ, theo đơn hàng (đã mua 30 ngày
   thì nhắc mua lại).

Sau khi có khóa Meta / Zalo: inbox và bình luận đổ về thật qua webhook, trả lời từ hệ thống ra nền tảng.

Câu mở đầu:
> Bạn là session "Khách hàng và Automation" của BAOR AI OS. Đọc README.md, docs/SESSIONS.md mục 4 và bộ nhớ dự án. Tạo
> nhánh feature/customers-automation từ feature/campaigns, mở giao diện bằng cấu hình baor-customers, làm 5 việc "Làm
> ngay", mỗi việc một commit, gate xanh, PR về feature/campaigns. Cần thêm cột hay bảng thì ghi trong PR, không tự tạo migration.

## 5. Hạ tầng và bảo mật — `baor-infra`, cổng 3015, nhánh `feature/infra`

Sở hữu: `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/login-guard.ts`, `src/lib/backup.ts`, `src/lib/retention.ts`,
`src/lib/env-check.ts`, `src/lib/scheduler.ts`, `Dockerfile`, `docker-compose*`, `scripts/`, `tests/`, cấu hình CI.

Làm ngay:
1. Xác thực hai lớp (TOTP) cho tài khoản quản trị và tùy chọn cho quản lý; mã dự phòng; bật ở Tài khoản của tôi.
2. Test đầu cuối bằng Playwright cho 4 luồng: đăng nhập, tạo và duyệt chiến dịch, tạo đơn từ lead, phân quyền nhân viên
   bị chặn. Chạy trong `npm run gate`.
3. Sao lưu có kiểm tra khôi phục: mỗi tuần khôi phục bản sao vào DB tạm, chạy truy vấn kiểm tra, báo kết quả vào syslog.
4. Giám sát: endpoint `/api/health` (DB, đĩa, scheduler, thời gian phản hồi), cảnh báo qua webhook khi lỗi; trang tình trạng
   nội bộ trong Cài đặt.
5. Docker compose đầy đủ: app, Nginx, chứng chỉ tự gia hạn, volume dữ liệu, biến môi trường mẫu `.env.example`.

Cần CEO: `AUTH_SECRET`, `PUBLIC_URL`, token GitHub sao lưu trên VPS; quyết định gộp PR lên `main`.

Câu mở đầu:
> Bạn là session "Hạ tầng và bảo mật" của BAOR AI OS. Đọc README.md, docs/SESSIONS.md mục 5 và bộ nhớ dự án. Tạo nhánh
> feature/infra từ feature/campaigns, mở giao diện bằng cấu hình baor-infra, làm 5 việc "Làm ngay", mỗi việc một commit,
> gate xanh, PR về feature/campaigns. Không đụng secret thật; mọi việc production ghi thành danh sách chờ CEO.

## 0. Điều phối — `baor-dev`, cổng 3010, nhánh `feature/campaigns`

Giữ schema, migration, seed, vỏ ứng dụng, config. Review PR các vị trí: chạy gate, đọc diff, kiểm tra không lộ secret,
không đụng vùng dùng chung, gộp theo thứ tự PR nhỏ trước. Sau mỗi lần gộp cập nhật README và bộ nhớ dự án.
Khi có 2 PR trở lên cùng cần migration: điều phối tự tạo một migration gộp, đặt tên theo ngày.

Câu mở đầu:
> Bạn là session điều phối BAOR AI OS. Đọc README.md, docs/SESSIONS.md mục 0 và bộ nhớ dự án. Mở giao diện bằng cấu hình
> baor-dev. Liệt kê PR đang mở, review từng PR theo quy ước, báo kết quả và đề xuất thứ tự gộp.
