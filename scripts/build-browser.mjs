import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const workerSafeEntityDecoder = fileURLToPath(
  new URL("../node_modules/decode-named-character-reference/index.js", import.meta.url),
);

const shared = {
  absWorkingDir: root,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  sourcemap: true,
  conditions: ["import", "default"],
  // The dependency's `browser` export creates a DOM element at module load.
  // Its pure-JS default export has the same API and supports pages and workers.
  alias: {
    "decode-named-character-reference": workerSafeEntityDecoder,
  },
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/browser/index.js",
});

await build({
  ...shared,
  entryPoints: ["src/internal/parser-smoke.ts"],
  outfile: ".verification/parser-smoke.js",
});
