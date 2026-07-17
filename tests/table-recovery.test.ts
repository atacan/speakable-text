import assert from "node:assert/strict";
import test from "node:test";
import type { Root } from "mdast";
import {
  compileMarkdown,
  convertMarkdown,
  type NarrationToken,
} from "../src/index.js";
import { compileMarkdownTree } from "../src/markdown/compile-markdown-tree.js";

const F06 = `| Name | Status |
| --- | --- |
| Build | **Passing** |
| Tests | |`;

const F12 = `Before <aside><strong>visible warning</strong></aside> after.

[unresolved reference][missing]

**unfinished emphasis`;

function boundary(
  name: Extract<NarrationToken, { kind: "boundary" }>["boundary"],
  phase: "start" | "end",
  metadata?: Readonly<Record<string, string | number | boolean>>,
): NarrationToken {
  return metadata === undefined
    ? { kind: "boundary", boundary: name, phase }
    : { kind: "boundary", boundary: name, phase, metadata };
}

test("F06 has an exact recursive table plan, transcript, and no diagnostics", () => {
  const table = { rowCount: 2, columnCount: 2 };
  const headerRow = { rowIndex: 0, header: true };
  const row1 = { rowIndex: 1, header: false };
  const row2 = { rowIndex: 2, header: false };
  const cell = (rowIndex: number, columnIndex: number, header: boolean, headerText: string) => ({
    rowIndex, columnIndex, header, headerText,
  });
  const boundedCell = (
    rowIndex: number,
    columnIndex: number,
    header: boolean,
    headerText: string,
    token: NarrationToken,
  ): NarrationToken[] => {
    const metadata = cell(rowIndex, columnIndex, header, headerText);
    return [boundary("table-cell", "start", metadata), token, boundary("table-cell", "end", metadata)];
  };
  const tableText = (value: string): NarrationToken => ({ kind: "text", value, style: { role: "table" } });
  const headerText = (value: string): NarrationToken => ({ kind: "text", value, style: { role: "table-header" } });
  const valueText = (value: string): NarrationToken => ({ kind: "text", value, style: { role: "table-cell" } });

  assert.deepEqual(compileMarkdown(F06), {
    plan: { schemaVersion: 1, tokens: [
      boundary("document", "start"),
      boundary("table", "start", table),
      tableText("Table. "),
      boundary("table-row", "start", headerRow),
      tableText("Columns: "),
      ...boundedCell(0, 0, true, "Name", headerText("Name")),
      tableText(" and "),
      ...boundedCell(0, 1, true, "Status", headerText("Status")),
      tableText(". "),
      boundary("table-row", "end", headerRow),
      boundary("table-row", "start", row1),
      tableText("Row one. "),
      headerText("Name: "),
      ...boundedCell(1, 0, false, "Name", valueText("Build")),
      tableText(". "),
      headerText("Status: "),
      ...boundedCell(1, 1, false, "Status", {
        kind: "text", value: "Passing", style: { role: "strong-emphasis", emphasis: "strong" },
      }),
      tableText(". "),
      boundary("table-row", "end", row1),
      boundary("table-row", "start", row2),
      tableText("Row two. "),
      headerText("Name: "),
      ...boundedCell(2, 0, false, "Name", valueText("Tests")),
      tableText(". "),
      headerText("Status: "),
      ...boundedCell(2, 1, false, "Status", valueText("empty")),
      tableText(". "),
      boundary("table-row", "end", row2),
      tableText("End table."),
      boundary("table", "end", table),
      boundary("document", "end"),
    ] },
    diagnostics: [],
  });
  assert.equal(
    convertMarkdown(F06).text,
    "Table. Columns: Name and Status. Row one. Name: Build. Status: Passing. Row two. Name: Tests. Status: empty. End table.",
  );
});

test("S03 table modes and toggles are deterministic and preserve cell order", () => {
  assert.equal(
    convertMarkdown(F06, { narration: { table: { mode: "headers-then-rows" } } }).text,
    "Table. Columns: Name and Status. Row one. Build. Passing. Row two. Tests. empty. End table.",
  );
  assert.equal(
    convertMarkdown(F06, { narration: { table: { mode: "header-per-cell", repeatColumnHeaders: false } } }).text,
    "Table. Columns: Name and Status. Row one. Build. Passing. Row two. Tests. empty. End table.",
  );
  assert.equal(
    convertMarkdown(F06, { narration: { table: {
      mode: "cells-only",
      announceTableStart: false,
      announceTableEnd: false,
      announceRowNumbers: false,
      emptyCellText: "blank",
    } } }).text,
    "Name. Status. Build. Passing. Tests. blank.",
  );

  let callbackCalls = 0;
  assert.equal(convertMarkdown(F06, { narration: { table: { skip: true, compile: () => {
    callbackCalls += 1;
    return [{ kind: "text", value: "wrong" }];
  } } } }).text, "");
  assert.equal(callbackCalls, 0);

  const callbackPlan = compileMarkdown(F06, { narration: { table: {
    before: [{ kind: "text", value: "unused" }],
    after: [{ kind: "text", value: "unused" }],
    compile: (context) => [{ kind: "text", value: `${context.rowCount} rows, ${context.columnCount} columns.` }],
  } } }).plan.tokens;
  assert.deepEqual(callbackPlan.slice(1, -1), [
    boundary("table", "start", { rowCount: 2, columnCount: 2 }),
    { kind: "text", value: "2 rows, 2 columns." },
    boundary("table", "end", { rowCount: 2, columnCount: 2 }),
  ]);
});

test("table recovery preserves missing cells, empty text, and balanced relationship metadata", () => {
  const result = compileMarkdown("| A | B |\n| - | - |\n| only-a |");
  const cellStarts = result.plan.tokens.filter(
    (token) => token.kind === "boundary" && token.boundary === "table-cell" && token.phase === "start",
  );
  assert.equal(cellStarts.length, 4);
  assert.equal(convertMarkdown("| A | B |\n| - | - |\n| only-a |").text,
    "Table. Columns: A and B. Row one. A: only-a. B: empty. End table.");
  for (const name of ["table", "table-row", "table-cell"] as const) {
    assert.equal(
      result.plan.tokens.filter((token) => token.kind === "boundary" && token.boundary === name && token.phase === "start").length,
      result.plan.tokens.filter((token) => token.kind === "boundary" && token.boundary === name && token.phase === "end").length,
    );
  }
});

test("F12 has exact recovered text, plan order, and traversal-ordered diagnostics", () => {
  assert.deepEqual(compileMarkdown(F12), {
    plan: { schemaVersion: 1, tokens: [
      boundary("document", "start"),
      boundary("paragraph", "start"),
      { kind: "text", value: "Before visible warning after." },
      { kind: "pause", durationMs: 400 },
      boundary("paragraph", "end"),
      boundary("paragraph", "start"),
      { kind: "text", value: "unresolved reference" },
      { kind: "pause", durationMs: 400 },
      boundary("paragraph", "end"),
      boundary("paragraph", "start"),
      { kind: "text", value: "unfinished emphasis" },
      { kind: "pause", durationMs: 400 },
      boundary("paragraph", "end"),
      boundary("document", "end"),
    ] },
    diagnostics: [
      ...Array.from({ length: 4 }, () => ({
        code: "UNSUPPORTED_MARKDOWN_NODE",
        severity: "warning",
        message: "Recovered visible text from unsupported Markdown node type html.",
      })),
      {
        code: "MARKDOWN_PARSE_RECOVERY",
        severity: "warning",
        message: "Recovered visible text from malformed Markdown delimiters.",
      },
      {
        code: "MARKDOWN_PARSE_RECOVERY",
        severity: "warning",
        message: "Recovered visible text from malformed Markdown delimiters.",
      },
    ],
  });
  assert.equal(convertMarkdown(F12).text, "Before visible warning after. unresolved reference. unfinished emphasis");
});

test("raw HTML recovery suppresses executable/style content and keeps safe visible text", () => {
  const markdown = `Start <span title="not > spoken">safe</span>.

Before <script data-test="a > b"><b>evil()</b></script> middle <style>.secret{display:none}</style> after.

<div>
block <em>visible</em>
</div>`;
  const result = convertMarkdown(markdown);
  assert.equal(result.text, "Start safe. Before middle after. block visible");
  assert.doesNotMatch(result.text, /span|title|script|evil|style|secret|div|em/u);
  assert.equal(
    compileMarkdown(markdown).diagnostics.every((diagnostic) => diagnostic.code === "UNSUPPORTED_MARKDOWN_NODE"),
    true,
  );
});

test("unsupported custom nodes recover children before value and mark literal fallback provenance", () => {
  const childFirst = {
    type: "root",
    children: [{
      type: "mystery",
      value: "literal should not win",
      children: [{ type: "text", value: "visible child" }],
    }],
  } as unknown as Root;
  const childResult = compileMarkdownTree(childFirst);
  assert.deepEqual(childResult.plan.tokens.filter((token) => token.kind === "text"), [
    { kind: "text", value: "visible child" },
  ]);
  assert.deepEqual(childResult.diagnostics.map((diagnostic) => diagnostic.code), ["UNSUPPORTED_MARKDOWN_NODE"]);

  const literalOnly = {
    type: "root",
    children: [{ type: "mysteryLeaf", value: "literal payload" }],
  } as unknown as Root;
  assert.deepEqual(compileMarkdownTree(literalOnly).plan.tokens.filter((token) => token.kind === "text"), [
    { kind: "text", value: "literal payload", literal: true },
  ]);
});

test("ordinary bracket and emphasis text is not diagnosed unless delimiters are transformed", () => {
  const result = compileMarkdown("Version [draft] costs 2 * 3. Escaped \\*literal\\*.");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(convertMarkdown("Version [draft] costs 2 * 3. Escaped \\*literal\\*.").text,
    "Version [draft] costs 2 * 3. Escaped *literal*.");
});

test("invalid table configuration fails before parsing", () => {
  assert.throws(
    () => compileMarkdown(null as unknown as string, { narration: { table: { mode: "invalid" as never } } }),
    { name: "TypeError", message: /narration\.table\.mode/u },
  );
  assert.throws(
    () => compileMarkdown(null as unknown as string, { narration: { table: { emptyCellText: 1 as never } } }),
    { name: "TypeError", message: /narration\.table\.emptyCellText/u },
  );
});
