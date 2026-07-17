import type { Tree } from "@lezer/common";
import type { SourceInterval } from "./parser-types.js";

export function collectRecoveryRegions(tree: Tree): readonly SourceInterval[] {
  const regions: SourceInterval[] = [];
  const cursor = tree.cursor();

  for (;;) {
    if (cursor.type.isError) {
      regions.push({ from: cursor.from, to: cursor.to });
    }

    if (cursor.firstChild()) {
      continue;
    }

    while (!cursor.nextSibling()) {
      if (!cursor.parent()) {
        return regions;
      }
    }
  }
}
