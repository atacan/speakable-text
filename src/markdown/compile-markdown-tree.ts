import type { Nodes, Parent, Root } from "mdast";
import {
  createNarrationDiagnostic,
  type NarrationDiagnostic,
} from "../narration/diagnostics.js";
import {
  mergeNarrationStyles,
  normalizeNarrationPlan,
} from "../narration/plan.js";
import type {
  BoundaryNarrationToken,
  NarrationPlan,
  NarrationStyle,
  NarrationToken,
  TextNarrationToken,
} from "../narration/tokens.js";

/**
 * Paragraph separation is deliberately modest: it is long enough for the
 * plain-text renderer to create a sentence break without exaggerating blank
 * lines in the Markdown source. Configuration can replace it in a later
 * milestone.
 */
export const DEFAULT_PARAGRAPH_PAUSE_MS = 400;

const HEADING_PAUSES: Readonly<Record<number, readonly [number, number]>> = {
  1: [700, 500],
  2: [550, 400],
  3: [450, 350],
  4: [350, 300],
  5: [350, 300],
  6: [350, 300],
};

const HEADING_STYLE: NarrationStyle = {
  role: "heading",
  emphasis: "strong",
};

const EMPHASIS_STYLE: NarrationStyle = {
  role: "emphasis",
  emphasis: "moderate",
};

const STRONG_STYLE: NarrationStyle = {
  role: "strong-emphasis",
  emphasis: "strong",
};

// Unicode General Category Cf contains formatting controls that have no
// independently speakable representation. A run between two non-whitespace
// characters becomes one space so removal cannot silently join visible text.
const INVISIBLE_FORMATTING_RUN = /\p{Cf}+/gu;

interface CompilationState {
  readonly tokens: NarrationToken[];
  readonly diagnostics: NarrationDiagnostic[];
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
      return before !== undefined && after !== undefined && !/\s/u.test(before) && !/\s/u.test(after)
        ? " "
        : "";
    },
  );
  return withoutInvisible.replace(/\s+/gu, " ");
}

function appendText(
  state: CompilationState,
  value: string,
  style: NarrationStyle | undefined,
): void {
  const cleaned = cleanProseText(value, state.diagnostics);
  if (cleaned.length === 0) return;

  const previous = state.tokens.at(-1);
  const removeDuplicateLeadingSpace =
    previous?.kind === "text" && previous.value.endsWith(" ") && cleaned.startsWith(" ");
  const normalized = removeDuplicateLeadingSpace ? cleaned.slice(1) : cleaned;
  if (normalized.length === 0) return;

  const token: TextNarrationToken = style === undefined
    ? { kind: "text", value: normalized }
    : { kind: "text", value: normalized, style };
  state.tokens.push(token);
}

function isParent(node: Nodes): node is Nodes & Parent {
  return "children" in node && Array.isArray(node.children);
}

/**
 * Temporary content-preserving traversal for node families implemented by
 * later milestones. It intentionally emits no semantic boundaries or final
 * unsupported-node diagnostics.
 */
function compileChildrenTemporarily(
  node: Nodes,
  state: CompilationState,
  inheritedStyle: NarrationStyle | undefined,
): void {
  if (isParent(node)) {
    for (const child of node.children) compileNode(child, state, inheritedStyle, true);
    return;
  }

  if ("alt" in node && typeof node.alt === "string") {
    appendText(state, node.alt, inheritedStyle);
    return;
  }

  if ("value" in node && typeof node.value === "string") {
    appendText(state, node.value, inheritedStyle);
  }
}

function trimInlineEdges(tokens: NarrationToken[], startIndex: number): void {
  const firstTextIndex = tokens.findIndex(
    (token, index) => index >= startIndex && token.kind === "text",
  );
  if (firstTextIndex === -1) return;
  const firstText = tokens[firstTextIndex] as TextNarrationToken;
  tokens[firstTextIndex] = { ...firstText, value: firstText.value.trimStart() };

  for (let index = tokens.length - 1; index >= startIndex; index -= 1) {
    const token = tokens[index];
    if (token?.kind !== "text") continue;
    tokens[index] = { ...token, value: token.value.trimEnd() };
    return;
  }
}

function compileHeading(node: Extract<Nodes, { type: "heading" }>, state: CompilationState): void {
  const contentTokens: NarrationToken[] = [];
  const contentState: CompilationState = {
    tokens: contentTokens,
    diagnostics: state.diagnostics,
  };
  for (const child of node.children) compileNode(child, contentState, HEADING_STYLE, false);
  trimInlineEdges(contentTokens, 0);

  if (!contentTokens.some((token) => token.kind === "text" && token.value.length > 0)) return;
  const pauses = HEADING_PAUSES[node.depth];
  if (pauses === undefined) throw new Error(`Internal invariant failure: invalid heading depth ${node.depth}.`);

  state.tokens.push(boundary("heading", "start", { level: node.depth }));
  state.tokens.push({ kind: "pause", durationMs: pauses[0] });
  state.tokens.push(...contentTokens);
  state.tokens.push({ kind: "pause", durationMs: pauses[1] });
  state.tokens.push(boundary("heading", "end", { level: node.depth }));
}

function compileParagraph(
  node: Extract<Nodes, { type: "paragraph" }>,
  state: CompilationState,
): void {
  const contentTokens: NarrationToken[] = [];
  const contentState: CompilationState = {
    tokens: contentTokens,
    diagnostics: state.diagnostics,
  };
  for (const child of node.children) compileNode(child, contentState, undefined, false);
  trimInlineEdges(contentTokens, 0);
  if (!contentTokens.some((token) => token.kind === "text" && token.value.length > 0)) return;

  state.tokens.push(boundary("paragraph", "start"));
  state.tokens.push(...contentTokens);
  state.tokens.push({ kind: "pause", durationMs: DEFAULT_PARAGRAPH_PAUSE_MS });
  state.tokens.push(boundary("paragraph", "end"));
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
      for (const child of node.children) {
        compileNode(child, state, mergeNarrationStyles(inheritedStyle, EMPHASIS_STYLE), temporaryTraversal);
      }
      return;
    case "strong":
      for (const child of node.children) {
        compileNode(child, state, mergeNarrationStyles(inheritedStyle, STRONG_STYLE), temporaryTraversal);
      }
      return;
    case "link":
    case "linkReference":
      // Ordinary links and GFM autolinks both expose their visible label as
      // children. Keeping that label unchanged is the conservative URL policy.
      for (const child of node.children) compileNode(child, state, inheritedStyle, temporaryTraversal);
      return;
    case "break":
      appendText(state, " ", inheritedStyle);
      return;
    case "definition":
      // Reference definitions have no visible document content.
      return;
    default:
      compileChildrenTemporarily(node, state, inheritedStyle);
  }
}

export interface MarkdownTreeCompilationResult {
  readonly plan: NarrationPlan;
  readonly diagnostics: readonly NarrationDiagnostic[];
}

export function compileMarkdownTree(root: Root): MarkdownTreeCompilationResult {
  const state: CompilationState = { tokens: [], diagnostics: [] };
  state.tokens.push(boundary("document", "start"));
  compileNode(root, state, undefined, false);
  state.tokens.push(boundary("document", "end"));
  return {
    plan: normalizeNarrationPlan(state.tokens),
    diagnostics: state.diagnostics,
  };
}
