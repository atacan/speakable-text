import { build } from "esbuild";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  // Lezer's optional debug tracing probes process.env.LOG. Browser conversion
  // must not observe a bundler-injected process shim or host configuration.
  define: {
    "process.env.LOG": "undefined",
  },
  // The dependency's `browser` export creates a DOM element at module load.
  // Its pure-JS default export has the same API and supports pages and workers.
  alias: {
    "decode-named-character-reference": workerSafeEntityDecoder,
  },
  logLevel: "info",
};

function bundledPackageNames(metafile) {
  const names = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const match = input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/u);
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

async function writeThirdPartyLicenses(metafile) {
  const sections = [
    "THIRD-PARTY LICENSES FOR THE SPEAKABLE-TEXT BROWSER BUNDLE",
    "",
    "This file is generated from the exact packages bundled into dist/browser/index.js.",
  ];

  for (const packageName of bundledPackageNames(metafile)) {
    const packageDirectory = join(root, "node_modules", ...packageName.split("/"));
    const packageJson = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
    const licenseFile = (await readdir(packageDirectory))
      .sort()
      .find((name) => /^licen[cs]e(?:\.|$)/iu.test(name));
    if (licenseFile === undefined) {
      throw new Error(`Bundled package ${packageName} has no top-level license file`);
    }
    const license = (await readFile(join(packageDirectory, licenseFile), "utf8")).trim();
    sections.push("", "=".repeat(78), `${packageJson.name}@${packageJson.version}`, "=".repeat(78), "", license);
  }

  sections.push("");
  await writeFile(join(root, "dist/browser/THIRD_PARTY_LICENSES.txt"), sections.join("\n"), "utf8");
}

const browserBuild = await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/browser/index.js",
  metafile: true,
});
await writeThirdPartyLicenses(browserBuild.metafile);

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
