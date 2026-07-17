import type { Tree } from "@lezer/common";
import { parser as javascriptParser } from "@lezer/javascript";
import { collectRecoveryRegions } from "../collect-recovery-regions.js";
import type { CodeParseResult, CodeParserAdapter } from "../parser-types.js";

const configuredParser = javascriptParser.configure({ dialect: "ts" });

export const typescriptParser: CodeParserAdapter<Tree> = Object.freeze({
  canonicalLanguage: "typescript",
  parse(source: string): CodeParseResult<Tree> {
    const tree = configuredParser.parse(source);
    return { tree, recoveryRegions: collectRecoveryRegions(tree) };
  },
});

export function parseTypeScript(source: string): CodeParseResult<Tree> {
  return typescriptParser.parse(source);
}
