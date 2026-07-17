export { compileMarkdown } from "./compile-markdown.js";
export { convertMarkdown } from "./convert-markdown.js";
export { renderNarration } from "./render-narration.js";
export { createPlainTextRenderer } from "./renderers/plain-text-renderer.js";
export type {
  CompileMarkdownOptions,
  ConversionResult,
  ConvertMarkdownOptions,
  NarrationCompilationResult,
  NarrationConfigurationOverrides,
} from "./public-api.js";
export type {
  DiagnosticSeverity,
  NarrationDiagnostic,
} from "./narration/diagnostics.js";
export type {
  BoundaryNarrationToken,
  NarrationEmphasis,
  NarrationFragment,
  NarrationPlan,
  NarrationRate,
  NarrationRole,
  NarrationStyle,
  NarrationToken,
  NarrationTone,
  PauseNarrationToken,
  TextNarrationToken,
} from "./narration/tokens.js";
export {
  defaultNarrationConfiguration,
  resolveNarrationConfiguration,
} from "./narration/configuration.js";
export type {
  DocumentNarrationContext,
  EmphasisNarrationContext,
  HeadingLevel,
  HeadingNarrationContext,
  HeadingNarrationOverrides,
  LinkNarrationContext,
  NarrationConfiguration,
  NarrationNodeRule,
  NarrationNodeRuleOverrides,
  NarrationTemplateFactory,
  ParagraphNarrationContext,
  StrongNarrationContext,
} from "./narration/configuration.js";
export type {
  NarrationRenderer,
  NarrationRenderResult,
  RendererCapabilities,
} from "./renderers/renderer.js";
