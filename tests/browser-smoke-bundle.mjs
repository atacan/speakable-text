import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parityCases } from "./fixtures/runtime-corpus.mjs";

const result = { dataset: { status: "running" }, textContent: "Running browser corpus…" };
const document = { querySelector: (selector) => selector === "#result" ? result : null };
const window = {
  reportBrowserSmokeFailure(error) {
    result.dataset.status = "failed";
    result.textContent = error instanceof Error ? error.stack : String(error);
  },
};
const source = await readFile(new URL("../.verification/browser-smoke.js", import.meta.url), "utf8");

vm.runInNewContext(source, { document, window });

assert.deepEqual(result, {
  dataset: { status: "passed" },
  textContent: `Passed ${parityCases.length} browser corpus cases`,
});
