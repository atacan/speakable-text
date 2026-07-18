import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findTests(path);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
    }),
  );
  return paths.flat();
}

const testFiles = (await findTests(resolve(repositoryRoot, "tests"))).sort();
if (testFiles.length === 0) {
  throw new Error("No TypeScript test files were found.");
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...testFiles], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
