import type { Nodes, Parent, Root } from "mdast";
import type {
  BlockquoteNarrationContext,
  DocumentNarrationContext,
  EmphasisNarrationContext,
  HeadingNarrationContext,
  ImageNarrationContext,
  LinkNarrationContext,
  ListItemNarrationContext,
  ListNarrationContext,
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
  return { tokens: [], diagnostics: state.diagnostics, configuration: state.configuration };
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
