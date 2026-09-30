import assert from "node:assert/strict";
import test from "node:test";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { tableRegressionCases } from "./fixtures/runtime-corpus.mjs";
import { compileMarkdownTree } from "../src/markdown/compile-markdown-tree.js";
import { compileMarkdown, convertMarkdown, renderNarration } from "../src/index.js";
import { routeCodeLanguage } from "../src/code/language-tag.js";
import { parsePython } from "../src/code/python/parse-python.js";
import { parseTypeScript } from "../src/code/typescript/parse-typescript.js";
import { parseMarkdown } from "../src/markdown/parse-markdown.js";

test("Markdown/GFM parsing is synchronous and decodes a named entity", () => {
  const parsed = parseMarkdown("- [x] Done &copy; now\n\n| A | B |\n| - | - |\n| 1 | 2 |");
  assert.equal(parsed.type, "root");
  assert.equal(parsed.children[0]?.type, "list");
  assert.equal(parsed.children[1]?.type, "table");
  assert.match(JSON.stringify(parsed), /Done © now/);
  assert.equal(parsed instanceof Promise, false);
});

test("pinned table syntax preserves upstream ASTs, narration plans, and diagnostics", () => {
  const upstream = unified().use(remarkParse).use(remarkGfm).freeze();
  for (const entry of tableRegressionCases) {
    const expected = upstream.parse(entry.markdown);
    const actual = parseMarkdown(entry.markdown);
    assert.deepEqual(actual, expected, `${entry.name}: AST and source positions`);
    const compilation = compileMarkdownTree(expected);
    assert.deepEqual(compileMarkdown(entry.markdown), compilation, `${entry.name}: compilation`);
    const rendering = renderNarration(compilation.plan);
    const conversion = convertMarkdown(entry.markdown);
    assert.deepEqual(conversion.plan, compilation.plan, `${entry.name}: narration plan`);
    assert.equal(conversion.text, rendering.text, `${entry.name}: transcript`);
    assert.deepEqual(conversion.diagnostics, [...compilation.diagnostics, ...rendering.diagnostics], `${entry.name}: diagnostics`);
  }
});

test("large table narration preserves every row and both cell values", () => {
  const entry = tableRegressionCases.find(({ name }) => name === "table-3200-rows-issue-13");
  assert.ok(entry);
  const result = convertMarkdown(entry.markdown);
  const rows = result.plan.tokens.filter((token) => token.kind === "boundary" && token.boundary === "table-row" && token.phase === "start");
  assert.equal(rows.length, 3201);
  assert.equal((result.text.match(/Status: Passing\./gu) ?? []).length, 3200);
  assert.match(result.text, /Row one\. Name: Item 0\. Status: Passing\./u);
  assert.match(result.text, /Row 3200\. Name: Item 3199\. Status: Passing\. End table\.$/u);
  assert.deepEqual(compileMarkdown(entry.markdown).diagnostics, []);
});

test("Python parsing is synchronous and reports recovery internally", () => {
  const complete = parsePython("from users import Repository\nvalue: int = 1\n");
  assert.equal(complete.tree.type.name, "Script");
  assert.deepEqual(complete.recoveryRegions, []);
  assert.equal(complete instanceof Promise, false);

  const incomplete = parsePython("result = get_user(\nif result != None:\n    return result\n");
  assert.ok(incomplete.recoveryRegions.length > 0);
});

test("TypeScript parsing is synchronous with the ts dialect", () => {
  const parsed = parseTypeScript(
    'import { getUser } from "./users";\nconst names: string[] = ["Ada"];',
  );
  assert.equal(parsed.tree.type.name, "Script");
  assert.deepEqual(parsed.recoveryRegions, []);
  assert.equal(parsed instanceof Promise, false);
});

test("the language-tag alias table is closed", () => {
  assert.deepEqual(
    ["python", "py", "python3", "typescript", "ts", "js", "javascript", "tsx", ""].map(
      (tag) => [tag, routeCodeLanguage(tag)],
    ),
    [
      ["python", "python"],
      ["py", "python"],
      ["python3", "python"],
      ["typescript", "typescript"],
      ["ts", "typescript"],
      ["js", "fallback"],
      ["javascript", "fallback"],
      ["tsx", "fallback"],
      ["", "fallback"],
    ],
  );
});
