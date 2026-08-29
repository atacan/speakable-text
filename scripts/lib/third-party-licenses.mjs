import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function bundledPackageNames(metafile) {
  const names = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const match = input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/u);
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * Generates a THIRD_PARTY_LICENSES.txt from the exact packages an esbuild
 * metafile reports as bundled, so the notice can never drift from what a
 * given artifact actually contains.
 */
export async function writeThirdPartyLicenses({ root, metafile, outfile, title, bundlePath }) {
  const sections = [
    title,
    "",
    `This file is generated from the exact packages bundled into ${bundlePath}.`,
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
  await writeFile(join(root, outfile), sections.join("\n"), "utf8");
}
