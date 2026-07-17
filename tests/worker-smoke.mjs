import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";

assert.equal("document" in globalThis, false);

const bundleUrl = new URL("../.verification/parser-smoke.js", import.meta.url);
const source = `
  import { parentPort } from "node:worker_threads";
  import { runParserSmoke } from ${JSON.stringify(bundleUrl.href)};
  parentPort.postMessage({ hasDocument: "document" in globalThis, result: runParserSmoke() });
`;

const message = await new Promise((resolve, reject) => {
  const worker = new Worker(source, { eval: true });
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
});
