# Dựng video theo luật (không AI)

Kiểu video: người nói trước máy quay, phụ đề tự động với từ khóa phóng to màu nhấn, logo góc, nhạc nền hạ âm khi có
tiếng nói, cắt khoảng lặng. Mọi bước là công thức: cùng đầu vào cho cùng đầu ra.

## Cần có trên máy
- `ffmpeg` (có sẵn trên macOS qua Homebrew; trên Docker: `apt-get install ffmpeg`).
- ImageMagick `magick` để vẽ phụ đề thành PNG (không cần libass trong FFmpeg).
- Python 3 với `openai-whisper` (`pip install openai-whisper`) cho bước chuyển giọng nói thành chữ; chạy tại chỗ.
- Font: macOS dùng Arial Bold / Arial Black; Docker thay bằng `fonts-dejavu` hoặc font thương hiệu (sửa FONT_REG / FONT_BIG).

## Hai bước
```bash
python3 scripts/video/transcribe.py --input clip.mov --out words.json --model medium --prompt "Gội dưỡng sinh, Mộc Diệp Spa"
python3 scripts/video/render.py --input clip.mov --transcript words.json --out ra.mp4 \
  --logo public/brand/baor-light.png --music nhac.mp3 --keywords "tiết kiệm,chi phí,AI" --accent F2C94C
```
Kết quả in ra JSON: thời lượng vào / ra, số đoạn đã cắt, số khung phụ đề.

## Luật đang dùng (chỉnh ở đầu `render.py`)
| Luật | Giá trị |
|---|---|
| Cắt lặng dài hơn | 0,6 giây, ngưỡng -35 dB (clip có nhạc sẵn: `--silence-db -25`) |
| Khung phụ đề | tối đa 6 từ hoặc 2,4 giây, ngắt ở dấu câu |
| Từ khóa | số, năm, phần trăm, và danh sách `--keywords` |
| Cỡ chữ | thường 58, từ khóa 100 (Arial Black, viết hoa, màu nhấn) |
| Vị trí | canh giữa, đáy chữ cách mép dưới 430 px (vùng an toàn 9:16) |
| Logo | góc phải trên, rộng 220 px |
| Nhạc | hạ âm khi có tiếng nói (sidechain), chuẩn hóa -16 LUFS |
| Xuất | 1080×1920, 30 fps, H.264 CRF 20, AAC 160k |

## Bước tiếp theo trong hệ thống
Nối vào Video Studio: tải clip thô → chuyển chữ (job nền) → người sửa chữ và chọn từ khóa → bấm "Dựng" → video vào
"Chờ kiểm tra". Cảnh phụ (B-roll) theo thẻ và xuất thêm 1:1 / 16:9 làm ở vòng sau.
