export interface SourceInterval {
  readonly from: number;
  readonly to: number;
}

export interface CodeParseResult<Tree> {
  readonly tree: Tree;
  readonly recoveryRegions: readonly SourceInterval[];
}

export interface CodeParserAdapter<Tree> {
  readonly canonicalLanguage: "python" | "typescript";
  parse(source: string): CodeParseResult<Tree>;
}
