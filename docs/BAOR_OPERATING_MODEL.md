# BAOR.vn — Chuẩn vận hành dùng chung (Shared Operating Standard)

**Một nguồn duy nhất** cho mọi phiên Claude Code và mọi agent phát triển BAOR.vn. OWNER ban hành 21/10/2026, chuẩn hoá 22/10/2026.
Không có bản quy định thứ hai: `CLAUDE.md` chỉ trỏ về đây, `docs/SESSIONS.md` cũ đã chuyển vào `docs/archive/`.

```
OPERATING_STATE: BUILD_MODE (Động cơ thương hiệu — Giai đoạn 01)
DATA_STATE:      DEV_ONLY (dữ liệu thử ở máy; chưa có khách / tiền / token thật)
SET_BY:          OWNER 21/10/2026 · chuẩn hoá 22/10/2026
STANDARD:        NOLI Universal Standard 0.3.0 (.noli-engineering-version)
```

Tài liệu có ba lớp, tách đúng như OWNER yêu cầu:

| Lớp | Nằm ở đâu | BAOR dùng thế nào |
|---|---|---|
| 1. **Universal Standard** | `noli-engineering-standard/docs/NOLI_AI_MASTER_STANDARD.md` (0.3.0) — tóm tắt phần áp dụng ở §1–§6 dưới đây | Áp dụng nguyên tắc, không chép bộ máy |
| 2. **Noli Sales Project Profile** | `Noli Sales System/CLAUDE.md`, `docs/NOLI_MASTER_OPERATING_MODEL.md` | **Không áp dụng** cho BAOR; chỉ là nơi thử nghiệm nguyên tắc. Không sửa Noli Sales |
| 3. **BAOR Project Profile** | §7 tệp này | Luật riêng BAOR (repo công khai, main tự triển khai, nội dung / video / quảng cáo) |

---

## LỚP 1 — UNIVERSAL STANDARD (áp dụng cho BAOR)

### §1. Một cửa, MASTER làm A→Z

```
OWNER → MASTER (phiên Claude Code chính) → AGENT (khi cần) → IMPLEMENT → VERIFY → INDEPENDENT REVIEW → CHECKPOINT → NEXT SLICE
```

- OWNER giao **mục tiêu**. MASTER tự chia việc thành slice có tiêu chí nghiệm thu, tự thiết kế, viết mã, chạy app, test, sửa, giao review, nghiệm thu, ghi checkpoint, rồi **tự chuyển slice tiếp theo** trong backlog đã ủy quyền (`docs/BAOR_PHASE01_STATUS.md`, khối VIỆC TIẾP THEO).
- MASTER tự quyết kỹ thuật. Không đưa OWNER phương án A/B/C. Chỉ hỏi OWNER khi thiếu luật nghiệp vụ, và hỏi bằng ngôn ngữ nghiệp vụ.
- Không bao giờ yêu cầu OWNER tự sửa lỗi kỹ thuật. Xong một checkpoint không phải lý do để dừng.

### §2. Vòng BUILD (một vòng duy nhất, mọi chức năng)

```
GOAL → ACCEPTANCE CRITERIA → IMPLEMENT → RUN REAL APP → VERIFY USER FLOW → TARGETED TEST
→ INDEPENDENT REVIEW → QUALITY GATE → RISK CHECK → CHECKPOINT → NEXT SLICE
Không đạt: FAIL → ROOT CAUSE → FIX → RE-TEST → RE-VERIFY
```

- **Definition of Done** = mã có + app thật chạy được (đã mở trang, đi đúng luồng người dùng) + test liên quan xanh + review độc lập APPROVE
  + `npm run verify` PASS **gắn đúng commit**. Thiếu một phần là chưa xong. Không báo xong vì "compile được".
- **Bằng chứng gắn SHA**: sửa → commit → verify → báo số. Số phải đọc từ đầu ra thật. Một FAIL sau PASS xoá PASS.
- **Test mới phải ĐỎ trên lỗi trước**, rồi mới xanh trên bản sửa. Kiểm thiếu điều kiện thì phải báo lỗi, không âm thầm đạt.
- Cấm: `.skip` / `.only` / tắt test, `@ts-ignore`, `/* eslint-disable */` cả tệp, nới `strict`, sửa kết quả hay hạ tiêu chí để có PASS.
- Không bắt buộc chạy toàn bộ test nặng sau mỗi thay đổi nhỏ: phát triển chạy test liên quan; trước checkpoint / tích hợp chạy đủ cổng.

### §3. Ranh giới quyền — 3 cổng OWNER (Universal §15), BAOR giữ thêm production

Tự chủ tối đa trong phát triển và kiểm thử an toàn. Chỉ dừng ở:

1. **MONEY** — mua dịch vụ / API trả theo lượt, ngân sách quảng cáo ngoài hạn mức OWNER ủy quyền. Không tiêu tiền thật để kiểm thử.
2. **API_CREDENTIAL_EXTERNAL_ACCESS** — token Notion / Claude API / Meta / TikTok / YouTube / Drive; tạo, đổi, công khai secret; đổi quyền kết nối, quyền tài khoản quảng cáo; mở cổng ra internet.
3. **REAL_CRITICAL_DATA** — dữ liệu khách / nhân sự / tài chính thật; đưa dữ liệu nội bộ ra repo công khai; xoá vĩnh viễn.
4. *(BAOR Profile)* **Production / công bố** — ghép `main` (= triển khai mkt.baor.vn), đăng bài thật, chạy quảng cáo thật, xuất bản nội dung chưa duyệt.

Các điểm này **không** là lý do dừng việc kỹ thuật độc lập khác: ghi BỊ CHẶN, làm tiếp phần còn lại.
Trước khi một dự án chạm dữ liệu / tiền / token thật: nhắc OWNER tắt `bypassPermissions` (`~/.claude/CLAUDE.md`).

### §4. Agent — cùng một chuẩn nghiệm thu

- Vai trò theo mẫu (không cố định số agent): MASTER (phiên chính, viết mã + điều phối), **`baor-reviewer`** (`.claude/agents/baor-reviewer.md`: chỉ đọc, không có Edit/Write), agent khảo sát `Explore` (chỉ đọc) khi cần quét rộng.
- Agent chỉ báo tối đa `DONE_LOCAL`. **Không agent nào tự tuyên bố PASS**: MASTER chạy lại kiểm chứng, không tin số agent báo.
- Bàn giao đúng khung 10 mục: `TASK · STATUS · FILES READ · FILES CHANGED · ASSUMPTIONS · RESULT · TESTS RUN · RISKS · BLOCKERS · RECOMMENDED NEXT STEP`.
- Dùng công cụ sẵn có (Agent / SendMessage / hook của Claude Code). **Không xây framework điều phối mới.**

### §5. Review và cổng chất lượng

- **Một vòng review độc lập** mỗi slice; chỉ thêm vòng khi P0 / P1 / bảo mật / toàn vẹn dữ liệu (vd tiền quảng cáo 22/10: 3 vòng). Cấm vòng review vô hạn.
- Lỗi một lần → sửa · hồi quy nghiêm trọng → sửa + test hồi quy · sai lặp lại → luật cứng / kiểm tĩnh (`scripts/guardrails.mts`). Luôn hỏi "vì sao phát hiện muộn?".
- **Cổng** (một lệnh, máy và CI như nhau — `scripts/verify.mts`):

| # | Cổng | Lệnh trong `npm run verify` |
|---|---|---|
| 1 | Guardrails (luật cứng GR-01…07) | `tsx scripts/guardrails.mts` |
| 2 | Typecheck | `tsc --noEmit -p .` |
| 3 | Lint | `eslint .` |
| 4 | Security | `scripts/security-check.mts` (tệp cấm, mẫu secret, mẫu nguy hiểm, `npm audit` high) |
| 5 | Unit + Integration | `node --test tests/*.test.ts` (CSDL SQLite tạm, fetch giả cho Meta) |
| 6 | Production build | `next build` |
| 7 | E2E ứng dụng thật | `npm run verify:e2e` — Playwright trên `next start`, CSDL tạm, đăng nhập bằng form thật |
| 8 | Independent review | agent `baor-reviewer` (APPROVE mới ghi checkpoint) |

`npm run verify` = 1–6 · `npm run verify:e2e` = 7 · `npm run verify:full` = 1–7. Bằng chứng: `artifacts/verification-evidence/<sha>-<scope>.json`.

### §6. Khoá phạm vi, báo cáo

- Trước khi mở thêm việc: *"Có bắt buộc cho mục tiêu OWNER đang giao, hoặc để bảo vệ nền móng?"* Không → ghi `DEFERRED` / nợ kỹ thuật.
- Thứ tự ưu tiên khi xung đột: Dữ liệu / Bảo mật > ý OWNER > Nền móng > Đúng > Nhanh > Mã đẹp.
- Báo cáo OWNER: `ĐÃ XONG · ĐANG LÀM · BỊ CHẶN · TIẾP THEO`, tiếng Việt, ngắn, số thật, nói rõ phần chưa kiểm chứng.

---

## LỚP 2 — NOLI SALES PROFILE (không áp dụng, chỉ ghi để không nhầm)

Không mang sang BAOR: Postgres / `requestDelete()` / luật migration Noli; Master tự ghép main; trạng thái `CEO_PRODUCT_EDIT_MODE` + `FOUNDATION_LOCKED`.
**Bộ máy đã bãi bỏ ở Noli — cấm tái tạo ở BAOR:** checkpoint STOP chờ CEO gõ `APPROVED`; Master Supervisor AO01 (hàng đợi nhiệm vụ 18 trạng thái,
lease / heartbeat, khoá HMAC, `.noli/runtime`); cổng `FINAL_MERGE_GATE` / `CEO_REVIEW_HOLD` / `START_APPROVED`…; CI chạy đêm; eval suite.
Lý do: khoảng 20/31 sự cố ở Noli do chính bộ máy điều phối gây ra (`NOLI-MASTER-GOVERNANCE-EXPORT`).

---

## LỚP 3 — BAOR PROJECT PROFILE

### §7. Luật riêng BAOR

| Mục | BAOR.vn | Lý do |
|---|---|---|
| Ghép `main` | **MASTER không ghép.** Chỉ khi OWNER nói **MERGE**: soát diff → `verify:full` → PR có nhãn `merge-candidate` → CI xanh → ghép → kiểm main bằng SHA + hành vi | `main` **tự triển khai production** mkt.baor.vn khoảng 2 phút sau mỗi lần đẩy |
| Nhánh | Một nhánh làm việc cho Giai đoạn 01: `feature/brand-cp01`. Không xếp tầng | `main` chậm hơn nhánh; ghép chờ OWNER |
| Repo | **CÔNG KHAI**: không commit `data/`, `docs/brand-engine/`, nội dung Second Brain, email, ID Drive, `.env*`. Stage đúng từng tệp | Lộ dữ liệu nội bộ là không đảo ngược |
| Nội dung | Notion là nguồn chuẩn, app chỉ đọc; bot chỉ ghi DRAFT. Không bịa câu chuyện / quan điểm OWNER. Số liệu chưa xác minh không thành sự thật | Chỉ thị Giai đoạn 01 |
| Đăng / quảng cáo | Chế độ thử bật mặc định, không tự tắt. Không tự đặt ủy quyền ngân sách. "Đã đăng" chỉ khi đọc lại được bài | Tiền + công bố |
| Bản quyền | Không vô hiệu bộ kiểm bản quyền, không giả giấy phép; nhạc Drive không mặc định có quyền thương mại | Chỉ thị Creative Freedom |
| Stack | Next.js 16 (đọc `node_modules/next/dist/docs/` trước khi viết — `AGENTS.md`), SQLite + Drizzle (migration bằng `drizzle-kit generate`), server action có guard, giao diện tiếng Việt | |
| **Giao diện** | **Đơn giản, chuyên nghiệp, ÍT CHỮ, điều khiển bằng NÚT BẤM.** Lõi phức tạp nằm trong mã; bề mặt dễ nhìn, dễ hiểu, dễ dùng (tham chiếu Linear / Vercel / Stripe). Mỗi mục = icon + tên ngắn (2–4 chữ) + nhãn / chấm trạng thái + nút hành động. Trạng thái bằng nhãn màu, không bằng câu; bật / tắt bằng công tắc. Giải thích dài vào icon (i) hoặc phần mở rộng, tối đa 1 dòng phụ ≤ 10 chữ. Mỗi thẻ / hàng chỉ MỘT nút chính, thao tác phụ vào menu ⋯. Không nhãn viết hoa nhiều dòng, không đoạn văn mô tả trên đầu khối. Cảnh báo an toàn (tiền, xoá vĩnh viễn, chế độ thử, chỉ OWNER) vẫn luôn thấy, dạng nhãn ngắn có icon. Giữ font gốc; theo theme hiện hành (nền Xanh băng / đen, icon màu theo nhóm) | Chỉ thị OWNER 25–26/10/2026: "Bây giờ ít ai xây dựng nền tảng bằng văn bản nhiều. Họ chỉ code lõi bên trong còn giao diện bên ngoài đơn giản dễ nhìn dễ hiểu dễ sử dụng" |
| App để kiểm | preview `baor-dev` cổng 3010 (`.claude/launch.json`), tự đăng nhập dev bằng `DEV_AUTO_LOGIN_EMAIL` | |

### §8. Cưỡng chế bằng máy (không chỉ ghi Markdown)

| Quy tắc | Cơ chế | Kiểm chứng |
|---|---|---|
| Không đẩy / ép đẩy `main`, không ghép PR, không ssh / deploy, không `git add -A`, không stage `data/` · `docs/brand-engine/` · `.env`, không `git clean -f`, không `rm -rf data`, không `--no-verify` | Hook **PreToolUse** `scripts/agent/guard-bash.mjs` (Bash + terminal của app; chuẩn hoá lệnh trước khi so) + `permissions.deny` trong `.claude/settings.json` | `node scripts/agent/guard-bash.mjs --self-test` (trong GR-05) |
| Không commit / đẩy dữ liệu thật / tài liệu nội bộ / `.env` | Git hook `.githooks/pre-commit` + `pre-push` soát tên tệp trong đúng các commit sắp đẩy + `security-check` (tệp bị theo dõi) | Thử commit / đẩy tệp `data/`, `docs/brand-engine/` bị chặn |
| Không đẩy khi cổng đỏ; không đẩy main | Git hook `.githooks/pre-push` chạy `verify --no-build` trên ĐÚNG commit được đẩy (worktree tạm nếu cây có thay đổi) | Lần đẩy có log verify |
| Không tắt test / nới TypeScript (kể cả cờ con, exclude) / tắt lint cả tệp; hook bảo vệ còn nguyên (kể cả `disableAllHooks` cục bộ); khối khôi phục còn; reviewer không có quyền sửa | `scripts/guardrails.mts` GR-01…07 (bước đầu của verify) | `tests/guardrails.test.ts`: 12 đột biến đều làm đỏ |
| Cổng chất lượng đủ 7 lớp, gắn SHA; E2E chỉ chạy trên bản build khớp mã | `scripts/verify.mts` → `artifacts/verification-evidence/` (+ `build-stamp.json`) | Tệp bằng chứng |
| Kiểm tra cuối ở ranh giới ghép | `.github/workflows/ci.yml` (PR vào main có nhãn `merge-candidate`) | Lần chạy CI trên GitHub |
| Phiên mới tự khôi phục | Hook **SessionStart** `scripts/agent/session-start.mjs`: in chuẩn, nhánh, verify gần nhất có khớp HEAD, VIỆC TIẾP THEO | Mở phiên mới thấy khối khôi phục |

### §9. Khôi phục qua nhiều phiên — cơ chế thật và giới hạn

1. **Trạng thái bằng văn bản, có chủ và ngày**: `docs/BAOR_PHASE01_STATUS.md` (bảng checkpoint, BỊ CHẶN, khối `<!-- NEXT:START -->` VIỆC TIẾP THEO đã ủy quyền, nhật ký). MASTER cập nhật sau mỗi checkpoint. Không suy đoán trạng thái.
2. **Bằng chứng máy**: `artifacts/verification-evidence/latest.json` (SHA, từng cổng, PASS/FAIL).
3. **Hook SessionStart** đưa (1)+(2) vào mọi phiên mới tự động, không cần OWNER dán lệnh.
4. Bộ nhớ Claude (`~/.claude/projects/…/memory`) chỉ là phụ; nguồn sự thật là repo.

**Giới hạn của lớp cưỡng chế (nói thẳng, phản biện S1 22/10/2026):**

- `guard-bash` là lớp **cục bộ dựa trên mẫu lệnh** (đã chuẩn hoá `git -C`, cờ gộp, dấu nháy, `sh -c`; tự kiểm 102 ca). Nó chỉ áp
  cho công cụ Bash và terminal của app, không áp cho thao tác ngoài Claude Code. Người hay công cụ cố tình viết lệnh lạ vẫn có thể lách.
- Git hook nằm ở máy, ai có quyền máy đều tắt được. `guardrails` GR-04 báo đỏ khi hook Claude bị tắt bằng `disableAllHooks`.
- **Lớp không lách được là branch protection / ruleset cho `main` trên GitHub** (chặn đẩy thẳng và ép đẩy, bắt buộc qua PR + CI).
  Hiện `main` **chưa có** bảo vệ. Bật nó là đổi chính sách quyền truy cập, thuộc quyền OWNER (BỊ CHẶN, xem trạng thái).
- Agent `baor-reviewer` không có Edit / Write nhưng vẫn có Bash: "chỉ đọc" được giữ bằng hợp đồng + kiểm `git status` sau review,
  chưa phải bằng quyền máy. Agent định nghĩa trong `.claude/agents/` chỉ nạp khi mở phiên mới; trong phiên đang chạy, MASTER
  giao cùng hợp đồng cho agent general-purpose.

**Giới hạn khôi phục:** Claude Code **không tự mở phiên mới** khi phiên cũ kết thúc. Phiên tiếp theo bắt đầu khi OWNER (hoặc lịch) mở nó; khi đó hook tự nạp trạng thái và MASTER làm tiếp không cần hướng dẫn.
Cách chạy liên tục thực tế, nếu OWNER muốn: một **tác vụ theo lịch của ứng dụng Claude (Scheduled tasks)** — đã kiểm 22/10/2026:
ứng dụng có công cụ này, danh sách hiện trống — với câu lệnh cố định *"Tiếp tục BAOR theo docs/BAOR_OPERATING_MODEL.md và khối
VIỆC TIẾP THEO"*; mỗi lần chạy mở một phiên mới, hook SessionStart nạp trạng thái. Chưa bật: đây là cấu hình thường trực tự mở
phiên và tốn hạn mức sử dụng, nên cần OWNER đồng ý (chọn giờ chạy). Chưa kiểm chứng một chuỗi nhiều phiên tự nối nhau.
Không có tiến trình nền nào tự phát triển mã; worker nền của app chỉ dựng video / đăng lịch / đồng bộ số liệu.

### §10. Báo cáo OWNER

```
ĐÃ XONG — CÓ THỂ TRẢI NGHIỆM — KIỂM THỬ — BỊ CHẶN — TIẾP THEO
```

Chỉ trình OWNER quyết định vượt quyền và sản phẩm cần duyệt (kịch bản, video). Không nhiễu kỹ thuật.
