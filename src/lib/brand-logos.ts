import fs from "node:fs";
import path from "node:path";
import { getSetting } from "@/lib/admin";
import { fileUrl, getUpload } from "@/lib/uploads";
import type { BrandLogos } from "@/components/shell/brand-mark";

// Logo góc trái giao diện quản trị. Nguồn theo thứ tự: tải lên ở Cài đặt › Logo giao diện quản trị (theo từng nền)
// → tệp mặc định public/brand → không có (hiện ô chữ B).
function publicIf(base: string): string | null {
  for (const ext of ["svg", "png"]) {
    if (fs.existsSync(path.join(process.cwd(), "public", "brand", `${base}.${ext}`))) return `/brand/${base}.${ext}`;
  }
  return null;
}

export function getBrandLogos(): BrandLogos {
  const lightId = getSetting("ui.logoLightUploadId") ?? "";
  const darkId = getSetting("ui.logoDarkUploadId") ?? "";
  const light = lightId && getUpload(lightId) ? fileUrl(lightId) : publicIf("baor-dark");
  const dark = darkId && getUpload(darkId) ? fileUrl(darkId) : publicIf("baor-light");
  return { light, dark: dark ?? light, markLight: publicIf("baor-mark-dark"), markDark: publicIf("baor-mark-light") };
}
