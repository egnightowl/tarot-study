# AGENTS.md — ChatGPT(Codex)와 Claude가 함께 쓰는 작업 규칙

이 저장소는 타로 복습 웹앱 **GO-TAROT**(부제: 이야기로 읽는 타로)이다. 역할은 이렇게 나눈다.

> ChatGPT는 작업 전에 **[docs/CHATGPT_DESIGN_BRIEF.md](docs/CHATGPT_DESIGN_BRIEF.md)** 를 먼저 읽는다. 레퍼런스 이미지는 `docs/references/` 에 있고, 읽는 법은 지침서 2장에 있다.

| 누가 | 하는 일 |
|---|---|
| ChatGPT | 이미지·아이콘 고르기와 만들기, 디자인 값 제안, 코드와 해석 교차 검증 |
| Claude | 코딩, 사이트 레이아웃, 데이터(md 파싱·암호화), GitHub 배포 |

## 이미지와 아이콘 — 사용자가 미리 허락함

사용자는 **ChatGPT가 이 앱에 필요한 이미지(Pinterest 등)와 아이콘(Flaticon 등)을 매번 묻지 않고 내려받아 넣는 것**을 미리 허락했다. 아래 규칙만 지키면 된다.

1. **넣는 곳**: `assets/images/` (이 폴더는 git에 올라가지 않고, 빌드 때 접속코드로 암호화된다)
   - `assets/public/` 은 인트로처럼 **잠금 전에 누구나 보는 공개 폴더**다. 직접 만든 그림이나 퍼블릭 도메인(예: 1909년 라이더 웨이트 원판)만 넣는다. Pinterest·Flaticon에서 받은 파일은 넣지 않는다.
2. **파일 이름 = 붙는 자리** (확장자: webp 권장, png·jpg·svg 가능)
   - 카드 그림: `major-00` ~ `major-21`, `wands-01` ~ `wands-14`, `cups-…`, `swords-…`, `pentacles-…` (01=에이스, 11=시종, 12=기사, 13=여왕, 14=왕)
   - 그 밖의 장식: `deco-이름` (예: `deco-moon`), 아이콘: `icon-이름` (예: `icon-cups`)
   - 같은 이름 파일이 있으면 바꾸기 전에 기존 파일을 `assets/images/_old/` 로 옮긴다
3. **출처 기록은 필수**: 받을 때마다 `assets/credits.json` 배열에 한 줄을 더한다. 앱의 "이미지 출처" 화면에 자동으로 나온다.
   ```json
   { "file": "icon-cups.svg", "site": "Flaticon", "author": "작가 이름", "source": "https://www.flaticon.com/...", "license": "Flaticon Free (출처 표시)" }
   ```
   - Flaticon 무료 아이콘은 출처 표시가 조건이다. 작가 이름과 링크를 꼭 적는다.
   - Pinterest 핀은 대부분 다른 사람의 작품을 다시 올린 것이다. 핀 주소가 아니라 **원래 작가·원본 주소**를 찾아 적는다. 못 찾으면 `"license": "출처 확인 필요"` 로 적어 둔다.
   - 마법 삼림(Lo Scarabeo) 카드 사진은 개인 복습용으로만 쓴다. `assets/images/` 에만 넣는다.
4. **크기**: 카드 그림은 세로 7:12 비율, 긴 변 1200px 이하, 파일 하나 500KB 이하를 권장한다.
5. 넣은 뒤 `npm run build` 를 돌리면 반영된다. 빌드 결과의 "이미지 N개"로 확인한다.

## 디자인 값

- 색·글꼴 같은 디자인 값은 `src/style.css` 맨 위 `:root` 블록에만 있다. 새 값을 제안할 때는 이 블록을 고친다.
- 글꼴 파일은 `assets/fonts/display.(woff2|ttf|otf)` (제목용), `assets/fonts/body.(…)` (본문용) 이름으로 넣으면 자동으로 쓰인다. 웹에 올려도 되는 라이선스인지 확인한다.

## 절대 하지 않을 것

- `ACCESS_CODE.txt` 를 읽어서 다른 곳에 적거나, 커밋하거나, 채팅에 붙이지 않는다.
- `content/`, `assets/images/`, `parse-report.md` 를 공개 저장소나 `gh-pages` 브랜치에 올리지 않는다. 공개되는 것은 `dist/` (암호화된 결과물)뿐이다.

## 교차 검증할 때 보는 것

- `npm run build` 가 오류 없이 끝나는지, `parse-report.md` 의 "확인 필요" 항목
- 휴대폰 폭(375px)에서 가로 스크롤이 생기지 않는지, 다크 모드에서 글자가 잘 보이는지
- 이야기·레슨의 타로 해석이 강의 노트(`content/notes.md`)와 어긋나지 않는지
