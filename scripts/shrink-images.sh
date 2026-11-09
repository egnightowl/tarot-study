#!/bin/sh
# assets/images 의 큰 그림(700KB 넘는 png/jpg/jpeg)을 긴 변 1200px jpg로 줄인다 (macOS sips 사용).
# 원본은 지우지 않고 assets/images-originals/ 로 옮긴다.
cd "$(dirname "$0")/.."
command -v sips >/dev/null || exit 0
mkdir -p assets/images-originals
for f in assets/images/*.png assets/images/*.jpg assets/images/*.jpeg; do
  [ -f "$f" ] || continue
  [ "$(stat -f%z "$f")" -gt 716800 ] || continue
  name=$(basename "$f"); base="${name%.*}"
  mv "$f" "assets/images-originals/$name"
  sips -Z 1200 -s format jpeg -s formatOptions 72 "assets/images-originals/$name" --out "assets/images/$base.jpg" >/dev/null
  echo "  줄임: $name → $base.jpg ($(du -h "assets/images/$base.jpg" | cut -f1))"
done
