import { ModulePage } from "@/components/shell/module-page";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Chiến dịch – BAOR AI OS" };

export default function CampaignsPage() {
  return <ModulePage moduleKey="campaigns" action={<Button variant="primary" size="md" disabled title="Sắp triển khai">Tạo chiến dịch</Button>} />;
}
