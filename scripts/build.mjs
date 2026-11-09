// npm run build: content/ md 파싱 → 암호화 → dist/
// 접속코드는 ACCESS_CODE.txt (git에 올라가지 않음). 없으면 새로 만든다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, cpSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, pbkdf2Sync, createCipheriv, createHash } from 'node:crypto';
import { parseContent } from './parse.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const at = (...p) => join(ROOT, ...p);
const DIST = at('dist');
const CODE_FILE = process.env.ACCESS_CODE_FILE || at('ACCESS_CODE.txt'); // 테스트용으로 다른 파일을 쓸 수 있다
const ITER = 310000;

// 접속코드: 헷갈리는 글자(0 O 1 I L) 없이 12자 ≈ 60비트
export function newCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const g = () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join('');
  return `${g()}-${g()}-${g()}`;
}
export const normalize = (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

function readOrCreateCode() {
  if (!process.argv.includes('--new-code') && existsSync(CODE_FILE)) {
    const line = readFileSync(CODE_FILE, 'utf8').split('\n').find((l) => /^[A-Z0-9]{4}-/.test(l.trim()));
    if (line) return { code: line.trim(), created: false };
  }
  const code = newCode();
  writeFileSync(CODE_FILE, `${code}\n\n# 타로 복습 앱 접속코드\n# 만든 날: ${new Date().toISOString().slice(0, 10)}\n# 이 파일은 git에 올라가지 않습니다 (.gitignore). 잃어버리면 npm run new-code 로 새로 만들고 다시 배포하세요.\n# 대소문자와 하이픈(-)은 입력할 때 무시됩니다.\n`, { mode: 0o600 });
  return { code, created: true };
}

const seal = (key, buf) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
};

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif' };
const FONT_EXT = ['.woff2', '.woff', '.otf', '.ttf'];

function main() {
  const { code, created } = readOrCreateCode();
  const salt = randomBytes(16);
  const key = pbkdf2Sync(normalize(code), salt, ITER, 32, 'sha256');

  const content = parseContent(at('content'));
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, 'img'), { recursive: true });

  // 이미지: assets/images 의 파일을 하나씩 암호화. 파일 이름(확장자 뺀 것)이 키 — 예: major-00.webp → 바보 카드
  const images = {};
  const imgDir = at('assets/images');
  for (const f of existsSync(imgDir) ? readdirSync(imgDir) : []) {
    const ext = extname(f).toLowerCase();
    if (!MIME[ext]) continue;
    const buf = readFileSync(join(imgDir, f));
    const out = createHash('sha256').update(buf).digest('hex').slice(0, 12) + '.bin';
    writeFileSync(join(DIST, 'img', out), seal(key, buf));
    images[basename(f, extname(f))] = { file: `img/${out}`, type: MIME[ext] };
  }
  const creditsFile = at('assets/credits.json');
  const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : [];

  const bundle = { builtAt: new Date().toISOString(), ...content, images, credits };
  delete bundle.flags;
  delete bundle.ills;
  writeFileSync(join(DIST, 'data.bin'), seal(key, Buffer.from(JSON.stringify(bundle))));
  writeFileSync(join(DIST, 'meta.json'), JSON.stringify({ salt: salt.toString('base64'), iter: ITER, v: Date.now() }));

  // 공개 파일: 앱 껍데기(내용 없음), 인트로용 공개 이미지, 글꼴
  for (const f of readdirSync(at('src'))) cpSync(at('src', f), join(DIST, f), { recursive: true });
  if (existsSync(at('assets/public'))) cpSync(at('assets/public'), join(DIST, 'public'), { recursive: true });
  const fonts = existsSync(at('assets/fonts')) ? readdirSync(at('assets/fonts')).filter((f) => FONT_EXT.includes(extname(f).toLowerCase())) : [];
  let fontCss = '';
  for (const f of fonts) {
    mkdirSync(join(DIST, 'fonts'), { recursive: true });
    cpSync(at('assets/fonts', f), join(DIST, 'fonts', f));
    // display.* → 제목용, body.* → 본문용 (예: 봄바람체 파일을 display.ttf 로 넣으면 제목 글꼴이 바뀐다)
    const role = basename(f, extname(f)).toLowerCase();
    if (role === 'display' || role === 'body') fontCss += `@font-face{font-family:"Custom-${role}";src:url("fonts/${f}");font-display:swap}\n`;
  }
  writeFileSync(join(DIST, 'fonts.css'), fontCss);
  writeFileSync(join(DIST, '.nojekyll'), '');

  writeReport(content);
  writeIllustrationList(content.ills, images);
  writeIllustrationPrompts(content.ills, images);
  const learned = content.cards.filter((c) => c.status === 'learned').length;
  console.log(`✓ 카드 ${learned}/78장, 이야기 ${content.stories.length}편, 노트 ${content.notes.length}개, 이미지 ${Object.keys(images).length}개 → dist/ (암호화됨)`);
  console.log(created ? `✓ 새 접속코드를 만들었습니다 → ACCESS_CODE.txt` : `✓ 기존 접속코드 사용 (ACCESS_CODE.txt)`);
  if (content.flags.length) console.log(`! 확인이 필요한 카드 ${content.flags.length}건 → parse-report.md`);
}

// 사람이 확인하는 파싱 결과표 (로컬 전용, git 제외)
function writeReport({ cards, flags }) {
  const cut = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s).replace(/\|/g, '\\|');
  const rows = cards.map((c) => `| ${c.id} | ${c.nameKo} | ${c.status === 'learned' ? '✅' : '⏳'} | ${cut(c.definition, 80)} | ${cut(c.notes, 60)} | ${c.forestHtml ? '🐾' : ''}${c.appendixHtml ? '🔎' : ''} | ${flags.filter((f) => f.id === c.id).map((f) => f.why).join('<br>')} |`);
  writeFileSync(at('parse-report.md'), `# 파싱 결과 확인표\n\n만든 시각: ${new Date().toLocaleString('ko-KR')}\n\n🐾 = 이야기의 마법 삼림 블록 연결됨, 🔎 = 부록 놓친 해석 연결됨\n\n| id | 카드 | 상태 | 한 줄 정의 | 메모(앞부분) | 연결 | 확인 필요 |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
}

// ChatGPT가 그릴 삽화 목록 (로컬 전용, git 제외)
// GPT 이미지 요청문: 첫 메시지(화풍·인물 고정)는 한 번만, 그다음은 남은 장면을 한 줄씩 보낸다 (토큰 절약)
const ILL_STYLES = {
  romance: { tag: 'A', title: '로판 (로맨스 판타지)' },
  blog: { tag: 'B', title: '역사 블로그' },
};
function writeIllustrationPrompts(ills, images) {
  const todo = ills.filter((x) => !images[x.name]);
  const groups = Object.entries(ILL_STYLES).map(([k, st]) => {
    const rows = todo.filter((x) => x.name.startsWith(`ill-${k}-`));
    return rows.length ? `## ${st.tag} · ${st.title} — ${rows.length}장\n\n\`\`\`\n${rows.map((x) => `${st.tag} ${x.name}: ${x.desc}`).join('\n')}\n\`\`\`\n` : '';
  }).join('\n');
  const left = todo.filter((x) => Object.keys(ILL_STYLES).some((k) => x.name.startsWith(`ill-${k}-`))).length;
  writeFileSync(at('illustration-prompts.md'), `# GPT 삽화 요청문 (남은 ${left}장)

빌드할 때마다 새로 만들어져요. 이미 그림이 있는 장면은 빠집니다.

## 쓰는 법

1. 새 대화를 열고 화풍 스케치 2장(\`docs/references/STYLE-A-romance.webp\`, \`STYLE-B-blog.webp\`)을 첨부한 뒤 **첫 메시지**를 보내요. 한 대화에 한 번만요.
2. 그다음엔 아래 목록에서 **한 줄씩** 복사해 보내요. 한 줄 = 그림 한 장.
3. 받은 그림은 줄 맨 앞의 파일 이름(예: \`ill-romance-major-00\`)에 \`.webp\`·\`.png\`·\`.jpg\` 중 하나를 붙여 \`assets/images/\`에 저장하고 \`npm run deploy\` 하면 돼요.
4. 인물 얼굴이 흔들리기 시작하면 새 대화에서 1번부터 다시 해요(대화가 길수록 토큰도 많이 들어요).

## 첫 메시지 (스케치 2장 첨부해서 한 번만)

\`\`\`
타로 이야기 삽화를 그려요. 질문·설명 없이 이미지만 주세요.
공통: 가로 4:3, 글자·로고·워터마크 없음. 카드 속 그림은 1909년 라이더 웨이트 스미스 구도.
A = 첫 번째 첨부 화풍. 로판 웹소설 삽화, 따뜻한 역광, 섬세한 디지털 페인팅. 인물 고정:
- 세미: 20대 한국 여성, 어깨 길이 짙은 갈색 웨이브 단발과 앞머리, 크림색 블라우스·버건디 리본·버건디 치마(카드 장면에선 그 카드 옷차림 가능)
- 피터: 키 큰 요정 청년, 짙은 녹색 머리, 뾰족한 귀, 반투명 무지갯빛 날개, 녹색·금장 망토
B = 두 번째 첨부 화풍. 빈티지 판화 콜라주, 찢긴 종이 가장자리, 세피아에 버건디·녹색, 손으로 그린 화살표·동그라미(글자는 넣지 않음).
제가 "A 파일명: 장면" 또는 "B 파일명: 장면"을 보내면 그 한 장만 그려 주세요.
\`\`\`

${groups}`);
}

function writeIllustrationList(ills, images) {
  const done = ills.filter((x) => images[x.name]).length;
  const rows = ills.map((x) => `| ${images[x.name] ? '✅' : '⬜'} | \`${x.name}.webp\` | ${x.story} · ${x.chapter} | ${x.desc.replace(/\|/g, '\\|')} |`);
  writeFileSync(at('illustration-list.md'), `# 삽화 목록\n\n완성 ${done} / ${ills.length}. 파일을 assets/images/ 에 이 이름으로 넣고 npm run build 하면 이야기 속 자리에 들어갑니다.\n그리는 규칙은 docs/CHATGPT_DESIGN_BRIEF.md 의 "삽화" 항목을 따릅니다.\n\n| 상태 | 파일 이름 | 위치 | 장면 |\n|---|---|---|---|\n${rows.join('\n')}\n`);
}

main();
