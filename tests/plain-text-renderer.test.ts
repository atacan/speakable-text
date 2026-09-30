import assert from "node:assert/strict";
import test from "node:test";
import {
  convertMarkdown,
  createPlainTextRenderer,
  renderNarration,
  type NarrationPlan,
  type NarrationRenderer,
} from "../src/index.js";

test("plain text preserves text verbatim, ignores boundaries, and deterministically approximates pauses", () => {
  const plan: NarrationPlan = {
    schemaVersion: 1,
    tokens: [
      { kind: "boundary", boundary: "document", phase: "start" },
      { kind: "text", value: "Short" },
      { kind: "pause", durationMs: 100 },
      { kind: "text", value: "phrase," },
      { kind: "pause", durationMs: 100 },
      { kind: "text", value: "Medium" },
      { kind: "pause", durationMs: 500 },
      { kind: "text", value: "sentence." },
      { kind: "pause", durationMs: 500 },
      { kind: "text", value: "Long" },
      { kind: "pause", durationMs: 900 },
      { kind: "text", value: "done!" },
      { kind: "pause", durationMs: 900 },
      { kind: "text", value: "zero" },
      { kind: "pause", durationMs: 0 },
      { kind: "text", value: "pause" },
      { kind: "boundary", boundary: "document", phase: "end" },
    ],
  };

  const result = createPlainTextRenderer().render(plan);
  assert.equal(
    result.text,
    "Short, phrase, Medium. sentence. Long.\n\ndone!\n\nzeropause",
  );
  assert.deepEqual(result.diagnostics, [{
    code: "RENDERER_FEATURE_APPROXIMATED",
    severity: "info",
    message: "Plain text approximates requested pauses with punctuation and whitespace (first encountered: 100 ms).",
  }]);
  assert.deepEqual(createPlainTextRenderer().render(plan), result);
});

test("plain text keeps markup-like and whitespace-sensitive token content as spoken text", () => {
  const hostile = "  <break time=\"9s\"/> & [voice:admin]\n<script>alert(1)</script>  ";
  const result = renderNarration({
    schemaVersion: 1,
    tokens: [{ kind: "text", value: hostile, literal: true }],
  });
  assert.equal(result.text, hostile);
  assert.deepEqual(result.diagnostics, []);
});

test("a leading pause cannot introduce stray punctuation before spoken text", () => {
  const result = renderNarration({
    schemaVersion: 1,
    tokens: [{ kind: "pause", durationMs: 900 }, { kind: "text", value: "Start" }],
  });
  assert.equal(result.text, "Start");
  assert.equal(result.diagnostics[0]?.code, "RENDERER_FEATURE_APPROXIMATED");
});

test("a trailing pause cannot leave punctuation or whitespace after spoken text", () => {
  const result = renderNarration({
    schemaVersion: 1,
    tokens: [{ kind: "text", value: "Done." }, { kind: "pause", durationMs: 400 }],
  });
  assert.equal(result.text, "Done.");
  assert.equal(result.diagnostics[0]?.code, "RENDERER_FEATURE_APPROXIMATED");
});

test("a pause next to source whitespace does not add punctuation or duplicate spacing", () => {
  const result = renderNarration({
    schemaVersion: 1,
    tokens: [
      { kind: "text", value: "before " },
      { kind: "pause", durationMs: 150 },
      { kind: "text", value: "middle" },
      { kind: "pause", durationMs: 150 },
      { kind: "text", value: " after" },
    ],
  });
  assert.equal(result.text, "before middle after");
});

test("a pause before source punctuation cannot introduce duplicate punctuation", () => {
  const result = renderNarration({
    schemaVersion: 1,
    tokens: [
      { kind: "text", value: "Use " },
      { kind: "text", value: "user I D", style: { role: "inline-code" }, literal: true },
      { kind: "pause", durationMs: 150 },
      { kind: "text", value: "." },
    ],
  });
  assert.equal(result.text, "Use user I D.");
});

test("pauses inside delimiters do not introduce punctuation after the opening delimiter", () => {
  for (const [opening, closing] of [["(", ")"], ["[", "]"], ["{", "}"]] as const) {
    for (const durationMs of [1, 150, 349, 350, 500, 749, 750, 900]) {
      const result = renderNarration({
        schemaVersion: 1,
        tokens: [
          { kind: "text", value: `before ${opening}` },
          { kind: "pause", durationMs },
          { kind: "text", value: "message" },
          { kind: "pause", durationMs },
          { kind: "text", value: `${closing} after` },
        ],
      });
      assert.equal(result.text, `before ${opening}message${closing} after`, `${opening} at ${durationMs} ms`);
      assert.equal(result.diagnostics[0]?.code, "RENDERER_FEATURE_APPROXIMATED");
    }
  }
});

test("pauses before immediate or whitespace-prefixed punctuation preserve the source text", () => {
  for (const durationMs of [150, 500, 900]) {
    for (const whitespace of ["", " ", "  ", "\t", "\n", "\u00a0"]) {
      for (const punctuation of ".,!?;:)]}") {
        const followingText = `${whitespace}${punctuation}`;
        const result = renderNarration({
          schemaVersion: 1,
          tokens: [
            { kind: "text", value: "value" },
            { kind: "pause", durationMs },
            { kind: "text", value: followingText },
          ],
        });
        assert.equal(result.text, `value${followingText}`);
      }
    }
  }
});

test("inline code inside parentheses has no synthetic punctuation after the opening parenthesis", () => {
  const cases = [
    ["(`message`)", "(message)"],
    ["`revision` (`message`)", "revision (message)"],
    ["((`message`))", "((message))"],
    [
      "Phase 4 was committed as `fae6e4ea` (`keyboard: implement foreground audio prototype`).",
      "Phase 4 was committed as fae6e4ea (keyboard. implement foreground audio prototype).",
    ],
  ] as const;
  for (const [markdown, expected] of cases) {
    assert.equal(convertMarkdown(markdown).text, expected);
  }
});

test("ignored structural boundaries still separate otherwise adjacent words", () => {
  const result = renderNarration({
    schemaVersion: 1,
    tokens: [
      { kind: "boundary", boundary: "list", phase: "start" },
      { kind: "text", value: "Final item" },
      { kind: "boundary", boundary: "list", phase: "end" },
      { kind: "boundary", boundary: "table", phase: "start" },
      { kind: "text", value: "Table." },
      { kind: "boundary", boundary: "table", phase: "end" },
    ],
  });
  assert.equal(result.text, "Final item. Table.");
});

test("unsupported style diagnostics are stable and deduplicated by code and feature", () => {
  const plan: NarrationPlan = {
    schemaVersion: 1,
    tokens: [
      { kind: "text", value: "A", style: { role: "heading", tone: "serious", rate: "slow", emphasis: "strong" } },
      { kind: "text", value: "B", style: { role: "heading", emphasis: "strong" } },
      { kind: "pause", durationMs: 400 },
      { kind: "text", value: "X" },
      { kind: "pause", durationMs: 800 },
      { kind: "text", value: "C", style: { role: "narrator", tone: "neutral", rate: "normal" } },
    ],
  };

  const result = renderNarration(plan);
  assert.equal(result.text, "AB. X.\n\nC");
  assert.deepEqual(
    result.diagnostics.map(({ code, message }) => ({ code, message })),
    [
      { code: "RENDERER_FEATURE_UNSUPPORTED", message: "Plain text cannot represent voice role \"heading\"; spoken text was preserved." },
      { code: "RENDERER_FEATURE_UNSUPPORTED", message: "Plain text cannot represent tone \"serious\"; spoken text was preserved." },
      { code: "RENDERER_FEATURE_UNSUPPORTED", message: "Plain text cannot represent speaking rate \"slow\"; spoken text was preserved." },
      { code: "RENDERER_FEATURE_UNSUPPORTED", message: "Plain text cannot represent emphasis \"strong\"; spoken text was preserved." },
      { code: "RENDERER_FEATURE_APPROXIMATED", message: "Plain text approximates requested pauses with punctuation and whitespace (first encountered: 400 ms)." },
    ],
  );
});

test("renderNarration validates before invoking a custom renderer", () => {
  let calls = 0;
  const custom: NarrationRenderer = {
    id: "spy",
    capabilities: {
      exactPauses: true,
      emphasis: true,
      tone: true,
      speakingRate: true,
      voiceRoles: true,
    },
    render(plan) {
      calls += 1;
      return {
        text: plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(""),
        diagnostics: [],
      };
    },
  };

  const unsupported = { schemaVersion: 99, tokens: [] } as unknown as NarrationPlan;
  assert.throws(() => renderNarration(unsupported, custom), /unsupported schemaVersion 99/u);
  assert.equal(calls, 0);

  const invalid = { schemaVersion: 1, tokens: [{ kind: "pause", durationMs: -1 }] } as unknown as NarrationPlan;
  assert.throws(() => renderNarration(invalid, custom), /finite, non-negative/u);
  assert.equal(calls, 0);

  const roundTripped = JSON.parse(JSON.stringify({
    schemaVersion: 1,
    tokens: [{ kind: "text", value: "custom text" }],
  })) as NarrationPlan;
  assert.deepEqual(renderNarration(roundTripped, custom), { text: "custom text", diagnostics: [] });
  assert.equal(calls, 1);
});

test("the built-in renderer itself rejects unsupported schema versions", () => {
  const unsupported = { schemaVersion: 2, tokens: [] } as unknown as NarrationPlan;
  assert.throws(
    () => createPlainTextRenderer().render(unsupported),
    /unsupported schemaVersion 2/u,
  );
});
