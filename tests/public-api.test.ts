import assert from "node:assert/strict";
import test from "node:test";
import {
  compileMarkdown,
  convertMarkdown,
  createPlainTextRenderer,
  renderNarration,
} from "../src/index.js";

test("public conversion returns a parser-free JSON-compatible wire value", () => {
  const compilation = compileMarkdown("# Hello");
  assert.equal(compilation.plan.schemaVersion, 1);
  assert.equal(compilation.diagnostics.length, 0);
  assert.ok(compilation.plan.tokens.length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(compilation.plan)), compilation.plan);
  assert.equal(renderNarration(compilation.plan).text, "Hello");
  const conversion = convertMarkdown("# Hello");
  assert.deepEqual(conversion.plan, compilation.plan);
  assert.equal(conversion.text, "Hello");
  assert.ok(conversion.diagnostics.every((diagnostic) => diagnostic.code.startsWith("RENDERER_")));
  assert.equal(createPlainTextRenderer().id, "plain-text");
});
