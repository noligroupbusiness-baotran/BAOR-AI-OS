# Động cơ thương hiệu — Giai đoạn 01 — trạng thái

Cập nhật bởi MASTER sau mỗi checkpoint. Nguồn vận hành: `docs/BAOR_OPERATING_MODEL.md`.

## Khôi phục phiên

1. Nhánh làm việc: `feature/brand-cp01` (đã đẩy lên GitHub; `main` KHÔNG đổi). `git status` phải sạch, trừ `docs/brand-engine/` (tài liệu nội bộ, cố ý không commit).
2. Mở app: preview `baor-dev` (cổng 3010, `.claude/launch.json`). Dev tự đăng nhập bằng `DEV_AUTO_LOGIN_EMAIL`.
3. CSDL dev tự migrate khi tiến trình khởi động. Nếu dev server chạy từ trước khi có migration mới: `npx tsx -e 'import("./src/db/index.ts").then(m=>m.getDb())'`.
4. Gate: `npx tsc --noEmit -p .` · `npm run lint` · `npm test` · `npx next build` · `npm run security` · `npm run video:selftest` (bộ dựng, footage tổng hợp hợp pháp).
5. Dữ liệu và bằng chứng chạy thật nằm trong `data/` (không commit): `data/baor.db`, `data/brand-engine/`, `data/video-jobs/`, `data/uploads/`.

## Bảng checkpoint

| CP | Mục tiêu | Kết quả | Trạng thái |
|---|---|---|---|
| CP00 | Kiểm toán hiện trạng | 6 tài liệu có bằng chứng (ở máy) | ĐẠT |
| CP01 | Second Brain + nghiên cứu ngoài → brief | Chỉ mục kho chỉ đọc; nguồn hạng A–D; luật kiểm phát hiện; nghiên cứu thật B1 (5 nguồn, 10 phát hiện đạt kiểm, brief đạt QA) | ĐẠT |
| CP02 | Brief → kịch bản quay | Kịch bản 5 cảnh có căn cứ [S#]/[K#], nguồn ngoài đọc kèm tên; không viết thay câu chuyện OWNER; luật kiểm số liệu / nguồn / chép nguyên văn / cấu trúc; AI viết lại bị kiểm bất biến; phiên bản + khôi phục; đề xuất chủ đề; bản đọc khi quay. Kịch bản B1 thật đạt kiểm, đã gửi OWNER duyệt | ĐẠT kỹ thuật · chờ OWNER duyệt B1 |
| CP03 | Video gốc → dựng tự động → QA → OWNER duyệt | Tải dạng luồng tới 8 GB; hàng đợi chạy ngầm (máy chủ phản hồi 5–7 ms khi đang dựng); B-roll có giấy phép, SFX tổng hợp (tắt, #78c); bảng kiểm A–Q; phiên bản, lịch sử phản hồi, dựng lại. Video thật B1 (4K, 3:21) dựng xong trong 3:22: A–E, H–J, L, N đạt; 3 điểm chặn chờ OWNER | ĐẠT kỹ thuật · chờ OWNER xem bản B1 |
| CP04 | Đăng video đã duyệt | Facebook Page theo Video API v26.0; chống trùng; giành quyền nguyên tử; "đã đăng" chỉ khi đọc lại được permalink; thử lại an toàn; chế độ thử mặc định; số liệu theo bài | ĐẠT trong chế độ thử · đăng thật chờ token |
| CP05 | Meta Ads trong ủy quyền | Ủy quyền ngân sách OWNER (trần ngày/tháng/hạn/tài khoản); mọi đường tiêu tiền qua cổng; nháp trên Meta luôn PAUSED; chi phí theo ngày; tối ưu theo luật; thu hồi = dừng hết | ĐẠT với fetch giả · chạy thật chờ tài khoản + ủy quyền |
| CP06 | Phân tích → cải tiến | Chỉ dữ liệu thật, ngưỡng cỡ mẫu, đề xuất là giả thuyết; OWNER chấp nhận / bỏ qua; xuất bản nháp DRAFT cho 07 HỘP CHỜ DUYỆT; chạy mỗi ngày | ĐẠT · số liệu thật còn ít |

## Bị chặn bởi quyền / quyết định OWNER

| Việc | Cần gì | Ảnh hưởng |
|---|---|---|
| Đồng bộ Second Brain tự động | Token Notion chỉ đọc | Đang dùng ảnh chụp kho |
| Nghiên cứu web tự động, AI viết lại kịch bản | Claude API key (chi phí theo lượt) | Nghiên cứu nhập bằng tệp; kịch bản dựng theo luật |
| Nguồn dựng từ Google Drive | Quyền Drive cho máy chủ, xác nhận giấy phép từng tệp | Thư viện B-roll cục bộ đang trống |
| Đăng thật Facebook | Page ID, Page token, App ID, User token (quyền CREATE_CONTENT); OWNER tắt chế độ thử | Bài chỉ chạy chế độ thử |
| Instagram / TikTok / YouTube | Nơi phát tệp công khai / ứng dụng TikTok được duyệt / OAuth YouTube | Ghi rõ lý do trên giao diện |
| Quảng cáo Meta thật | Tài khoản quảng cáo + ủy quyền ngân sách | Không có chi tiêu thật |
| Video B1 | OWNER nghe lại 39 từ chưa chắc, quyết tên người trong phụ đề (#92), cỡ logo (#98a), giấy phép font | Chưa phê duyệt |
| Câu hỏi mở skill | #78c SFX, #100, #102, #103, nhạc nền | Giữ mặc định an toàn |
| Đưa lên mkt.baor.vn | OWNER nói MERGE | `main` chậm hơn nhánh làm việc |
| Vá lỗ hổng Next.js | Phiên riêng (nhánh `fix/next-16.4.2-security`) | `npm run security` báo lỗi tới khi ghép |

## Rủi ro / nợ đã biết (DEFERRED)

- Build `next build` ở máy kéo cả `data/` vào `.next/standalone` (do instrumentation dùng fs động, có từ trước). Docker production không bị vì `.dockerignore` loại `data`. Không đóng gói standalone từ máy cá nhân.
- Căn cứ kịch bản gắn theo cảnh, không theo câu (một thẻ hợp lệ hợp thức hoá số liệu cả cảnh).
- API Meta (đăng video, Marketing API) viết theo tài liệu chính thức nhưng chưa chạy với tài khoản thật.

## Nhật ký checkpoint

- 21/10/2026 — CP01 ĐẠT (commit 4c3c94f).
- 21/10/2026 — CP02 + CP03 (2085ee3), review độc lập 2 vòng: sửa 3 P1 CP02 + 2 P1 (sửa nội dung đã duyệt; bỏ qua ghi chú duyệt video) và các P2.
- 21/10/2026 — CP04 (f093a81), CP05 + bản sửa review (ec21f32), CP06 (303d2dc). Test 93/93, tsc sạch, lint 0 lỗi, build đạt.
