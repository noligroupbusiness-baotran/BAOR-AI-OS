import fs from "node:fs";
import path from "node:path";
import { getSetting } from "@/lib/admin";
import { fileUrl, getUpload } from "@/lib/uploads";
import type { BrandLogos } from "@/components/shell/brand-mark";

// Nguồn logo theo thứ tự: tải lên trong Cài đặt (theo từng nền) → tệp mặc định public/brand → không có.
function publicIf(base: string): string | null {
  for (const ext of ["svg", "png"]) {
    if (fs.existsSync(path.join(process.cwd(), "public", "brand", `${base}.${ext}`))) return `/brand/${base}.${ext}`;
  }
  return null;
}

export function getBrandLogos(): BrandLogos {
  const lightId = getSetting("brand.logoUploadId") ?? "";
  const darkId = getSetting("brand.logoDarkUploadId") ?? "";
  const light = lightId && getUpload(lightId) ? fileUrl(lightId) : publicIf("baor-dark");
  const dark = darkId && getUpload(darkId) ? fileUrl(darkId) : publicIf("baor-light");
  return { light, dark: dark ?? light, markLight: publicIf("baor-mark-dark"), markDark: publicIf("baor-mark-light") };
}
