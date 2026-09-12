"use server";

import { done, logActivity } from "./common";
import { runBackup, formatBytes, type BackupResult } from "@/lib/backup";

// Nút "Sao lưu ngay" ở Cài đặt › Sao lưu dữ liệu.
export async function backupNow() {
  let r: BackupResult;
  try {
    r = await runBackup({ force: true, reason: "theo yêu cầu" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return done("/settings#backup", `Sao lưu thất bại: ${msg}`);
  }
  const f = r.file!;
  logActivity("human", `Sao lưu dữ liệu thủ công: ${f.name} (${formatBytes(f.size)})`);
  const gh = r.uploaded === true ? ", đã đẩy lên GitHub" : r.uploaded === false ? ", đẩy lên GitHub thất bại" : "";
  done("/settings#backup", `Đã sao lưu ${f.name} (${formatBytes(f.size)})${gh}`);
}
