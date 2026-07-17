import assert from "node:assert/strict";
import test from "node:test";
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
