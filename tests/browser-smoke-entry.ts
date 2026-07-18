import { convertMarkdown } from "../src/index.js";
import { parityCases } from "./fixtures/runtime-corpus.mjs";

declare global {
  interface Window {
    reportBrowserSmokeFailure(error: unknown): void;
  }
}

const result = document.querySelector<HTMLElement>("#result");

try {
  if (result === null) throw new Error("Browser smoke result element is missing");
  if (typeof process !== "undefined") throw new Error("Node process leaked into browser runtime");
  for (const entry of parityCases) {
    const first = convertMarkdown(entry.markdown, entry.options);
    const second = convertMarkdown(entry.markdown, entry.options);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(`${entry.name} was nondeterministic`);
    }
  }
  result.dataset["status"] = "passed";
  result.textContent = `Passed ${parityCases.length} browser corpus cases`;
} catch (error) {
  window.reportBrowserSmokeFailure(error);
}
