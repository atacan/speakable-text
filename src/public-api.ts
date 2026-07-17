import type { NarrationDiagnostic } from "./narration/diagnostics.js";
import type { NarrationPlan } from "./narration/tokens.js";
import type { NarrationRenderer } from "./renderers/renderer.js";

/** Reserved until the configuration milestone defines the nested overrides. */
export type NarrationConfigurationOverrides = Readonly<Record<string, never>>;

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
