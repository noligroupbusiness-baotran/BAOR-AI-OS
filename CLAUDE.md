# BAOR.vn — CLAUDE.md

**Đọc trước tiên:** [`docs/BAOR_OPERATING_MODEL.md`](docs/BAOR_OPERATING_MODEL.md) (mô hình vận hành kế thừa NOLI SALES MASTER)
và [`docs/BAOR_PHASE01_STATUS.md`](docs/BAOR_PHASE01_STATUS.md) (trạng thái Giai đoạn 01, cách khôi phục phiên).

- `main` **tự triển khai production**. Không ghép, không đẩy `main` khi OWNER chưa nói MERGE.
- Repo **công khai**: không commit nội dung Second Brain, email, ID Drive, thư mục `data/`, `docs/brand-engine/`.
- Gate: `npx tsc --noEmit -p .` và `npm run gate`.

@AGENTS.md
