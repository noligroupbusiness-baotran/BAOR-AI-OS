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

```bash
cp .env.example .env.local   # rồi sửa ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_SECRET
npm install
npm run dev                  # http://localhost:3000
```

Tài khoản đăng nhập đọc từ `.env.local`. Sinh khóa ký cookie: `openssl rand -hex 32`.

## Công nghệ

- Next.js 16 (App Router, Server Actions, `proxy.ts` bảo vệ route) + TypeScript
- Tailwind CSS 4, giao diện tiếng Việt, nền kem / xanh lá
- Phiên đăng nhập: cookie HTTP-only ký bằng `jose`

## Cấu trúc

```
src/app/(admin)/*      các trang quản trị (dashboard, approvals, research, insights, content,
                       publishing, ads, customers, email, settings)
src/app/login          đăng nhập (Server Action)
src/components/ui      pill, button, card, stat, filter-tabs, table, toggle, platform
src/components/layout  sidebar, topbar, nav
src/lib/data/*         dữ liệu mẫu cho từng bước – thay bằng API/CSDL thật ở giai đoạn sau
src/lib/auth.ts        xác thực
```

## Giai đoạn tiếp theo

- Backend agent: Claude API (research, insight, viết nội dung, trả lời khách), Meta Graph API + Marketing API, SMTP/Resend.
- CSDL PostgreSQL thay cho dữ liệu mẫu; scheduler đăng bài; webhook Messenger.
