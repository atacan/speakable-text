import type { Nodes, Parent, Root } from "mdast";
import type {
  BlockquoteNarrationContext,
  CodeBlockNarrationContext,
  DocumentNarrationContext,
  EmphasisNarrationContext,
  HeadingNarrationContext,
  ImageNarrationContext,
  InlineCodeNarrationContext,
  LinkNarrationContext,
  ListItemNarrationContext,
  ListNarrationContext,
  NarrationConfiguration,
  NarrationNodeRule,
  ParagraphNarrationContext,
  StrongNarrationContext,
  TableNarrationContext,
} from "../narration/configuration.js";
import { routeCodeLanguage } from "../code/language-tag.js";
import { narrateLexicalCode } from "../code/narrate-lexical-code.js";
import { parsePython } from "../code/python/parse-python.js";
import { parseTypeScript } from "../code/typescript/parse-typescript.js";
import {
  cloneAndValidateNarrationFragments,
  defaultNarrationConfiguration,
} from "../narration/configuration.js";
import {
  createNarrationDiagnostic,
  type NarrationDiagnostic,
} from "../narration/diagnostics.js";
import { mergeNarrationStyles, normalizeNarrationPlan } from "../narration/plan.js";
import type {
  BoundaryNarrationToken,
  NarrationFragment,
  NarrationPlan,
  NarrationStyle,
  NarrationToken,
  TextNarrationToken,
} from "../narration/tokens.js";

export const DEFAULT_PARAGRAPH_PAUSE_MS = 400;
const INVISIBLE_FORMATTING_RUN = /\p{Cf}+/gu;

interface CompilationState {
  readonly tokens: NarrationToken[];
  readonly diagnostics: NarrationDiagnostic[];
  readonly configuration: NarrationConfiguration;
  suppressedRawHtmlElement?: "script" | "style";
}

function boundary(
  boundaryName: BoundaryNarrationToken["boundary"],
  phase: BoundaryNarrationToken["phase"],
  metadata?: BoundaryNarrationToken["metadata"],
): BoundaryNarrationToken {
  return metadata === undefined
    ? { kind: "boundary", boundary: boundaryName, phase }
    : { kind: "boundary", boundary: boundaryName, phase, metadata };
}

function cleanProseText(value: string, diagnostics: NarrationDiagnostic[]): string {
  const withoutInvisible = value.replace(
    INVISIBLE_FORMATTING_RUN,
    (removed, offset: number, source: string) => {
      const removedCount = Array.from(removed).length;
      diagnostics.push(createNarrationDiagnostic(
        "INVISIBLE_CHARACTER_REMOVED",
        "warning",
        `Removed ${removedCount} invisible Unicode formatting ${removedCount === 1 ? "character" : "characters"} from spoken text.`,
      ));
      const before = offset === 0 ? undefined : source.at(offset - 1);
      const after = source.at(offset + removed.length);
      return before !== undefined && after !== undefined && !/\s/u.test(before) && !/\s/u.test(after) ? " " : "";
    },
  );
  return withoutInvisible.replace(/\s+/gu, " ");
}

function appendText(
  state: CompilationState,
  value: string,
  style: NarrationStyle | undefined,
  literal?: boolean,
): void {
  const cleaned = cleanProseText(value, state.diagnostics);
  if (cleaned.length === 0) return;
  const previous = state.tokens.at(-1);
  const normalized = previous?.kind === "text" && previous.value.endsWith(" ") && cleaned.startsWith(" ")
    ? cleaned.slice(1)
    : cleaned;
  if (normalized.length === 0) return;
  const token: TextNarrationToken = style === undefined
    ? { kind: "text", value: normalized, ...(literal === undefined ? {} : { literal }) }
    : { kind: "text", value: normalized, style, ...(literal === undefined ? {} : { literal }) };
  state.tokens.push(token);
}

function appendFragments(
  state: CompilationState,
  fragments: readonly NarrationFragment[],
  inheritedStyle: NarrationStyle | undefined,
): void {
  for (const fragment of fragments) {
    if (fragment.kind === "pause") {
      state.tokens.push({ kind: "pause", durationMs: fragment.durationMs });
      continue;
    }
    const style = mergeNarrationStyles(inheritedStyle, fragment.style);
    state.tokens.push({
      kind: "text",
      value: fragment.value,
      ...(style === undefined ? {} : { style }),
      ...(fragment.literal === undefined ? {} : { literal: fragment.literal }),
    });
  }
}

function isParent(node: Nodes): node is Nodes & Parent {
  return "children" in node && Array.isArray(node.children);
}

function visibleText(node: Nodes): string {
  if (node.type === "definition") return "";
  if (isParent(node)) return node.children.map(visibleText).join("");
  if ("alt" in node && typeof node.alt === "string") return node.alt;
  if ("value" in node && typeof node.value === "string") return node.value;
  return "";
}

function immutableContext<Context extends object>(context: Context): Readonly<Context> {
  return Object.freeze(context);
}

function compileRuleReplacement<Context extends object>(
  rule: NarrationNodeRule<Context>,
  context: Readonly<Context>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  path: string,
): boolean {
  if (rule.skip === true) return true;
  if (rule.compile === undefined) return false;
  const fragments = cloneAndValidateNarrationFragments(rule.compile(context), `${path}.compile result`);
  appendFragments(state, fragments, inheritedStyle);
  return true;
}

function compileChildrenTemporarily(
  node: Nodes,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  if (isParent(node)) {
    for (const child of node.children) compileNode(child, state, inheritedStyle, true, 0, false);
    return;
  }
  if ("alt" in node && typeof node.alt === "string") appendText(state, node.alt, inheritedStyle);
  else if ("value" in node && typeof node.value === "string") appendText(state, node.value, inheritedStyle);
}

function trimInlineEdges(tokens: NarrationToken[]): void {
  const firstTextIndex = tokens.findIndex((token) => token.kind === "text");
  if (firstTextIndex === -1) return;
  const firstText = tokens[firstTextIndex] as TextNarrationToken;
  tokens[firstTextIndex] = { ...firstText, value: firstText.value.trimStart() };
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token?.kind !== "text") continue;
    tokens[index] = { ...token, value: token.value.trimEnd() };
    return;
  }
}

function childState(state: CompilationState): CompilationState {
  return {
    tokens: [],
    diagnostics: state.diagnostics,
    configuration: state.configuration,
    ...(state.suppressedRawHtmlElement === undefined ? {} : { suppressedRawHtmlElement: state.suppressedRawHtmlElement }),
  };
}

function markdownRecoveryText(value: string): { value: string; transformed: boolean } {
  const unresolvedReference = /^\[([^\]\n]+)\]\[[^\]\n]+\]$/u.exec(value);
  if (unresolvedReference !== null) return { value: unresolvedReference[1] ?? "", transformed: true };
  const unfinishedEmphasis = /^(\*{1,3}|_{1,3})(?=\S)([\s\S]+)$/u.exec(value);
  if (unfinishedEmphasis !== null && !value.endsWith(unfinishedEmphasis[1] ?? "")) {
    return { value: unfinishedEmphasis[2] ?? "", transformed: true };
  }
  return { value, transformed: false };
}

function recoverTextNode(
  value: string,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  if (state.suppressedRawHtmlElement !== undefined) return;
  const recovered = markdownRecoveryText(value);
  if (recovered.transformed) {
    state.diagnostics.push(createNarrationDiagnostic(
      "MARKDOWN_PARSE_RECOVERY",
      "warning",
      "Recovered visible text from malformed Markdown delimiters.",
    ));
  }
  appendText(state, recovered.value, inheritedStyle);
}

function recoverRawHtml(value: string): string {
  let output = "";
  let index = 0;
  let suppressed: "script" | "style" | undefined;
  while (index < value.length) {
    const opening = suppressed === undefined
      ? value.indexOf("<", index)
      : value.toLowerCase().indexOf(`</${suppressed}`, index);
    if (opening === -1) {
      if (suppressed === undefined) output += value.slice(index);
      break;
    }
    if (suppressed === undefined) output += value.slice(index, opening);
    const closing = findHtmlTagEnd(value, opening);
    if (closing === -1) break;
    const tag = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)/u.exec(value.slice(opening, closing + 1));
    if (tag !== null) {
      const name = (tag[2] ?? "").toLowerCase();
      if (name === "script" || name === "style") {
        if ((tag[1] ?? "") === "/") suppressed = undefined;
        else suppressed = name;
      }
    }
    index = closing + 1;
  }
  return output;
}

function findHtmlTagEnd(value: string, opening: number): number {
  let quote: "\"" | "'" | undefined;
  for (let index = opening + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function standaloneRawTag(value: string): { closing: boolean; name: string } | undefined {
  const opening = value.search(/\S/u);
  if (opening === -1 || value[opening] !== "<") return undefined;
  const closing = findHtmlTagEnd(value, opening);
  if (closing === -1 || value.slice(closing + 1).trim().length > 0) return undefined;
  const match = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)/u.exec(value.slice(opening, closing + 1));
  return match === null ? undefined : {
    closing: (match[1] ?? "") === "/",
    name: (match[2] ?? "").toLowerCase(),
  };
}

function compileRawHtml(
  node: Extract<Nodes, { type: "html" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  state.diagnostics.push(createNarrationDiagnostic(
    "UNSUPPORTED_MARKDOWN_NODE",
    "warning",
    "Recovered visible text from unsupported Markdown node type html.",
  ));
  const standaloneTag = standaloneRawTag(node.value);
  if (standaloneTag !== undefined && (standaloneTag.name === "script" || standaloneTag.name === "style")) {
    if (standaloneTag.closing) delete state.suppressedRawHtmlElement;
    else state.suppressedRawHtmlElement = standaloneTag.name;
    return;
  }
  const recovered = recoverRawHtml(node.value);
  const visible = /[\r\n]/u.test(node.value) ? recovered.trim() : recovered;
  if (visible.trim().length > 0) appendText(state, visible, inheritedStyle);
}

function compileBoundedRule<Context extends object>(
  boundaryName: "heading" | "paragraph" | "blockquote",
  metadata: BoundaryNarrationToken["metadata"] | undefined,
  rule: NarrationNodeRule<Context>,
  context: Readonly<Context>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  compileContent: (target: CompilationState, style: NarrationStyle | undefined) => void,
  path: string,
): void {
  if (rule.skip === true) return;
  const body = childState(state);
  if (!compileRuleReplacement(rule, context, body, inheritedStyle, path)) {
    const content = childState(state);
    compileContent(content, mergeNarrationStyles(inheritedStyle, rule.contentStyle));
    trimInlineEdges(content.tokens);
    if (content.tokens.length === 0) return;
    appendFragments(body, rule.before ?? [], inheritedStyle);
    body.tokens.push(...content.tokens);
    appendFragments(body, rule.after ?? [], inheritedStyle);
  }
  if (body.tokens.length === 0) return;
  state.tokens.push(boundary(boundaryName, "start", metadata), ...body.tokens, boundary(boundaryName, "end", metadata));
}

function compileHeading(
  node: Extract<Nodes, { type: "heading" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  if (visibleText(node).trim().length === 0) return;
  const level = node.depth;
  const rule = state.configuration.headings[level];
  const context = immutableContext<HeadingNarrationContext>({ level, text: visibleText(node) });
  compileBoundedRule(
    "heading",
    { level },
    rule,
    context,
    state,
    inheritedStyle,
    (target, style) => {
      for (const child of node.children) compileNode(child, target, style, false, 0, false);
    },
    `narration.headings.${level}`,
  );
}

function compileParagraph(
  node: Extract<Nodes, { type: "paragraph" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  listDepth: number,
  suppressAfter: boolean,
): void {
  const configuredRule = state.configuration.paragraph;
  const rule = suppressAfter && configuredRule.compile === undefined
    ? { ...configuredRule, after: [] }
    : configuredRule;
  const context = immutableContext<ParagraphNarrationContext>({ text: visibleText(node) });
  compileBoundedRule(
    "paragraph",
    undefined,
    rule,
    context,
    state,
    inheritedStyle,
    (target, style) => {
      for (const child of node.children) compileNode(child, target, style, false, listDepth, false);
    },
    "narration.paragraph",
  );
}

function listMetadata(context: Readonly<ListNarrationContext>): BoundaryNarrationToken["metadata"] {
  return {
    ordered: context.ordered,
    depth: context.depth,
    itemCount: context.itemCount,
    ...(context.start === undefined ? {} : { start: context.start }),
  };
}

function listItemMetadata(context: Readonly<ListItemNarrationContext>): BoundaryNarrationToken["metadata"] {
  return {
    ordered: context.ordered,
    depth: context.depth,
    index: context.index,
    ...(context.number === undefined ? {} : { number: context.number }),
    ...(context.checked === undefined ? {} : { checked: context.checked }),
  };
}

function compileListItem(
  node: Extract<Nodes, { type: "listItem" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  context: Readonly<ListItemNarrationContext>,
): void {
  const rule = state.configuration.listItem;
  if (rule.skip === true) return;
  const body = childState(state);
  if (!compileRuleReplacement(rule, context, body, inheritedStyle, "narration.listItem")) {
    appendFragments(body, rule.before ?? [], inheritedStyle);
    appendFragments(body, context.depth > 1 ? rule.nestedItemSeparator : rule.itemSeparator, inheritedStyle);
    const itemStyle = mergeNarrationStyles(inheritedStyle, rule.contentStyle);
    appendFragments(
      body,
      cloneAndValidateNarrationFragments(rule.nestingPrefix(context), "narration.listItem.nestingPrefix result"),
      itemStyle,
    );
    // Ordered task items preserve both relationships in a stable spoken order:
    // computed list number first, followed by checked/unchecked task state.
    if (context.ordered) {
      appendFragments(
        body,
        cloneAndValidateNarrationFragments(rule.orderedPrefix(context), "narration.listItem.orderedPrefix result"),
        itemStyle,
      );
    }
    if (context.checked !== undefined) {
      appendFragments(body, context.checked ? rule.completedTaskPrefix : rule.incompleteTaskPrefix, itemStyle);
    }
    node.children.forEach((child, index) => {
      const next = node.children[index + 1];
      const suppressParagraphPause = child.type === "paragraph" && (next === undefined || next.type === "list");
      compileNode(child, body, itemStyle, false, context.depth, suppressParagraphPause);
    });
    appendFragments(body, rule.after ?? [], inheritedStyle);
  }
  if (body.tokens.length === 0) return;
  const metadata = listItemMetadata(context);
  state.tokens.push(boundary("list-item", "start", metadata), ...body.tokens, boundary("list-item", "end", metadata));
}

function compileList(
  node: Extract<Nodes, { type: "list" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  parentDepth: number,
): void {
  const depth = parentDepth + 1;
  const ordered = node.ordered === true;
  const start = ordered ? node.start ?? 1 : undefined;
  const context = immutableContext<ListNarrationContext>({
    ordered,
    depth,
    itemCount: node.children.length,
    ...(start === undefined ? {} : { start }),
    text: visibleText(node),
  });
  const rule = ordered ? state.configuration.orderedList : state.configuration.unorderedList;
  if (rule.skip === true) return;
  const body = childState(state);
  const path = ordered ? "narration.orderedList" : "narration.unorderedList";
  if (!compileRuleReplacement(rule, context, body, inheritedStyle, path)) {
    appendFragments(body, rule.before ?? [], inheritedStyle);
    const contentStyle = mergeNarrationStyles(inheritedStyle, rule.contentStyle);
    node.children.forEach((item, index) => {
      const itemContext = immutableContext<ListItemNarrationContext>({
        ordered,
        depth,
        index,
        ...(ordered ? { number: (start ?? 1) + index } : {}),
        ...(typeof item.checked === "boolean" ? { checked: item.checked } : {}),
        text: visibleText(item),
      });
      compileListItem(item, body, contentStyle, itemContext);
    });
    appendFragments(body, rule.after ?? [], inheritedStyle);
  }
  if (body.tokens.length === 0) return;
  const metadata = listMetadata(context);
  state.tokens.push(boundary("list", "start", metadata), ...body.tokens, boundary("list", "end", metadata));
}

function compileBlockquote(
  node: Extract<Nodes, { type: "blockquote" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  listDepth: number,
): void {
  const rule = state.configuration.blockquote;
  compileBoundedRule(
    "blockquote",
    undefined,
    rule,
    immutableContext<BlockquoteNarrationContext>({ text: visibleText(node) }),
    state,
    inheritedStyle,
    (target, style) => {
      for (const child of node.children) compileNode(child, target, style, false, listDepth, false);
    },
    "narration.blockquote",
  );
}

function compileImage(
  node: Extract<Nodes, { type: "image" | "imageReference" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  const rule = state.configuration.image;
  if (rule.skip === true) return;
  const context = immutableContext<ImageNarrationContext>({
    ...(typeof node.alt === "string" ? { alt: node.alt } : {}),
    ...(node.type === "image" ? { destination: node.url } : { reference: node.identifier }),
    ...(node.type === "image" && node.title !== null && node.title !== undefined ? { title: node.title } : {}),
  });
  if (compileRuleReplacement(rule, context, state, inheritedStyle, "narration.image")) return;
  if (context.alt === undefined) {
    state.diagnostics.push(createNarrationDiagnostic(
      "IMAGE_ALT_MISSING",
      "info",
      "An image without alternative text was omitted from spoken output.",
    ));
    return;
  }
  if (context.alt.length === 0) return;
  appendFragments(state, rule.before ?? [], inheritedStyle);
  appendText(state, context.alt, mergeNarrationStyles(inheritedStyle, rule.contentStyle));
  appendFragments(state, rule.after ?? [], inheritedStyle);
}

function spokenLanguage(tag: string | null | undefined): string | undefined {
  const route = routeCodeLanguage(tag);
  if (route === "python") return "Python";
  if (route === "typescript") return "TypeScript";
  const safeWords = (tag ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (safeWords.length === 0) return undefined;
  return `${safeWords[0]?.toUpperCase() ?? ""}${safeWords.slice(1).toLowerCase()}`;
}

function compileInlineCode(
  node: Extract<Nodes, { type: "inlineCode" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  const rule = state.configuration.code.inline;
  if (rule.skip === true) return;
  const context = immutableContext<InlineCodeNarrationContext>({ code: node.value });
  if (compileRuleReplacement(rule, context, state, inheritedStyle, "narration.code.inline")) return;
  appendFragments(state, rule.before ?? [], inheritedStyle);
  const style = mergeNarrationStyles(inheritedStyle, rule.contentStyle);
  const fragments = narrateLexicalCode(node.value, {
    operators: state.configuration.code.operators,
    style: style ?? { role: "inline-code" },
    commentStyle: style ?? { role: "inline-code" },
    linePauseMs: 150,
  });
  appendFragments(state, fragments, undefined);
  appendFragments(state, rule.after ?? [], inheritedStyle);
}

function compileCodeBlock(
  node: Extract<Nodes, { type: "code" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  const configuration = state.configuration.code;
  const rule = configuration.block;
  if (rule.skip === true) return;
  const route = routeCodeLanguage(node.lang);
  const language = spokenLanguage(node.lang);
  const supported = route !== "fallback";
  const context = immutableContext<CodeBlockNarrationContext>({
    code: node.value,
    ...(language === undefined ? {} : { language }),
    supported,
  });
  const body = childState(state);
  const replaced = compileRuleReplacement(rule, context, body, inheritedStyle, "narration.code.block");
  if (!replaced) {
    const codeStyle = mergeNarrationStyles(inheritedStyle, rule.contentStyle) ?? { role: "code" };
    const commentStyle = mergeNarrationStyles(codeStyle, rule.commentStyle) ?? { role: "code-comment" };
    appendFragments(body, rule.before ?? [], inheritedStyle);
    appendFragments(body, rule.startAnnouncement, codeStyle);
    appendFragments(
      body,
      cloneAndValidateNarrationFragments(rule.languageAnnouncement(context), "narration.code.block.languageAnnouncement result"),
      codeStyle,
    );
    appendFragments(body, narrateLexicalCode(node.value, {
      operators: configuration.operators,
      style: codeStyle,
      commentStyle,
      linePauseMs: rule.linePauseMs,
    }), undefined);
    if (node.value.length > 0) body.tokens.push({ kind: "pause", durationMs: rule.linePauseMs });
    appendFragments(body, rule.endAnnouncement, codeStyle);
    appendFragments(body, rule.after ?? [], inheritedStyle);
  }
  if (body.tokens.length === 0) return;
  const metadata = {
    ...(language === undefined ? {} : { language }),
    supported,
  };
  state.tokens.push(boundary("code-block", "start", metadata), ...body.tokens, boundary("code-block", "end", metadata));

  if (!supported && node.lang !== null && node.lang !== undefined && node.lang.trim().length > 0) {
    state.diagnostics.push(createNarrationDiagnostic(
      "UNSUPPORTED_CODE_LANGUAGE",
      "warning",
      `Used deterministic lexical fallback for unsupported code language ${JSON.stringify(language ?? "unknown")}.`,
    ));
  } else if (supported && !replaced) {
    const parsed = route === "python" ? parsePython(node.value) : parseTypeScript(node.value);
    if (parsed.recoveryRegions.length > 0) {
      state.diagnostics.push(createNarrationDiagnostic(
        "CODE_PARSE_RECOVERY",
        "warning",
        `Recovered incomplete ${language ?? "supported"} code without discarding content.`,
      ));
    }
    state.diagnostics.push(createNarrationDiagnostic(
      "CODE_LITERAL_FALLBACK",
      "info",
      `Used deterministic lexical narration until semantic ${language ?? "code"} narration is available.`,
    ));
  }
}

const ROW_NUMBERS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
] as const;

function spokenRowNumber(value: number): string {
  return ROW_NUMBERS[value] ?? String(value);
}

function tableMetadata(node: Extract<Nodes, { type: "table" }>): BoundaryNarrationToken["metadata"] {
  const columnCount = node.children.reduce((maximum, row) => Math.max(maximum, row.children.length), 0);
  return {
    rowCount: Math.max(0, node.children.length - 1),
    columnCount,
  };
}

function compileTableCellContent(
  cell: Extract<Nodes, { type: "tableCell" }> | undefined,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  emptyCellText: string | undefined,
): void {
  const before = state.tokens.length;
  for (const child of cell?.children ?? []) compileNode(child, state, inheritedStyle, true, 0, false);
  if (state.tokens.length === before && emptyCellText !== undefined) appendText(state, emptyCellText, inheritedStyle);
}

function compileTableCell(
  cell: Extract<Nodes, { type: "tableCell" }> | undefined,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  rowIndex: number,
  columnIndex: number,
  header: boolean,
  headerText: string | undefined,
  emptyCellText: string | undefined,
): void {
  const metadata = {
    rowIndex,
    columnIndex,
    header,
    ...(headerText === undefined ? {} : { headerText }),
  };
  state.tokens.push(boundary("table-cell", "start", metadata));
  compileTableCellContent(cell, state, inheritedStyle, emptyCellText);
  state.tokens.push(boundary("table-cell", "end", metadata));
}

function compileTable(
  node: Extract<Nodes, { type: "table" }>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  const rule = state.configuration.table;
  if (rule.skip === true) return;
  const headerRow = node.children[0];
  const columnCount = node.children.reduce((maximum, row) => Math.max(maximum, row.children.length), 0);
  const headers = Object.freeze(Array.from(
    { length: columnCount },
    (_, columnIndex) => {
      const cell = headerRow?.children[columnIndex];
      return cell === undefined ? "" : visibleText(cell).trim();
    },
  ));
  const context = immutableContext<TableNarrationContext>({
    rowCount: Math.max(0, node.children.length - 1),
    columnCount,
    headers,
    text: visibleText(node),
  });
  const body = childState(state);
  if (!compileRuleReplacement(rule, context, body, inheritedStyle, "narration.table")) {
    const tableStyle = mergeNarrationStyles(inheritedStyle, rule.contentStyle);
    appendFragments(body, rule.before ?? [], inheritedStyle);
    if (rule.announceTableStart) appendText(body, "Table. ", tableStyle);

    if (rule.mode !== "cells-only" && headerRow !== undefined) {
      const rowMetadata = { rowIndex: 0, header: true };
      body.tokens.push(boundary("table-row", "start", rowMetadata));
      appendText(body, "Columns: ", tableStyle);
      headers.forEach((_, columnIndex) => {
        const cell = headerRow.children[columnIndex];
        if (columnIndex > 0) appendText(body, columnIndex === headers.length - 1 ? " and " : ", ", tableStyle);
        compileTableCell(
          cell,
          body,
          mergeNarrationStyles(tableStyle, { role: "table-header" }),
          0,
          columnIndex,
          true,
          headers[columnIndex],
          rule.emptyCellText,
        );
      });
      appendText(body, ". ", tableStyle);
      body.tokens.push(boundary("table-row", "end", rowMetadata));
    }

    const firstRowIndex = rule.mode === "cells-only" ? 0 : 1;
    for (let rowIndex = firstRowIndex; rowIndex < node.children.length; rowIndex += 1) {
      const row = node.children[rowIndex];
      if (row === undefined) continue;
      const header = rowIndex === 0;
      const spokenIndex = header ? 0 : rowIndex;
      const rowMetadata = { rowIndex, header };
      body.tokens.push(boundary("table-row", "start", rowMetadata));
      if (!header && rule.announceRowNumbers) {
        appendText(body, `Row ${spokenRowNumber(spokenIndex)}. `, tableStyle);
      }
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const cell = row.children[columnIndex];
        if (columnIndex > 0) appendText(body, " ", tableStyle);
        const headerText = headers[columnIndex];
        if (!header && rule.mode === "header-per-cell" && rule.repeatColumnHeaders && headerText !== undefined) {
          appendText(body, `${headerText}: `, mergeNarrationStyles(tableStyle, { role: "table-header" }));
        }
        compileTableCell(
          cell,
          body,
          mergeNarrationStyles(tableStyle, { role: header ? "table-header" : "table-cell" }),
          rowIndex,
          columnIndex,
          header,
          headerText,
          rule.emptyCellText,
        );
        appendText(body, ".", tableStyle);
      }
      if (rowIndex < node.children.length - 1 || rule.announceTableEnd || (rule.after?.length ?? 0) > 0) {
        appendText(body, " ", tableStyle);
      }
      body.tokens.push(boundary("table-row", "end", rowMetadata));
    }
    if (rule.announceTableEnd) appendText(body, "End table.", tableStyle);
    appendFragments(body, rule.after ?? [], inheritedStyle);
  }
  if (body.tokens.length === 0) return;
  const metadata = tableMetadata(node);
  state.tokens.push(boundary("table", "start", metadata), ...body.tokens, boundary("table", "end", metadata));
}

function compileUnsupportedNode(
  node: Nodes,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  state.diagnostics.push(createNarrationDiagnostic(
    "UNSUPPORTED_MARKDOWN_NODE",
    "warning",
    `Recovered visible text from unsupported Markdown node type ${node.type}.`,
  ));
  const before = state.tokens.length;
  if (isParent(node)) {
    for (const child of node.children) compileNode(child, state, inheritedStyle, true, 0, false);
  }
  if (state.tokens.length > before) return;
  const record = node as unknown as Record<string, unknown>;
  const literal = [record["value"], record["raw"], record["source"]].find((value) => typeof value === "string");
  if (typeof literal === "string") appendText(state, literal, inheritedStyle, true);
}

function compileInlineRule<Context extends object>(
  node: Nodes & Parent,
  rule: NarrationNodeRule<Context>,
  context: Readonly<Context>,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  temporaryTraversal: boolean,
  path: string,
): void {
  if (rule.skip === true) return;
  if (compileRuleReplacement(rule, context, state, inheritedStyle, path)) return;
  appendFragments(state, rule.before ?? [], inheritedStyle);
  const contentStyle = mergeNarrationStyles(inheritedStyle, rule.contentStyle);
  for (const child of node.children) compileNode(child, state, contentStyle, temporaryTraversal);
  appendFragments(state, rule.after ?? [], inheritedStyle);
}

function compileNode(
  node: Nodes,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
  temporaryTraversal: boolean,
  listDepth = 0,
  suppressParagraphPause = false,
): void {
  switch (node.type) {
    case "root":
      for (const child of node.children) compileNode(child, state, inheritedStyle, false, listDepth, false);
      return;
    case "heading":
      if (temporaryTraversal) compileChildrenTemporarily(node, state, inheritedStyle);
      else compileHeading(node, state, inheritedStyle);
      return;
    case "paragraph":
      if (temporaryTraversal) compileChildrenTemporarily(node, state, inheritedStyle);
      else compileParagraph(node, state, inheritedStyle, listDepth, suppressParagraphPause);
      return;
    case "text":
      recoverTextNode(node.value, state, inheritedStyle);
      return;
    case "emphasis":
      compileInlineRule<EmphasisNarrationContext>(
        node,
        state.configuration.italic,
        immutableContext({ text: visibleText(node) }),
        state,
        inheritedStyle,
        temporaryTraversal,
        "narration.italic",
      );
      return;
    case "strong":
      compileInlineRule<StrongNarrationContext>(
        node,
        state.configuration.strong,
        immutableContext({ text: visibleText(node) }),
        state,
        inheritedStyle,
        temporaryTraversal,
        "narration.strong",
      );
      return;
    case "link":
      compileInlineRule<LinkNarrationContext>(
        node,
        state.configuration.link,
        immutableContext({
          text: visibleText(node),
          destination: node.url,
          ...(node.title === null || node.title === undefined ? {} : { title: node.title }),
        }),
        state,
        inheritedStyle,
        temporaryTraversal,
        "narration.link",
      );
      return;
    case "linkReference":
      compileInlineRule<LinkNarrationContext>(
        node,
        state.configuration.link,
        immutableContext({ text: visibleText(node), reference: node.identifier }),
        state,
        inheritedStyle,
        temporaryTraversal,
        "narration.link",
      );
      return;
    case "break":
      appendText(state, " ", inheritedStyle);
      return;
    case "definition":
      return;
    case "list":
      compileList(node, state, inheritedStyle, listDepth);
      return;
    case "listItem":
      compileChildrenTemporarily(node, state, inheritedStyle);
      return;
    case "blockquote":
      compileBlockquote(node, state, inheritedStyle, listDepth);
      return;
    case "image":
    case "imageReference":
      compileImage(node, state, inheritedStyle);
      return;
    case "inlineCode":
      compileInlineCode(node, state, inheritedStyle);
      return;
    case "code":
      compileCodeBlock(node, state, inheritedStyle);
      return;
    case "table":
      compileTable(node, state, inheritedStyle);
      return;
    case "tableRow":
    case "tableCell":
      compileChildrenTemporarily(node, state, inheritedStyle);
      return;
    case "html":
      compileRawHtml(node, state, inheritedStyle);
      return;
    default:
      compileUnsupportedNode(node, state, inheritedStyle);
  }
}

export interface MarkdownTreeCompilationResult {
  readonly plan: NarrationPlan;
  readonly diagnostics: readonly NarrationDiagnostic[];
}

export function compileMarkdownTree(
  root: Root,
  configuration: NarrationConfiguration = defaultNarrationConfiguration,
): MarkdownTreeCompilationResult {
  const state: CompilationState = { tokens: [], diagnostics: [], configuration };
  const rule = configuration.document;
  if (rule.skip !== true) {
    const context = immutableContext<DocumentNarrationContext>({ text: visibleText(root) });
    state.tokens.push(boundary("document", "start"));
    if (!compileRuleReplacement(rule, context, state, undefined, "narration.document")) {
      appendFragments(state, rule.before ?? [], undefined);
      for (const child of root.children) compileNode(child, state, rule.contentStyle, false);
      appendFragments(state, rule.after ?? [], undefined);
    }
    state.tokens.push(boundary("document", "end"));
  }
  return { plan: normalizeNarrationPlan(state.tokens), diagnostics: state.diagnostics };
}
