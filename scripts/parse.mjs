// content/*.md → 카드 78장 + 이야기 + 부록 + 노트
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { render, toText, illustrations } from './md.mjs';

export const SUITS = {
  wands: { ko: '완드', en: 'Wands' },
  cups: { ko: '컵', en: 'Cups' },
  swords: { ko: '소드', en: 'Swords' },
  pentacles: { ko: '펜타클', en: 'Pentacles' },
};
const SUIT_BY_KO = Object.fromEntries(Object.entries(SUITS).map(([k, v]) => [v.ko, k]));
const RANKS = ['에이스', '2', '3', '4', '5', '6', '7', '8', '9', '10', '시종', '기사', '여왕', '왕'];
const RANKS_EN = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];
const MAJOR_EN = ['The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor', 'The Hierophant',
  'The Lovers', 'The Chariot', 'Strength', 'The Hermit', 'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death',
  'Temperance', 'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun', 'Judgement', 'The World'];
const MAJOR_KO = ['바보', '마법사', '여사제', '여황제', '황제', '교황', '연인', '전차', '힘', '은둔자', '운명의 수레바퀴',
  '정의', '매달린 사람', '죽음', '절제', '악마', '탑', '별', '달', '태양', '심판', '세계'];

const ORDER = (f) => ['major', ...Object.keys(SUITS)].findIndex((k) => f.includes(k)) >>> 0; // 못 찾으면 맨 뒤
const pad = (n) => String(n).padStart(2, '0');
const cellsOf = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

// 칸 끝의 괄호 묶음(최상위)을 메모로 떼어 낸다. 그 앞의 괄호는 정의에 남는다 (예: 컵 6의 "(마법 삼림)")
export function splitDefinition(cell) {
  const s = cell.trim();
  if (!s.endsWith(')')) {
    // 괄호가 닫히지 않은 경우 (예: 완드 5) 첫 " (" 에서 나눈다
    const at = s.indexOf(' (');
    return at > 0 ? { definition: s.slice(0, at).trim(), notes: s.slice(at + 2).trim(), unclosed: true } : { definition: s, notes: '' };
  }
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++;
    else if (s[i] === '(' && --depth === 0) {
      const definition = s.slice(0, i).trim();
      if (!definition) return { definition: s, notes: '' };
      return { definition, notes: s.slice(i + 1, -1).trim() };
    }
  }
  return { definition: s, notes: '' };
}

function blankCards() {
  const cards = MAJOR_KO.map((ko, n) => ({
    id: `major-${pad(n)}`, arcana: 'major', suit: null, number: n, rank: null,
    nameKo: ko, nameEn: MAJOR_EN[n], definition: '', notes: '', status: 'upcoming',
  }));
  for (const [suit, s] of Object.entries(SUITS)) {
    RANKS.forEach((r, i) => cards.push({
      id: `${suit}-${pad(i + 1)}`, arcana: 'minor', suit, number: i + 1, rank: r,
      nameKo: `${s.ko} ${r}`, nameEn: `${RANKS_EN[i]} of ${s.en}`, definition: '', notes: '', status: 'upcoming',
    }));
  }
  return cards;
}

export function parseContent(dir) {
  const read = (f) => readFileSync(join(dir, f), 'utf8');
  const cards = blankCards();
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const flags = [];

  // notes.md: 한 줄 정의 표
  const notesMd = read('notes.md');
  let section = '', suit = null;
  for (const line of notesMd.split('\n')) {
    if (line.startsWith('## ')) { section = line; suit = null; continue; }
    if (line.startsWith('### ')) { const k = line.slice(4).split(' ')[0]; suit = SUIT_BY_KO[k] ?? null; continue; }
    if (!section.includes('한 줄 정의') || !/^\|/.test(line) || /^\|[\s:|-]+\|?\s*$/.test(line)) continue;
    const c = cellsOf(line);
    let card;
    if (section.includes('메이저') && /^\d+$/.test(c[0])) card = byId[`major-${pad(+c[0])}`];
    else if (suit && RANKS.includes(c[0])) card = byId[`${suit}-${pad(RANKS.indexOf(c[0]) + 1)}`];
    if (!card) continue;
    const { definition, notes, unclosed } = splitDefinition(c[c.length - 1]);
    if (unclosed) flags.push({ id: card.id, why: '괄호가 닫히지 않아 첫 " (" 에서 나눔' });
    Object.assign(card, { definition, notes, status: 'learned' });
    if (definition.includes('(') || definition.includes(' / ')) flags.push({ id: card.id, why: '정의 안에 괄호나 / 가 있음 — 나눔 확인 필요' });
    if (!notes) flags.push({ id: card.id, why: '메모 없음 (괄호가 없거나 정의만 있음)' });
  }

  // story-<수트>[.버전].md: 장 단위. 버전: romance(로맨스 판타지), blog(역사 블로그), 버전 없는 파일 = 강의 원본
  const stories = [];
  const ills = [];
  const files = readdirSync(dir).filter((f) => /^story-[a-z]+(\.[a-z]+)?\.md$/.test(f));
  const keys = [...new Set(files.map((f) => f.split(/[-.]/)[1]))].sort((a, b) => ORDER(a) - ORDER(b));
  for (const key of keys) {
    const versions = {};
    for (const f of files.filter((f) => f.split(/[-.]/)[1] === key)) {
      const ver = f.split('.').length === 3 ? f.split('.')[1] : 'original';
      const md = read(f);
      const [head, ...parts] = md.split(/\n(?=## )/);
      const title = (head.match(/^# (.*)$/m) || [, key])[1];
      const chapters = parts.map((p, idx) => {
        const heading = p.match(/^## (.*)$/m)[1].trim();
        let body = p.replace(/^## .*$/m, '').replace(/\n---\s*$/, '').trim();
        let cardId = null;
        const num = heading.match(/^(\d+)\.\s/);
        const rank = heading.split(' — ')[0].trim();
        if (key === 'major' && num) cardId = `major-${pad(+num[1])}`;
        else if (SUITS[key] && RANKS.includes(rank)) cardId = `${key}-${pad(RANKS.indexOf(rank) + 1)}`;
        // 🐾 마법 삼림 블록은 카드에 모아 두고, 앱에서 토글로 끼워 넣는다
        const forest = (body.match(/^> \*\*🐾[\s\S]*?(?=\n\n|\n?$)/m) || [''])[0];
        if (forest) body = body.replace(forest, '').trim();
        const card = cardId && byId[cardId];
        if (card) {
          card.storyRef = card.storyRef || { story: key, chapter: idx };
          if (forest && !card.forestHtml) card.forestHtml = render(forest.replace(/^>\s?/gm, ''));
        }
        illustrations(body).forEach((x) => ills.push({ ...x, story: f, chapter: heading }));
        return { idx, heading, cardId, html: render(body), text: toText(body) };
      });
      versions[ver] = { title, introHtml: render(head.replace(/^# .*$/m, '')), chapters };
    }
    stories.push({ key, title: (versions.original || Object.values(versions)[0]).title, versions });
  }

  // appendix-missed.md: 수트별 카드 피드백
  if (existsSync(join(dir, 'appendix-missed.md'))) {
    let s = null;
    for (const block of read('appendix-missed.md').split(/\n(?=##+ )/)) {
      const h2 = block.match(/^## (.*)$/m), h3 = block.match(/^### (.*)$/m);
      if (h2) s = SUIT_BY_KO[h2[1].trim()] ?? null;
      if (h3 && s && RANKS.includes(h3[1].trim())) {
        const card = byId[`${s}-${pad(RANKS.indexOf(h3[1].trim()) + 1)}`];
        card.appendixHtml = render(block.replace(/^### .*$/m, ''));
      }
    }
  }
  const appendixHtml = existsSync(join(dir, 'appendix-missed.md')) ? render(read('appendix-missed.md')) : '';

  // deck-<이름>.md: 다른 덱 비교 노트 (예: deck-crows.md = 머더 오브 크로우)
  // "### 0 바보 — 부제" 처럼 번호로 시작하는 소제목 = 메이저, "### 완드 에이스 — 부제" = 마이너
  const decks = [];
  for (const f of readdirSync(dir).filter((f) => /^deck-[a-z]+\.md$/.test(f))) {
    const key = f.replace(/^deck-|\.md$/g, '');
    const md = read(f);
    const title = (md.match(/^# (.*)$/m) || [, key])[1].trim();
    const at = md.search(/^## 카드별 정리/m);
    const introMd = (at >= 0 ? md.slice(0, at) : md).replace(/^# .*$/m, '');
    let count = 0;
    if (at >= 0) {
      for (const block of md.slice(at).split(/\n(?=### )/).filter((b) => b.startsWith('### '))) {
        const head = block.match(/^### (.*)$/m)[1].trim();
        const [name, sub = ''] = head.split(' — ');
        let card = null;
        const num = name.match(/^(\d+)\s/);
        if (num) card = byId[`major-${pad(+num[1])}`];
        else {
          const [sk, rk] = name.split(/\s+/);
          if (SUIT_BY_KO[sk] && RANKS.includes(rk)) card = byId[`${SUIT_BY_KO[sk]}-${pad(RANKS.indexOf(rk) + 1)}`];
        }
        if (!card) continue;
        card.decks = card.decks || {};
        card.decks[key] = { name: name.replace(/^\d+\s+/, ''), sub, html: render(block.replace(/^### .*$/m, '').replace(/\n---\s*$/, '')) };
        count++;
      }
    }
    decks.push({ key, title, introHtml: render(introMd), text: toText(md), count });
  }

  // 노트 모음: 한 줄 정의 표만 빼고 섹션별로
  const noteSections = [];
  let cur = null;
  let inDef = false;
  for (const line of notesMd.split('\n')) {
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) { inDef = line.includes('한 줄 정의'); cur = { title: line.slice(3).trim(), md: [] }; noteSections.push(cur); continue; }
    if (inDef && /^\|/.test(line)) continue;
    if (line.startsWith('### ') && /^### 바보의 여정/.test(line)) { cur = { title: line.slice(4).trim(), md: [] }; noteSections.push(cur); inDef = false; continue; }
    cur?.md.push(line);
  }
  const notes = noteSections
    .map((n) => ({ title: n.title.replace(/ — 한 줄 정의$/, ' — 수트별 흐름'), md: n.md.join('\n').trim() }))
    .filter((n) => n.md.replace(/^###.*$/gm, '').trim())
    .map((n, i) => ({ id: `n${i}`, title: n.title, html: render(n.md), text: toText(n.md) }));

  return { cards, stories, appendixHtml, notes, decks, flags, ills };
}
