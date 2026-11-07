// Owner: Agent D. Safe renderer for the CONTRACT §6 markdown subset:
// **bold**, *italic*, `code`, "- " and "1. " lists, "### " headings, simple | tables |, paragraphs.
// Builds DOM with createElement/textContent only. Model text never reaches innerHTML.

/**
 * Render markdown-subset text to a DocumentFragment.
 * Partial input (mid-stream) renders sensibly: unclosed markers stay literal.
 * @param {string} text
 * @returns {DocumentFragment}
 */
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    const p = document.createElement("p");
    para.forEach((line, idx) => {
      if (idx) p.appendChild(document.createElement("br"));
      appendInline(p, line);
    });
    frag.appendChild(p);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      i += 1;
      continue;
    }

    // fenced code (not in the subset, rendered as plain preformatted text)
    if (/^```/.test(trimmed)) {
      flushPara();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = buf.join("\n");
      pre.appendChild(code);
      frag.appendChild(wrapScroll(pre));
      continue;
    }

    // headings: ### (and # / ## / ####, all rendered at a modest size)
    const hm = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (hm) {
      flushPara();
      const level = hm[1].length <= 2 ? "h3" : "h4";
      const el = document.createElement(level);
      el.className = "md-h";
      appendInline(el, hm[2].replace(/\s*#+\s*$/, ""));
      frag.appendChild(el);
      i += 1;
      continue;
    }

    // tables: a row starting with "|" followed by a separator row
    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const head = splitRow(trimmed);
      const aligns = splitRow(lines[i + 1].trim()).map(alignOf);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()));
        i += 1;
      }
      frag.appendChild(wrapScroll(buildTable(head, rows, aligns)));
      continue;
    }

    // lists
    if (isListLine(line)) {
      flushPara();
      const { el, next } = buildList(lines, i);
      frag.appendChild(el);
      i = next;
      continue;
    }

    para.push(trimmed);
    i += 1;
  }
  flushPara();
  return frag;
}

const LIST_RE = /^(\s*)([-*•]|\d{1,3}[.)])\s+(.*)$/;

function isListLine(line) {
  return LIST_RE.test(line);
}

function indentOf(line) {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].replace(/\t/g, "  ").length : 0;
}

/** Build a (possibly nested, one level per indent step) list starting at line i. */
function buildList(lines, start) {
  const first = LIST_RE.exec(lines[start]);
  const baseIndent = indentOf(lines[start]);
  const ordered = /\d/.test(first[2]);
  const list = document.createElement(ordered ? "ol" : "ul");
  if (ordered) {
    const n = parseInt(first[2], 10);
    if (n > 1) list.setAttribute("start", String(n));
  }
  let i = start;
  let currentLi = null;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // a blank line ends the list unless the next line continues it
      if (i + 1 < lines.length && isListLine(lines[i + 1]) && indentOf(lines[i + 1]) >= baseIndent) {
        i += 1;
        continue;
      }
      break;
    }
    const m = LIST_RE.exec(line);
    const ind = indentOf(line);
    if (m && ind > baseIndent + 1 && currentLi) {
      const nested = buildList(lines, i);
      currentLi.appendChild(nested.el);
      i = nested.next;
      continue;
    }
    if (m && ind < baseIndent) break;
    if (m) {
      const isOrdered = /\d/.test(m[2]);
      if (isOrdered !== ordered && ind === baseIndent) break;
      currentLi = document.createElement("li");
      appendInline(currentLi, m[3]);
      list.appendChild(currentLi);
      i += 1;
      continue;
    }
    // continuation line of the current item
    if (currentLi && ind > baseIndent) {
      currentLi.appendChild(document.createElement("br"));
      appendInline(currentLi, line.trim());
      i += 1;
      continue;
    }
    break;
  }
  return { el: list, next: i };
}

function isTableSep(line) {
  const t = String(line || "").trim();
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(t) && t.includes("-");
}

function splitRow(row) {
  let t = row.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function alignOf(sep) {
  const l = sep.startsWith(":");
  const r = sep.endsWith(":");
  return l && r ? "center" : r ? "right" : "left";
}

function buildTable(head, rows, aligns) {
  const table = document.createElement("table");
  table.className = "md-table";
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  head.forEach((c, idx) => {
    const th = document.createElement("th");
    th.scope = "col";
    if (aligns[idx] && aligns[idx] !== "left") th.style.textAlign = aligns[idx];
    appendInline(th, c);
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const row = document.createElement("tr");
    for (let idx = 0; idx < head.length; idx += 1) {
      const td = document.createElement("td");
      if (aligns[idx] && aligns[idx] !== "left") td.style.textAlign = aligns[idx];
      appendInline(td, r[idx] ?? "");
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return table;
}

function wrapScroll(el) {
  const wrap = document.createElement("div");
  wrap.className = "table-scroll";
  wrap.tabIndex = 0;
  wrap.appendChild(el);
  return wrap;
}

/**
 * Append inline-formatted text (bold, italic, code) to a parent element.
 * @param {HTMLElement} parent
 * @param {string} text
 */
export function appendInline(parent, text) {
  const s = String(text ?? "");
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) parent.appendChild(document.createTextNode(buf));
    buf = "";
  };
  while (i < s.length) {
    const ch = s[i];
    // escaped marker
    if (ch === "\\" && i + 1 < s.length && "*_`\\|#".includes(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        const code = document.createElement("code");
        code.textContent = s.slice(i + 1, end);
        parent.appendChild(code);
        i = end + 1;
        continue;
      }
    }
    if ((ch === "*" && s[i + 1] === "*") || (ch === "_" && s[i + 1] === "_")) {
      const marker = ch + ch;
      const end = s.indexOf(marker, i + 2);
      if (end > i + 2) {
        flush();
        const strong = document.createElement("strong");
        appendInline(strong, s.slice(i + 2, end));
        parent.appendChild(strong);
        i = end + 2;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && s[i + 1] !== ch && s[i + 1] && s[i + 1] !== " ") {
      // italic: closing marker must not be preceded by a space; "_" only at word boundaries
      const wordStart = ch === "*" || i === 0 || /[\s(]/.test(s[i - 1]);
      let end = -1;
      for (let j = i + 1; j < s.length; j += 1) {
        if (s[j] === ch && s[j - 1] !== " " && s[j + 1] !== ch && (ch === "*" || !/\w/.test(s[j + 1] || ""))) {
          end = j;
          break;
        }
      }
      if (wordStart && end > i + 1) {
        flush();
        const em = document.createElement("em");
        appendInline(em, s.slice(i + 1, end));
        parent.appendChild(em);
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
}

/**
 * Strip markdown markers for one-line previews (comment snippets).
 * @param {string} text
 * @returns {string}
 */
export function plainText(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)[*_]([^*_]+)[*_]/g, "$1$2")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
