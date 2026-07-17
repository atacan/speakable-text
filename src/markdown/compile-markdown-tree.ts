import type { Nodes, Parent, Root } from "mdast";
import type {
  DocumentNarrationContext,
  EmphasisNarrationContext,
  HeadingNarrationContext,
  LinkNarrationContext,
  NarrationConfiguration,
  NarrationNodeRule,
  ParagraphNarrationContext,
  StrongNarrationContext,
} from "../narration/configuration.js";
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

function appendText(state: CompilationState, value: string, style: NarrationStyle | undefined): void {
  const cleaned = cleanProseText(value, state.diagnostics);
  if (cleaned.length === 0) return;
  const previous = state.tokens.at(-1);
  const normalized = previous?.kind === "text" && previous.value.endsWith(" ") && cleaned.startsWith(" ")
    ? cleaned.slice(1)
    : cleaned;
  if (normalized.length === 0) return;
  const token: TextNarrationToken = style === undefined
    ? { kind: "text", value: normalized }
    : { kind: "text", value: normalized, style };
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
    for (const child of node.children) compileNode(child, state, inheritedStyle, true);
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
  return { tokens: [], diagnostics: state.diagnostics, configuration: state.configuration };
}

function compileBoundedRule<Context extends object>(
  boundaryName: "heading" | "paragraph",
  metadata: BoundaryNarrationToken["metadata"] | undefined,
  rule: NarrationNodeRule<Context>,
  context: Readonly<Context>,
  state: CompilationState,
  compileContent: (target: CompilationState, style: NarrationStyle | undefined) => void,
  path: string,
): void {
  if (rule.skip === true) return;
  const body = childState(state);
  if (!compileRuleReplacement(rule, context, body, undefined, path)) {
    appendFragments(body, rule.before ?? [], undefined);
    const content = childState(state);
    compileContent(content, rule.contentStyle);
    trimInlineEdges(content.tokens);
    body.tokens.push(...content.tokens);
    appendFragments(body, rule.after ?? [], undefined);
  }
  if (body.tokens.length === 0) return;
  state.tokens.push(boundary(boundaryName, "start", metadata), ...body.tokens, boundary(boundaryName, "end", metadata));
}

function compileHeading(node: Extract<Nodes, { type: "heading" }>, state: CompilationState): void {
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
    (target, style) => {
      for (const child of node.children) compileNode(child, target, style, false);
    },
    `narration.headings.${level}`,
  );
}

function compileParagraph(node: Extract<Nodes, { type: "paragraph" }>, state: CompilationState): void {
  if (visibleText(node).trim().length === 0) return;
  const rule = state.configuration.paragraph;
  const context = immutableContext<ParagraphNarrationContext>({ text: visibleText(node) });
  compileBoundedRule(
    "paragraph",
    undefined,
    rule,
    context,
    state,
    (target, style) => {
      for (const child of node.children) compileNode(child, target, style, false);
    },
    "narration.paragraph",
  );
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
): void {
  switch (node.type) {
    case "root":
      for (const child of node.children) compileNode(child, state, inheritedStyle, false);
      return;
    case "heading":
      if (temporaryTraversal) compileChildrenTemporarily(node, state, inheritedStyle);
      else compileHeading(node, state);
      return;
    case "paragraph":
      if (temporaryTraversal) compileChildrenTemporarily(node, state, inheritedStyle);
      else compileParagraph(node, state);
      return;
    case "text":
      appendText(state, node.value, inheritedStyle);
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
    default:
      compileChildrenTemporarily(node, state, inheritedStyle);
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
