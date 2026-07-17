import { parseMarkdown } from "./markdown/parse-markdown.js";
import { compileMarkdownTree } from "./markdown/compile-markdown-tree.js";
import type {
  CompileMarkdownOptions,
  NarrationCompilationResult,
} from "./public-api.js";
import { resolveNarrationConfiguration } from "./narration/configuration.js";

export function compileMarkdown(
  markdown: string,
  options?: CompileMarkdownOptions,
): NarrationCompilationResult {
  // Configuration validation deliberately precedes Markdown parser invocation.
  const configuration = resolveNarrationConfiguration(options?.narration);
  const root = parseMarkdown(markdown);
  return compileMarkdownTree(root, configuration);
}
