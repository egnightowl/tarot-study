#!/bin/sh
# npm run deploy: 빌드 후 암호화된 dist/ 만 gh-pages 브랜치에 올린다.
# content/, assets/images/, ACCESS_CODE.txt 는 dist/ 에 들어가지 않으므로 공개되지 않는다.
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
sh scripts/shrink-images.sh
node scripts/build.mjs
# 평문 내용이 dist/ 에 섞이지 않았는지 마지막으로 확인
if grep -rqs "한 줄 정의\|ACCESS_CODE" dist/*.json dist/*.bin 2>/dev/null; then echo "! dist/ 에 평문이 있습니다. 배포를 멈춥니다."; exit 1; fi
TMP=$(mktemp -d)
cp -R dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$REMOTE" gh-pages
cd - >/dev/null
rm -rf "$TMP"
echo "✓ 배포 완료 → https://egnightowl.github.io/tarot-study/"
