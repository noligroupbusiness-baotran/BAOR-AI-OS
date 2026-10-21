// Nạp dữ liệu Second Brain / nghiên cứu vào CSDL ứng dụng (DATA_DIR, mặc định ./data). Dùng chung luật kiểm với giao diện.
//   npx tsx scripts/knowledge/import.mts snapshot <tệp.json>
//   npx tsx scripts/knowledge/import.mts research <tệp.json>   (JSON gồm task + result, xem docs/brand-engine)
import fs from "node:fs";

const [kind, file] = process.argv.slice(2);
if (!kind || !file) {
  console.error("Cách dùng: import.mts snapshot|research <tệp.json>");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, "utf8"));

if (kind === "snapshot") {
  const { importKnowledgeSnapshot, knowledgeStats } = await import("../../src/lib/knowledge/index");
  const r = importKnowledgeSnapshot(data);
  console.log(`Nạp ${r.pages} trang (cập nhật ${r.changed}, không đổi ${r.unchanged}).`, JSON.stringify(knowledgeStats().byStatus));
} else if (kind === "research") {
  const { createResearchTask, saveResearchResult, ResearchResultSchema } = await import("../../src/lib/research/index");
  const t = data.task as { question: string; purposeKind: "content"; purpose: string; by: string };
  const id = createResearchTask({ question: t.question, purposeKind: t.purposeKind, purpose: t.purpose, by: t.by });
  const r = saveResearchResult(id, ResearchResultSchema.parse(data.result), { runner: "import", by: t.by });
  console.log(`Nhiệm vụ ${id}: ${r.sources} nguồn, ${r.findings} phát hiện (${r.verified} đạt kiểm), brief ${r.briefId ?? "không có"}; bỏ ${r.dropped.length}.`);
} else {
  console.error("Loại không hỗ trợ:", kind);
  process.exit(1);
}
