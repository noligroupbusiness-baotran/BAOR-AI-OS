// Mọi Server Action (tệp "use server" trong src/lib/actions) phải kiểm tra người gọi trước khi ghi dữ liệu.
// Test tĩnh: đọc mã nguồn, tìm từng hàm export, đòi hỏi thân hàm (hoặc hàm nội bộ nó gọi) có một lời gọi guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const GUARD = /\b(requirePermission|currentActor|getCurrentUser)\s*\(|\bawait actor\(\)/;
const DIR = path.join(process.cwd(), "src/lib/actions");

interface Fn {
  name: string;
  exported: boolean;
  body: string;
}

function parseFunctions(src: string): Fn[] {
  const out: Fn[] = [];
  const re = /(export\s+)?async\s+function\s+([A-Za-z0-9_]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = src.indexOf("{", re.lastIndex);
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    out.push({ name: m[2], exported: !!m[1], body: src.slice(open, i + 1) });
  }
  return out;
}

function guardedNames(fns: Fn[]): Set<string> {
  const ok = new Set(fns.filter((f) => GUARD.test(f.body)).map((f) => f.name));
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of fns) {
      if (ok.has(f.name)) continue;
      if ([...ok].some((g) => new RegExp(`\\b${g}\\s*\\(`).test(f.body))) {
        ok.add(f.name);
        grew = true;
      }
    }
  }
  return ok;
}

test("mọi server action trong src/lib/actions đều có guard đăng nhập / phân quyền", () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length >= 10, "phải thấy các tệp action");
  const missing: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    if (!src.startsWith('"use server"')) continue;
    const fns = parseFunctions(src);
    const ok = guardedNames(fns);
    for (const fn of fns) if (fn.exported && !ok.has(fn.name)) missing.push(`${f}:${fn.name}`);
  }
  assert.deepEqual(missing, [], `Action thiếu guard:\n${missing.join("\n")}`);
});

test("tệp action không export hàm đọc dữ liệu nhạy cảm theo email tùy ý", () => {
  // Hàm nhận email làm tham số trong tệp "use server" sẽ thành endpoint gọi được từ trình duyệt với email bất kỳ.
  for (const f of fs.readdirSync(DIR)) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    if (!src.startsWith('"use server"')) continue;
    for (const fn of parseFunctions(src)) {
      if (!fn.exported) continue;
      const sig = src.slice(src.indexOf(`function ${fn.name}(`), src.indexOf("{", src.indexOf(`function ${fn.name}(`)));
      assert.ok(!/\bemail\s*:\s*string/.test(sig), `${f}:${fn.name} nhận email làm tham số; chuyển sang đọc từ phiên`);
    }
  }
});
