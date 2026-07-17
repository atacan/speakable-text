import type { NarrationDiagnostic } from "../narration/diagnostics.js";
import type { NarrationPlan } from "../narration/tokens.js";

export interface RendererCapabilities {
  readonly exactPauses: boolean;
  readonly emphasis: boolean;
  readonly tone: boolean;
  readonly speakingRate: boolean;
  readonly voiceRoles: boolean;
}

export interface NarrationRenderResult {
  readonly text: string;
  readonly diagnostics: readonly NarrationDiagnostic[];
}

export interface NarrationRenderer {
  readonly id: string;
  readonly capabilities: RendererCapabilities;
  render(plan: NarrationPlan): NarrationRenderResult;
}
