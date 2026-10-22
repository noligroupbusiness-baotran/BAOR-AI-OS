# Động cơ thương hiệu — Giai đoạn 01 — trạng thái

Cập nhật bởi MASTER sau mỗi checkpoint. Nguồn vận hành: `docs/BAOR_OPERATING_MODEL.md`.

## Khôi phục phiên

1. Nhánh làm việc: `feature/brand-cp01` (đã đẩy lên GitHub; `main` KHÔNG đổi). `git status` phải sạch, trừ `docs/brand-engine/` (tài liệu nội bộ, cố ý không commit).
2. Mở app: preview `baor-dev` (cổng 3010, `.claude/launch.json`). Dev tự đăng nhập bằng `DEV_AUTO_LOGIN_EMAIL`.
3. CSDL dev tự migrate khi tiến trình khởi động. Nếu dev server chạy từ trước khi có migration mới: `npx tsx -e 'import("./src/db/index.ts").then(m=>m.getDb())'`.
4. Cổng: `npm run verify` (guardrails · typecheck · lint · security · test · build), `npm run verify:full` (+ E2E Playwright), `npm run video:selftest` (bộ dựng, footage tổng hợp hợp pháp). Bằng chứng: `artifacts/verification-evidence/latest.json`.
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
| Nguồn dựng từ Google Drive | — (OWNER đã xác nhận quyền dùng 21/10/2026) | 72 ảnh + 10 clip trong thư viện cục bộ |
| Đăng thật Facebook | Page ID, Page token, App ID, User token (quyền CREATE_CONTENT); OWNER tắt chế độ thử | Bài chỉ chạy chế độ thử |
| Instagram / TikTok / YouTube | Nơi phát tệp công khai / ứng dụng TikTok được duyệt / OAuth YouTube | Ghi rõ lý do trên giao diện |
| Quảng cáo Meta thật | Tài khoản quảng cáo + ủy quyền ngân sách | Không có chi tiêu thật |
| Video B1 | OWNER nghe lại 39 từ chưa chắc, quyết tên người trong phụ đề (#92), cỡ logo (#98a), giấy phép font | Chưa phê duyệt |
| Câu hỏi mở skill | #78c SFX, #100, #102, #103, nhạc nền | Giữ mặc định an toàn |
| Đưa lên mkt.baor.vn | OWNER nói MERGE | `main` chậm hơn nhánh làm việc |
| Bảo vệ nhánh `main` trên GitHub | OWNER bật branch protection / ruleset (chặn đẩy thẳng + ép đẩy, bắt buộc PR + CI \`verify\`) — đổi chính sách quyền truy cập | Hiện chỉ có lớp chặn ở máy (hook); lớp không lách được còn thiếu |
| Vá lỗ hổng Next.js | Phiên riêng (nhánh `fix/next-16.4.2-security`) | `npm run security` báo lỗi tới khi ghép |

## Phản hồi OWNER cần xử lý

- 21/10/2026, video B1 (yêu cầu chỉnh sửa): "chưa có chữ nhấn... chưa có animation.. như trong skill mình đưa".
  Bộ dựng hiện chỉ chọn vài chữ nhấn (5 cho 3 phút) và animation (mục 3.3 của skill) vẫn chưa tự động. Việc tiếp theo của CP03:
  tăng mật độ chữ nhấn theo skill, làm animation chữ / sơ đồ theo mục 3.3, rồi dựng lại B1 để OWNER so.

- 21/10/2026 (tiếp): "nút ⛶ không mở lớn" → do khung trình duyệt trong app Claude chặn toàn màn hình (lệnh không được trả lời); Chrome/Safari dùng được. Bỏ nút "Xem lớn" theo ý OWNER.
  "edit vẫn bằng skill cũ" → Skill ESV là bộ dựng mặc định; kế hoạch máy lập ở bản trước được lập lại theo luật mới nhất.
  Minh hoạ: ảnh tĩnh dựng thành thẻ bo góc trên nền mờ, đẩy vào chậm 1,00→1,05 (affine dưới điểm ảnh); chèn theo từ khoá lời nói.

- 21/10/2026 (tối): OWNER "không có vi phạm gì cả...tôi duyệt cho làm hết" → ghi vào `data/video-assets/owner-decisions.json`
  (quyền dùng ảnh/clip, font, cỡ logo, từ chưa chắc đã ẩn, SFX #78c, nhạc). Bộ dựng đọc tệp này để gỡ điểm chặn F/P.
  Nhạc: Skill ESV r3 chỉ cho Pixabay Content License / CC0 có bằng chứng và loại "3 bài #56" → dùng Pixabay 552792 (bài đã thẩm định cho v9),
  bằng chứng ở `data/video-assets/music/evidence/`; 3 bài NHAC-NEN trên Drive để trống giấy phép (không dùng) tới khi OWNER đưa nguồn.
  Bộ dựng theo Skill ESV r3: zoom smootherstep một tâm theo hồ sơ nhịp CHẬM/VỪA/NHANH (bỏ zoom "thở"), luật cắt chữ nhấn,
  sơ đồ mới (thanh bước, cơ chế dọc, so sánh sai/đúng có tick, quy trình nối bước), FS-06 + TR-PIP, AN-12 vệt sáng, SFX tổng hợp,
  kiểm Q (dòng "Kết quả cá nhân, không cam kết") và R (A21 số trên màn hình). Kế hoạch biên tập cấp video: `video-jobs/<id>/plan.json`.

- 21/10/2026 (khuya): OWNER — cắt khoảng lặng (mặc định cho video mới, #103), bỏ tiếng "vút" nhiễu, chọn tỷ lệ khung trước khi dựng,
  nút Dừng / Xoá video, một nút ⛶ ở thanh dưới, chọn 540p / 1080p. Video Studio: tải lên → "Chờ chọn khung" → Bắt đầu dựng.
  Lỗi thật đã sửa: nhận diện tiến trình chỉ biết pipeline.py (không dừng / dọn được bộ ESV); cắt lặng > ~100 đoạn làm ffmpeg hết bộ nhớ;
  bản xem nhanh vượt đỉnh −1,0 dBTP. Video 1 giờ quay ngang đã gỡ theo yêu cầu (lưu trữ ở `data/removed-20261021-long-video/`).

- 22/10/2026: OWNER "vẫn chưa đạt" → tự soát bằng mắt, sửa: làm tối mềm sau sơ đồ (KH-TOI), zoom lấp khoảng trống (2 → 12 lần ở 1011),
  chữ nhấn rải đều, khung trích dẫn cho câu mẫu, kết mờ sang đen (luật CORE trang Animation), dòng "Kết quả cá nhân, không cam kết"
  tự hiện ở câu doanh thu (Q-T016-5), kiểm J ở tỷ lệ khác 9:16 đo giao mặt với chữ thật. Thêm khung FS-05 / FS-01, thẻ chương, khung trích dẫn.
  Video Studio có "Bảng biên tập": tắt / sửa / đổi ảnh / thêm chữ nhấn theo mốc thời gian rồi dựng lại (kế hoạch cấp video).
  Notion không có tệp mẫu animation (chỉ mô tả; thông số chi tiết "nằm trong code mẫu của đội") → các khung vẽ lại theo mô tả skill.

## VIỆC TIẾP THEO (backlog OWNER đã ủy quyền — tự làm theo thứ tự, không chờ nhắc)

<!-- NEXT:START -->
Nguồn ủy quyền: chỉ thị OWNER 22/10/2026 "CONTINUE BRAND ENGINE IMPLEMENTATION" + "SHARED OPERATING STANDARD". Mỗi mục đi đủ vòng BUILD (docs/BAOR_OPERATING_MODEL.md §2).
1. [ĐANG LÀM] S5 nhóm A — đã xong (chờ phản biện gộp): Insights reach / CPM / CTR (bcedf4e), tự thử lại khi dựng lỗi (528a3be),
   font có giấy phép Tinos OFL (98f48a5). Còn: dựng thật 4:5 và 1:1 + bố cục 16:9 trên video thật, chỉnh màu / da nhẹ,
   tải lên nối tiếp được (resumable), rồi E2E cho từng phần.
2. Nợ đã ghi (không chặn): script_align "Lan"→"Lành" khi kịch bản viết hoa tên khác; negated_before dừng ở "thì" có thể sót
   phủ định mệnh đề sau; mỗi video mới gọi mô hình ~6 phút (hàng đợi chậm khi tải nhiều); minh hoạ AI 0 ảnh qua kiểm
   (thư viện chỉ có mô tả chữ — cân nhắc mô hình nhìn ảnh mở để mô tả ảnh); khôi phục plan.prev-* chưa có nút trong app;
   gắn lại kịch bản không gỡ liên kết chiến dịch kế thừa từ kịch bản cũ.
3. Sau mỗi nhóm được nghiệm thu: cập nhật docs/brand-engine/BAOR-BRAND-ENGINE-IMPLEMENTATION-PROGRESS.md (công thức chấm cố định, chỉ tính bằng chứng mới).
<!-- NEXT:END -->

## Lỗi P2 trước khi đăng / chạy quảng cáo thật — ĐÃ SỬA 22/10/2026

5 lỗi P2 (df59581) + 5 lỗi P1 phản biện tìm ra trong bản sửa (b2bb0b0, 57a7d23) + 2 P2 (6ef2711). Phản biện độc lập 3 vòng: APPROVE.

## Rủi ro / nợ đã biết (DEFERRED)

- Build `next build` ở máy kéo cả `data/` vào `.next/standalone` (do instrumentation dùng fs động, có từ trước). Docker production không bị vì `.dockerignore` loại `data`. Không đóng gói standalone từ máy cá nhân.
- Căn cứ kịch bản gắn theo cảnh, không theo câu (một thẻ hợp lệ hợp thức hoá số liệu cả cảnh).
- API Meta (đăng video, Marketing API) viết theo tài liệu chính thức nhưng chưa chạy với tài khoản thật.
- Dự chi quảng cáo giả định mỗi ngày ≤ ngân sách ngày; Meta cho một ngày tiêu tới ~1,75× (trần theo tuần). Ngày Insights theo múi giờ tài khoản quảng cáo, mã so theo giờ VN → khi kết nối thật: đọc `timezone_name` hoặc yêu cầu tài khoản đặt giờ VN.

## Nhật ký checkpoint

- 22/10/2026 — **S4 Nội dung → Video ĐẠT** (ca540e5 → 0123fcb → 6a7d493 → 98f48a5): kịch bản đã duyệt → script.txt → bộ dựng
  (gợi ý Whisper, sửa chữ nghe sai chỉ trong đoạn khớp dài, ngữ cảnh biên tập AI); gắn / bỏ gắn cho video có sẵn. Phản biện 3 vòng:
  2 P1 (đổi nghĩa lời OWNER "Cô giáo"→"Có giáo"; kịch bản nháp lọt qua tải lên) + 6 P2, vòng 3 APPROVE. Test chuỗi dữ liệu thật
  (CSDL → script.txt → Python), test runJob với python giả, E2E gắn / bỏ gắn.
- 22/10/2026 — **S3 AI biên tập trong app ĐẠT kỹ thuật** (0b0789c … f252837): bộ dựng tự gọi mô hình mở tại máy (Qwen2.5-32B, llama.cpp),
  chạy thật trong app trên video 1011 bản 8 (11 chữ nhấn + 3 sơ đồ, bảng kiểm đạt). Phản biện 3 vòng: P1 cắt từ phủ định → đảo nghĩa
  ("không nên hứa hẹn" → "HỨA HẸN"), P2 đầu ra rác làm mất cả kế hoạch; vòng 3 APPROVE. CHỜ OWNER xem bản 8 và nói đẹp / chưa.

- 22/10/2026 — **S2 Video Review ĐẠT** (d5461ef + de831f0): góp ý theo mốc / đoạn, yêu cầu sửa cụ thể, dựng lại có phạm vi,
  tự kiểm bản mới theo kế hoạch + đầu ra bộ dựng, so 2 phiên bản, lịch sử không xoá. Chạy thật trên video 1011: góp ý tại 0:01.5
  "PHÁ BĂNG → Ánh kim" → bản 7 dựng bằng bộ ESV thật (11 phút) → tự kiểm "Bản 7: có chữ nhấn PHÁ BĂNG (shine) ở 1.5 s", bảng kiểm đạt,
  khung hình so bản 6 / 7 khác đúng chỗ. Phản biện: vòng 1 tìm 1 P1 (hai sơ đồ cùng mốc → sửa nhầm + kiểm sai) + 5 P2, vòng 2 APPROVE.
  verify:full PASS gắn de831f0 (117 test, 5 E2E). Lỗi thật lộ ra khi chạy app: thời lượng 0:00, cột nút ép nội dung 177 px, lịch sử ghi trùng.

- 22/10/2026 — **S1 Chuẩn vận hành dùng chung** (7d51f68 → 25128a0 → 33dc391 → d5461ef): một nguồn quy định 3 lớp; hook PreToolUse
  guard-bash (138 ca tự kiểm) + SessionStart; git hook pre-commit / pre-push (soát tên tệp theo commit, verify đúng commit);
  guardrails GR-01…07 + 12 đột biến; `npm run verify(:full)` gắn SHA; E2E Playwright trên bản build production; CI ở ranh giới ghép.
  Phản biện độc lập 3 vòng: vòng 1 tìm 2 P1 (git -C lách guard → đẩy được main; commit -nm lọt docs/brand-engine), vòng 2 tìm
  3 P1 (tiền tố --no-verif, gh api ghi, hồi quy git clean --force), vòng 3 APPROVE. CI GitHub run 39724193780 (7d51f68): success.

- 21/10/2026 — Review vòng 4: APPROVE (0 P0/P1). Theo yêu cầu OWNER, làm mới toàn bộ dữ liệu thử ở máy để test lại từ đầu; bản lưu trữ ở `data/reset-archive-20261021-193350/` (CSDL + video). Giữ chỉ mục Second Brain, cài đặt, kết nối. Cờ `data.sampleCleared` chặn tự nạp lại dữ liệu mẫu.

- 21/10/2026 — CP01 ĐẠT (commit 4c3c94f).
- 21/10/2026 — CP02 + CP03 (2085ee3), review độc lập 2 vòng: sửa 3 P1 CP02 + 2 P1 (sửa nội dung đã duyệt; bỏ qua ghi chú duyệt video) và các P2.
- 21/10/2026 — CP04 (f093a81), CP05 + bản sửa review (ec21f32), CP06 (303d2dc). Test 93/93, tsc sạch, lint 0 lỗi, build đạt.
