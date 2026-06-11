import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const mdPath = path.join(root, 'public', 'SALT_Lessons.md');
const htmlPath = path.join(root, 'public', 'SALT_Lessons.html');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function renderInline(text) {
  if (text == null || text === '') return '';
  const tokens = [];
  let out = String(text)
    .replace(/`([^`]+)`/g, (_, code) => {
      const token = `@@CODE${tokens.length}@@`;
      tokens.push(`<code>${escapeHtml(code)}</code>`);
      return token;
    });

  out = escapeHtml(out);

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const safeHref = escapeAttr(href);
    const labelHtml = label;
    if (/^https?:\/\//i.test(href)) {
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
    }
    return `<a href="${safeHref}">${labelHtml}</a>`;
  });

  out = out.replace(/@@CODE(\d+)@@/g, (_, idx) => tokens[Number(idx)] || '');
  return out;
}

function leadingSpaces(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function stripIndent(line, indent) {
  if (!line) return line;
  let i = 0;
  while (i < line.length && i < indent && line[i] === ' ') i += 1;
  return line.slice(i);
}

function isHeading(line) {
  return line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
}

function isListItem(line) {
  return line.match(/^(\s*)(?:([-*+])|(\d+\.))\s+(.*)$/);
}

function isHr(line) {
  return /^\s*---+\s*$/.test(line);
}

function isFence(line) {
  return line.match(/^\s*```(\w+)?\s*$/);
}

function isTableSeparator(line) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function isTableStart(lines, index) {
  return Boolean(lines[index] && lines[index].includes('|') && lines[index + 1] && isTableSeparator(lines[index + 1]));
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function parseTable(lines, index) {
  const header = splitTableRow(lines[index]);
  index += 2;
  const rows = [];
  while (index < lines.length && lines[index].trim() !== '' && lines[index].includes('|') && !isHeading(lines[index]) && !isListItem(lines[index]) && !isFence(lines[index]) && !isHr(lines[index])) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const thead = `<thead><tr>${header.map(cell => `<th scope="col" class="px-2 py-1 border">${renderInline(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row => `<tr class="border-t">${row.map((cell, idx) => `<td${idx === 0 ? ' scope="row" class="px-2 py-1 border font-semibold"' : ' class="px-2 py-1 border"'}>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return { html: `<table>${thead}${tbody}</table>`, nextIndex: index };
}

function parseBlockquote(lines, index) {
  const quoteLines = [];
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*>/.test(line)) {
      quoteLines.push(line.replace(/^\s*>\s?/, ''));
      index += 1;
      continue;
    }
    if (line.trim() === '') {
      quoteLines.push('');
      index += 1;
      continue;
    }
    break;
  }

  let inner = quoteLines;
  let calloutType = null;
  if (inner.length > 0) {
    const firstMeaningfulIndex = inner.findIndex(line => line.trim() !== '');
    if (firstMeaningfulIndex >= 0) {
      const marker = inner[firstMeaningfulIndex].trim().match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*(.*)$/i);
      if (marker) {
        calloutType = marker[1].toLowerCase();
        inner = inner.slice(firstMeaningfulIndex + 1);
        if (marker[2]) inner.unshift(marker[2]);
        while (inner.length && inner[0].trim() === '') inner.shift();
      }
    }
  }

  const rendered = parseBlocks(inner);
  if (calloutType) {
    const title = calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
    return {
      html: `<aside class="callout callout-${calloutType}"><div class="callout-title">${title}</div>${rendered.html}</aside>`,
      nextIndex: index
    };
  }
  return { html: `<blockquote>${rendered.html}</blockquote>`, nextIndex: index };
}

function parseList(lines, index) {
  const first = isListItem(lines[index]);
  const listIndent = first[1].length;
  const ordered = Boolean(first[3]);
  const listTag = ordered ? 'ol' : 'ul';
  const items = [];

  while (index < lines.length) {
    while (index < lines.length && lines[index].trim() === '') index += 1;
    if (index >= lines.length) break;
    const match = isListItem(lines[index]);
    if (!match) break;
    if (match[1].length !== listIndent || Boolean(match[3]) !== ordered) break;

    const itemLines = [];
    itemLines.push(match[4]);
    index += 1;

    while (index < lines.length) {
      const line = lines[index];
      if (line.trim() === '') {
        itemLines.push('');
        index += 1;
        continue;
      }
      const nextMatch = isListItem(line);
      const nextIndent = leadingSpaces(line);
      if (nextMatch && nextMatch[1].length === listIndent && Boolean(nextMatch[3]) === ordered) {
        break;
      }
      if (nextIndent <= listIndent) {
        break;
      }
      itemLines.push(stripIndent(line, listIndent + 2));
      index += 1;
    }

    const renderedItem = parseBlocks(itemLines).html;
    items.push(`<li>${renderedItem}</li>`);
  }

  return { html: `<${listTag}>${items.join('')}</${listTag}>`, nextIndex: index };
}

function parseParagraph(lines, index) {
  const parts = [];
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') break;
    if (
      isHeading(line) ||
      isHr(line) ||
      isFence(line) ||
      isListItem(line) ||
      isTableStart(lines, index) ||
      /^\s*>/.test(line) ||
      /^\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/i.test(line)
    ) break;
    parts.push(line.trim());
    index += 1;
  }
  return { html: `<p>${renderInline(parts.join(' '))}</p>`, nextIndex: index };
}

function parseBlocks(lines) {
  let html = '';
  let index = 0;
  let skippedDocumentTitle = false;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      if (!skippedDocumentTitle && level === 1) {
        skippedDocumentTitle = true;
        index += 1;
        continue;
      }
      const id = slugify(text);
      html += `<h${level} id="${id}">${renderInline(text)}</h${level}>`;
      index += 1;
      continue;
    }

    if (isHr(line)) {
      html += '<hr>';
      index += 1;
      continue;
    }

    const fence = isFence(line);
    if (fence) {
      const language = fence[1] || '';
      index += 1;
      const codeLines = [];
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const langClass = language ? ` class="language-${escapeAttr(language)}"` : '';
      html += `<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      html += parsed.html;
      index = parsed.nextIndex;
      continue;
    }

    const inlineCallout = line.trim().match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*(.*)$/i);
    if (inlineCallout) {
      const calloutType = inlineCallout[1].toLowerCase();
      const title = calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
      const content = inlineCallout[2] ? `<p>${renderInline(inlineCallout[2])}</p>` : '';
      html += `<aside class="callout callout-${calloutType}"><div class="callout-title">${title}</div>${content}</aside>`;
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const parsed = parseBlockquote(lines, index);
      html += parsed.html;
      index = parsed.nextIndex;
      continue;
    }

    if (isListItem(line)) {
      const parsed = parseList(lines, index);
      html += parsed.html;
      index = parsed.nextIndex;
      continue;
    }

    const parsed = parseParagraph(lines, index);
    html += parsed.html;
    index = parsed.nextIndex;
  }

  return { html };
}

function buildToc(headings) {
  const items = headings
    .filter(h => h.level === 1 || h.level === 2)
    .map(h => `<li class="toc-level-${h.level}"><a href="#${h.id}">${renderInline(h.text)}</a></li>`)
    .join('\n');
  return `<ul>\n${items}\n</ul>`;
}

async function replaceBetweenMarkers(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Unable to find markers ${startMarker} / ${endMarker}`);
  }
  return source.slice(0, start + startMarker.length) + '\n' + replacement + '\n' + source.slice(end);
}

async function main() {
  const markdown = await fs.readFile(mdPath, 'utf8');
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  const headings = [];
  const originalIsHeading = isHeading;
  let skippedDocumentTitle = false;

  // Collect headings first so the TOC can be built from the same source pass.
  for (let i = 0; i < lines.length; i += 1) {
    const match = originalIsHeading(lines[i]);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].trim();
    if (!skippedDocumentTitle && level === 1) {
      skippedDocumentTitle = true;
      continue;
    }
    headings.push({ level, text, id: slugify(text) });
  }

  const body = parseBlocks(lines).html;
  const toc = buildToc(headings);

  const htmlTemplate = await fs.readFile(htmlPath, 'utf8');
  let nextHtml = htmlTemplate;
  nextHtml = await replaceBetweenMarkers(nextHtml, '<!-- LESSONS_TOC_START -->', '<!-- LESSONS_TOC_END -->', toc);
  nextHtml = await replaceBetweenMarkers(nextHtml, '<!-- LESSONS_BODY_START -->', '<!-- LESSONS_BODY_END -->', body);

  const normalizedHtml = nextHtml.replace(/\r+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
  await fs.writeFile(htmlPath, normalizedHtml);
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
