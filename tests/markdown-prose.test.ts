import assert from "node:assert/strict";
import test from "node:test";
import { compileMarkdown, convertMarkdown } from "../src/index.js";

const F01 = `# Release notes

Read the *important* **migration guide** in [the documentation](https://example.test/guide).`;

test("F01 compiles headings, prose, emphasis, and links to an exact plan", () => {
  const result = compileMarkdown(F01);
  assert.deepEqual(result, {
    plan: {
      schemaVersion: 1,
      tokens: [
        { kind: "boundary", boundary: "document", phase: "start" },
        { kind: "boundary", boundary: "heading", phase: "start", metadata: { level: 1 } },
        { kind: "pause", durationMs: 700 },
        { kind: "text", value: "Release notes", style: { role: "heading", emphasis: "strong" } },
        { kind: "pause", durationMs: 500 },
        { kind: "boundary", boundary: "heading", phase: "end", metadata: { level: 1 } },
        { kind: "boundary", boundary: "paragraph", phase: "start" },
        { kind: "text", value: "Read the " },
        { kind: "text", value: "important", style: { role: "emphasis", emphasis: "moderate" } },
        { kind: "text", value: " " },
        { kind: "text", value: "migration guide", style: { role: "strong-emphasis", emphasis: "strong" } },
        { kind: "text", value: " in the documentation." },
        { kind: "pause", durationMs: 400 },
        { kind: "boundary", boundary: "paragraph", phase: "end" },
        { kind: "boundary", boundary: "document", phase: "end" },
      ],
    },
    diagnostics: [],
  });
  assert.equal(convertMarkdown(F01).text, "Release notes. Read the important migration guide in the documentation.");
});

test("F14 ignores an empty heading and bounds blank-line paragraph separation", () => {
  const markdown = `###

Version 2.4.1 uses API_v2.



Ready.`;
  const result = compileMarkdown(markdown);
  assert.deepEqual(result, {
    plan: {
      schemaVersion: 1,
      tokens: [
        { kind: "boundary", boundary: "document", phase: "start" },
        { kind: "boundary", boundary: "paragraph", phase: "start" },
        { kind: "text", value: "Version 2.4.1 uses API_v2." },
        { kind: "pause", durationMs: 400 },
        { kind: "boundary", boundary: "paragraph", phase: "end" },
        { kind: "boundary", boundary: "paragraph", phase: "start" },
        { kind: "text", value: "Ready." },
        { kind: "pause", durationMs: 400 },
        { kind: "boundary", boundary: "paragraph", phase: "end" },
        { kind: "boundary", boundary: "document", phase: "end" },
      ],
    },
    diagnostics: [],
  });
  assert.equal(convertMarkdown(markdown).text, "Version 2.4.1 uses API_v2. Ready.");
});

test("all nonempty heading levels use the specified default pauses and style", () => {
  const expectedPauses = [
    [700, 500],
    [550, 400],
    [450, 350],
    [350, 300],
    [350, 300],
    [350, 300],
  ] as const;

  for (let level = 1; level <= 6; level += 1) {
    const tokens = compileMarkdown(`${"#".repeat(level)} Level ${level}`).plan.tokens;
    assert.deepEqual(tokens.slice(1, -1), [
      { kind: "boundary", boundary: "heading", phase: "start", metadata: { level } },
      { kind: "pause", durationMs: expectedPauses[level - 1]?.[0] },
      { kind: "text", value: `Level ${level}`, style: { role: "heading", emphasis: "strong" } },
      { kind: "pause", durationMs: expectedPauses[level - 1]?.[1] },
      { kind: "boundary", boundary: "heading", phase: "end", metadata: { level } },
    ]);
  }
});

test("nested inline styles merge inner-over-outer while prose spacing stays natural", () => {
  const result = compileMarkdown("  A   *moderate **strong**\n tail*   end.  ");
  assert.deepEqual(result.plan.tokens.slice(2, -3), [
    { kind: "text", value: "A " },
    { kind: "text", value: "moderate ", style: { role: "emphasis", emphasis: "moderate" } },
    { kind: "text", value: "strong", style: { role: "strong-emphasis", emphasis: "strong" } },
    { kind: "text", value: " tail", style: { role: "emphasis", emphasis: "moderate" } },
    { kind: "text", value: " end." },
  ]);
  assert.equal(convertMarkdown("  A   *moderate **strong**\n tail*   end.  ").text, "A moderate strong tail end.");
});

test("ordinary links omit destinations while GFM autolinks preserve their visible URL conservatively", () => {
  const markdown = "See [the guide](https://hidden.test/path), https://example.test/a-b?q=x, and <mailto:test@example.test>.";
  const result = compileMarkdown(markdown);
  assert.equal(
    result.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(""),
    "See the guide, https://example.test/a-b?q=x, and mailto:test@example.test.",
  );
  assert.equal(result.diagnostics.length, 0);
  assert.doesNotMatch(convertMarkdown(markdown).text, /hidden/u);
});

test("escaped punctuation is decoded as visible prose instead of formatting", () => {
  const markdown = String.raw`Escaped \*asterisks\*, \[brackets\], and \# hash.`;
  const result = compileMarkdown(markdown);
  assert.deepEqual(
    result.plan.tokens.filter((token) => token.kind === "text"),
    [{ kind: "text", value: "Escaped *asterisks*, [brackets], and # hash." }],
  );
  assert.equal(convertMarkdown(markdown).text, "Escaped *asterisks*, [brackets], and # hash.");
});

test("invisible formatting runs are removed with stable traversal-order diagnostics", () => {
  const markdown = "Deploy\u200Bnow and verify\uFEFF metrics. Next\u200Dstep.";
  const result = compileMarkdown(markdown);
  assert.deepEqual(
    result.plan.tokens.filter((token) => token.kind === "text"),
    [{ kind: "text", value: "Deploy now and verify metrics. Next step." }],
  );
  assert.deepEqual(result.diagnostics, [
    {
      code: "INVISIBLE_CHARACTER_REMOVED",
      severity: "warning",
      message: "Removed 1 invisible Unicode formatting character from spoken text.",
    },
    {
      code: "INVISIBLE_CHARACTER_REMOVED",
      severity: "warning",
      message: "Removed 1 invisible Unicode formatting character from spoken text.",
    },
    {
      code: "INVISIBLE_CHARACTER_REMOVED",
      severity: "warning",
      message: "Removed 1 invisible Unicode formatting character from spoken text.",
    },
  ]);
  assert.equal(convertMarkdown(markdown).text, "Deploy now and verify metrics. Next step.");
});

test("conversion keeps compiler diagnostics before renderer diagnostics", () => {
  const result = convertMarkdown("Visible\u200Bwords.");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "INVISIBLE_CHARACTER_REMOVED",
    "RENDERER_FEATURE_APPROXIMATED",
  ]);
});

test("empty documents retain only a balanced document boundary", () => {
  assert.deepEqual(compileMarkdown("").plan.tokens, [
    { kind: "boundary", boundary: "document", phase: "start" },
    { kind: "boundary", boundary: "document", phase: "end" },
  ]);
  assert.equal(convertMarkdown("").text, "");
});
