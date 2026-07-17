import type { Tree } from "@lezer/common";
import { parser } from "@lezer/python";
import { collectRecoveryRegions } from "../collect-recovery-regions.js";
import type { CodeParseResult, CodeParserAdapter } from "../parser-types.js";

export const pythonParser: CodeParserAdapter<Tree> = Object.freeze({
  canonicalLanguage: "python",
  parse(source: string): CodeParseResult<Tree> {
    const tree = parser.parse(source);
    return { tree, recoveryRegions: collectRecoveryRegions(tree) };
  },
});

export function parsePython(source: string): CodeParseResult<Tree> {
  return pythonParser.parse(source);
}
