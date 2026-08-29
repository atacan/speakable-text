import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createSharedBundleOptions } from "./lib/esbuild-shared.mjs";
import { writeThirdPartyLicenses } from "./lib/third-party-licenses.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

const shared = {
  ...createSharedBundleOptions(root),
  format: "esm",
  platform: "browser",
  target: ["es2022"],
};

const browserBuild = await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/browser/index.js",
  metafile: true,
});
await writeThirdPartyLicenses({
  root,
  metafile: browserBuild.metafile,
  outfile: "dist/browser/THIRD_PARTY_LICENSES.txt",
  title: "THIRD-PARTY LICENSES FOR THE SPEAKABLE-TEXT BROWSER BUNDLE",
  bundlePath: "dist/browser/index.js",
});

await build({
  ...shared,
  entryPoints: ["src/internal/parser-smoke.ts"],
  outfile: ".verification/parser-smoke.js",
});

await build({
  ...shared,
  entryPoints: ["tests/browser-smoke-entry.ts"],
  format: "iife",
  outfile: ".verification/browser-smoke.js",
});
