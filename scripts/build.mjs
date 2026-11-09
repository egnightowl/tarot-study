// npm run build: content/ md 파싱 → 암호화 → dist/
// 접속코드는 ACCESS_CODE.txt (git에 올라가지 않음). 없으면 새로 만든다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, cpSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, pbkdf2Sync, createCipheriv, createHash, createHmac } from 'node:crypto';
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

// IV는 내용에서 만든다(HMAC). 같은 그림은 늘 같은 암호문이 되어, 배포 때 바뀐 파일만 올라간다.
// 내용이 다르면 IV도 달라지므로 같은 키·IV를 다른 내용에 다시 쓰는 일은 없다.
const seal = (key, buf) => {
  const iv = createHmac('sha256', key).update(buf).digest().subarray(0, 12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
};

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif' };
const FONT_EXT = ['.woff2', '.woff', '.otf', '.ttf'];

function main() {
  const { code, created } = readOrCreateCode();
  // 솔트도 접속코드처럼 유지한다(.build-salt, git 제외). 새 코드를 만들면 솔트도 새로.
  const SALT_FILE = CODE_FILE.replace(/[^/]+$/, '.build-salt');
  if (created || !existsSync(SALT_FILE)) writeFileSync(SALT_FILE, randomBytes(16).toString('base64'), { mode: 0o600 });
  const salt = Buffer.from(readFileSync(SALT_FILE, 'utf8').trim(), 'base64');
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
// GPT 이미지 요청문 (토큰 절약 + 인물 붕괴 방지)
// 로판: 대화 하나에 5장씩만 그리고 새 대화로 넘어간다. 줄마다 짧은 인물 고정 문구를 붙여, 대화가 길어져도 생김새가 흐려지지 않게 한다.
const ROMANCE_ANCHOR = '고정: 세미=짙은 갈색 웨이브 단발·앞머리·크림 블라우스·버건디 리본 / 피터=짙은 초록 머리(갈색 아님)·뾰족 귀·무지갯빛 투명 날개·녹색 금장 망토 / 빛·시간은 장면대로 / 손·손목·얼굴 해부학 정상';
const ROMANCE_BATCH = 5;
const ROMANCE_START = `캐릭터 시트와 화풍 스케치를 첨부했어요. 질문·설명 없이 이미지만 주세요.
규칙: 가로 4:3 / 글자·로고 없음 / 화풍은 화풍 스케치, 인물 얼굴·머리·옷은 캐릭터 시트와 똑같이 / 주인공 2명 외 인물은 3명 이하, 작게 / 카드 속 장면은 1909년 라이더 웨이트 스미스 구도 / 스케치의 노을빛은 화풍 참고일 뿐, 빛과 시간대는 장면 설명을 따름.
해부학: 손가락 다섯 개, 손목·팔꿈치·무릎은 자연스러운 각도로만 / 팔다리 길이와 몸 비율은 실제 사람과 같게 / 얼굴은 정면이나 3/4 각도, 좌우가 뒤틀리지 않게 / 두 사람이 겹치거나 팔다리가 엉키지 않게.
구도: 주인공은 무릎 위까지 나오는 중간 샷으로 크게 / 손은 옷자락·소품·무릎 위에 편하게 두고, 손이 복잡해지는 동작은 손이 덜 보이는 각도로 바꿔도 됨 / 공중에 뜨거나 뛰는 자세보다 서거나 앉은 자세.
제가 "A 파일명 | 장면 | 고정"을 보내면 그 한 장만 그려 주세요.`;
const BLOG_START = `화풍 스케치를 첨부했어요. 질문·설명 없이 이미지만 주세요.
규칙: 가로 4:3 / 빈티지 판화 콜라주, 찢긴 종이 가장자리, 세피아에 버건디·녹색 / 손으로 그린 화살표·동그라미는 되지만 글자는 넣지 않음 / 카드 그림은 1909년 라이더 웨이트 스미스 구도.
제가 "B 파일명: 장면"을 보내면 그 한 장만 그려 주세요.`;
const block = (t) => '```\n' + t + '\n```\n';
function writeIllustrationPrompts(ills, images) {
  const todo = ills.filter((x) => !images[x.name]);
  const rom = todo.filter((x) => x.name.startsWith('ill-romance-'));
  const blog = todo.filter((x) => x.name.startsWith('ill-blog-'));
  const batches = [];
  for (let i = 0; i < rom.length; i += ROMANCE_BATCH) batches.push(rom.slice(i, i + ROMANCE_BATCH));
  const romMd = batches.map((b, i) => `### 로판 ${i + 1}번째 대화 (${b.length}장) — 새 대화 + 캐릭터 시트·화풍 스케치 첨부 + 시작 메시지\n\n` +
    b.map((x) => block(`A ${x.name} | ${x.desc} | ${ROMANCE_ANCHOR}`)).join('\n')).join('\n');
  writeFileSync(at('illustration-prompts.md'), `# GPT 삽화 요청문 (남은 로판 ${rom.length}장 · 블로그 ${blog.length}장)

빌드할 때마다 새로 만들어져요. \`assets/images/\`에 그림이 들어간 장면은 빠집니다.

**저장할 때 파일 이름은 줄 앞의 \`A \`·\`B \`를 빼고** \`ill-…\`부터 적어요. 예: \`A ill-romance-major-15\` → \`ill-romance-major-15.png\`

## 로판 (A) — 인물 붕괴를 줄이는 방법

1. **캐릭터 시트 먼저 한 장** (처음 한 번만). 지금까지 그린 그림 중 세미와 피터가 가장 마음에 드는 한 장을 첨부하고 아래를 보내요. 결과를 \`docs/references/CHARACTER-SHEET.png\`로 저장해 두세요.
${block(`첨부한 그림의 두 인물로 캐릭터 시트를 만들어 주세요. 흰 배경, 가로 4:3, 글자 없음. 왼쪽 세미, 오른쪽 피터. 각각 정면 전신 1개와 얼굴 클로즈업 1개.
세미: 20대 한국 여성, 짙은 갈색 웨이브 단발과 앞머리, 크림색 블라우스, 버건디 리본, 버건디 치마.
피터: 키 큰 요정 청년, 짙은 초록 머리(갈색 아님), 뾰족한 귀, 무지갯빛 투명 날개, 녹색에 금장식 망토.`)}
2. **대화 하나에 5장까지만.** 아래 묶음마다 새 대화를 열고, **캐릭터 시트 + STYLE-A 스케치** 두 장을 첨부해 시작 메시지를 보낸 다음 묶음 안의 줄을 하나씩 보내요.
3. 시작 메시지 (묶음마다 같아요)
${block(ROMANCE_START)}
4. **인물이 바뀌었으면** 고쳐 달라고 말하지 말고, 그 줄을 **새 대화에서** 다시 보내요. 고쳐 달라는 대화가 쌓일수록 더 무너져요.
5. **손·손목·얼굴만 이상하면** 전체를 다시 그리지 말고, 이미지 편집에서 그 부분만 선택해 아래처럼 보내요.
${block('선택한 부분만 고쳐 주세요. 손가락 다섯 개, 손목은 자연스럽게 곧게, 나머지는 그대로.')}${block('선택한 얼굴만 고쳐 주세요. 캐릭터 시트와 같은 얼굴, 좌우 대칭, 표정은 그대로.')}

${romMd}
## 역사 블로그 (B)

블로그는 인물이 반복되지 않아서 붕괴가 적어요. STYLE-B 스케치를 첨부하고 시작 메시지 한 번, 그다음 한 줄씩 보내요. 10장쯤마다 새 대화로 바꾸면 좋아요.

${block(BLOG_START)}
${block(blog.map((x) => `B ${x.name}: ${x.desc}`).join('\n'))}`);
}

function writeIllustrationList(ills, images) {
  const done = ills.filter((x) => images[x.name]).length;
  const rows = ills.map((x) => `| ${images[x.name] ? '✅' : '⬜'} | \`${x.name}.webp\` | ${x.story} · ${x.chapter} | ${x.desc.replace(/\|/g, '\\|')} |`);
  writeFileSync(at('illustration-list.md'), `# 삽화 목록\n\n완성 ${done} / ${ills.length}. 파일을 assets/images/ 에 이 이름으로 넣고 npm run build 하면 이야기 속 자리에 들어갑니다.\n그리는 규칙은 docs/CHATGPT_DESIGN_BRIEF.md 의 "삽화" 항목을 따릅니다.\n\n| 상태 | 파일 이름 | 위치 | 장면 |\n|---|---|---|---|\n${rows.join('\n')}\n`);
}

main();
