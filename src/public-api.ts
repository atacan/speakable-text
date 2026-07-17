import type { NarrationDiagnostic } from "./narration/diagnostics.js";
import type { NarrationPlan } from "./narration/tokens.js";
import type { NarrationRenderer } from "./renderers/renderer.js";
import type { NarrationConfigurationOverrides } from "./narration/configuration.js";

export type { NarrationConfigurationOverrides } from "./narration/configuration.js";

export interface ConversionResult {
  readonly plan: NarrationPlan;
  readonly text: string;
  readonly diagnostics: readonly NarrationDiagnostic[];
}

export interface ConvertMarkdownOptions {
  readonly narration?: NarrationConfigurationOverrides;
  readonly renderer?: NarrationRenderer;
}

export interface CompileMarkdownOptions {
  readonly narration?: NarrationConfigurationOverrides;
}

export interface NarrationCompilationResult {
  readonly plan: NarrationPlan;
  readonly diagnostics: readonly NarrationDiagnostic[];
}
