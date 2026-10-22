#!/usr/bin/env python3
"""Nạp nhạc nền + SFX từ KHO TƯ LIỆU (Drive "02-THU-VIEN-TU-LIEU / NHAC-NEN-SFX") vào thư viện dựng tại máy.

Nguồn sự thật là DANH MỤC của kho (`DANH-MUC_NHAC-SFX_v*.csv`, do đội kiểm hồ sơ giấy phép lập): mỗi dòng có link tải gốc
(Pixabay / Mixkit), sha256 của tệp đội đã tải, giấy phép và trạng thái kiểm (ĐỦ-HỒ-SƠ / NGHI-AI / CHỈ-NỘI-BỘ / LOẠI).

LUẬT (không nới):
- CHỈ nạp dòng `ĐỦ-HỒ-SƠ`. NGHI-AI, CHỈ-NỘI-BỘ, LOẠI → không tải, ghi lý do vào báo cáo.
- Tệp tải về phải TRÙNG sha256 trong danh mục (đúng tệp đội đã kiểm); lệch → bỏ, không ghi vào thư viện.
- "ĐỦ-HỒ-SƠ" là kiểm hồ sơ, KHÔNG phải OWNER duyệt và KHÔNG phải quét Content ID → giấy phép ghi kèm "chờ OWNER nghe duyệt":
  bộ dựng chỉ tự chọn bài đã được OWNER nghe duyệt; bài chưa duyệt mà vẫn dùng (chọn tay) → bảng kiểm P chặn đăng.
- Không chứa ID Drive / đường dẫn kho trong mã (repo công khai): danh mục truyền bằng tham số, thư viện nằm trong DATA_DIR.
- Chạy lại nhiều lần an toàn: tệp đã có và đúng sha256 thì bỏ qua; mục đã có trong manifest giữ nguyên trường OWNER (duyệt / loại).

Dùng:  python3 scripts/video/library_sync.py --catalog <DANH-MUC_NHAC-SFX_v1.2.csv> [--data-dir data] [--dry-run]
       python3 scripts/video/library_sync.py --self-test
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.request

PENDING = "chờ OWNER nghe duyệt"
OK_STATUS = "ĐỦ-HỒ-SƠ"
# Thể loại trong danh mục → tâm trạng / mục đích (tiếng Việt) để bộ dựng và biên tập AI chọn theo nội dung
GENRE_MOOD = {
    "lofi-chill": ["lofi", "thư giãn", "chia sẻ nhẹ", "đào tạo"],
    "upbeat": ["sôi động", "năng động", "khuyến mãi", "bán hàng"],
    "cinematic": ["kịch tính", "câu chuyện", "truyền cảm hứng"],
    "nhe-nhang-piano": ["nhẹ nhàng", "sâu lắng", "tâm sự"],
    "corporate-truyen-cam-hung": ["kinh doanh", "truyền cảm hứng", "tuyển dụng", "đào tạo"],
    "acoustic": ["ấm áp", "đời thường", "vlog", "đội nhóm"],
}
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from music_pick import BANNED_IDS  # noqa: E402  (bài LOẠI theo luật A5 — một danh sách dùng chung với bộ dựng)
UA = "Mozilla/5.0 (BAOR library_sync; files listed in the licence catalogue)"


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def seconds(s):
    """'2:12' → 132.0 · '1.76 s' → 1.76 · lạ → None"""
    s = (s or "").strip()
    m = re.fullmatch(r"(\d+):(\d{2})", s)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m = re.match(r"([\d.]+)\s*s\b", s)
    return float(m.group(1)) if m else None


def safe_name(name):
    """Tên tệp từ danh mục chỉ được là tên phẳng an toàn (không thư mục, không ký tự lạ)."""
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,160}\.(mp3|wav)", name or ""))


def license_text(row):
    lic = (row.get("giay_phep") or "").split(" — ")[0].split(" ; ")[0].strip() or "giấy phép theo danh mục"
    return (f"{lic} ({row.get('nguon', '')} {row.get('id', '')}) — kho tư liệu NHAC-NEN-SFX: {OK_STATUS} "
            f"(đội kiểm hồ sơ giấy phép; Content ID thật chưa biết) — {PENDING}")


def entry_for(row, kind):
    e = {
        "file": row["ten_tep"],
        "title": row.get("ten_bai", ""),
        "author": row.get("tac_gia", ""),
        "license": license_text(row),
        "source": row.get("link_trang", ""),
        "download": row.get("link_tai", ""),
        "sha256": row["sha256"].lower(),
        "catalogStatus": OK_STATUS,
        "credit": row.get("ghi_cong", ""),
        "durationSec": seconds(row.get("do_dai", "")),
    }
    if kind == "music":
        e["genre"] = row["the_loai"]
        e["mood"] = GENRE_MOOD.get(row["the_loai"], [row["the_loai"]])
    else:
        e["kind"] = row["the_loai"].split("/", 1)[-1]
    return e


def download(url, dest, want_sha, timeout=180):
    """Tải về tệp tạm cạnh đích, kiểm sha256 rồi mới đổi tên → không bao giờ để tệp dở / sai trong thư viện."""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dest), suffix=".part")
    try:
        with os.fdopen(fd, "wb") as f, urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        got = sha256_file(tmp)
        if got != want_sha:
            return f"sha256 lệch danh mục ({got[:12]}… ≠ {want_sha[:12]}…)"
        os.replace(tmp, dest)
        return None
    except Exception as ex:  # mạng / HTTP: báo lỗi từng tệp, không dừng cả lượt
        return f"tải lỗi: {str(ex)[:120]}"
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _drop_approval(m):
    """Bỏ duyệt OWNER: trả giấy phép kho nguyên văn (lại "chờ OWNER nghe duyệt")."""
    if m.get("ownerApproved") and isinstance(m.get("catalogLicense"), str):
        m["license"] = m["catalogLicense"]
    m.pop("ownerApproved", None)
    m.pop("catalogLicense", None)


def merge(manifest, new, revoked=None):
    """Thêm / cập nhật theo tên tệp.
    - Giữ quyết định OWNER (duyệt, loại tay, mặc định) khi tệp KHÔNG đổi.
    - Kho đổi tệp (sha256 khác) → bỏ duyệt: OWNER chưa nghe bản âm thanh mới (phản biện P1-b).
    - `revoked` {tệp: lý do}: mục từ kho mà kho nay không còn ghi ĐỦ-HỒ-SƠ (NGHI-AI / CHỈ-NỘI-BỘ / LOẠI / xoá dòng)
      → loại khỏi bộ dựng + bỏ duyệt (phản biện P1-a). Kho ghi ĐỦ-HỒ-SƠ lại → gỡ loại do kho (không gỡ loại tay của OWNER)."""
    by = {m.get("file"): m for m in manifest}
    for e in new:
        old = by.get(e["file"])
        if old is None:
            manifest.append(e)
            by[e["file"]] = e
            continue
        if old.get("sha256") and old.get("sha256") != e["sha256"]:
            _drop_approval(old)
        keep = {k: old[k] for k in ("ownerApproved", "catalogLicense", "default") if k in old}
        if old.get("ownerApproved"):
            keep["license"] = old.get("license", e["license"])
        if not old.get("catalogExcluded"):
            keep.update({k: old[k] for k in ("exclude", "excludeReason") if k in old})
        for k in ("exclude", "excludeReason", "catalogExcluded"):
            old.pop(k, None)
        old.update({**e, **keep})
    for f, (status, reason) in (revoked or {}).items():
        old = by.get(f)
        if old is None or not old.get("catalogStatus"):
            continue  # chỉ thu hồi mục đến từ kho; bài nạp tay / duyệt riêng không do danh mục quyết
        _drop_approval(old)
        if old.get("exclude") and not old.get("catalogExcluded"):
            old["catalogStatus"] = status  # OWNER đã loại tay: giữ nguyên lý do của OWNER (kho ghi ĐỦ-HỒ-SƠ lại cũng không gỡ)
            continue
        old.update({"catalogStatus": status, "exclude": True, "catalogExcluded": True, "excludeReason": reason})
    return manifest


def sync(rows, data_dir, dry_run=False, fetch=download, log=print):
    out = {"music": [], "sfx": []}
    report = {"added": 0, "present": 0, "skipped": [], "failed": [], "revoked": []}
    in_catalog = {(r.get("ten_tep") or "").strip() for r in rows}
    revoked = {}
    for r in rows:
        name, status = (r.get("ten_tep") or "").strip(), (r.get("trang_thai") or "").strip()
        kind = "sfx" if (r.get("the_loai") or "").startswith("SFX") or (r.get("duong_dan") or "").startswith("SFX/") else "music"
        if status != OK_STATUS:
            report["skipped"].append({"file": name, "reason": f"trạng thái kho {status or 'trống'} → không dùng"})
            revoked[name] = (status or "trống", f"kho tư liệu ghi {status or 'trống'} → không dùng (thu hồi khi đồng bộ)")
            continue
        if any(i in name or i in (r.get("link_trang") or "") for i in BANNED_IDS):
            report["skipped"].append({"file": name, "reason": "bài LOẠI theo luật A5 (QĐ-CEO 1010) → không dùng"})
            revoked[name] = ("LOẠI (A5)", "bài LOẠI theo luật A5 (QĐ-CEO 1010; Skill ESV / Ngang v0.1.r2) → không dùng")
            continue
        if not safe_name(name) or not re.fullmatch(r"[0-9a-fA-F]{64}", r.get("sha256") or "") or not (r.get("link_tai") or "").startswith("https://"):
            report["skipped"].append({"file": name, "reason": "dòng danh mục thiếu / sai tên tệp, sha256 hoặc link tải https"})
            continue
        d = os.path.join(data_dir, "video-assets", kind)
        dest = os.path.join(d, name)
        want = r["sha256"].lower()
        if os.path.isfile(dest) and sha256_file(dest) == want:
            report["present"] += 1
        elif dry_run:
            report["added"] += 1
            log(f"(thử) sẽ tải {kind}: {name}")
        else:
            os.makedirs(d, exist_ok=True)
            err = fetch(r["link_tai"], dest, want)
            if err:
                report["failed"].append({"file": name, "reason": err})
                log(f"LỖI {name}: {err}")
                continue
            report["added"] += 1
            log(f"đã nạp {kind}: {name}")
        out[kind].append(entry_for(r, kind))
    if not dry_run:
        for kind, items in out.items():
            d = os.path.join(data_dir, "video-assets", kind)
            os.makedirs(d, exist_ok=True)
            mf = os.path.join(d, "manifest.json")
            try:
                cur = json.load(open(mf, encoding="utf-8"))
            except (OSError, ValueError):
                cur = []
            gone = {m["file"]: ("không còn trong danh mục", "không còn trong danh mục kho tư liệu → không dùng") for m in cur
                    if isinstance(m, dict) and m.get("catalogStatus") and m.get("file") not in in_catalog}
            rv = {**gone, **{f: v for f, v in revoked.items() if any(isinstance(m, dict) and m.get("file") == f for m in cur)}}
            report["revoked"] += [f for f, _ in rv.items() if any(m.get("file") == f and m.get("catalogStatus") for m in cur if isinstance(m, dict))]
            json.dump(merge(cur, items, rv), open(mf + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            os.replace(mf + ".tmp", mf)
    report["music"], report["sfx"] = len(out["music"]), len(out["sfx"])
    return report


def self_test():
    """Không mạng: tệp giả, fetch giả. Kiểm: chỉ ĐỦ-HỒ-SƠ; sha lệch bị bỏ; tên nguy hiểm bị chặn; chạy lại giữ OWNER duyệt."""
    bad = 0

    def check(cond, msg):
        nonlocal bad
        if not cond:
            bad += 1
            print("SAI:", msg)

    good, evil = b"nhac-that", b"tep-bi-trao"
    sha = hashlib.sha256(good).hexdigest()

    def fake(url, dest, want):
        data = evil if "trao" in url else good
        if hashlib.sha256(data).hexdigest() != want:
            return "sha256 lệch danh mục"
        open(dest, "wb").write(data)
        return None

    base = {"nguon": "Mixkit", "id": "1", "giay_phep": "Mixkit Stock Music Free License — https://mixkit.co/license/", "do_dai": "2:12", "ghi_cong": "Không bắt buộc"}
    rows = [
        {**base, "ten_tep": "upbeat_a_mixkit1.mp3", "the_loai": "upbeat", "trang_thai": "ĐỦ-HỒ-SƠ", "sha256": sha, "link_tai": "https://x/a.mp3"},
        {**base, "ten_tep": "lofi_b_pixabay2.mp3", "the_loai": "lofi-chill", "trang_thai": "NGHI-AI", "sha256": sha, "link_tai": "https://x/b.mp3"},
        {**base, "ten_tep": "lofi_c_pixabay3.mp3", "the_loai": "lofi-chill", "trang_thai": "CHỈ-NỘI-BỘ", "sha256": sha, "link_tai": "https://x/c.mp3"},
        {**base, "ten_tep": "cinematic_d_mixkit4.mp3", "the_loai": "cinematic", "trang_thai": "ĐỦ-HỒ-SƠ", "sha256": sha, "link_tai": "https://x/trao.mp3"},
        {**base, "ten_tep": "../../evil.mp3", "the_loai": "upbeat", "trang_thai": "ĐỦ-HỒ-SƠ", "sha256": sha, "link_tai": "https://x/e.mp3"},
        {**base, "ten_tep": "pop_e_mixkit5.wav", "the_loai": "SFX/pop", "trang_thai": "ĐỦ-HỒ-SƠ", "sha256": sha, "link_tai": "https://x/p.wav", "do_dai": "0.48 s", "duong_dan": "SFX/pop/pop_e_mixkit5.wav"},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        rep = sync(rows, tmp, fetch=fake, log=lambda *_: None)
        mus = json.load(open(os.path.join(tmp, "video-assets", "music", "manifest.json"), encoding="utf-8"))
        sfx = json.load(open(os.path.join(tmp, "video-assets", "sfx", "manifest.json"), encoding="utf-8"))
        check([m["file"] for m in mus] == ["upbeat_a_mixkit1.mp3"], f"chỉ nạp nhạc ĐỦ-HỒ-SƠ đúng sha: {[m['file'] for m in mus]}")
        check(PENDING in mus[0]["license"] and mus[0]["genre"] == "upbeat" and mus[0]["durationSec"] == 132, f"mục nhạc: {mus[0]}")
        check([s["file"] for s in sfx] == ["pop_e_mixkit5.wav"] and sfx[0]["kind"] == "pop" and sfx[0]["durationSec"] == 0.48, f"SFX: {sfx}")
        check(not os.path.exists(os.path.join(tmp, "video-assets", "music", "cinematic_d_mixkit4.mp3")), "tệp sha lệch không được nằm trong thư viện")
        check(not os.path.exists(os.path.join(tmp, "evil.mp3")) and not os.path.exists(os.path.join(tmp, "video-assets", "evil.mp3")), "tên ../ bị chặn")
        check(len(rep["skipped"]) == 3 and len(rep["failed"]) == 1, f"báo cáo: {rep}")
        # OWNER duyệt bài rồi chạy lại: giữ duyệt + license đã duyệt, không tải lại
        mus[0]["ownerApproved"] = {"at": "2026-10-22", "by": "owner@baor.test"}
        mus[0]["license"] = "Mixkit … — OWNER nghe duyệt 22/10/2026"
        json.dump(mus, open(os.path.join(tmp, "video-assets", "music", "manifest.json"), "w", encoding="utf-8"))
        calls = []
        rep2 = sync(rows, tmp, fetch=lambda *a: calls.append(a) or "không được gọi", log=lambda *_: None)
        mus2 = json.load(open(os.path.join(tmp, "video-assets", "music", "manifest.json"), encoding="utf-8"))
        check(mus2[0].get("ownerApproved") and "OWNER nghe duyệt" in mus2[0]["license"] and PENDING not in mus2[0]["license"], f"giữ duyệt: {mus2[0]}")
        check(rep2["present"] == 2 and not [c for c in calls if "a.mp3" in c[0] or "p.wav" in c[0]], f"không tải lại tệp đúng sha: {rep2} {calls}")
        # Phản biện P1-b: kho đổi tệp (sha256 mới) → bỏ duyệt, giấy phép về "chờ OWNER nghe duyệt"
        new_bytes = b"nhac-khac"
        sha2 = hashlib.sha256(new_bytes).hexdigest()

        def fake2(url, dest, want):
            open(dest, "wb").write(new_bytes)
            return None if hashlib.sha256(new_bytes).hexdigest() == want else "sha256 lệch"
        rows_b = [dict(rows[0], sha256=sha2, link_tai="https://x/a2.mp3")] + rows[1:]
        sync(rows_b, tmp, fetch=fake2, log=lambda *_: None)
        m3 = {m["file"]: m for m in json.load(open(os.path.join(tmp, "video-assets", "music", "manifest.json"), encoding="utf-8"))}["upbeat_a_mixkit1.mp3"]
        check(not m3.get("ownerApproved") and PENDING in m3["license"] and m3["sha256"] == sha2, f"đổi tệp phải bỏ duyệt: {m3}")
        # Phản biện P1-a: OWNER duyệt lại, rồi kho đổi bài sang NGHI-AI → bị loại + bỏ duyệt; kho ghi ĐỦ-HỒ-SƠ lại → gỡ loại, vẫn chờ duyệt
        mus4 = json.load(open(os.path.join(tmp, "video-assets", "music", "manifest.json"), encoding="utf-8"))
        for m in mus4:
            if m["file"] == "upbeat_a_mixkit1.mp3":
                m["catalogLicense"], m["license"], m["ownerApproved"] = m["license"], "… OWNER nghe duyệt 22/10/2026", {"by": "owner@baor.test"}
        json.dump(mus4, open(os.path.join(tmp, "video-assets", "music", "manifest.json"), "w", encoding="utf-8"))
        sync([dict(rows_b[0], trang_thai="NGHI-AI")] + rows_b[1:], tmp, fetch=fake2, log=lambda *_: None)
        m5 = {m["file"]: m for m in json.load(open(os.path.join(tmp, "video-assets", "music", "manifest.json"), encoding="utf-8"))}["upbeat_a_mixkit1.mp3"]
        check(m5.get("exclude") and m5["catalogStatus"] == "NGHI-AI" and not m5.get("ownerApproved") and PENDING in m5["license"], f"kho thu hồi phải loại + bỏ duyệt: {m5}")
        sync(rows_b, tmp, fetch=fake2, log=lambda *_: None)
        m6 = {m["file"]: m for m in json.load(open(os.path.join(tmp, "video-assets", "music", "manifest.json"), encoding="utf-8"))}["upbeat_a_mixkit1.mp3"]
        check(not m6.get("exclude") and m6["catalogStatus"] == OK_STATUS and PENDING in m6["license"], f"kho ghi ĐỦ-HỒ-SƠ lại → gỡ loại do kho, vẫn chờ duyệt: {m6}")
        # xoá dòng khỏi danh mục → loại
        sync(rows_b[1:], tmp, fetch=fake2, log=lambda *_: None)
        m7 = {m["file"]: m for m in json.load(open(os.path.join(tmp, "video-assets", "music", "manifest.json"), encoding="utf-8"))}["upbeat_a_mixkit1.mp3"]
        check(m7.get("exclude") and m7["catalogStatus"] == "không còn trong danh mục", f"xoá dòng khỏi danh mục phải loại: {m7}")
        # OWNER loại tay → kho vẫn ĐỦ-HỒ-SƠ không được gỡ loại tay
        sfx_m = json.load(open(os.path.join(tmp, "video-assets", "sfx", "manifest.json"), encoding="utf-8"))
        sfx_m[0].update({"exclude": True, "excludeReason": "OWNER không thích"})
        json.dump(sfx_m, open(os.path.join(tmp, "video-assets", "sfx", "manifest.json"), "w", encoding="utf-8"))
        sync(rows_b, tmp, fetch=fake2, log=lambda *_: None)
        s8 = json.load(open(os.path.join(tmp, "video-assets", "sfx", "manifest.json"), encoding="utf-8"))[0]
        check(s8.get("exclude") and s8.get("excludeReason") == "OWNER không thích", f"giữ loại tay của OWNER: {s8}")
        # phản biện vòng 2 (P2): OWNER loại tay → kho thu hồi → kho ghi ĐỦ-HỒ-SƠ lại: loại tay vẫn còn
        sync([dict(r, trang_thai="NGHI-AI") if r["ten_tep"].startswith("pop_") else r for r in rows_b], tmp, fetch=fake2, log=lambda *_: None)
        sync(rows_b, tmp, fetch=fake2, log=lambda *_: None)
        s9 = json.load(open(os.path.join(tmp, "video-assets", "sfx", "manifest.json"), encoding="utf-8"))[0]
        check(s9.get("exclude") and s9.get("excludeReason") == "OWNER không thích", f"loại tay qua chu kỳ thu hồi: {s9}")
    print(f"library_sync tự kiểm: {'đạt' if not bad else f'{bad} lỗi'}")
    return bad == 0


def main():
    if "--self-test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True, help="DANH-MUC_NHAC-SFX_v*.csv của kho tư liệu")
    ap.add_argument("--data-dir", default=os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "data")))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    rows = list(csv.DictReader(open(a.catalog, encoding="utf-8-sig")))
    rep = sync(rows, os.path.abspath(a.data_dir), a.dry_run)
    print(json.dumps({k: (v if not isinstance(v, list) else len(v)) for k, v in rep.items()}, ensure_ascii=False))
    for x in rep["skipped"] + rep["failed"]:
        print(f"- {x['file']}: {x['reason']}")
    sys.exit(1 if rep["failed"] else 0)


if __name__ == "__main__":
    main()
