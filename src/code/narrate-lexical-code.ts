import type { NarrationFragment, NarrationStyle } from "../narration/tokens.js";
import { normalizeIdentifier } from "./identifier.js";
import { scanCodeLexically } from "./lexical-scanner.js";
import type { OperatorPhrasebook } from "./operators.js";

function appendWord(parts: string[], value: string): void {
  if (value.length === 0) return;
  const previous = parts.at(-1) ?? "";
  const separator = previous.length === 0 || /[\s,.]$/u.test(previous) ? "" : " ";
  parts.push(`${separator}${value}`);
}

function finishLine(parts: string[]): string {
  return parts.join("").replace(/\s+/gu, " ").replace(/\s+([,.])/gu, "$1").trim();
}

export interface LexicalNarrationOptions {
  readonly operators: OperatorPhrasebook;
  readonly style: NarrationStyle;
  readonly commentStyle: NarrationStyle;
  readonly linePauseMs: number;
}

export function narrateLexicalCode(
  source: string,
  options: LexicalNarrationOptions,
): readonly NarrationFragment[] {
  const fragments: NarrationFragment[] = [];
  let line: string[] = [];
  const flush = (): void => {
    const value = finishLine(line);
    if (value.length > 0) fragments.push({ kind: "text", value, style: options.style, literal: true });
    line = [];
  };
  for (const token of scanCodeLexically(source)) {
    switch (token.kind) {
      case "newline":
        flush();
        if (fragments.at(-1)?.kind !== "pause") fragments.push({ kind: "pause", durationMs: options.linePauseMs });
        break;
      case "space":
        if (line.length > 0 && !(line.at(-1) ?? "").endsWith(" ")) line.push(" ");
        break;
      case "identifier": appendWord(line, normalizeIdentifier(token.value)); break;
      case "operator": appendWord(line, options.operators[token.value]); break;
      case "number": appendWord(line, token.value); break;
      case "string": appendWord(line, `string ${token.value}`); break;
      case "comment": {
        flush();
        fragments.push({ kind: "text", value: `Comment. ${token.value}`, style: options.commentStyle, literal: true });
        break;
      }
      case "punctuation":
        if (token.value === ",") line.push(", ");
        else if (token.value === ".") line.push(" ");
        else if (token.value === ":" || token.value === ";") line.push(". ");
        else if (token.value === "(" && line.length > 0) line.push(", ");
        break;
      case "unknown": appendWord(line, token.value); break;
    }
  }
  flush();
  while (fragments.at(-1)?.kind === "pause") fragments.pop();
  return fragments;
}
