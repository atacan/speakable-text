import type { NarrationPlan } from "./narration/tokens.js";
import { assertNarrationPlan } from "./narration/plan.js";
import type {
  NarrationRenderer,
  NarrationRenderResult,
} from "./renderers/renderer.js";
import { createPlainTextRenderer } from "./renderers/plain-text-renderer.js";

const defaultPlainTextRenderer = createPlainTextRenderer();

export function renderNarration(
  plan: NarrationPlan,
  renderer: NarrationRenderer = defaultPlainTextRenderer,
): NarrationRenderResult {
  // Validate before dispatch so custom renderers never observe an unsupported
  // schema or a structurally invalid wire value.
  assertNarrationPlan(plan);
  return renderer.render(plan);
}
