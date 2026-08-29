import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createSharedBundleOptions } from "./lib/esbuild-shared.mjs";
import { writeThirdPartyLicenses } from "./lib/third-party-licenses.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

// JavaScriptCore provides only the JavaScript language runtime: no `window`,
// `document`, `process`, `Buffer`, `fetch`, or module loader. `platform:
// "neutral"` keeps esbuild from assuming either browser or Node globals are
// present, and the bare `src/internal/jscore-entry.ts` entry point pulls in
// nothing but the library itself.
//
// Target: the library's own source uses `Object.hasOwn` and `Array#at`
// (ES2022 runtime built-ins). esbuild's `target` only downlevels *syntax* --
// it cannot polyfill built-ins -- so those calls reach the host unchanged
// regardless of target. iOS/Safari 15.4 is therefore the actual
// compatibility floor for this bundle, not an arbitrarily conservative
// choice; targeting an older engine (for example Safari 12) would still
// throw at runtime on first use without adding a compatibility shim.
const jscoreBuild = await build({
  ...createSharedBundleOptions(root),
  entryPoints: ["src/internal/jscore-entry.ts"],
  outfile: "dist/jscore/speakable-text.js",
  format: "iife",
  globalName: "SpeakableText",
  platform: "neutral",
  target: ["ios15.4", "safari15.4"],
  metafile: true,
});
await writeThirdPartyLicenses({
  root,
  metafile: jscoreBuild.metafile,
  outfile: "dist/jscore/THIRD_PARTY_LICENSES.txt",
  title: "THIRD-PARTY LICENSES FOR THE SPEAKABLE-TEXT JAVASCRIPTCORE BUNDLE",
  bundlePath: "dist/jscore/speakable-text.js",
});
