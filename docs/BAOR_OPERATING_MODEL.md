# BAOR.vn — Mô hình vận hành (kế thừa NOLI SALES MASTER)

OWNER ban hành 21/10/2026: BAOR.vn kế thừa trực tiếp mô hình của NOLI SALES MASTER
(`Noli Sales System/docs/NOLI_MASTER_OPERATING_MODEL.md`, ban hành 27/09/2026). Không dùng Governance của Grok Bot.
Tài liệu này chỉ ghi **phần áp dụng cho BAOR.vn** và **những điểm BAOR khác Noli**. Không sửa hệ thống Noli Sales.

```
OPERATING_STATE: BUILD_MODE (Động cơ thương hiệu — Giai đoạn 01)
SET_BY:          OWNER 21/10/2026
```

## 1. Một cửa

```
OWNER → CLAUDE MASTER → AGENTS → IMPLEMENTATION → VERIFICATION → INDEPENDENT REVIEW → NEXT CHECKPOINT
```

- MASTER tự chia việc, tự định tuyến, tự giải quyết lỗi kỹ thuật. Không hỏi OWNER việc kỹ thuật thông thường.
- Xong một checkpoint thì tự kiểm chứng, ghi `docs/BAOR_PHASE01_STATUS.md` rồi đi tiếp. Không chờ OWNER nhắn "tiếp tục".
- Việc bị chặn bởi quyền hoặc quyết định OWNER: ghi BỊ CHẶN, làm tiếp phần độc lập. Không tuyên bố xong phần phụ thuộc quyền chưa cấp.

## 2. Vòng BUILD (một vòng duy nhất)

```
GOAL → ACCEPTANCE CRITERIA → IMPLEMENT → RUN REAL APP → VERIFY USER FLOW
→ TARGETED TEST → INDEPENDENT REVIEW (1 vòng) → GATE → NEXT CHECKPOINT
```

- **Xong** = mã có + app thật chạy được (đã mở trang, đi luồng) + test quan trọng xanh. Không báo xong vì "compile được".
- **Gate**: `npm run gate` (lint · kiểm bảo mật · test · build) và `npx tsc --noEmit`.
- **Review độc lập**: một agent không viết mã đó, chỉ đọc và chạy kiểm chứng. Mặc định MỘT vòng. Chỉ thêm vòng khi P0, P1, bảo mật hoặc toàn vẹn dữ liệu. Cấm vòng review vô hạn.
- Lỗi một lần: sửa. Hồi quy nghiêm trọng: sửa và thêm test. Sai lặp lại: luật cứng hoặc kiểm tĩnh.

## 3. Điểm dừng OWNER

Áp dụng ranh giới **an toàn hơn** giữa Noli (3 cổng) và `~/.claude/CLAUDE.md` (4 điểm):

1. **Tiền** — mua dịch vụ, chi phí API theo lượt mới, ngân sách quảng cáo ngoài hạn mức OWNER đã ủy quyền.
2. **Credential / truy cập ngoài** — token Notion, Claude API, Meta, TikTok, YouTube, Google Drive; secret mới.
3. **Dữ liệu thật quan trọng** — dữ liệu khách, tệp khách hàng cho quảng cáo, đưa dữ liệu nội bộ lên repo công khai.
4. **Production / không đảo ngược** — ghép `main`, deploy, force push, xoá vĩnh viễn, đăng bài, chạy quảng cáo.

Luật nội dung từ chỉ thị Giai đoạn 01: Notion là nguồn chuẩn, app chỉ đọc; bot chỉ ghi DRAFT/đề xuất vào hộp chờ duyệt.
Không tự tạo quan điểm hoặc câu chuyện OWNER. Số liệu chưa xác minh không thành sự thật.
PUBLISHED chỉ khi có bằng chứng đăng thành công. Không đăng nội dung chưa OWNER duyệt.

## 4. Khác biệt với Noli — BẮT BUỘC

| Noli Sales | BAOR.vn | Lý do |
|---|---|---|
| Master tự ghép `main` khi verify xanh + CI xanh | **Master KHÔNG ghép `main`** | `main` của BAOR **tự triển khai lên production** (mkt.baor.vn) khoảng 2 phút sau mỗi lần đẩy. Ghép = deploy = điểm dừng 4. |
| CI GitHub ở ranh giới ghép | Gate chạy ở máy; chưa có CI cho BAOR | Không thêm bộ máy mới khi chưa cần (Noli §8). |
| Nhánh: `main mới nhất → một nhánh → ghép` | Một nhánh làm việc cho cả Giai đoạn 01 (`feature/brand-cp01`), không xếp tầng thêm | `main` đang chậm hơn nhánh; ghép chờ OWNER. |
| Repo riêng tư | **Repo BAOR CÔNG KHAI** | Không commit nội dung Second Brain, email, ID thư mục Drive, dữ liệu `data/`. Tài liệu nội bộ để ở máy (`docs/brand-engine/`, chưa commit). |

Khi OWNER nói **MERGE**: Master soát diff, chạy gate, kiểm app, ghép, rồi kiểm `main` bằng SHA và hành vi (Noli §7, §15).
Trước lần đẩy `main` đầu tiên có dữ liệu thật: nhắc OWNER tắt `bypassPermissions` (`~/.claude/CLAUDE.md`).

## 5. Khoá phạm vi

Trước khi mở thêm việc: *"Việc này có bắt buộc để hoàn thành Giai đoạn 01, hoặc để bảo vệ nền móng?"* Có thì làm, không thì ghi `DEFERRED`.
Không xây thêm bộ máy quản trị (sổ bằng chứng, framework agent, CI mới) khi chưa có nhu cầu thật.

## 6. Báo cáo OWNER

```
ĐÃ XONG — ĐANG LÀM — BỊ CHẶN — KẾT QUẢ TIẾP THEO
```

Ngắn, tiếng Việt, không nhiễu kỹ thuật. Chỉ trình OWNER quyết định vượt quyền và sản phẩm cần duyệt.
