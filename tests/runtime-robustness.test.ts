import assert from "node:assert/strict";
import test from "node:test";
import { compileMarkdown, convertMarkdown } from "../src/index.js";
import { representativeAgentResponse } from "./fixtures/runtime-corpus.mjs";

const adversarialCases = [
  { name: "unclosed fence", markdown: "Before marker.\n\n```python\ncall(marker", markers: ["Before marker", "call", "marker"] },
  { name: "broken nesting", markdown: "- outer marker\n  1. inner marker\n     > quote marker\n       **unfinished", markers: ["outer marker", "inner marker", "quote marker", "unfinished"] },
  { name: "raw HTML", markdown: "Before <div><em>safe marker</em></div> after marker.", markers: ["Before", "safe marker", "after marker"] },
  { name: "hostile raw HTML", markdown: "kept before <script>discarded()</script> kept after", markers: ["kept before", "kept after"] },
  { name: "nulls and lone surrogates", markdown: "left marker\u0000 middle marker\uD800 right marker", markers: ["left marker", "middle marker", "right marker"] },
  { name: "delimiter storm", markdown: `${"*[".repeat(150)}deep marker${"]*".repeat(150)}`, markers: ["deep marker"] },
] as const;

function assertBalanced(markdown: string): void {
  const stack: string[] = [];
  for (const token of compileMarkdown(markdown).plan.tokens) {
    if (token.kind !== "boundary") continue;
    if (token.phase === "start") stack.push(token.boundary);
    else assert.equal(stack.pop(), token.boundary, `misnested ${token.boundary} boundary`);
  }
  assert.deepEqual(stack, []);
}

test("malformed and adversarial strings never throw, remain deterministic, and preserve recoverable content", () => {
  for (const entry of adversarialCases) {
    const first = convertMarkdown(entry.markdown);
    assert.deepEqual(convertMarkdown(entry.markdown), first, `${entry.name}: repeat conversion`);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(first)), `${entry.name}: JSON compatible`);
    for (const marker of entry.markers) {
      assert.match(first.text, new RegExp(marker, "u"), `${entry.name}: preserves ${marker}`);
    }
    assertBalanced(entry.markdown);
  }
});

test("S06 representative response preserves fixture order and key relationships mechanically", () => {
  const result = convertMarkdown(representativeAgentResponse);
  const orderedPhrases = [
    "Release notes",
    "Prepare",
    "Deploy",
    "Watch logs",
    "Check health",
    "Notify the team",
    "Columns: Name and Status",
    "Name: Build",
    "Status: Passing",
    "Name: Tests",
    "Status: empty",
    "From users import Repository",
    "For each name in names",
    "If user active and not user deleted, then",
    "While the length of results is less than limit",
    "Import get user from dot slash users",
    "While index is less than limit and enabled",
    "If user optionally access status is strictly equal",
    "For each name of names",
    "Ruby",
    "user name set to get user",
    "total increase by price multiplied by count",
    "Before visible warning after",
    "unresolved reference",
    "unfinished emphasis",
  ];
  let position = -1;
  for (const phrase of orderedPhrases) {
    const next = result.text.indexOf(phrase, position + 1);
    assert.ok(next > position, `missing or out of order: ${phrase}`);
    position = next;
  }
  assert.doesNotMatch(result.text, /(?:```|\]\(https?:|<\/?(?:aside|strong)>|^>|\| --- \|)/mu);
  assert.doesNotMatch(result.text, /(?:teamTable|table\.Code|block\.Code|block\.Before)/u);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
  assertBalanced(representativeAgentResponse);
});
