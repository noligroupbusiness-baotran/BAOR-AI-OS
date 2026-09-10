#!/usr/bin/env bash
# Tạo bộ logo từ tệp gốc (nền trắng): xóa nền, cắt sát, và hai biến thể
#   public/brand/baor-dark.png   chữ tối (màu gốc)   → dùng trên nền sáng
#   public/brand/baor-light.png  chữ sáng (vàng kem) → dùng trên nền tối
#   public/brand/baor-mark-*.png biểu tượng vuông (chữ B) cho sidebar thu gọn
# Cách dùng: bash scripts/make-logo-variants.sh /đường/dẫn/logo-goc.png
set -euo pipefail
SRC="${1:?Cần đường dẫn tệp logo gốc}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/brand"
mkdir -p "$OUT"
command -v magick >/dev/null || { echo "Cần ImageMagick (brew install imagemagick)"; exit 1; }

# 1. Xóa nền trắng (dung sai 12%) nếu tệp chưa có nền trong suốt; cắt sát, đệm 2%, giới hạn chiều rộng 1600px.
#    Tệp đã trong suốt thì giữ nguyên để không làm thủng vùng sáng bóng của chữ.
if [ "$(magick "$SRC" -format '%[opaque]' info:)" = "True" ]; then
  magick "$SRC" -fuzz 12% -transparent white -trim +repage -resize 1600x -bordercolor none -border 2% "$OUT/baor-dark.png"
else
  magick "$SRC" -trim +repage -resize 1600x -bordercolor none -border 2% "$OUT/baor-dark.png"
fi

# 2. Biến thể chữ sáng: lấy alpha làm khuôn, tô gradient vàng kem → vàng đồng để giữ chất "gold".
W=$(magick identify -format %w "$OUT/baor-dark.png")
H=$(magick identify -format %h "$OUT/baor-dark.png")
magick -size "${W}x${H}" gradient:"#f7ecd2-#d9b26f" \( "$OUT/baor-dark.png" -alpha extract \) -compose CopyOpacity -composite "$OUT/baor-light.png"

# 3. Biểu tượng vuông: cắt chữ B (khoảng 19% chiều rộng đầu tiên của phần chữ lớn), đóng khung vuông.
crop_mark() {
  local in="$1" out="$2"
  # Cắt chữ B, cắt sát, rồi đóng khung vuông theo cạnh lớn nhất của chính chữ B (không phải cả wordmark).
  magick "$in" -gravity West -crop "19%x78%+0+0" +repage -trim +repage -bordercolor none -border 8% -gravity center -background none -extent '%[fx:max(w,h)]x%[fx:max(w,h)]' "$out"
}
crop_mark "$OUT/baor-dark.png" "$OUT/baor-mark-dark.png"
crop_mark "$OUT/baor-light.png" "$OUT/baor-mark-light.png"

ls -la "$OUT"
echo "Xong. Sidebar sẽ tự dùng: baor-dark.png trên nền sáng, baor-light.png trên nền tối."
