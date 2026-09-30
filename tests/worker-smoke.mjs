import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { convertMarkdown } from "../dist/index.js";
import { tableRegressionCases } from "./fixtures/runtime-corpus.mjs";

assert.equal("document" in globalThis, false);

const bundleUrl = new URL("../.verification/parser-smoke.js", import.meta.url);
const browserUrl = new URL("../dist/browser/index.js", import.meta.url);
const source = `
  import { parentPort, workerData } from "node:worker_threads";
  import { runParserSmoke } from ${JSON.stringify(bundleUrl.href)};
  import { convertMarkdown } from ${JSON.stringify(browserUrl.href)};
  parentPort.postMessage({
    hasDocument: "document" in globalThis,
    result: runParserSmoke(),
    tables: workerData.map(({ markdown }) => convertMarkdown(markdown)),
  });
`;

const message = await new Promise((resolve, reject) => {
  const worker = new Worker(source, { eval: true, workerData: tableRegressionCases });
  worker.once("message", resolve);
  worker.once("error", reject);
});

assert.deepEqual(message, {
  hasDocument: false,
  result: {
    markdownText: "Worker © entity",
    markdownRootKind: "root",
    pythonRootKind: "Script",
    typescriptRootKind: "Script",
  },
  tables: tableRegressionCases.map(({ markdown }) => convertMarkdown(markdown)),
});
