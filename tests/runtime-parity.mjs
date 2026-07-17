import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as server from "../dist/index.js";
import * as browser from "../dist/browser/index.js";
import { parityCases } from "./fixtures/runtime-corpus.mjs";

const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("conversion attempted network access"); };

try {
  for (const entry of parityCases) {
    const serverResult = server.convertMarkdown(entry.markdown, entry.options);
    const browserResult = browser.convertMarkdown(entry.markdown, entry.options);
    assert.deepEqual(browserResult, serverResult, `${entry.name}: browser/server parity`);
    for (let repeat = 0; repeat < 3; repeat += 1) {
      assert.deepEqual(server.convertMarkdown(entry.markdown, entry.options), serverResult, `${entry.name}: server deterministic`);
      assert.deepEqual(browser.convertMarkdown(entry.markdown, entry.options), browserResult, `${entry.name}: browser deterministic`);
    }
  }

  const callbackOptions = { narration: { paragraph: {
    compile: ({ text }) => [{ kind: "text", value: `Callback: ${text}` }],
  } } };
  assert.deepEqual(
    browser.convertMarkdown("callback content", callbackOptions),
    server.convertMarkdown("callback content", callbackOptions),
    "S02 callback parity",
  );

  const renderer = {
    id: "parity-renderer",
    capabilities: { exactPauses: false, emphasis: false, tone: false, speakingRate: false, voiceRoles: false },
    render(plan) {
      return {
        text: plan.tokens.flatMap((token) => token.kind === "text" ? [token.value] : token.kind === "pause" ? [" "] : []).join(""),
        diagnostics: [],
      };
    },
  };
  assert.deepEqual(
    browser.convertMarkdown("# Custom renderer", { renderer }),
    server.convertMarkdown("# Custom renderer", { renderer }),
    "S04 renderer parity",
  );

  const bundle = await readFile(new URL("../dist/browser/index.js", import.meta.url), "utf8");
  for (const [label, pattern] of [
    ["Node built-in imports", /(?:from\s*|import\s*)["']node:/u],
    ["environment-variable values", /\bprocess\.env(?:\.|\[)/u],
    ["network calls", /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u],
    ["DOM entity decoding", /\bdocument\.createElement\s*\(/u],
  ]) assert.doesNotMatch(bundle, pattern, `browser bundle contains ${label}`);
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`runtime parity passed for ${parityCases.length} corpus cases`);
