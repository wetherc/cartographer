/**
 * Snippet extraction for the developer guide.
 *
 * A snippet is named by file and symbol, never by line number. The extractor
 * finds the declaration and reads to its closing brace, so a snippet follows
 * the code when it moves. A symbol that no longer exists fails the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Thrown when the guide refers to something the repository no longer has. */
export class MissingReference extends Error {}

/**
 * @param {string} root
 * @param {string} file repository-relative path
 * @param {string} symbol declared name
 * @param {{ label?: string, note?: string }} [opts]
 */
export function snippet(root, file, symbol, opts = {}) {
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.split('\n');
  const start = declarationLine(lines, symbol);
  if (start < 0) throw new MissingReference(`${file}: no declaration of "${symbol}"`);

  const end = blockEnd(lines, start);
  const body = lines.slice(start, end + 1);
  const trimmed = trimIndent(body);

  return {
    file,
    symbol,
    line: start + 1,
    endLine: end + 1,
    code: trimmed.join('\n'),
    label: opts.label || `${file}:${start + 1}`,
    note: opts.note || '',
  };
}

/**
 * A verbatim run of lines, anchored on the text that opens it and the text
 * that closes it rather than on line numbers.
 * @param {string} root
 * @param {string} file
 * @param {{ from: string, to: string, label?: string }} range
 */
export function region(root, file, range) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes(range.from));
  if (start < 0) throw new MissingReference(`${file}: no line containing "${range.from}"`);
  const end = lines.findIndex((l, i) => i >= start && l.includes(range.to));
  if (end < 0) throw new MissingReference(`${file}: no line containing "${range.to}"`);

  return {
    file,
    symbol: '',
    line: start + 1,
    endLine: end + 1,
    code: trimIndent(lines.slice(start, end + 1)).join('\n'),
    label: range.label || `${file}:${start + 1}-${end + 1}`,
    note: '',
  };
}

/**
 * Check that a symbol exists without pulling in its body. The guide calls
 * this for every name it mentions in prose, so a rename cannot leave stale
 * text behind.
 * @param {string} root
 * @param {string} file
 * @param {string} symbol
 */
export function assertSymbol(root, file, symbol) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    throw new MissingReference(`${file}: file is missing, referenced for "${symbol}"`);
  }
  const pattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  if (!pattern.test(text)) throw new MissingReference(`${file}: no mention of "${symbol}"`);
}

/**
 * The line a symbol first appears on, for a `file:line` pointer in the text.
 * @param {string} root
 * @param {string} file
 * @param {string} symbol
 */
export function locate(root, file, symbol) {
  let lines;
  try {
    lines = readFileSync(join(root, file), 'utf8').split('\n');
  } catch {
    throw new MissingReference(`${file}: file is missing, referenced for "${symbol}"`);
  }
  const declared = declarationLine(lines, symbol);
  if (declared >= 0) return declared + 1;

  const pattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const mention = lines.findIndex((line) => pattern.test(line));
  if (mention < 0) throw new MissingReference(`${file}: no mention of "${symbol}"`);
  return mention + 1;
}

/** @param {string[]} lines @param {string} symbol */
function declarationLine(lines, symbol) {
  const forms = [
    `function ${symbol}(`,
    `function ${symbol} (`,
    `interface ${symbol} `,
    `interface ${symbol}{`,
    `class ${symbol} `,
    `const ${symbol} =`,
    `const ${symbol}=`,
    `type ${symbol} =`,
  ];
  return lines.findIndex((line) => forms.some((form) => line.includes(form)));
}

/**
 * The line that closes the block opened on `start`. Braces inside strings,
 * template literals, and comments do not count. A declaration with no brace
 * on its first line ends at that line.
 * @param {string[]} lines
 * @param {number} start
 */
function blockEnd(lines, start) {
  let depth = 0;
  let opened = false;
  let inBlockComment = false;

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    let inString = '';

    for (let c = 0; c < line.length; c += 1) {
      const ch = line[c];
      const next = line[c + 1];

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          c += 1;
        }
        continue;
      }
      if (inString) {
        if (ch === '\\') c += 1;
        else if (ch === inString) inString = '';
        continue;
      }
      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        c += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '{') {
        depth += 1;
        opened = true;
      } else if (ch === '}') {
        depth -= 1;
        if (opened && depth === 0) return i;
      }
    }

    if (!opened && /[;=]\s*$/.test(line.trim())) return i;
  }

  return start;
}

/** @param {string[]} lines */
function trimIndent(lines) {
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => l.length - l.trimStart().length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut));
}
