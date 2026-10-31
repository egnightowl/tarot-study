# GO-TAROT · 이야기로 읽는 타로

이야기로 기억하고 도형으로 읽는 타로 복습 웹앱. ChatGPT 작업 지침: [docs/CHATGPT_DESIGN_BRIEF.md](docs/CHATGPT_DESIGN_BRIEF.md) 접속코드로 잠긴 정적 사이트(GitHub Pages).

```bash
npm run dev        # 빌드 + 미리 보기 (http://localhost:4173)
npm run build      # content/ md → 암호화 → dist/
npm run new-code   # 접속코드를 새로 만들기 (그 뒤 다시 배포)
npm run deploy     # 빌드 + 암호화된 dist/ 를 gh-pages 에 배포
```

- 접속코드: 처음 빌드할 때 `ACCESS_CODE.txt` 에 자동 생성 (git 제외)
- 내용: `content/*.md` — 새 수트 노트·이야기를 넣고 다시 빌드하면 반영
- 이미지·아이콘·디자인 규칙: [AGENTS.md](AGENTS.md)
- 파싱 확인표: 빌드하면 `parse-report.md` 생성 (git 제외)
