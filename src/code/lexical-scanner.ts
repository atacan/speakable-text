import { CODE_OPERATORS_LONGEST_FIRST, type CodeOperator } from "./operators.js";

export type LexicalCodeToken =
  | { readonly kind: "identifier"; readonly value: string }
  | { readonly kind: "number"; readonly value: string }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "comment"; readonly value: string }
  | { readonly kind: "operator"; readonly value: CodeOperator }
  | { readonly kind: "punctuation" | "unknown"; readonly value: string }
  | { readonly kind: "space" | "newline" };

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && (character === "_" || /[A-Za-z]/u.test(character));
}

function isIdentifierContinue(character: string | undefined): boolean {
  return character !== undefined && (character === "_" || /[A-Za-z0-9]/u.test(character));
}

function scanQuoted(source: string, start: number): number {
  const quote = source[start];
  const triple = source.slice(start, start + 3) === quote?.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote ?? "";
  let index = start + delimiter.length;
  while (index < source.length) {
    if (source.slice(index, index + delimiter.length) === delimiter) return index + delimiter.length;
    if (source[index] === "\\") index += 2;
    else index += 1;
  }
  return source.length;
}

/** A stateful, character-by-character scanner used by language-neutral fallback. */
export function scanCodeLexically(source: string): readonly LexicalCodeToken[] {
  const tokens: LexicalCodeToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index] ?? "";
    if (character === "\r" || character === "\n") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      tokens.push({ kind: "newline" });
      index += 1;
      continue;
    }
    if (/[^\S\r\n]/u.test(character)) {
      while (/[^\S\r\n]/u.test(source[index + 1] ?? "")) index += 1;
      tokens.push({ kind: "space" });
      index += 1;
      continue;
    }
    if (character === "#" || source.slice(index, index + 2) === "//") {
      const markerLength = character === "#" ? 1 : 2;
      let end = index + markerLength;
      while (end < source.length && source[end] !== "\n" && source[end] !== "\r") end += 1;
      tokens.push({ kind: "comment", value: source.slice(index + markerLength, end).trim() });
      index = end;
      continue;
    }
    if (source.slice(index, index + 2) === "/*") {
      const closing = source.indexOf("*/", index + 2);
      const end = closing === -1 ? source.length : closing + 2;
      tokens.push({ kind: "comment", value: source.slice(index + 2, closing === -1 ? source.length : closing).trim() });
      index = end;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      const end = scanQuoted(source, index);
      const delimiterLength = source.slice(index, index + 3) === character.repeat(3) ? 3 : 1;
      const closed = source.slice(end - delimiterLength, end) === character.repeat(delimiterLength);
      tokens.push({
        kind: "string",
        value: source.slice(index + delimiterLength, closed ? end - delimiterLength : end),
      });
      index = end;
      continue;
    }
    if (isIdentifierStart(character)) {
      let end = index + 1;
      while (isIdentifierContinue(source[end])) end += 1;
      const value = source.slice(index, end);
      tokens.push(value === "and" || value === "or" || value === "not"
        ? { kind: "operator", value }
        : { kind: "identifier", value });
      index = end;
      continue;
    }
    if (/[0-9]/u.test(character)) {
      let end = index + 1;
      while (/[0-9A-Za-z_.]/u.test(source[end] ?? "")) end += 1;
      tokens.push({ kind: "number", value: source.slice(index, end) });
      index = end;
      continue;
    }
    const operator = CODE_OPERATORS_LONGEST_FIRST.find((candidate) => source.startsWith(candidate, index));
    if (operator !== undefined) {
      tokens.push({ kind: "operator", value: operator });
      index += operator.length;
      continue;
    }
    if ("()[]{}.,:;".includes(character)) tokens.push({ kind: "punctuation", value: character });
    else tokens.push({ kind: "unknown", value: character });
    index += 1;
  }
  return tokens;
}
