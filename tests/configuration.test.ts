import assert from "node:assert/strict";
import test from "node:test";
import {
  compileMarkdown,
  defaultNarrationConfiguration,
  resolveNarrationConfiguration,
  type HeadingNarrationContext,
  type NarrationConfigurationOverrides,
  type NarrationFragment,
} from "../src/index.js";

function textValues(markdown: string, narration: NarrationConfigurationOverrides): string[] {
  return compileMarkdown(markdown, { narration }).plan.tokens
    .filter((token) => token.kind === "text")
    .map((token) => token.value);
}

test("deep resolution replaces fragment arrays and keeps heading levels independent", () => {
  const resolved = resolveNarrationConfiguration({
    headings: {
      1: { before: [{ kind: "text", value: "Main title." }, { kind: "pause", durationMs: 250 }] },
      2: { after: [{ kind: "text", value: "Section complete." }] },
    },
  });
  assert.deepEqual(resolved.headings[1].before, [
    { kind: "text", value: "Main title." },
    { kind: "pause", durationMs: 250 },
  ]);
  assert.deepEqual(resolved.headings[1].after, [{ kind: "pause", durationMs: 500 }]);
  assert.deepEqual(resolved.headings[2].before, [{ kind: "pause", durationMs: 550 }]);
  assert.deepEqual(resolved.headings[2].after, [{ kind: "text", value: "Section complete." }]);

  const tokens = compileMarkdown("# One\n\n## Two", { narration: {
    headings: {
      1: { before: [{ kind: "text", value: "H one. " }] },
      2: { before: [{ kind: "text", value: "H two. " }] },
    },
  } }).plan.tokens;
  assert.deepEqual(tokens.filter((token) => token.kind === "pause").map((token) => token.durationMs), [500, 400]);
  assert.deepEqual(tokens.filter((token) => token.kind === "text").map((token) => token.value), ["H one. ", "One", "H two. ", "Two"]);
});

test("document after fragments occur inside the compiler-owned document boundary", () => {
  const tokens = compileMarkdown("Hello.", { narration: {
    document: { after: [{ kind: "pause", durationMs: 400 }, { kind: "text", value: "End of document." }] },
  } }).plan.tokens;
  assert.deepEqual(tokens.slice(-3), [
    { kind: "pause", durationMs: 400 },
    { kind: "text", value: "End of document." },
    { kind: "boundary", boundary: "document", phase: "end" },
  ]);
});

test("content styles resolve deeply and merge from outer nodes to inner nodes", () => {
  const resolved = resolveNarrationConfiguration({ italic: { contentStyle: { tone: "calm" } } });
  assert.deepEqual(resolved.italic.contentStyle, {
    role: "emphasis",
    tone: "calm",
    emphasis: "moderate",
  });

  const tokens = compileMarkdown("*outer **inner***", { narration: {
    paragraph: { contentStyle: { rate: "slow", tone: "serious" } },
    italic: { contentStyle: { tone: "calm" } },
  } }).plan.tokens.filter((token) => token.kind === "text");
  assert.deepEqual(tokens, [
    { kind: "text", value: "outer ", style: { role: "emphasis", tone: "calm", rate: "slow", emphasis: "moderate" } },
    { kind: "text", value: "inner", style: { role: "strong-emphasis", tone: "calm", rate: "slow", emphasis: "strong" } },
  ]);
});

test("compile callbacks replace before, content, style, and after but retain node boundaries", () => {
  const tokens = compileMarkdown("# Original", { narration: { headings: { 1: {
    before: [{ kind: "text", value: "unused before" }],
    after: [{ kind: "text", value: "unused after" }],
    contentStyle: { tone: "excited" },
    compile: (context) => [{ kind: "text", value: `Replacement for ${context.text}.` }],
  } } } }).plan.tokens;
  assert.deepEqual(tokens.slice(1, -1), [
    { kind: "boundary", boundary: "heading", phase: "start", metadata: { level: 1 } },
    { kind: "text", value: "Replacement for Original." },
    { kind: "boundary", boundary: "heading", phase: "end", metadata: { level: 1 } },
  ]);
});

test("skip omits a complete subtree and never invokes its callback", () => {
  let calls = 0;
  const plan = compileMarkdown("Keep *remove **all*** this.", { narration: { italic: {
    skip: true,
    compile: () => {
      calls += 1;
      return [{ kind: "text", value: "wrong" }];
    },
  } } }).plan;
  assert.equal(calls, 0);
  assert.equal(plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(""), "Keep this.");
});

test("callbacks receive frozen AST-free contexts and link data", () => {
  let seen: Readonly<HeadingNarrationContext> | undefined;
  const heading = compileMarkdown("# Frozen", { narration: { headings: { 1: { compile: (context) => {
    seen = context;
    assert.equal(Object.isFrozen(context), true);
    assert.throws(() => Object.assign(context, { text: "changed" }), TypeError);
    return [{ kind: "text", value: context.text }];
  } } } } });
  assert.equal(seen?.text, "Frozen");
  assert.deepEqual(JSON.parse(JSON.stringify(heading.plan)), heading.plan);

  let linkFrozen = false;
  assert.deepEqual(textValues("[Guide](https://example.test/path \"Docs\")", { link: { compile: (context) => {
    linkFrozen = Object.isFrozen(context);
    return [{ kind: "text", value: `${context.text} at ${context.destination} (${context.title})` }];
  } } }), ["Guide at https://example.test/path (Docs)"]);
  assert.equal(linkFrozen, true);
});

test("resolved configuration is detached from caller mutations and deeply frozen", () => {
  const before: NarrationFragment[] = [{ kind: "text", value: "Original" }];
  const overrides: NarrationConfigurationOverrides = { document: { before } };
  const resolved = resolveNarrationConfiguration(overrides);
  before[0] = { kind: "text", value: "Mutated" };
  before.push({ kind: "text", value: "Extra" });
  assert.deepEqual(resolved.document.before, [{ kind: "text", value: "Original" }]);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.document.before), true);
  assert.equal(Object.isFrozen(defaultNarrationConfiguration.headings[1].contentStyle), true);
  assert.throws(() => (resolved.document.before as NarrationFragment[]).push({ kind: "text", value: "No" }), TypeError);
});

test("invalid static configuration throws TypeError before Markdown parsing", () => {
  const invalidInputs: unknown[] = [
    { paragraph: { after: [{ kind: "pause", durationMs: -1 }] } },
    { document: { before: [{ kind: "pause", durationMs: Number.NaN }] } },
    { headings: { 7: {} } },
    { italic: { contentStyle: { rate: 2 } } },
    { link: { unknown: true } },
    { paragraph: { before: [{ kind: "boundary", boundary: "paragraph", phase: "start" }] } },
  ];
  for (const narration of invalidInputs) {
    assert.throws(
      () => compileMarkdown(null as unknown as string, { narration: narration as NarrationConfigurationOverrides }),
      { name: "TypeError", message: /Invalid narration configuration/u },
    );
  }
});

test("callback fragments are runtime validated and cannot emit boundaries", () => {
  assert.throws(
    () => compileMarkdown("# Heading", { narration: { headings: { 1: {
      compile: (() => [{ kind: "pause", durationMs: Number.POSITIVE_INFINITY }]) as never,
    } } } }),
    { name: "TypeError", message: /compile result/u },
  );
  assert.throws(
    () => compileMarkdown("Text", { narration: { paragraph: {
      compile: (() => [{ kind: "boundary", boundary: "paragraph", phase: "end" }]) as never,
    } } }),
    { name: "TypeError", message: /boundary|not supported/u },
  );
});

test("document compile replacement keeps only the document boundary around callback output", () => {
  const result = compileMarkdown("Ignored *content*.", { narration: { document: {
    before: [{ kind: "text", value: "unused" }],
    compile: (context) => [{ kind: "text", value: `Summary: ${context.text}` }],
  } } });
  assert.deepEqual(result.plan.tokens, [
    { kind: "boundary", boundary: "document", phase: "start" },
    { kind: "text", value: "Summary: Ignored content." },
    { kind: "boundary", boundary: "document", phase: "end" },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.plan)), result.plan);
});
