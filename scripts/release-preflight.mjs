import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EXPECTED_NAME = "speakable-text";
const EXPECTED_REPOSITORY = "git+https://github.com/atacan/speakable-text.git";
const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

function parseArguments(arguments_) {
  let tag = process.env.GITHUB_REF_NAME;
  let requireClean = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--require-clean") {
      requireClean = true;
      continue;
    }
    if (argument === "--tag") {
      tag = arguments_[index + 1];
      assert.ok(tag, "--tag requires a value");
      index += 1;
      continue;
    }
    if (argument.startsWith("--tag=")) {
      tag = argument.slice("--tag=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  assert.ok(tag, "Provide --tag v<version> or set GITHUB_REF_NAME");
  return { tag, requireClean };
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(repositoryRoot, relativePath), "utf8"));
}

async function assertFileExists(relativePath) {
  await access(resolve(repositoryRoot, relativePath), constants.R_OK);
}

function assertCleanRepository() {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || "git status failed");
  assert.equal(result.stdout, "", `Release checkout is not clean:\n${result.stdout}`);
}

const { tag, requireClean } = parseArguments(process.argv.slice(2));
const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const changelog = await readFile(resolve(repositoryRoot, "CHANGELOG.md"), "utf8");
const license = await readFile(resolve(repositoryRoot, "LICENSE"), "utf8");
const ciWorkflow = await readFile(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
const publishWorkflow = await readFile(resolve(repositoryRoot, ".github/workflows/publish.yml"), "utf8");

const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
assert.match(packageJson.version, stableSemver, "package version must be a stable SemVer version");
assert.equal(tag, `v${packageJson.version}`, "release tag must exactly equal v<package version>");
assert.equal(packageJson.name, EXPECTED_NAME);
assert.notEqual(packageJson.private, true, "package must be publishable");
assert.equal(packageJson.license, "MIT");
assert.equal(packageJson.repository?.url, EXPECTED_REPOSITORY);
assert.equal(packageJson.homepage, "https://github.com/atacan/speakable-text#readme");
assert.equal(packageJson.bugs?.url, "https://github.com/atacan/speakable-text/issues");
assert.equal(packageJson.author?.name, "atacan");
assert.equal(packageJson.type, "module");
assert.equal(packageJson.publishConfig?.access, "public");
assert.equal(packageJson.publishConfig?.registry, "https://registry.npmjs.org/");
assert.equal(packageJson.publishConfig?.provenance, true, "publication must explicitly enable provenance");
assert.equal(packageLock.name, packageJson.name);
assert.equal(packageLock.version, packageJson.version);
assert.equal(packageLock.packages?.[""]?.name, packageJson.name);
assert.equal(packageLock.packages?.[""]?.version, packageJson.version);
assert.ok(packageJson.files?.includes("dist/browser"), "browser build must be published");
assert.ok(packageJson.files?.includes("dist/jscore"), "JavaScriptCore build must be published");
assert.ok(packageJson.files?.includes("dist/index.*"), "root entry point must be published");
for (const forbiddenExport of Object.keys(packageJson.exports?.["."] ?? {})) {
  assert.notEqual(
    packageJson.exports["."][forbiddenExport],
    "./dist/jscore/speakable-text.js",
    "the JavaScriptCore IIFE bundle must not be wired into package.json exports as an ES module",
  );
}
assert.match(changelog, new RegExp(`^## \\[${packageJson.version.replaceAll(".", "\\.")}\\](?: - \\d{4}-\\d{2}-\\d{2})?$`, "m"));
assert.equal((changelog.match(new RegExp(`^## \\[${packageJson.version.replaceAll(".", "\\.")}\\]`, "gm")) ?? []).length, 1);
assert.match(changelog, new RegExp(`^\\[${packageJson.version.replaceAll(".", "\\.")}\\]: https://github\\.com/atacan/speakable-text/releases/tag/v${packageJson.version}$`, "m"));
assert.match(license, /MIT License/);
assert.match(license, /Copyright \(c\) 2026 atacan/);
assert.doesNotMatch(ciWorkflow, /id-token:\s*write/, "CI must not receive an OIDC token");
assert.match(publishWorkflow, /^\s*workflow_dispatch:\s*$/m);
assert.doesNotMatch(publishWorkflow, /^\s*(?:push|pull_request|release):\s*$/m);
assert.match(publishWorkflow, /^\s*environment:\s*npm\s*$/m);
assert.match(publishWorkflow, /^\s*id-token:\s*write\s*$/m);
assert.equal((publishWorkflow.match(/^\s*run:\s*npm publish --access public\s*$/gm) ?? []).length, 1);
assert.doesNotMatch(publishWorkflow, /\$\{\{\s*secrets\./i);
assert.doesNotMatch(publishWorkflow, /(?:NODE_AUTH_TOKEN|NPM_TOKEN|_authToken)/i);

for (const path of ["README.md", "CHANGELOG.md", "LICENSE", ".npmignore", ".github/workflows/publish.yml"]) {
  await assertFileExists(path);
}

for (const forbiddenScript of ["publish", "postpublish", "prepublish", "prepare"]) {
  assert.equal(packageJson.scripts?.[forbiddenScript], undefined, `lifecycle script ${forbiddenScript} is not allowed`);
}

try {
  await access(resolve(repositoryRoot, ".npmrc"), constants.F_OK);
  assert.fail("A repository .npmrc is not allowed for this tokenless release process");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (requireClean) assertCleanRepository();

console.log(`Release preflight passed for ${packageJson.name}@${packageJson.version} (${tag}).`);
