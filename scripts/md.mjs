// 의존성 없는 작은 마크다운 렌더러 (이 프로젝트의 md에 쓰인 문법만 지원)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function render(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(ill:([\w-]+)\)\s*$/))) {
      // 삽화 자리: ![장면 설명](ill:romance-major-00) → assets/images/ill-romance-major-00.webp 가 있으면 그 그림, 없으면 설명이 보이는 빈 칸
      flush();
      out.push(`<figure class="ill" data-img="ill-${m[2]}"><div class="ill-ph"><span>✦ 삽화 자리</span>${inline(m[1])}<small>ill-${m[2]}</small></div></figure>`);
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if (/^-{3,}\s*$/.test(line)) {
      flush(); out.push('<hr>');
    } else if (/^>/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      i--;
      const body = buf.join('\n');
      out.push(`<blockquote${body.includes('🐾') ? ' class="forest"' : ''}>${render(body)}</blockquote>`);
    } else if (/^\|/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const head = cells(rows[0]);
      const body = rows.slice(1).filter((r) => !/^\|[\s:|-]+\|?\s*$/.test(r)).map(cells);
      out.push('<div class="table-wrap"><table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') +
        '</tr></thead><tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
    } else if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      i--;
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${tag}>`);
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}

export const illustrations = (md) => [...md.matchAll(/^!\[([^\]]*)\]\(ill:([\w-]+)\)\s*$/gm)].map((m) => ({ name: `ill-${m[2]}`, desc: m[1] }));
export const toText = (md) => md.replace(/^!\[.*$/gm, '').replace(/[#>*`|]/g, ' ').replace(/\s+/g, ' ').trim();
