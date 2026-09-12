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
| Khung phụ đề | tối đa 5 từ hoặc 2,2 giây, ngắt ở dấu câu và chỗ ngừng > 0,35 giây, không cắt giữa cụm từ khóa, mỗi khung một điểm nhấn |
| Từ khóa | số, năm, phần trăm, và danh sách `--keywords` (nhận cả cụm nhiều từ); phóng khung 5% trong 0,35 giây; âm pop tổng hợp, tối đa 1 lần / 3 giây |
| Cỡ chữ | dòng phụ 48 nghiêng, từ khóa 200 Barlow Condensed ExtraBold viết hoa, vàng chuyển sắc, viền tối; chữ nảy 0,1 giây khi hiện |
| Vị trí | khối chữ canh giữa ngang, tâm ở 60% chiều cao (chỉnh `--caption-y`) |
| Logo | góc phải trên, rộng 220 px |
| Nhạc | hạ âm khi có tiếng nói (sidechain), chuẩn hóa -16 LUFS |
| Xuất | 1080×1920, 30 fps, H.264 CRF 20, AAC 160k |

## Dựng tự động trong hệ thống (đã nối)
Thả clip vào `DATA_DIR/video-inbox/` (đường dẫn hiện ở Cài đặt › Dựng video). Mỗi phút bộ chạy nền lấy một tệp, chạy hai
bước trên (`src/lib/video/auto-edit.ts`), đưa video vào Kho tải lên và Video Studio › Chờ kiểm tra, ghi vào Nhật ký hệ thống.
Tệp `.txt` cùng tên là gợi ý nhận dạng (kịch bản, từ chuyên ngành). Tệp xong → `da-xu-ly/`, lỗi → `loi/`.
Cấu hình: từ khóa nhấn, màu nhấn, vị trí chữ, bộ nhận dạng, nhạc nền, bật/tắt (Cài đặt › Dựng video). Máy chủ cần
ffmpeg, ImageMagick, Python 3 + openai-whisper; đặt `PYTHON_BIN` nếu python3 không ở PATH.

Vòng sau: cảnh phụ (B-roll) theo thẻ, thẻ mở đầu / kết, xuất thêm 1:1 và 16:9, sửa chữ trước khi dựng.
