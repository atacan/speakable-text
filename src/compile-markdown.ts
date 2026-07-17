import { parseMarkdown } from "./markdown/parse-markdown.js";
import { compileMarkdownTree } from "./markdown/compile-markdown-tree.js";
import type {
  CompileMarkdownOptions,
  NarrationCompilationResult,
} from "./public-api.js";

export function compileMarkdown(
  markdown: string,
  _options?: CompileMarkdownOptions,
): NarrationCompilationResult {
  const root = parseMarkdown(markdown);
  return compileMarkdownTree(root);
}
