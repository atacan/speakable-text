import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const repositoryPackage = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
const workspace = await mkdtemp(join(tmpdir(), "speakable-text-package-"));
const packDirectory = join(workspace, "pack");
const consumerDirectory = join(workspace, "consumer");
const npmCache = join(workspace, "npm-cache");
const emptyNpmConfig = join(workspace, "empty-npmrc");
const representativeMarkdown = '# Package consumer\n\n1. Build\n2. Verify\n\nRun `status === "ready"`.';
const expectedTarballName = `${repositoryPackage.name.replace(/^@/, "").replaceAll("/", "-")}-${repositoryPackage.version}.tgz`;
let cleanupStarted = false;

async function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  await rm(workspace, { recursive: true, force: true });
}

for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(exitCode));
  });
}

const npmCredentialVariables = new Set([
  "corepack_npm_token",
  "node_auth_token",
  "npm_auth",
  "npm_auth_token",
  "npm_email",
  "npm_otp",
  "npm_password",
  "npm_token",
  "npm_username",
  "yarn_npm_auth_ident",
  "yarn_npm_auth_token",
]);

function createNpmEnvironment(parentEnvironment) {
  const sanitized = {};

  for (const [key, value] of Object.entries(parentEnvironment)) {
    const normalizedKey = key.toLowerCase();
    // npm treats configuration environment keys case-insensitively. Removing
    // the entire namespace prevents scoped-registry auth, cert/key paths, and
    // less-common credential spellings from bypassing the empty user config.
    if (normalizedKey.startsWith("npm_config_")) continue;
    if (npmCredentialVariables.has(normalizedKey)) continue;
    sanitized[key] = value;
  }

  return {
    ...sanitized,
    npm_config_audit: "false",
    npm_config_cache: npmCache,
    npm_config_fund: "false",
    npm_config_registry: "https://registry.npmjs.org/",
    npm_config_userconfig: emptyNpmConfig,
  };
}

const npmEnvironment = createNpmEnvironment(process.env);

const environmentProbe = createNpmEnvironment({
  HOME: "/safe/home",
  Path: "/safe/bin",
  NODE_AUTH_TOKEN: "node secret",
  npm_token: "npm secret",
  NPM_CONFIG_CERT: "/secret/client.pem",
  "npm_config_//registry.npmjs.org/:_authToken": "scoped secret",
  YARN_NPM_AUTH_IDENT: "user:password",
});
assert.equal(environmentProbe.HOME, "/safe/home");
assert.equal(environmentProbe.Path, "/safe/bin");
assert.equal(environmentProbe.npm_config_registry, "https://registry.npmjs.org/");
assert.ok(!Object.values(environmentProbe).some((value) => String(value).includes("secret")));
assert.ok(!Object.values(environmentProbe).includes("user:password"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.capture
      ? `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      : "";
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}.${details}`);
  }

  return result.stdout?.trim() ?? "";
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} did not produce JSON. Output:\n${output}`, { cause: error });
  }
}

async function writeConsumerFile(name, contents) {
  await writeFile(join(consumerDirectory, name), contents, "utf8");
}

try {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  assert.ok(nodeMajor >= 20, `package consumers require Node.js >=20; found ${process.version}`);

  await mkdir(packDirectory, { recursive: true });
  await mkdir(consumerDirectory, { recursive: true });
  await writeFile(emptyNpmConfig, "", "utf8");

  console.log("\n[package] Building exact npm tarball");
  run("npm", ["pack", "--pack-destination", packDirectory], {
    env: npmEnvironment,
  });

  const tarballs = (await readdir(packDirectory)).filter((name) => name.endsWith(".tgz"));
  assert.deepEqual(tarballs, [expectedTarballName]);
  const tarball = join(packDirectory, tarballs[0]);

  console.log("\n[package] Auditing exact tarball contents");
  const archiveEntries = run("tar", ["-tzf", tarball], { capture: true })
    .split("\n")
    .filter(Boolean);
  const requiredFiles = [
    "package/package.json",
    "package/README.md",
    "package/CHANGELOG.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/browser/index.js",
  ];
  for (const requiredFile of requiredFiles) {
    assert.ok(archiveEntries.includes(requiredFile), `tarball is missing ${requiredFile}`);
  }
  const allowedEntry = /^package\/(?:package\.json|README\.md|CHANGELOG\.md|LICENSE|dist\/)/;
  const unexpectedEntries = archiveEntries.filter((entry) => !allowedEntry.test(entry));
  assert.deepEqual(unexpectedEntries, [], `tarball contains unexpected files: ${unexpectedEntries.join(", ")}`);
  const sensitiveEntry = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|credentials(?:\..*)?|id_rsa|[^/]+\.(?:pem|key|p12))$/i;
  assert.deepEqual(
    archiveEntries.filter((entry) => sensitiveEntry.test(entry)),
    [],
    "tarball contains a credential- or secret-shaped file",
  );

  await writeConsumerFile(
    "package.json",
    `${JSON.stringify({ name: "speakable-text-package-consumer", private: true, type: "module" }, null, 2)}\n`,
  );

  console.log("\n[package] Installing tarball and consumer tools with an isolated npm cache");
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      tarball,
      `typescript@${repositoryPackage.devDependencies.typescript}`,
      `esbuild@${repositoryPackage.devDependencies.esbuild}`,
    ],
    { cwd: consumerDirectory, env: npmEnvironment },
  );

  const runtimeConsumer = `
import assert from "node:assert/strict";
import {
  compileMarkdown,
  convertMarkdown,
  createPlainTextRenderer,
  renderNarration,
} from "speakable-text";

const markdown = ${JSON.stringify(representativeMarkdown)};
const conversion = convertMarkdown(markdown);
const compilation = compileMarkdown(markdown);
const renderer = createPlainTextRenderer();
const rendering = renderNarration(compilation.plan, renderer);

assert.equal(conversion.plan.schemaVersion, 1);
assert.equal(renderer.id, "plain-text");
assert.equal(rendering.text, conversion.text);
assert.deepEqual(compilation.plan, conversion.plan);
assert.match(conversion.text, /Package consumer/);

console.log(JSON.stringify({
  text: conversion.text,
  plan: conversion.plan,
  compilerDiagnostics: compilation.diagnostics,
  conversionDiagnostics: conversion.diagnostics,
  renderingDiagnostics: rendering.diagnostics,
}));
`;
  await writeConsumerFile("runtime.mjs", runtimeConsumer);

  console.log("\n[package] Checking Node ESM and browser-condition parity");
  const serverResult = parseJsonOutput(
    run("node", ["runtime.mjs"], { cwd: consumerDirectory, capture: true }),
    "Node ESM consumer",
  );
  const browserConditionResult = parseJsonOutput(
    run("node", ["--conditions=browser", "runtime.mjs"], {
      cwd: consumerDirectory,
      capture: true,
    }),
    "browser-condition consumer",
  );
  assert.deepEqual(browserConditionResult, serverResult);

  await writeConsumerFile(
    "types.ts",
    `
import {
  compileMarkdown,
  convertMarkdown,
  createPlainTextRenderer,
  renderNarration,
  type ConvertMarkdownOptions,
  type NarrationConfigurationOverrides,
  type NarrationPlan,
  type NarrationRenderer,
} from "speakable-text";

const narration: NarrationConfigurationOverrides = {
  headings: { 1: { before: [{ kind: "text", value: "Title. " }] } },
  table: { mode: "headers-then-rows", emptyCellText: "empty" },
  code: {
    operators: { "===": "exactly matches" },
    block: {
      languageAnnouncement: ({ language }) => [
        { kind: "text", value: language ?? "unknown" },
      ],
    },
  },
};

const renderer: NarrationRenderer = {
  id: "consumer-renderer",
  capabilities: {
    exactPauses: false,
    emphasis: false,
    tone: false,
    speakingRate: false,
    voiceRoles: false,
  },
  render(plan: NarrationPlan) {
    return { text: String(plan.schemaVersion), diagnostics: [] };
  },
};

const options: ConvertMarkdownOptions = { narration, renderer };
const converted: string = convertMarkdown("# Typed", options).text;
const plan: NarrationPlan = compileMarkdown("# Typed", { narration }).plan;
const rendered: string = renderNarration(plan, renderer).text;
const rendererId: string = createPlainTextRenderer().id;
void [converted, rendered, rendererId];
`,
  );
  await writeConsumerFile(
    "tsconfig.json",
    `${JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        exactOptionalPropertyTypes: true,
      },
      files: ["types.ts"],
    }, null, 2)}\n`,
  );

  console.log("\n[package] Typechecking public API from a NodeNext consumer");
  run("node", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], {
    cwd: consumerDirectory,
  });

  await writeConsumerFile(
    "browser-entry.js",
    String.raw`
import {
  compileMarkdown,
  convertMarkdown,
  createPlainTextRenderer,
  renderNarration,
} from "speakable-text";

const markdown = ${JSON.stringify(representativeMarkdown)};
const conversion = convertMarkdown(markdown);
const compilation = compileMarkdown(markdown);
const rendering = renderNarration(compilation.plan, createPlainTextRenderer());
if (rendering.text !== conversion.text) throw new Error("browser bundle API mismatch");
console.log(JSON.stringify({
  text: conversion.text,
  plan: conversion.plan,
  compilerDiagnostics: compilation.diagnostics,
  conversionDiagnostics: conversion.diagnostics,
  renderingDiagnostics: rendering.diagnostics,
}));
`,
  );
  await writeConsumerFile(
    "build-browser.mjs",
    String.raw`
import { build } from "esbuild";
await build({
  entryPoints: ["browser-entry.js"],
  outfile: "browser-output.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  conditions: ["browser", "import", "default"],
  logLevel: "warning",
});
`,
  );
  await writeConsumerFile(
    "run-browser.mjs",
    "globalThis.window = undefined;\nglobalThis.document = undefined;\nglobalThis.process = undefined;\nawait import('./browser-output.mjs');\n",
  );

  console.log("\n[package] Bundling installed package for a DOM-free browser target");
  run("node", ["build-browser.mjs"], { cwd: consumerDirectory });
  const bundledBrowserResult = parseJsonOutput(
    run("node", ["run-browser.mjs"], { cwd: consumerDirectory, capture: true }),
    "bundled browser consumer",
  );
  assert.deepEqual(bundledBrowserResult, serverResult);

  await writeConsumerFile(
    "deep-import.mjs",
    String.raw`
try {
  await import("speakable-text/dist/index.js");
  throw new Error("unintended deep import succeeded");
} catch (error) {
  if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
}
`,
  );

  console.log("\n[package] Confirming unintended deep imports are blocked");
  run("node", ["deep-import.mjs"], { cwd: consumerDirectory });

  console.log(`\n[package] Passed exact-tarball validation (${basename(tarball)})`);
} finally {
  await cleanup();
}
