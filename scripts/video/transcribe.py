#!/usr/bin/env python3
"""Chuyển giọng nói thành chữ có mốc thời gian từng từ, chạy tại chỗ bằng Whisper (không gửi dữ liệu ra ngoài).

  python3 scripts/video/transcribe.py --input clip.mov --out words.json [--model medium] [--prompt "từ chuyên ngành, tên sản phẩm"]

Mẹo: --prompt liệt kê từ hay dùng của thương hiệu (tên sản phẩm, thuật ngữ) giúp nhận dạng đúng hơn rõ rệt.
"""
import argparse, json, subprocess, tempfile, os

ap = argparse.ArgumentParser()
ap.add_argument("--input", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--model", default="medium"); ap.add_argument("--prompt", default="")
a = ap.parse_args()

import whisper  # noqa: E402
wav = os.path.join(tempfile.mkdtemp(), "audio.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.input, "-vn", "-ac", "1", "-ar", "16000", wav], check=True)
model = whisper.load_model(a.model)
r = model.transcribe(wav, language="vi", word_timestamps=True, fp16=False, initial_prompt=a.prompt or None)
json.dump(r, open(a.out, "w"), ensure_ascii=False)
print(json.dumps({"words": sum(len(s.get("words", [])) for s in r["segments"]), "text": r["text"][:200]}, ensure_ascii=False))
