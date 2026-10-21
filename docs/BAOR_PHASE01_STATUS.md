# Động cơ thương hiệu — Giai đoạn 01 — trạng thái

Cập nhật bởi MASTER sau mỗi checkpoint. Nguồn vận hành: `docs/BAOR_OPERATING_MODEL.md`.

## Khôi phục phiên

1. Nhánh làm việc: `feature/brand-cp01`. `git status` phải sạch, trừ `docs/brand-engine/` (tài liệu nội bộ, cố ý không commit).
2. Mở app: preview `baor-dev` (cổng 3010, `.claude/launch.json`). Đăng nhập tài khoản quản trị dev.
3. Đọc bảng dưới, làm tiếp checkpoint đầu tiên chưa ĐẠT. Gate: `npx tsc --noEmit -p .` và `npm run gate`.
4. Dữ liệu và bằng chứng chạy thật nằm trong `data/` (không commit): `data/baor.db`, `data/brand-engine/`, `data/video-jobs/`.

## Bảng checkpoint

| CP | Mục tiêu | Tiêu chí nghiệm thu | Trạng thái |
|---|---|---|---|
| CP00 | Kiểm toán hiện trạng | 6 tài liệu kiểm toán có bằng chứng | ĐẠT (tài liệu ở máy) |
| CP01 | Second Brain + nghiên cứu ngoài → brief | Chỉ mục kho chỉ đọc; nghiên cứu có hạng nguồn và luật kiểm; brief đạt QA; nghiên cứu thật B1 | ĐẠT — commit 4c3c94f |
| CP02 | Brief → nội dung → kịch bản quay | Brief tạo kịch bản quay theo cảnh, mỗi luận điểm có nguồn; chỗ cần câu chuyện OWNER được đánh dấu, không viết thay; QA chặn gửi duyệt khi còn lỗi; OWNER duyệt; bản đọc khi quay | ĐANG LÀM |
| CP03 | OWNER tải video → AI dựng theo Skill + nguồn → QA → OWNER duyệt | Tải video lớn không bị cắt; dựng chạy nền không chặn máy chủ; báo cáo QA; duyệt/sửa; nguồn Drive khi có quyền | CHƯA |
| CP04 | Tự đăng video đã duyệt | Chỉ video đã duyệt vào hàng đăng; PUBLISHED chỉ khi nền tảng trả mã bài; lỗi được ghi và thử lại | CHƯA |
| CP05 | Facebook Ads trong ngân sách ủy quyền | Hạn mức OWNER ghi nhận; mọi bật/tăng ngân sách qua kiểm hạn mức; không tự dùng tệp khách hàng | CHƯA |
| CP06 | Phân tích → cải tiến Content, Second Brain, Video Skill | Số liệu thật theo bài; đề xuất cải tiến có căn cứ, ghi DRAFT/hộp chờ duyệt, không tự sửa nguồn | CHƯA |

## Bị chặn bởi quyền OWNER

| Việc | Cần gì | Ảnh hưởng |
|---|---|---|
| Đồng bộ Second Brain tự động | Token Notion chỉ đọc | Đang dùng ảnh chụp kho |
| Nghiên cứu web tự động, AI viết kịch bản | Claude API key (chi phí theo lượt) | Đang nhập nghiên cứu bằng tệp; kịch bản dựng theo luật |
| Lấy nguồn dựng từ Google Drive | Quyền Drive cho máy chủ | Dùng thư viện nguồn cục bộ |
| Đăng thật lên Facebook/TikTok/YouTube | Token trang và kênh | Hàng đăng chạy, chưa đăng thật |
| Quảng cáo Meta thật | Tài khoản quảng cáo + hạn mức tháng | Chưa có chi tiêu thật |
| Đưa thay đổi lên mkt.baor.vn | OWNER nói MERGE | `main` chậm hơn nhánh làm việc |
| Vá lỗ hổng Next.js | Phiên riêng đang nâng lên 16.4.2 | `npm run security` báo lỗi |

## Nhật ký checkpoint

- 21/10/2026 — CP01 ĐẠT. Gate: tsc sạch, lint 0 lỗi, test 64/64, build đạt; kiểm bảo mật lỗi do Next.js (đã tách việc).
