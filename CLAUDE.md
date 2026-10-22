# BAOR.vn — CLAUDE.md

**Mọi phiên và mọi agent dùng chung MỘT chuẩn vận hành:** [`docs/BAOR_OPERATING_MODEL.md`](docs/BAOR_OPERATING_MODEL.md)
(kế thừa NOLI Universal Standard 0.3.0). Đọc trước khi làm. Trạng thái + việc tiếp theo: [`docs/BAOR_PHASE01_STATUS.md`](docs/BAOR_PHASE01_STATUS.md)
(hook SessionStart tự in khối khôi phục khi mở phiên).

Tóm tắt bắt buộc (chi tiết và lý do ở chuẩn vận hành):

- Vòng BUILD: GOAL → ACCEPTANCE CRITERIA → IMPLEMENT → RUN REAL APP → VERIFY USER FLOW → TARGETED TEST → INDEPENDENT REVIEW (`baor-reviewer`)
  → QUALITY GATE (`npm run verify`, có UI thì `npm run verify:full`) → RISK CHECK → CHECKPOINT → NEXT SLICE. Chưa kiểm chứng = chưa xong.
- `main` **tự triển khai production**. Không ghép, không đẩy `main` khi OWNER chưa nói MERGE (hook `scripts/agent/guard-bash.mjs` chặn).
- Repo **công khai**: không commit `data/`, `docs/brand-engine/`, nội dung Second Brain, email, ID Drive, `.env*`. Stage đúng từng tệp.
- Dừng chỉ ở: tiền · credential / truy cập ngoài · dữ liệu thật · production / công bố. Ngoài ra tự quyết, tự sửa, làm tới cùng.

@AGENTS.md
