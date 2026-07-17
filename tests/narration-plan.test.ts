import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNarrationPlan,
  mergeNarrationStyles,
  normalizeNarrationPlan,
} from "../src/narration/plan.js";
import type { NarrationPlan, NarrationToken } from "../src/narration/tokens.js";

test("normalization removes empty text and merges only compatible adjacent tokens", () => {
  const plan = normalizeNarrationPlan([
    { kind: "text", value: "" },
    { kind: "text", value: "one", style: { role: "heading", tone: "calm" } },
    { kind: "text", value: " two", style: { tone: "calm", role: "heading" } },
    { kind: "text", value: " literal false", style: { role: "heading", tone: "calm" }, literal: false },
    { kind: "text", value: " fallback", style: { role: "heading", tone: "calm" }, literal: true },
    { kind: "text", value: " plain" },
  ]);

  assert.deepEqual(plan, {
    schemaVersion: 1,
    tokens: [
      { kind: "text", value: "one two", style: { role: "heading", tone: "calm" } },
      { kind: "text", value: " literal false", style: { role: "heading", tone: "calm" }, literal: false },
      { kind: "text", value: " fallback", style: { role: "heading", tone: "calm" }, literal: true },
      { kind: "text", value: " plain" },
    ],
  });
});

test("normalization collapses adjacent pauses to the longest but boundaries separate them", () => {
  const plan = normalizeNarrationPlan([
    { kind: "pause", durationMs: 100 },
    { kind: "pause", durationMs: 400 },
    { kind: "pause", durationMs: 200 },
    { kind: "boundary", boundary: "paragraph", phase: "start" },
    { kind: "pause", durationMs: 50 },
    { kind: "boundary", boundary: "paragraph", phase: "end" },
    { kind: "pause", durationMs: 75 },
  ]);

  assert.deepEqual(plan.tokens, [
    { kind: "pause", durationMs: 400 },
    { kind: "boundary", boundary: "paragraph", phase: "start" },
    { kind: "pause", durationMs: 50 },
    { kind: "boundary", boundary: "paragraph", phase: "end" },
    { kind: "pause", durationMs: 75 },
  ]);
});

test("nested styles merge outer-to-inner without erasing unspecified properties", () => {
  assert.deepEqual(
    mergeNarrationStyles(
      { role: "quotation", tone: "calm", rate: "slow" },
      undefined,
      { role: "strong-emphasis", emphasis: "strong" },
      { tone: "serious" },
    ),
    { role: "strong-emphasis", tone: "serious", rate: "slow", emphasis: "strong" },
  );
  assert.equal(mergeNarrationStyles(undefined, {}), undefined);
});

test("normalized plans survive JSON round trips and runtime validation", () => {
  const plan = normalizeNarrationPlan([
    { kind: "boundary", boundary: "heading", phase: "start", metadata: { level: 2, primary: true } },
    { kind: "text", value: "Safe <break time=\"9s\"/>", style: { role: "heading" } },
    { kind: "boundary", boundary: "heading", phase: "end" },
  ]);
  const roundTripped: unknown = JSON.parse(JSON.stringify(plan));
  assertNarrationPlan(roundTripped);
  assert.deepEqual(roundTripped, plan);
  assert.deepEqual(normalizeNarrationPlan(plan.tokens), plan);
});

test("runtime validation rejects plans that have not been normalized", () => {
  const cases: readonly unknown[] = [
    { schemaVersion: 1, tokens: [{ kind: "text", value: "" }] },
    { schemaVersion: 1, tokens: [{ kind: "pause", durationMs: 10 }, { kind: "pause", durationMs: 20 }] },
    { schemaVersion: 1, tokens: [{ kind: "text", value: "a" }, { kind: "text", value: "b" }] },
  ];
  for (const plan of cases) {
    assert.throws(() => assertNarrationPlan(plan), /Invalid narration plan/u);
  }
});

const invalidTokenCases: readonly [string, unknown][] = [
  ["negative pause", { kind: "pause", durationMs: -1 }],
  ["infinite pause", { kind: "pause", durationMs: Number.POSITIVE_INFINITY }],
  ["NaN pause", { kind: "pause", durationMs: Number.NaN }],
  ["negative-zero pause", { kind: "pause", durationMs: -0 }],
  ["non-number pause", { kind: "pause", durationMs: "100" }],
  ["infinite metadata", { kind: "boundary", boundary: "paragraph", phase: "start", metadata: { index: Number.POSITIVE_INFINITY } }],
  ["negative-zero metadata", { kind: "boundary", boundary: "paragraph", phase: "start", metadata: { index: -0 } }],
  ["non-primitive metadata", { kind: "boundary", boundary: "paragraph", phase: "start", metadata: { value: null } }],
  ["invalid style", { kind: "text", value: "x", style: { rate: 2 } }],
  ["undefined optional field", { kind: "text", value: "x", literal: undefined }],
  ["runtime handle", { kind: "text", value: "x", callback: () => undefined }],
  ["unknown kind", { kind: "audio", value: "x" }],
];

for (const [name, token] of invalidTokenCases) {
  test(`normalization rejects ${name}`, () => {
    assert.throws(
      () => normalizeNarrationPlan([token as NarrationToken]),
      { name: "TypeError", message: /Invalid narration plan/u },
    );
  });
}

test("normalization validates invalid tokens before empty-token removal", () => {
  assert.throws(
    () => normalizeNarrationPlan([
      { kind: "text", value: "", literal: "yes" } as unknown as NarrationToken,
    ]),
    /literal must be a boolean/u,
  );
});

const invalidBoundaryCases: readonly [string, readonly NarrationToken[]][] = [
  ["unopened close", [{ kind: "boundary", boundary: "paragraph", phase: "end" }]],
  ["unclosed start", [{ kind: "boundary", boundary: "paragraph", phase: "start" }]],
  ["crossed pair", [
    { kind: "boundary", boundary: "paragraph", phase: "start" },
    { kind: "boundary", boundary: "heading", phase: "start" },
    { kind: "boundary", boundary: "paragraph", phase: "end" },
    { kind: "boundary", boundary: "heading", phase: "end" },
  ]],
];

for (const [name, tokens] of invalidBoundaryCases) {
  test(`normalization rejects ${name} boundaries`, () => {
    assert.throws(() => normalizeNarrationPlan(tokens), /Invalid narration plan/u);
  });
}

test("runtime validation rejects unsupported schemas and non-wire objects", () => {
  assert.throws(
    () => assertNarrationPlan({ schemaVersion: 2, tokens: [] }),
    /unsupported schemaVersion 2/u,
  );

  class PlanLike {
    schemaVersion = 1;
    tokens: NarrationToken[] = [];
  }
  assert.throws(() => assertNarrationPlan(new PlanLike()), /plan must be an object/u);

  const planWithExtraField = { schemaVersion: 1, tokens: [], handle: {} } as unknown as NarrationPlan;
  assert.throws(() => assertNarrationPlan(planWithExtraField), /unknown property "handle"/u);

  const tokens: unknown[] = [];
  Object.assign(tokens, { handle: () => undefined });
  assert.throws(
    () => assertNarrationPlan({ schemaVersion: 1, tokens }),
    /tokens array has a non-index property/u,
  );
});
