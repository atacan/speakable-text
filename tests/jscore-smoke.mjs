import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as server from "../dist/index.js";
import { parityCases } from "./fixtures/runtime-corpus.mjs";

function assertThrows(call, expectedNamePattern, expectedMessagePattern, description) {
  let thrown;
  try {
    call();
  } catch (error) {
    thrown = error;
  }
  assert.notEqual(thrown, undefined, `expected ${description} to throw`);
  // The bundle runs in its own vm realm, so a thrown error is an instance of
  // *that* realm's Error constructors, not this process's. `instanceof`
  // would not observe that (which is exactly what a JSContext exception
  // handler sees too), so check the string properties JavaScriptCore
  // exposes on any thrown value instead.
  assert.match(String(thrown?.name ?? ""), expectedNamePattern, `${description}: unexpected error name (${thrown})`);
  assert.match(String(thrown?.message ?? ""), expectedMessagePattern, `${description}: unexpected error message (${thrown})`);
}

const source = await readFile(new URL("../dist/jscore/speakable-text.js", import.meta.url), "utf8");

for (const [label, pattern] of [
  ["an ESM import statement", /(?:^|\n)\s*import\s+[^(].*?\bfrom\b/u],
  ["an ESM export statement", /(?:^|\n)\s*export\s+(?:\{|default\b|const\b|function\b|class\b)/u],
  ["a CommonJS require call", /\brequire\s*\(\s*["']/u],
  ["Node built-in imports", /(?:from\s*|import\s*\()\s*["']node:/u],
  ["network calls", /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u],
  ["DOM entity decoding", /\bdocument\.createElement\s*\(/u],
]) {
  assert.doesNotMatch(source, pattern, `jscore bundle contains ${label}`);
}

// Evaluate as a classic script in a deliberately empty context -- no Node
// globals (process, require, module, exports, Buffer), no browser globals
// (window, document), nothing beyond what the vm module always provides
// (the standard built-ins such as Object, JSON, and the error types, which
// come from the JS engine itself and exist in JavaScriptCore too).
const context = vm.createContext({});
vm.runInContext(source, context, { filename: "speakable-text.js" });

for (const forbiddenGlobal of ["window", "document", "process", "require", "module", "exports", "Buffer"]) {
  assert.equal(forbiddenGlobal in context, false, `jscore host context gained a "${forbiddenGlobal}" global`);
}

assert.equal(typeof context.SpeakableText, "object", "SpeakableText global was not installed");
assert.notEqual(context.SpeakableText, null, "SpeakableText global was not installed");
assert.equal(typeof context.SpeakableText.convertMarkdownJSON, "function");

for (const entry of parityCases) {
  const serverResult = server.convertMarkdown(entry.markdown, entry.options);
  const optionsJSON = entry.options === undefined ? undefined : JSON.stringify(entry.options);
  const bridgeResult = JSON.parse(context.SpeakableText.convertMarkdownJSON(entry.markdown, optionsJSON));
  assert.deepEqual(bridgeResult, serverResult, `${entry.name}: JSCore bridge/server parity`);
}

console.log(`jscore functional parity passed for ${parityCases.length} corpus cases`);

assertThrows(
  () => context.SpeakableText.convertMarkdownJSON("# Heading", "{not json"),
  /SyntaxError/u,
  /optionsJSON is not valid JSON/u,
  "malformed options JSON",
);

assertThrows(
  () => context.SpeakableText.convertMarkdownJSON(42),
  /TypeError/u,
  /markdown must be a string/u,
  "non-string markdown",
);

assertThrows(
  () => context.SpeakableText.convertMarkdownJSON("markdown", 42),
  /TypeError/u,
  /optionsJSON must be a JSON string or omitted/u,
  "non-string optionsJSON",
);

assertThrows(
  () => context.SpeakableText.convertMarkdownJSON("markdown", "[1, 2, 3]"),
  /TypeError/u,
  /optionsJSON must decode to a JSON object/u,
  "JSON array instead of a JSON object for options",
);

assertThrows(
  () => context.SpeakableText.convertMarkdownJSON(
    "Text",
    JSON.stringify({ narration: { paragraph: { after: [{ kind: "pause", durationMs: -1 }] } } }),
  ),
  /TypeError/u,
  /Invalid narration configuration/u,
  "JSON-valid but semantically invalid narration options",
);

console.log("jscore bridge failure handling passed");
