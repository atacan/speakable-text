import assert from "node:assert/strict";
import test from "node:test";
import type { Root } from "mdast";
import {
  compileMarkdown,
  convertMarkdown,
  type NarrationToken,
} from "../src/index.js";
import { compileMarkdownTree } from "../src/markdown/compile-markdown-tree.js";

const F02 = `3. Prepare
4. Deploy
   - Watch logs
   - Check health

- Notify the team`;
const F03 = `- [x] Compile
- [ ] Publish`;
const F04 = `> Keep the rollback ready.
>
> Verify metrics first.`;
const F07 = `![Deployment diagram](https://example.test/deploy.png)

![](https://example.test/decorative.png)`;

function boundary(
  name: Extract<NarrationToken, { kind: "boundary" }>["boundary"],
  phase: "start" | "end",
  metadata?: Readonly<Record<string, string | number | boolean>>,
): NarrationToken {
  return metadata === undefined
    ? { kind: "boundary", boundary: name, phase }
    : { kind: "boundary", boundary: name, phase, metadata };
}

test("F02 has an exact nested list plan and transcript", () => {
  const ordered = { ordered: true, depth: 1, itemCount: 2, start: 3 };
  const item3 = { ordered: true, depth: 1, index: 0, number: 3 };
  const item4 = { ordered: true, depth: 1, index: 1, number: 4 };
  const nested = { ordered: false, depth: 2, itemCount: 2 };
  const nested0 = { ordered: false, depth: 2, index: 0 };
  const nested1 = { ordered: false, depth: 2, index: 1 };
  const finalList = { ordered: false, depth: 1, itemCount: 1 };
  const finalItem = { ordered: false, depth: 1, index: 0 };
  const paragraph = (value: string): NarrationToken[] => [
    boundary("paragraph", "start"),
    { kind: "text", value, style: { role: "list-item" } },
    boundary("paragraph", "end"),
  ];
  assert.deepEqual(compileMarkdown(F02), {
    plan: { schemaVersion: 1, tokens: [
      boundary("document", "start"),
      boundary("list", "start", ordered),
      boundary("list-item", "start", item3),
      { kind: "pause", durationMs: 400 },
      { kind: "text", value: "Three. ", style: { role: "list-item" } },
      ...paragraph("Prepare"),
      boundary("list-item", "end", item3),
      boundary("list-item", "start", item4),
      { kind: "pause", durationMs: 400 },
      { kind: "text", value: "Four. ", style: { role: "list-item" } },
      ...paragraph("Deploy"),
      boundary("list", "start", nested),
      boundary("list-item", "start", nested0),
      { kind: "pause", durationMs: 550 },
      ...paragraph("Watch logs"),
      boundary("list-item", "end", nested0),
      boundary("list-item", "start", nested1),
      { kind: "pause", durationMs: 550 },
      ...paragraph("Check health"),
      boundary("list-item", "end", nested1),
      boundary("list", "end", nested),
      boundary("list-item", "end", item4),
      boundary("list", "end", ordered),
      boundary("list", "start", finalList),
      boundary("list-item", "start", finalItem),
      { kind: "pause", durationMs: 400 },
      ...paragraph("Notify the team"),
      boundary("list-item", "end", finalItem),
      boundary("list", "end", finalList),
      boundary("document", "end"),
    ] },
    diagnostics: [],
  });
  assert.equal(convertMarkdown(F02).text, "Three. Prepare. Four. Deploy. Watch logs. Check health. Notify the team");
});

test("F03 pairs exact task-state phrases with item metadata and content", () => {
  const list = { ordered: false, depth: 1, itemCount: 2 };
  const completed = { ordered: false, depth: 1, index: 0, checked: true };
  const incomplete = { ordered: false, depth: 1, index: 1, checked: false };
  assert.deepEqual(compileMarkdown(F03), {
    plan: { schemaVersion: 1, tokens: [
      boundary("document", "start"),
      boundary("list", "start", list),
      boundary("list-item", "start", completed),
      { kind: "pause", durationMs: 400 },
      { kind: "text", value: "Completed item. ", style: { role: "list-item" } },
      boundary("paragraph", "start"),
      { kind: "text", value: "Compile", style: { role: "list-item" } },
      boundary("paragraph", "end"),
      boundary("list-item", "end", completed),
      boundary("list-item", "start", incomplete),
      { kind: "pause", durationMs: 400 },
      { kind: "text", value: "Incomplete item. ", style: { role: "list-item" } },
      boundary("paragraph", "start"),
      { kind: "text", value: "Publish", style: { role: "list-item" } },
      boundary("paragraph", "end"),
      boundary("list-item", "end", incomplete),
      boundary("list", "end", list),
      boundary("document", "end"),
    ] },
    diagnostics: [],
  });
  assert.equal(convertMarkdown(F03).text, "Completed item. Compile. Incomplete item. Publish");
});

test("F04 recursively preserves an exact quoted plan and transcript", () => {
  assert.deepEqual(compileMarkdown(F04), {
    plan: { schemaVersion: 1, tokens: [
      boundary("document", "start"),
      boundary("blockquote", "start"),
      { kind: "pause", durationMs: 500 },
      boundary("paragraph", "start"),
      { kind: "text", value: "Keep the rollback ready.", style: { role: "quotation" } },
      { kind: "pause", durationMs: 400 },
      boundary("paragraph", "end"),
      boundary("paragraph", "start"),
      { kind: "text", value: "Verify metrics first.", style: { role: "quotation" } },
      { kind: "pause", durationMs: 400 },
      boundary("paragraph", "end"),
      { kind: "pause", durationMs: 500 },
      boundary("blockquote", "end"),
      boundary("document", "end"),
    ] },
    diagnostics: [],
  });
  assert.equal(convertMarkdown(F04).text, "Keep the rollback ready. Verify metrics first.");
});

test("F07 narrates nonempty alt text exactly and makes an empty-alt image tokenless", () => {
  assert.deepEqual(compileMarkdown(F07), {
    plan: { schemaVersion: 1, tokens: [
      boundary("document", "start"),
      boundary("paragraph", "start"),
      { kind: "text", value: "Image. Deployment diagram", style: { role: "image" } },
      { kind: "pause", durationMs: 400 },
      boundary("paragraph", "end"),
      boundary("document", "end"),
    ] },
    diagnostics: [],
  });
  assert.equal(convertMarkdown(F07).text, "Image. Deployment diagram");
  assert.doesNotMatch(convertMarkdown(F07).text, /https|decorative/u);
});

test("ordered numbering uses parsed start plus index even when every source marker repeats one", () => {
  const result = compileMarkdown("1. Alpha\n1. Beta\n1. Gamma");
  assert.deepEqual(
    result.plan.tokens.filter((token) => token.kind === "boundary" && token.boundary === "list-item" && token.phase === "start")
      .map((token) => token.kind === "boundary" ? token.metadata?.["number"] : undefined),
    [1, 2, 3],
  );
  assert.equal(convertMarkdown("1. Alpha\n1. Beta\n1. Gamma").text, "One. Alpha. Two. Beta. Three. Gamma");
});

test("ordered task items preserve exact computed numbering and task state from repeated markers", () => {
  const markdown = "1. [x] Compile\n1. [ ] Publish";
  const list = { ordered: true, depth: 1, itemCount: 2, start: 1 };
  const completed = { ordered: true, depth: 1, index: 0, number: 1, checked: true };
  const incomplete = { ordered: true, depth: 1, index: 1, number: 2, checked: false };
  assert.deepEqual(compileMarkdown(markdown), {
    plan: { schemaVersion: 1, tokens: [
      boundary("document", "start"),
      boundary("list", "start", list),
      boundary("list-item", "start", completed),
      { kind: "pause", durationMs: 400 },
      { kind: "text", value: "One. Completed item. ", style: { role: "list-item" } },
      boundary("paragraph", "start"),
      { kind: "text", value: "Compile", style: { role: "list-item" } },
      boundary("paragraph", "end"),
      boundary("list-item", "end", completed),
      boundary("list-item", "start", incomplete),
      { kind: "pause", durationMs: 400 },
      { kind: "text", value: "Two. Incomplete item. ", style: { role: "list-item" } },
      boundary("paragraph", "start"),
      { kind: "text", value: "Publish", style: { role: "list-item" } },
      boundary("paragraph", "end"),
      boundary("list-item", "end", incomplete),
      boundary("list", "end", list),
      boundary("document", "end"),
    ] },
    diagnostics: [],
  });
  assert.equal(convertMarkdown(markdown).text, "One. Completed item. Compile. Two. Incomplete item. Publish");
});

test("tight and loose items retain paragraph relationships without duplicate trailing item pauses", () => {
  const tight = compileMarkdown("- Alpha\n- Beta").plan.tokens;
  assert.equal(tight.filter((token) => token.kind === "pause").length, 2);
  const looseText = convertMarkdown("- First paragraph.\n\n  Second paragraph.\n\n- Last item.").text;
  assert.equal(looseText, "First paragraph. Second paragraph. Last item.");
});

test("nested list cadence is stronger and recursive emphasis remains semantic", () => {
  const result = compileMarkdown("- Parent\n  - *Nested* **value**");
  assert.deepEqual(result.plan.tokens.filter((token) => token.kind === "pause").map((token) => token.durationMs), [400, 550]);
  assert.deepEqual(result.plan.tokens.filter((token) => token.kind === "text").map((token) => token.style), [
    { role: "list-item" },
    { role: "emphasis", emphasis: "moderate" },
    { role: "list-item" },
    { role: "strong-emphasis", emphasis: "strong" },
  ]);
  assert.equal(convertMarkdown("- Parent\n  - *Nested* **value**").text, "Parent. Nested value");
});

test("structure configuration replaces phrases, enables nesting announcements, and supports skips", () => {
  const taskText = convertMarkdown(F03, { narration: { listItem: {
    completedTaskPrefix: [{ kind: "text", value: "Done. " }],
    incompleteTaskPrefix: [{ kind: "text", value: "Pending. " }],
  } } }).text;
  assert.equal(taskText, "Done. Compile. Pending. Publish");

  const nestedText = convertMarkdown("- Outer\n  - Inner", { narration: { listItem: {
    nestingPrefix: ({ depth }) => depth > 1 ? [{ kind: "text", value: `Level ${depth}. ` }] : [],
  } } }).text;
  assert.equal(nestedText, "Outer. Level 2. Inner");

  assert.equal(convertMarkdown("Before.\n\n> Hidden.\n\nAfter.", { narration: { blockquote: { skip: true } } }).text, "Before. After.");
  assert.equal(convertMarkdown("Before ![hidden](x) after.", { narration: { image: { skip: true } } }).text, "Before after.");
  assert.equal(convertMarkdown("Before.\n\n- Hidden\n\nAfter.", { narration: { unorderedList: { skip: true } } }).text, "Before. After.");
  assert.equal(convertMarkdown(F04, { narration: { blockquote: {
    before: [{ kind: "text", value: "Quote starts. " }],
    after: [{ kind: "text", value: "Quote ends." }],
  } } }).text, "Quote starts. Keep the rollback ready. Verify metrics first. Quote ends.");
  assert.equal(convertMarkdown("![Map](x)", { narration: { image: {
    before: [{ kind: "text", value: "Diagram: " }],
  } } }).text, "Diagram: Map");
});

test("node callbacks retain boundaries, replace subtree behavior, and receive frozen contexts", () => {
  let frozen = false;
  const tokens = compileMarkdown("- Original", { narration: { listItem: { compile: (context) => {
    frozen = Object.isFrozen(context);
    return [{ kind: "text", value: `Replacement ${context.index}.` }];
  } } } }).plan.tokens;
  assert.equal(frozen, true);
  assert.equal(tokens.some((token) => token.kind === "boundary" && token.boundary === "list-item"), true);
  assert.deepEqual(tokens.filter((token) => token.kind === "text").map((token) => token.value), ["Replacement 0."]);

  const listTokens = compileMarkdown("- Original", { narration: { unorderedList: {
    compile: (context) => [{ kind: "text", value: `List of ${context.itemCount}.` }],
  } } }).plan.tokens;
  assert.deepEqual(listTokens.slice(1, -1), [
    boundary("list", "start", { ordered: false, depth: 1, itemCount: 1 }),
    { kind: "text", value: "List of 1." },
    boundary("list", "end", { ordered: false, depth: 1, itemCount: 1 }),
  ]);

  const quoteTokens = compileMarkdown("> Original", { narration: { blockquote: {
    compile: () => [{ kind: "text", value: "Quoted replacement." }],
  } } }).plan.tokens;
  assert.deepEqual(quoteTokens.slice(1, -1), [
    boundary("blockquote", "start"),
    { kind: "text", value: "Quoted replacement." },
    boundary("blockquote", "end"),
  ]);

  assert.equal(convertMarkdown("![Original](x)", { narration: { image: {
    compile: (context) => [{ kind: "text", value: `Graphic ${context.alt}.` }],
  } } }).text, "Graphic Original.");
});

test("structure skips omit complete subtrees without invoking callbacks", () => {
  let calls = 0;
  const callback = () => {
    calls += 1;
    return [{ kind: "text" as const, value: "wrong" }];
  };
  assert.equal(convertMarkdown("- Hidden", { narration: { unorderedList: { skip: true, compile: callback } } }).text, "");
  assert.equal(convertMarkdown("> Hidden", { narration: { blockquote: { skip: true, compile: callback } } }).text, "");
  assert.equal(convertMarkdown("![Hidden](x)", { narration: { image: { skip: true, compile: callback } } }).text, "");
  assert.equal(calls, 0);
});

test("missing image alt is omitted with an informational diagnostic while empty alt is silent", () => {
  const root: Root = { type: "root", children: [{ type: "paragraph", children: [
    { type: "image", url: "x", title: null } as never,
  ] }] };
  const missing = compileMarkdownTree(root);
  assert.deepEqual(missing.plan.tokens, [boundary("document", "start"), boundary("document", "end")]);
  assert.deepEqual(missing.diagnostics, [{
    code: "IMAGE_ALT_MISSING",
    severity: "info",
    message: "An image without alternative text was omitted from spoken output.",
  }]);
  assert.deepEqual(compileMarkdown("![](x)").diagnostics, []);
});

test("structure-specific invalid fragments and callback output fail before unsafe plan data escapes", () => {
  assert.throws(
    () => compileMarkdown("- Item", { narration: { listItem: { itemSeparator: [{ kind: "pause", durationMs: -1 }] } } }),
    /narration\.listItem\.itemSeparator/u,
  );
  assert.throws(
    () => compileMarkdown("1. Item", { narration: { listItem: {
      orderedPrefix: (() => [{ kind: "boundary" }]) as never,
    } } }),
    /orderedPrefix result/u,
  );
});
