import { join } from "node:path";

/**
 * Bundling options shared by every self-contained esbuild artifact this
 * package produces (browser bundle, JavaScriptCore bundle, verification
 * bundles). Callers still set their own `entryPoints`, `outfile`, `format`,
 * `platform`, and `target`.
 */
export function createSharedBundleOptions(root) {
  const workerSafeEntityDecoder = join(root, "node_modules/decode-named-character-reference/index.js");

  return {
    absWorkingDir: root,
    bundle: true,
    sourcemap: true,
    conditions: ["import", "default"],
    // Lezer's optional debug tracing probes process.env.LOG. Bundled builds
    // must not observe a bundler-injected process shim or host configuration.
    define: {
      "process.env.LOG": "undefined",
    },
    // The dependency's `browser` export creates a DOM element at module load.
    // Its pure-JS default export has the same API and supports pages, workers,
    // and hosts with no DOM at all (such as JavaScriptCore).
    alias: {
      "decode-named-character-reference": workerSafeEntityDecoder,
    },
    logLevel: "info",
  };
}
