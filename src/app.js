// 타로 복습 앱 — 접속코드로 data.bin 을 풀고, 해시 주소(#/...)로 화면을 바꾼다
const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ───── 저장 (없어도 동작) ─────
const store = {
  get(k, d) { try { const v = localStorage.getItem('tarot:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tarot:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('tarot:' + k); } catch {} },
};

// ───── 복호화 ─────
const normalize = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let KEY = null, DATA = null;

async function deriveKey(code) {
  const meta = await fetch('meta.json', { cache: 'no-store' }).then((r) => r.json());
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalize(code)), 'PBKDF2', false, ['deriveKey']);
  return { key: await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(meta.salt), iterations: meta.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']), v: meta.v };
}
const open = (key, buf) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));

async function unlock(code) {
  const { key, v } = await deriveKey(code);
  const buf = await fetch('data.bin?v=' + v).then((r) => r.arrayBuffer());
  const plain = await open(key, buf); // 코드가 틀리면 여기서 실패
  KEY = key;
  DATA = JSON.parse(new TextDecoder().decode(plain));
  DATA.byId = Object.fromEntries(DATA.cards.map((c) => [c.id, c]));
  initVersions();
}

const imgCache = {};
async function imageUrl(name) {
  const meta = DATA.images?.[name];
  if (!meta) return null;
  if (!imgCache[name]) imgCache[name] = fetch(meta.file).then((r) => r.arrayBuffer()).then((b) => open(KEY, b)).then((p) => URL.createObjectURL(new Blob([p], { type: meta.type })));
  return imgCache[name];
}
// 화면에 data-img="이름" 이 있으면 암호화된 이미지를 풀어서 채운다
function hydrateImages(root) {
  root.querySelectorAll('[data-img]').forEach(async (el) => {
    const url = await imageUrl(el.dataset.img);
    if (!url) return;
    el.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
    el.closest('.tarot')?.classList.add('has-img');
  });
}

// ───── 인트로 + 수정구슬 접속코드 ─────
const SPARK = (n) => `<svg viewBox="0 0 24 24" width="${n}" height="${n}"><path d="M12 0l1.6 9.2L24 12l-10.4 2.8L12 24l-1.6-9.2L0 12l10.4-2.8z"/></svg>`;
function setupIntro() {
  const sky = $('.intro-sky');
  const dots = Array.from({ length: 60 }, () => `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;--t:${2 + Math.random() * 4}s;--d:${Math.random() * 4}s"></i>`);
  const sparks = Array.from({ length: 11 }, (_, k) => { const big = k < 3; const n = big ? 26 + Math.random() * 18 : 9 + Math.random() * 9;
    return `<span style="position:absolute;left:${Math.random() * 94}%;top:${Math.random() * 94}%">${SPARK(n).replace('<svg', `<svg style="--t:${3 + Math.random() * 3}s;--d:${Math.random() * 3}s"`)}</span>`; });
  sky.innerHTML = dots.join('') + sparks.join('');

  const saved = store.get('code', null);
  const form = $('#gate'), input = $('#code'), msg = $('.gate-msg'), btn = $('.gate-btn'), orb = $('#orb'), hint = $('#orb-hint');
  const cells = [...document.querySelectorAll('.cells i')];
  const paint = () => {
    const v = normalize(input.value).slice(0, 12);
    cells.forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('filled', !!v[i]); c.classList.toggle('caret', i === v.length && document.activeElement === input); });
    orb.style.setProperty('--power', (v.length / 12).toFixed(2));
    return v;
  };
  input.addEventListener('input', () => {
    const v = normalize(input.value).slice(0, 12);
    input.value = v.replace(/(.{4})(?=.)/g, '$1-');
    msg.textContent = '';
    paint();
    if (v.length === 12) form.requestSubmit();
  });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', paint);
  orb.addEventListener('click', () => (saved ? form.requestSubmit() : input.focus()));

  if (saved) {
    $('#cells').hidden = true;
    $('#remember-row').hidden = true;
    orb.style.setProperty('--power', '.7');
    hint.textContent = '수정구슬이 당신을 기억하고 있어요';
    msg.innerHTML = '<button type="button" class="linkish" id="forget">다른 코드로 들어갈게요</button>';
    $('#forget').onclick = () => { store.del('code'); location.reload(); };
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (DATA) { enterApp(); return; } // 앱 안에서 인트로를 다시 연 경우
    const code = saved || input.value;
    if (normalize(code).length < 12) { msg.textContent = '코드 12자리를 모두 넣어 주세요.'; input.focus(); return; }
    btn.disabled = true; btn.firstElementChild.textContent = '구슬이 읽는 중…';
    hint.textContent = '안개 너머를 들여다보는 중이에요';
    try {
      await unlock(code);
      if (!saved && $('#remember').checked) store.set('code', normalize(code));
      enterApp();
    } catch (err) {
      console.warn(err);
      orb.classList.remove('clouded'); void orb.offsetWidth; orb.classList.add('clouded');
      setTimeout(() => orb.classList.remove('clouded'), 900);
      if (saved) { store.del('code'); msg.textContent = '코드가 바뀌었나 봐요. 새 코드를 넣어 주세요.'; setTimeout(() => location.reload(), 1500); }
      else { msg.textContent = '구슬이 흐려졌어요. 코드를 다시 확인해 주세요.'; input.value = ''; paint(); input.focus(); }
      hint.textContent = '수정구슬에 접속 코드를 들려주세요';
      btn.disabled = false; btn.firstElementChild.textContent = '입장하기';
    }
  });
}

function enterApp() {
  const intro = $('#intro');
  $('#orb').classList.add('awake');
  intro.classList.add('leaving');
  setTimeout(() => {
    $('#app').hidden = false;
    buildIndex();
    route();
  }, 450);
  setTimeout(() => { intro.hidden = true; intro.classList.remove('leaving'); $('#orb').classList.remove('awake'); }, 1550);
}
function showIntro() {
  closeIndex();
  const intro = $('#intro');
  intro.hidden = false;
  $('.gate-btn').disabled = false;
  $('.gate-btn').firstElementChild.textContent = '다시 입장하기';
  $('#cells').hidden = true; $('#remember-row').hidden = true;
  $('#orb').style.setProperty('--power', '.7');
  $('#orb-hint').textContent = '수정구슬이 당신을 기억하고 있어요';
  scrollTo(0, 0);
}

// ───── 이야기 버전 · 마법 삼림 설정 ─────
// 이야기 버전: content/story-<수트>.<버전>.md 가 있으면 토글에 나타난다
const VERSION_LABELS = { romance: '로맨스 판타지', crows: '까마귀 로판', blog: '역사 블로그', priceoflove: '사랑의 값 로판', childhood: '차일드후드 로판' };
let VERSIONS = Object.entries(VERSION_LABELS).slice(0, 2);
const initVersions = () => {
  const have = new Set(DATA.stories.flatMap((s) => Object.keys(s.versions)).filter((v) => v !== 'original'));
  VERSIONS = [...Object.keys(VERSION_LABELS).filter((k) => have.has(k)), ...[...have].filter((k) => !VERSION_LABELS[k])].map((k) => [k, VERSION_LABELS[k] || k]);
};
const getVer = () => store.get('ver', 'romance');
// 고른 버전이 없는 수트는 로맨스 판타지 → 강의 원본 순서로 대신 보여 준다
const pickVersion = (st) => st.versions[getVer()] || st.versions.romance || st.versions.original || Object.values(st.versions)[0];
// 비교 덱: 켜고 끌 수 있는 해석 블록 (forest = 이야기 속 🐾 블록, 나머지 = content/deck-<key>.md)
const DECKS = { forest: { icon: '🐾', name: '마법 삼림' }, crows: { icon: '🪶', name: '머더 오브 크로우' } };
const deckOn = (k) => store.get(k === 'forest' ? 'forest' : `deck:${k}`, true);
const applyDecks = () => Object.keys(DECKS).forEach((k) => document.body.classList.toggle(`no-${k}`, !deckOn(k)));
const deckSwitch = (k) => `<label class="switch"><input type="checkbox" data-deck="${k}" ${deckOn(k) ? 'checked' : ''}> ${DECKS[k].icon} ${DECKS[k].name} 해석</label>`;
const deckSwitches = (keys = Object.keys(DECKS)) => `<div class="deck-switches">${keys.map(deckSwitch).join('')}</div>`;
document.addEventListener('change', (e) => {
  const k = e.target.dataset?.deck;
  if (!k) return;
  store.set(k === 'forest' ? 'forest' : `deck:${k}`, e.target.checked);
  document.querySelectorAll(`[data-deck="${k}"]`).forEach((x) => (x.checked = e.target.checked));
  applyDecks();
});
const crowsBlock = (card) => card?.decks?.crows
  ? `<blockquote class="crows crows-only"><p><strong>🪶 머더 오브 크로우에서는</strong> · ${esc(card.decks.crows.name)} — ${esc(card.decks.crows.sub)}</p>${card.decks.crows.html}</blockquote>` : '';

// ───── 카드 정보 ─────
const SUIT = {
  major: { ko: '메이저', icon: '✦', animal: '✦', el: '' },
  wands: { ko: '완드', icon: '🜂', animal: '🐸', el: '불' },
  cups: { ko: '컵', icon: '🜄', animal: '🐰', el: '물' },
  swords: { ko: '소드', icon: '🜁', animal: '🐱', el: '공기' },
  pentacles: { ko: '펜타클', icon: '🜃', animal: '🦊', el: '흙' },
};
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const suitOf = (c) => c.suit || 'major';
const numLabel = (c) => (c.arcana === 'major' ? ROMAN[c.number] : c.rank === '에이스' ? 'ACE' : /^\d+$/.test(c.rank) ? c.rank : c.rank);
const cardsIn = (s) => DATA.cards.filter((c) => suitOf(c) === s);
const learned = () => DATA.cards.filter((c) => c.status === 'learned');

function tile(c, href = `#/card/${c.id}`) {
  const s = suitOf(c);
  return `<a class="tarot s-${s} ${c.status}" href="${href}" aria-label="${esc(c.nameKo)}">
    <span class="frame"><span class="num">${numLabel(c)}</span>
    <span class="art" data-img="${c.id}">${SUIT[s].animal}</span>
    <span><span class="nm">${esc(c.arcana === 'major' ? c.nameKo : c.rank)}</span><br><span class="en">${esc(c.nameEn)}</span></span></span></a>`;
}

// ───── 목차 (상단 메뉴에서 여는 인덱스) ─────
function buildIndex() {
  const count = (s) => `${cardsIn(s).filter((c) => c.status === 'learned').length}/${cardsIn(s).length}`;
  const stories = DATA.stories.map((st) => { const v = pickVersion(st);
    return `<details><summary><span class="ix-ico">☾</span>${esc(v.title.split(' — ')[0])}</summary>
      <div class="ix-sub">${v.chapters.map((ch) => `<a href="#/story/${st.key}/${ch.idx}">${esc(ch.heading.split(' — ')[0])}</a>`).join('')}</div></details>`; }).join('');
  $('#index').innerHTML = `
    <div class="ix-group"><p class="ix-title">BEGIN</p>
      <a class="ix-link" href="#/intro"><span class="ix-ico">☽</span>수정구슬 (처음 화면)</a>
      <a class="ix-link" href="#/"><span class="ix-ico">⌂</span>홈 · 오늘의 카드</a></div>
    <div class="ix-group"><p class="ix-title">CARDS</p>
      ${Object.entries(SUIT).map(([k, v]) => `<a class="ix-link" href="#/cards/${k}"><span class="ix-ico">${v.animal}</span>${v.ko}${k === 'major' ? ' 아르카나' : ''}<span class="ix-count">${count(k)}</span></a>`).join('')}</div>
    <div class="ix-group"><p class="ix-title">STORIES</p>${stories}</div>
    <div class="ix-group"><p class="ix-title">LEARN</p>
      <a class="ix-link" href="#/learn/reading"><span class="ix-ico">✦</span>직관 리딩법</a>
      <a class="ix-link" href="#/learn/spread"><span class="ix-ico">⊞</span>올바른 배치</a>
      <a class="ix-link" href="#/learn/shape"><span class="ix-ico">△</span>도형으로 읽기</a></div>
    <div class="ix-group"><p class="ix-title">REVIEW</p>
      <a class="ix-link" href="#/review"><span class="ix-ico">↻</span>플래시카드 · 퀴즈</a>
      <a class="ix-link" href="#/favorites"><span class="ix-ico">☆</span>즐겨찾기</a></div>
    <div class="ix-group"><p class="ix-title">NOTES</p>
      <details><summary><span class="ix-ico">✎</span>노트 모음</summary>
      <div class="ix-sub">${DATA.notes.map((n) => `<a href="#/notes/${n.id}">${esc(n.title)}</a>`).join('')}<a href="#/appendix">부록 — 놓친 해석</a></div></details>
      ${(DATA.decks || []).map((d) => `<a class="ix-link" href="#/deck/${d.key}"><span class="ix-ico">${DECKS[d.key]?.icon || '✦'}</span>${esc(d.title.split(' — ')[0])}<span class="ix-count">${d.count}장</span></a>`).join('')}
      <a class="ix-link" href="#/search"><span class="ix-ico">⌕</span>검색</a>
      <a class="ix-link" href="#/credits"><span class="ix-ico">©</span>이미지 출처</a></div>
    <div class="ix-group"><p class="ix-title">SETTINGS</p>
      <div style="display:grid;gap:10px;padding:6px 10px">
        <div class="seg" role="group" aria-label="이야기 버전">${VERSIONS.map(([k, l]) => `<button type="button" data-ver="${k}" aria-pressed="${k === getVer()}">${l}</button>`).join('')}</div>
        ${deckSwitches()}</div></div>
    <div class="ix-tools"><button type="button" id="theme-btn">밝게 / 어둡게</button><button type="button" id="lock-btn">잠그기</button></div>`;
  $('#theme-btn').onclick = () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', document.documentElement.dataset.theme);
  };
  $('#lock-btn').onclick = () => { store.del('code'); location.hash = ''; location.reload(); };
}
function openIndex() { $('#index').hidden = false; $('#index-scrim').hidden = false; $('#menu-btn').setAttribute('aria-expanded', 'true'); markIndex(); }
function closeIndex() { $('#index').hidden = true; $('#index-scrim').hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); }
function markIndex() {
  const h = location.hash || '#/';
  document.querySelectorAll('#index a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === h));
  document.querySelectorAll('.quick a').forEach((a) => a.classList.toggle('on', h.startsWith('#/' + a.dataset.nav) || (a.dataset.nav === 'home' && (h === '#/' || h === '#'))));
}

// ───── 화면들 ─────
const views = {
  home() {
    const L = learned();
    const today = new Date().toISOString().slice(0, 10);
    const seed = [...today].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const c = L[seed % L.length];
    const last = store.get('last', null);
    return `<p class="kicker">TODAY</p><h1 class="page-title">오늘의 카드</h1>
      <div class="panel hero-today">${tile(c)}<div><p class="kicker">${SUIT[suitOf(c)].ko}</p><h2 style="margin:2px 0 8px">${esc(c.nameKo)}</h2>
        <p style="margin:0 0 12px;font-family:var(--font-display);font-size:18px">${esc(c.definition)}</p><a class="btn" href="#/card/${c.id}">펼쳐 보기 →</a></div></div>
      <div class="home-grid">
        <div class="panel"><p class="kicker">PROGRESS</p><h3 style="margin:2px 0 12px">공부한 카드 ${L.length} / 78</h3><div class="progress">
          ${Object.entries(SUIT).map(([k, v]) => { const all = cardsIn(k), n = all.filter((x) => x.status === 'learned').length;
            return `<a class="prog-row" href="#/cards/${k}" style="--c:var(--c-${k})"><span>${v.animal} ${v.ko}</span><span class="prog-bar"><i style="width:${(n / all.length) * 100}%"></i></span><b>${n}/${all.length}</b></a>`; }).join('')}
        </div></div>
        <div style="display:grid;gap:14px">
          ${last ? `<a class="panel tile-link" href="${esc(last.href)}"><p class="kicker">CONTINUE</p><h3>읽던 자리</h3><p>${esc(last.label)}</p></a>` : ''}
          <a class="panel tile-link" href="#/story/major"><p class="kicker">STORY</p><h3>바보의 여정</h3><p>세미와 피터를 따라 메이저 22장을 여행해요</p></a>
          <a class="panel tile-link" href="#/learn/shape"><p class="kicker">GEOMETRY</p><h3>도형으로 읽기</h3><p>선과 시선, 구도로 그림을 읽어 봐요</p></a>
        </div>
      </div>`;
  },

  cards(tab = 'major') {
    if (!SUIT[tab]) tab = 'major';
    const all = cardsIn(tab);
    return `<p class="kicker">CARDS</p><h1 class="page-title">${SUIT[tab].ko}${tab === 'major' ? ' 아르카나' : ''}</h1>
      <p class="page-sub">${tab === 'major' ? '0 바보에서 21 세계까지, 한 사람이 걷는 여정이에요.' : `${SUIT[tab].el}의 수트예요. 마법 삼림에서는 ${SUIT[tab].animal}가 주인공이고요.`} 지금까지 ${all.length}장 중 ${all.filter((c) => c.status === 'learned').length}장을 공부했어요.</p>
      <nav class="tabs">${Object.entries(SUIT).map(([k, v]) => `<a href="#/cards/${k}" class="${k === tab ? 'on' : ''}">${v.animal} ${v.ko}</a>`).join('')}</nav>
      <div class="card-grid">${all.map((c) => tile(c)).join('')}</div>`;
  },

  card(id) {
    const c = DATA.byId[id];
    if (!c) return views.notFound();
    const list = DATA.cards, i = list.indexOf(c);
    const prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
    const favs = store.get('favs', []);
    const story = c.storyRef && DATA.stories.find((s) => s.key === c.storyRef.story);
    store.set('last', { href: `#/card/${c.id}`, label: `카드 · ${c.nameKo}` });
    return `<div class="detail-head">${tile(c, '#/cards/' + suitOf(c))}<div>
        <p class="kicker">${SUIT[suitOf(c)].ko} · ${numLabel(c)}</p><h1>${esc(c.nameKo)}</h1><div class="en">${esc(c.nameEn)}</div>
        <button class="fav" id="fav" aria-pressed="${favs.includes(id)}" aria-label="즐겨찾기">${favs.includes(id) ? '★' : '☆'}</button></div></div>
      ${c.status === 'upcoming' ? `<div class="panel soon"><div class="glyph">⏳</div><h2>곧 배울 카드</h2><p class="page-sub">아직 공부하지 않은 카드예요. 노트가 생기면 여기에 바로 채워 둘게요.</p></div>` : `
      <p class="definition panel">${esc(c.definition)}</p>
      ${c.notes ? `<details class="fold panel" open><summary>📝 강의 메모 <small style="color:var(--muted);font-size:13px">웨이트 키워드 · 역방향 · 보완</small></summary><div class="fold-body memo">${memo(c.notes)}</div></details>` : ''}
      ${c.forestHtml || c.decks ? `<div style="margin-top:14px">${deckSwitches(Object.keys(DECKS).filter((k) => (k === 'forest' ? c.forestHtml : c.decks?.[k])))}</div>` : ''}
      ${c.forestHtml ? `<details class="fold panel forest-only" open><summary>🐾 마법 삼림에서는</summary><div class="fold-body">${c.forestHtml}</div></details>` : ''}
      ${c.decks?.crows ? `<details class="fold panel crows-only" open><summary>🪶 머더 오브 크로우 <small class="fold-sub">${esc(c.decks.crows.sub)}</small></summary><div class="fold-body prose crows-body">${c.decks.crows.html}<a class="chapter-card-link" href="#/deck/crows">이 덱 읽는 법 →</a></div></details>` : ''}
      ${c.appendixHtml ? `<details class="fold panel"><summary>🔎 놓친 해석</summary><div class="fold-body prose">${c.appendixHtml}</div></details>` : ''}
      ${story ? `<a class="btn" style="margin-top:14px" href="#/story/${story.key}/${storyChapter(story, c.id)}">📖 이야기 속 이 카드의 장 →</a>` : ''}`}
      <nav class="pager"><a class="btn" href="#/card/${prev.id}">← ${esc(prev.nameKo)}</a><a class="btn" href="#/card/${next.id}">${esc(next.nameKo)} →</a></nav>`;
  },

  story(key = 'major', ch) {
    const st = DATA.stories.find((s) => s.key === key) || DATA.stories[0];
    const want = getVer();
    const v = pickVersion(st);
    const fallback = !st.versions[want];
    const shownAs = Object.entries(st.versions).find(([, x]) => x === v)[0];
    setTimeout(() => {
      const target = ch != null ? $(`#ch-${ch}`) : null;
      if (target) target.scrollIntoView({ block: 'start' });
      else scrollTo(0, store.get(`scroll:${st.key}:${want}`, 0));
    }, 30);
    const name = (t) => t.split(' — ')[0];
    return `<nav class="tabs">${DATA.stories.map((s) => `<a href="#/story/${s.key}" class="${s.key === st.key ? 'on' : ''}">${esc(name(pickVersion(s).title))}</a>`).join('')}</nav>
      <div class="story-controls">
        <div class="seg" role="group" aria-label="이야기 버전">${VERSIONS.map(([k, l]) => `<button type="button" data-ver="${k}" aria-pressed="${k === want}">${l}</button>`).join('')}</div>
        ${deckSwitches()}
      </div>
      ${fallback ? `<p class="version-note">${esc(VERSION_LABELS[want] || want)} 버전은 아직 쓰는 중이에요. 그동안은 ${shownAs === 'original' ? '강의 노트의 원래 이야기를' : `${esc(VERSION_LABELS[shownAs] || shownAs)} 버전을`} 보여 드릴게요.</p>` : ''}
      <p class="kicker">STORY</p><h1 class="page-title">${esc(v.title)}</h1>
      <div class="page-sub">${v.introHtml}</div>
      <nav class="toc panel" aria-label="장 목차">${v.chapters.map((c) => `<a href="#/story/${st.key}/${c.idx}">${esc(name(c.heading))}</a>`).join('')}</nav>
      <article class="story ${shownAs}" data-story="${st.key}:${shownAs}">${v.chapters.map((c) => {
        const [a, b] = c.heading.split(' — ');
        const card = c.cardId && DATA.byId[c.cardId];
        return `<section><h2 id="ch-${c.idx}"><span class="num">${esc(a)}</span>${esc(b || a)}</h2>${c.html}
          ${card?.forestHtml ? `<blockquote class="forest">${card.forestHtml}</blockquote>` : ''}
          ${crowsBlock(card)}
          ${card ? `<a class="chapter-card-link" href="#/card/${c.cardId}">${esc(card.nameKo)} 카드 해석 페이지 →</a>` : ''}</section>`; }).join('')}</article>`;
  },

  notes(id) {
    setTimeout(() => id && $('#' + id)?.scrollIntoView({ block: 'start' }), 30);
    return `<p class="kicker">NOTES</p><h1 class="page-title">노트 모음</h1>
      <nav class="toc panel">${DATA.notes.map((n) => `<a href="#/notes/${n.id}">${esc(n.title)}</a>`).join('')}<a href="#/appendix">부록 — 놓친 해석</a></nav>
      <div class="prose">${DATA.notes.map((n) => `<h2 id="${n.id}">${esc(n.title)}</h2>${n.html}`).join('<hr>')}</div>`;
  },

  deck(key = 'crows') {
    const d = (DATA.decks || []).find((x) => x.key === key);
    if (!d) return views.notFound();
    const cards = DATA.cards.filter((c) => c.decks?.[key]);
    return `<p class="kicker">DECK</p><h1 class="page-title">${esc(d.title.split(' — ')[0])}</h1>
      <p class="page-sub">${cards.length}장의 해석이 있어요. 카드 페이지와 이야기에서 ${DECKS[key]?.icon || ''} 블록으로 함께 보여 드려요.</p>
      ${DECKS[key] ? `<div style="margin-bottom:14px">${deckSwitch(key)}</div>` : ''}
      <div class="panel prose crows-body">${d.introHtml}</div>
      <h2 class="page-title" style="font-size:22px;margin-top:26px">카드별 해석</h2>
      <div class="deck-list">${cards.map((c) => `<a class="result" href="#/card/${c.id}"><small>${numLabel(c)}</small> ${esc(c.nameKo)}<p>${esc(c.decks[key].sub)}</p></a>`).join('')}</div>`;
  },

  appendix() { return `<p class="kicker">APPENDIX</p><div class="prose">${DATA.appendixHtml}</div>`; },

  learn(topic = 'reading') {
    const tabs = `<nav class="tabs">${[['reading', '✦ 직관 리딩법'], ['spread', '⊞ 올바른 배치'], ['shape', '△ 도형으로 읽기']].map(([k, l]) => `<a href="#/learn/${k}" class="${k === topic ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
    if (topic === 'reading') {
      const n = DATA.notes.find((x) => x.title.includes('리딩 원칙'));
      return `${tabs}<p class="kicker">INTUITIVE READING</p><h1 class="page-title">직관 리딩법</h1>
        <p class="page-sub">단계별 레슨은 곧 열려요. 그동안 강의에서 정리한 원칙부터 같이 봐요.</p>
        <div class="panel prose">${n ? n.html : ''}</div>`;
    }
    const soon = {
      spread: ['⊞', '올바른 배치', ['한 장 · 세 장(나 / 상대 / 흐름) · 두 갈래 선택', '켈틱 크로스 10자리', '자리를 누르면 그 자리의 뜻, 직접 뽑아 연습하기']],
      shape: ['△', '도형으로 읽기', ['시선과 방향 — 누가 어디를 보는가', '삼각형 · 십자 · 원 · 숫자 4 모양 다리', '위와 아래(하늘과 땅), 왼쪽과 오른쪽']],
    }[topic] || [];
    return `${tabs}<div class="panel soon"><div class="glyph">${soon[0]}</div><h1 class="page-title">${soon[1]}</h1><p class="page-sub">곧 열리는 레슨이에요. 이런 내용을 담을게요.</p><ul>${(soon[2] || []).map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  },

  review() {
    return `<div class="panel soon"><div class="glyph">↻</div><h1 class="page-title">복습</h1><p class="page-sub">플래시카드와 4지선다 퀴즈가 곧 열려요.</p>
      <ul><li>앞면 카드 이름 → 뒤집으면 한 줄 정의</li><li>정의를 보고 카드 맞히기</li><li>범위 선택 · 틀린 카드 다시 보기</li></ul></div>`;
  },

  favorites() {
    const favs = store.get('favs', []).map((id) => DATA.byId[id]).filter(Boolean);
    return `<p class="kicker">FAVORITES</p><h1 class="page-title">즐겨찾기</h1>
      ${favs.length ? `<div class="card-grid">${favs.map((c) => tile(c)).join('')}</div>` : '<p class="page-sub">카드 페이지에서 ☆ 를 누르면 여기에 모여요.</p>'}`;
  },

  search() {
    setTimeout(() => { const box = $('#q'); box.focus(); box.oninput = () => { store.set('q', box.value); $('#results').innerHTML = searchHtml(box.value); hydrateImages($('#results')); }; box.oninput(); }, 0);
    return `<p class="kicker">SEARCH</p><h1 class="page-title">검색</h1>
      <input id="q" class="search-box" type="search" placeholder="예: 사자, 우로보로스, 시선" value="${esc(store.get('q', ''))}">
      <div id="results" style="margin-top:12px"></div>`;
  },

  credits() {
    const list = DATA.credits || [];
    return `<p class="kicker">CREDITS</p><h1 class="page-title">이미지 출처</h1>
      <p class="page-sub">앱에 쓴 그림과 아이콘을 만든 분들이에요. 고맙습니다.</p>
      ${list.length ? `<div class="panel prose"><ul>${list.map((x) => `<li><b>${esc(x.file)}</b> — ${esc(x.author || '')} ${x.source ? `<a href="${esc(x.source)}" target="_blank" rel="noopener">${esc(x.site || '출처')}</a>` : ''} <small>${esc(x.license || '')}</small></li>`).join('')}</ul></div>` : '<p class="page-sub">아직 등록된 그림이 없어요.</p>'}`;
  },

  notFound() { return `<div class="soon"><div class="glyph">?</div><h1 class="page-title">길 잃은 페이지</h1><p class="page-sub">주소가 바뀌었나 봐요. 홈에서 다시 찾아볼까요?</p><a class="btn" href="#/">홈으로</a></div>`; },
};

// 지금 고른 버전에서 이 카드가 나오는 장 번호
function storyChapter(st, id) {
  const v = pickVersion(st);
  return v.chapters.find((c) => c.cardId === id)?.idx ?? 0;
}

// 메모 안의 ✏️ 보완, 역방향, 마법 삼림을 눈에 띄게
function memo(text) {
  let h = esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(역방향|마법 삼림|웨이트)(:|\s)/g, '<mark>$1</mark>$2');
  h = h.replace(/✏️ 보완:?([^✏️]*)/g, '<span class="fix">✏️ <strong>보완</strong> $1</span>');
  return h;
}

function searchHtml(q) {
  q = q.trim();
  if (q.length < 1) return '<p class="page-sub">카드 이름, 한 줄 정의, 메모, 이야기, 노트를 한꺼번에 찾아 드려요.</p>';
  const lq = q.toLowerCase();
  const snip = (t) => { const i = t.toLowerCase().indexOf(lq); if (i < 0) return esc(t.slice(0, 80)); const s = Math.max(0, i - 30);
    return (s ? '…' : '') + esc(t.slice(s, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length, i + q.length + 50)) + '…'; };
  const out = [];
  for (const c of DATA.cards) {
    const hay = [c.nameKo, c.nameEn, c.definition, c.notes, ...Object.values(c.decks || {}).map((d) => `${d.name} ${d.sub} ${d.html.replace(/<[^>]+>/g, ' ')}`)].join(' ');
    if (hay.toLowerCase().includes(lq)) out.push(`<a class="result" href="#/card/${c.id}"><small>CARD</small> ${esc(c.nameKo)}<p>${snip(c.nameKo.toLowerCase().includes(lq) ? c.definition : hay)}</p></a>`);
  }
  const VL = Object.fromEntries([...VERSIONS, ['original', '강의 원본']]);
  for (const s of DATA.stories) for (const [ver, v] of Object.entries(s.versions)) for (const ch of v.chapters) if ((ch.heading + ch.text).toLowerCase().includes(lq))
    out.push(`<a class="result" href="#/story/${s.key}/${ch.idx}" data-goto-ver="${ver}"><small>STORY · ${VL[ver] || ver}</small> ${esc(v.title.split(' — ')[0])} · ${esc(ch.heading)}<p>${snip(ch.text)}</p></a>`);
  for (const d of DATA.decks || []) if (d.text.toLowerCase().includes(lq)) out.push(`<a class="result" href="#/deck/${d.key}"><small>DECK</small> ${esc(d.title)}<p>${snip(d.text)}</p></a>`);
  for (const n of DATA.notes) if (n.text.toLowerCase().includes(lq)) out.push(`<a class="result" href="#/notes/${n.id}"><small>NOTE</small> ${esc(n.title)}<p>${snip(n.text)}</p></a>`);
  return out.length ? `<p class="page-sub">${out.length}개를 찾았어요.</p>` + out.join('') : '<p class="page-sub">찾는 내용이 없어요. 다른 말로 찾아볼까요?</p>';
}

// ───── 라우터 ─────
function route() {
  if (!DATA) return;
  const [name = '', a, b] = (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
  closeIndex();
  if (name === 'intro') { showIntro(); return; }
  const view = $('#view');
  const fn = { '': views.home, cards: views.cards, card: views.card, story: views.story, notes: views.notes, appendix: views.appendix, learn: views.learn, deck: views.deck,
    review: views.review, favorites: views.favorites, search: views.search, credits: views.credits }[name] || views.notFound;
  view.innerHTML = fn(a, b);
  if (!['story', 'notes'].includes(name)) scrollTo(0, 0);
  if (name === 'story') store.set('last', { href: location.hash.split('/').slice(0, 3).join('/'), label: '이야기 · ' + ($('.page-title')?.textContent || '') });
  hydrateImages(view);
  markIndex();
  const fav = $('#fav');
  if (fav) fav.onclick = () => { const f = new Set(store.get('favs', [])); f.has(a) ? f.delete(a) : f.add(a); store.set('favs', [...f]); fav.textContent = f.has(a) ? '★' : '☆'; buildIndex(); };
}

// 이야기 읽던 위치 기억
let scrollT;
addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(() => { const st = $('[data-story]'); if (st) store.set(`scroll:${st.dataset.story}`, scrollY); }, 200); }, { passive: true });

// 카드 화면에서 좌우로 밀면 이전·다음 카드
let touchX = null;
addEventListener('touchstart', (e) => { touchX = location.hash.startsWith('#/card/') ? e.touches[0].clientX : null; }, { passive: true });
addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 70) { const links = document.querySelectorAll('.pager a'); (dx < 0 ? links[1] : links[0])?.click(); }
});

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto-ver]');
  if (g && VERSIONS.some(([k]) => k === g.dataset.gotoVer)) store.set('ver', g.dataset.gotoVer);
  const b = e.target.closest('[data-ver]');
  if (!b) return;
  store.set('ver', b.dataset.ver);
  document.querySelectorAll('[data-ver]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.ver === b.dataset.ver));
  buildIndex();
  if (location.hash.startsWith('#/story')) { const [, , k] = location.hash.split('/'); location.hash === `#/story/${k || 'major'}` ? route() : (location.hash = `#/story/${k || 'major'}`); }
});
addEventListener('hashchange', route);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeIndex(); });
$('#menu-btn').addEventListener('click', () => ($('#index').hidden ? openIndex() : closeIndex()));
$('#index-scrim').addEventListener('click', closeIndex);
$('#index').addEventListener('click', (e) => { if (e.target.closest('a')) setTimeout(closeIndex, 0); });
const theme = store.get('theme', null);
if (theme) document.documentElement.dataset.theme = theme;
applyDecks();
setupIntro();
