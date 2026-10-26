import { AdsPanel } from "@/components/publishing/ads-panel";

export const metadata = { title: "Quảng cáo – BAOR AI OS" };

// Bước 7 của hành trình marketing: quảng cáo (tách khỏi Đăng bài — mỗi bước một trang).
export default async function AdsPage({ searchParams }: { searchParams: Promise<{ edit?: string; link?: string; campaign?: string; goal?: string }> }) {
  const { edit, link, campaign, goal } = await searchParams;
  return <AdsPanel edit={edit} link={link} campaign={campaign} goal={goal} />;
}
