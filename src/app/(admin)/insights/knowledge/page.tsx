import { redirect } from "next/navigation";

// Second Brain không hiển thị trong app (OWNER 25/10/2026): đường cũ chuyển về Cài đặt › Second Brain (trạng thái đồng bộ).
export default function KnowledgeRedirect() {
  redirect("/settings#second-brain");
}
