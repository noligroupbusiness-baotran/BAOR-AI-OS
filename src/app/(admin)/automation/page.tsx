import { ModulePage } from "@/components/shell/module-page";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Automation – BAOR AI OS" };

export default function AutomationPage() {
  return <ModulePage moduleKey="automation" action={<Button variant="primary" size="md" disabled title="Sắp triển khai">Tạo quy trình</Button>} />;
}
