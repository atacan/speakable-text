import { compileMarkdown } from "./compile-markdown.js";
import type { ConversionResult, ConvertMarkdownOptions } from "./public-api.js";
import { renderNarration } from "./render-narration.js";

export function convertMarkdown(
  markdown: string,
  options?: ConvertMarkdownOptions,
): ConversionResult {
  const compileOptions = options?.narration === undefined
    ? undefined
    : { narration: options.narration };
  const compilation = compileMarkdown(markdown, compileOptions);
  const rendering = renderNarration(compilation.plan, options?.renderer);
  return {
    plan: compilation.plan,
    text: rendering.text,
    diagnostics: [...compilation.diagnostics, ...rendering.diagnostics],
  };
}
