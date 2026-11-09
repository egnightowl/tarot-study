#!/bin/sh
# npm run deploy: 빌드 후 암호화된 dist/ 만 gh-pages 브랜치에 올린다.
# content/, assets/images/, ACCESS_CODE.txt 는 dist/ 에 들어가지 않으므로 공개되지 않는다.
# .deploy/ 에 gh-pages 사본을 두고 바뀐 파일만 커밋해서 올린다(처음 한 번만 전체를 받는다).
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
sh scripts/shrink-images.sh
node scripts/build.mjs
# 평문 내용이 dist/ 에 섞이지 않았는지 마지막으로 확인
if grep -rqs "한 줄 정의\|ACCESS_CODE" dist/*.json dist/*.bin 2>/dev/null; then echo "! dist/ 에 평문이 있습니다. 배포를 멈춥니다."; exit 1; fi
if [ ! -d .deploy/.git ]; then
  rm -rf .deploy
  git clone -q --single-branch --branch gh-pages "$REMOTE" .deploy 2>/dev/null || { mkdir -p .deploy && git -C .deploy init -q -b gh-pages; }
fi
rsync -a --delete --exclude .git dist/ .deploy/
cd .deploy
git add -A
if git diff --cached --quiet; then echo "✓ 바뀐 내용이 없어 올리지 않았어요."; exit 0; fi
echo "  올릴 파일: $(git diff --cached --name-only | wc -l | tr -d ' ')개"
git commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
# GitHub 쪽 일시 오류에 대비해 세 번까지 다시 시도
for n in 1 2 3; do
  if git push -q "$REMOTE" gh-pages 2>/tmp/go-tarot-push.log || git push -q -f "$REMOTE" gh-pages 2>>/tmp/go-tarot-push.log; then
    echo "✓ 배포 완료 → https://egnightowl.github.io/tarot-study/"; exit 0
  fi
  echo "  업로드 실패, 다시 시도합니다 ($n/3)"; sleep 5
done
tail -5 /tmp/go-tarot-push.log; echo "! 배포 실패. 잠시 뒤 npm run deploy 를 다시 실행해 주세요."; exit 1
