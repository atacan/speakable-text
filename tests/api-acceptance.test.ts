import assert from "node:assert/strict";
import test from "node:test";
import {
  compileMarkdown,
  convertMarkdown,
  DEFAULT_OPERATOR_PHRASES,
  renderNarration,
  type CodeNarrationMode,
  type CodeOperator,
  type NarrationConfigurationOverrides,
  type NarrationDiagnostic,
  type NarrationFragment,
  type NarrationPlan,
  type NarrationRenderer,
  type OperatorPhrasebook,
} from "../src/index.js";

const F01 = `# Release notes

Read the *important* **migration guide** in [the documentation](https://example.test/guide).`;

const F06 = `| Name | Status |
| --- | --- |
| Build | **Passing** |
| Tests | |`;

function spoken(plan: NarrationPlan): string {
  return plan.tokens.flatMap((token) => token.kind === "text" ? [token.value] : []).join("");
}

test("S01 convert is exactly compile plus render and plans survive a JSON wire round trip", () => {
  const compilation = compileMarkdown(F01);
  const rendering = renderNarration(compilation.plan);
  const conversion = convertMarkdown(F01);

  assert.deepEqual(conversion, {
    plan: compilation.plan,
    text: rendering.text,
    diagnostics: [...compilation.diagnostics, ...rendering.diagnostics],
  });
  assert.equal(conversion.plan.schemaVersion, 1);

  const wirePlan = JSON.parse(JSON.stringify(conversion.plan)) as NarrationPlan;
  assert.deepEqual(wirePlan, conversion.plan);
  assert.deepEqual(renderNarration(wirePlan), rendering);

  const visit = (value: unknown): void => {
    assert.notEqual(typeof value, "function");
    if (typeof value === "number") assert.equal(Number.isFinite(value), true);
    if (typeof value !== "object" || value === null) return;
    assert.equal(Object.getPrototypeOf(value) === Object.prototype || Array.isArray(value), true);
    for (const child of Object.values(value)) visit(child);
  };
  visit(wirePlan);
});

test("S02 deep overrides replace arrays, retain independent heading levels, and replace task wording", () => {
  const markdown = `# One

## Two

- [x] Compile
- [ ] Publish`;
  const result = compileMarkdown(markdown, { narration: {
    headings: {
      1: { before: [{ kind: "text", value: "Main title. " }, { kind: "pause", durationMs: 250 }] },
      2: { before: [{ kind: "text", value: "Subsection. " }, { kind: "pause", durationMs: 125 }] },
    },
    document: { after: [{ kind: "text", value: " End of document." }] },
    listItem: {
      completedTaskPrefix: [{ kind: "text", value: "Done. " }],
      incompleteTaskPrefix: [{ kind: "text", value: "Pending. " }],
    },
  } });

  assert.deepEqual(
    result.plan.tokens.filter((token) => token.kind === "pause").slice(0, 4).map((token) => token.durationMs),
    [250, 500, 125, 400],
  );
  assert.match(spoken(result.plan), /^Main title\. OneSubsection\. Two/u);
  assert.match(spoken(result.plan), /Done\. CompilePending\. Publish End of document\.$/u);
});

test("S02 before, after, and skip apply consistently to every public major-node rule", () => {
  type Case = {
    readonly name: string;
    readonly markdown: string;
    readonly override: (rule: Record<string, unknown>) => NarrationConfigurationOverrides;
    readonly content: string;
  };
  const cases: readonly Case[] = [
    { name: "document", markdown: "content", override: (rule) => ({ document: rule }), content: "content" },
    { name: "heading", markdown: "# content", override: (rule) => ({ headings: { 1: rule } }), content: "content" },
    { name: "paragraph", markdown: "content", override: (rule) => ({ paragraph: rule }), content: "content" },
    { name: "italic", markdown: "*content*", override: (rule) => ({ italic: rule }), content: "content" },
    { name: "strong", markdown: "**content**", override: (rule) => ({ strong: rule }), content: "content" },
    { name: "link", markdown: "[content](https://example.test)", override: (rule) => ({ link: rule }), content: "content" },
    { name: "ordered list", markdown: "1. content", override: (rule) => ({ orderedList: rule }), content: "content" },
    { name: "unordered list", markdown: "- content", override: (rule) => ({ unorderedList: rule }), content: "content" },
    { name: "list item", markdown: "- content", override: (rule) => ({ listItem: rule }), content: "content" },
    { name: "blockquote", markdown: "> content", override: (rule) => ({ blockquote: rule }), content: "content" },
    { name: "image", markdown: "![content](image.png)", override: (rule) => ({ image: rule }), content: "content" },
    { name: "table", markdown: "| H |\n| - |\n| content |", override: (rule) => ({ table: rule }), content: "content" },
    { name: "inline code", markdown: "`content`", override: (rule) => ({ code: { inline: rule } }), content: "content" },
    { name: "code block", markdown: "```text\ncontent\n```", override: (rule) => ({ code: { block: rule } }), content: "content" },
  ];

  for (const entry of cases) {
    const markers = entry.override({
      before: [{ kind: "text", value: "BEFORE|" }],
      after: [{ kind: "text", value: "|AFTER" }],
    });
    const marked = spoken(compileMarkdown(entry.markdown, { narration: markers }).plan);
    assert.ok(marked.indexOf("BEFORE|") < marked.indexOf(entry.content), `${entry.name}: before precedes content`);
    assert.ok(marked.indexOf(entry.content) < marked.indexOf("|AFTER"), `${entry.name}: after follows content`);

    let callbackCalls = 0;
    const skipped = compileMarkdown(entry.markdown, { narration: entry.override({
      skip: true,
      compile: () => {
        callbackCalls += 1;
        return [{ kind: "text", value: "wrong" }];
      },
    }) });
    assert.equal(spoken(skipped.plan).includes(entry.content), false, `${entry.name}: subtree is skipped`);
    assert.equal(callbackCalls, 0, `${entry.name}: skip suppresses callback`);
  }
});

test("S02 callbacks receive frozen AST-free data and replace normal rule behavior", () => {
  let callbackContext: Readonly<Record<string, unknown>> | undefined;
  const result = compileMarkdown(F06, { narration: { table: {
    before: [{ kind: "text", value: "unused before" }],
    after: [{ kind: "text", value: "unused after" }],
    contentStyle: { tone: "excited" },
    compile: (context) => {
      callbackContext = context as unknown as Readonly<Record<string, unknown>>;
      assert.equal(Object.isFrozen(context), true);
      assert.equal(Object.isFrozen(context.headers), true);
      return [{ kind: "text", value: `${context.rowCount} by ${context.columnCount}` }];
    },
  } } });

  assert.equal(spoken(result.plan), "2 by 2");
  assert.equal(JSON.stringify(callbackContext).includes("children"), false);
  assert.equal(JSON.stringify(callbackContext).includes("position"), false);
});

test("S03 every table mode and announcement toggle preserves ordered cell content", () => {
  const runs = [
    { mode: "headers-then-rows" as const },
    { mode: "header-per-cell" as const },
    { mode: "cells-only" as const },
    { announceTableStart: false },
    { announceTableEnd: false },
    { announceRowNumbers: false },
    { repeatColumnHeaders: false },
    { emptyCellText: "vacant" },
  ];
  for (const table of runs) {
    const text = convertMarkdown(F06, { narration: { table } }).text;
    const values = ["Name", "Status", "Build", "Passing", "Tests"];
    let previous = -1;
    for (const value of values) {
      const next = text.indexOf(value, previous + 1);
      assert.ok(next > previous, `${JSON.stringify(table)} preserves ${value} in order`);
      previous = next;
    }
    assert.match(text, table.emptyCellText === "vacant" ? /vacant/u : /empty/u);
  }
  assert.doesNotMatch(convertMarkdown(F06, { narration: { table: { announceTableStart: false } } }).text, /^Table\./u);
  assert.doesNotMatch(convertMarkdown(F06, { narration: { table: { announceTableEnd: false } } }).text, /End table\.$/u);
  assert.doesNotMatch(convertMarkdown(F06, { narration: { table: { announceRowNumbers: false } } }).text, /Row one/u);
  assert.doesNotMatch(convertMarkdown(F06, { narration: { table: { repeatColumnHeaders: false } } }).text, /Name: Build/u);
});

test("S03 public code configuration types and values drive announcements and both language narrators", () => {
  const mode: CodeNarrationMode = "natural";
  const operator: CodeOperator = "==";
  const phrases: OperatorPhrasebook = DEFAULT_OPERATOR_PHRASES;
  assert.equal(phrases[operator], "is equal to");

  const announcement: readonly NarrationFragment[] = [{ kind: "text", value: "Snippet. " }];
  const narration: NarrationConfigurationOverrides = { code: {
    mode,
    operators: { "==": "matches", "===": "matches exactly" },
    block: {
      startAnnouncement: announcement,
      languageAnnouncement: ({ language }) => [{ kind: "text", value: `${language} dialect. ` }],
      endAnnouncement: [{ kind: "text", value: "Done." }],
    },
  } };
  assert.equal(
    convertMarkdown("```python\nmatch = left == right\n```", { narration }).text,
    "Snippet. Python dialect. Set match to left matches right. Done.",
  );
  assert.equal(
    convertMarkdown("```ts\nconst match = left === right;\n```", { narration }).text,
    "Snippet. TypeScript dialect. Set constant match to left matches exactly right. Done.",
  );
});

function escapeMarkup(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

test("S04 custom renderer invocation, capabilities, escaping, diagnostics, and schema rejection", () => {
  let calls = 0;
  const renderer: NarrationRenderer = {
    id: "acceptance-tagged-text",
    capabilities: {
      exactPauses: false,
      emphasis: false,
      tone: false,
      speakingRate: false,
      voiceRoles: false,
    },
    render(plan) {
      calls += 1;
      const diagnostics: NarrationDiagnostic[] = [];
      const seen = new Set<string>();
      const add = (key: string, diagnostic: NarrationDiagnostic): void => {
        if (!seen.has(key)) diagnostics.push(diagnostic);
        seen.add(key);
      };
      let text = "";
      for (const token of plan.tokens) {
        if (token.kind === "text") {
          text += escapeMarkup(token.value);
          if (token.style?.role !== undefined) add("unsupported:role", {
            code: "RENDERER_FEATURE_UNSUPPORTED", severity: "info", message: "Voice roles are not supported.",
          });
          if (token.style?.emphasis !== undefined) add("unsupported:emphasis", {
            code: "RENDERER_FEATURE_UNSUPPORTED", severity: "info", message: "Emphasis is not supported.",
          });
        } else if (token.kind === "pause" && token.durationMs > 0) {
          text += " ";
          add("approximated:pause", {
            code: "RENDERER_FEATURE_APPROXIMATED", severity: "info", message: "Pauses use spaces.",
          });
        }
      }
      return { text, diagnostics };
    },
  };

  const configuredMarkup = `<break time="9s"/> & <voice>`;
  const result = convertMarkdown(`Visible\u200B text.`, { narration: {
    document: { before: [{ kind: "text", value: configuredMarkup }] },
  }, renderer });
  assert.equal(calls, 1);
  assert.equal(result.text.includes("<break"), false);
  assert.match(result.text, /&lt;break time="9s"\/&gt; &amp; &lt;voice&gt;/u);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "INVISIBLE_CHARACTER_REMOVED",
    "RENDERER_FEATURE_APPROXIMATED",
  ]);

  const styled = renderNarration(JSON.parse(JSON.stringify(compileMarkdown(F01).plan)) as NarrationPlan, renderer);
  assert.deepEqual(styled.diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.message}`), [
    "RENDERER_FEATURE_APPROXIMATED:Pauses use spaces.",
    "RENDERER_FEATURE_UNSUPPORTED:Voice roles are not supported.",
    "RENDERER_FEATURE_UNSUPPORTED:Emphasis is not supported.",
  ]);

  assert.throws(
    () => renderNarration({ schemaVersion: 2, tokens: [] } as unknown as NarrationPlan, renderer),
    /unsupported schemaVersion 2/u,
  );
  assert.equal(calls, 2);
});

test("markup-like Markdown text remains spoken content in the plain renderer", () => {
  const markup = `<break time="9s"/>`;
  assert.equal(convertMarkdown(`Literal \\<break time="9s"/> text.`).text, `Literal ${markup} text.`);
});
