import { ModulePage } from "@/components/shell/module-page";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Video Studio – BAOR AI OS" };

export default function VideoStudioPage() {
  return <ModulePage moduleKey="video-studio" action={<Button variant="primary" size="md" disabled title="Sắp triển khai">Tải video lên</Button>} />;
}
