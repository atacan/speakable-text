import {
  appendDiagnosticOnce,
  createNarrationDiagnostic,
  type NarrationDiagnostic,
} from "../narration/diagnostics.js";
import { assertNarrationPlan } from "../narration/plan.js";
import type {
  NarrationPlan,
  NarrationStyle,
  PauseNarrationToken,
} from "../narration/tokens.js";
import type { NarrationRenderer } from "./renderer.js";

function finalPunctuation(text: string): string | undefined {
  const finalCharacter = text.at(-1);
  if (finalCharacter === undefined) return undefined;
  if ("\"')]".includes(finalCharacter)) return text.at(-2);
  return finalCharacter;
}

function pauseText(durationMs: number, renderedSoFar: string, followingText: string | undefined): string {
  if (durationMs === 0) return "";
  if (renderedSoFar.length === 0) return "";

  const finalCharacter = renderedSoFar.at(-1);
  if (finalCharacter !== undefined && finalCharacter.trim().length === 0) {
    return "";
  }
  // A structural pause immediately before source punctuation should not add a
  // second punctuation mark. This is especially common for inline code at the
  // end of a sentence, where the compiler emits the code's trailing pause
  // before the paragraph's literal period.
  if (followingText !== undefined && /^[\s.,!?;:)\]}]/u.test(followingText)) return "";

  const punctuation = finalPunctuation(renderedSoFar);
  const hasSentencePunctuation = punctuation !== undefined && ".!?".includes(punctuation);
  const hasPhrasePunctuation = punctuation !== undefined && ",;:".includes(punctuation);

  if (durationMs < 350) {
    return hasPhrasePunctuation || hasSentencePunctuation ? " " : ", ";
  }

  if (durationMs < 750) {
    return hasSentencePunctuation ? " " : ". ";
  }

  return hasSentencePunctuation ? "\n\n" : ".\n\n";
}

function reportUnsupportedStyles(
  style: NarrationStyle | undefined,
  diagnostics: NarrationDiagnostic[],
  seen: Set<string>,
): void {
  if (style === undefined) return;

  const unsupported: readonly [keyof NarrationStyle, string, string][] = [
    ["role", "voice role", "narrator"],
    ["tone", "tone", "neutral"],
    ["rate", "speaking rate", "normal"],
    ["emphasis", "emphasis", ""],
  ];

  for (const [property, label, plainDefault] of unsupported) {
    const value = style[property];
    if (value === undefined || value === plainDefault) continue;
    const feature = `${property}:${value}`;
    appendDiagnosticOnce(
      diagnostics,
      seen,
      `RENDERER_FEATURE_UNSUPPORTED:${feature}`,
      createNarrationDiagnostic(
        "RENDERER_FEATURE_UNSUPPORTED",
        "info",
        `Plain text cannot represent ${label} ${JSON.stringify(value)}; spoken text was preserved.`,
      ),
    );
  }
}

function reportApproximatedPause(
  pause: PauseNarrationToken,
  diagnostics: NarrationDiagnostic[],
  seen: Set<string>,
): void {
  // A zero-duration request is represented exactly by emitting nothing.
  if (pause.durationMs === 0) return;
  appendDiagnosticOnce(
    diagnostics,
    seen,
    "RENDERER_FEATURE_APPROXIMATED:pause",
    createNarrationDiagnostic(
      "RENDERER_FEATURE_APPROXIMATED",
      "info",
      `Plain text approximates requested pauses with punctuation and whitespace (first encountered: ${pause.durationMs} ms).`,
    ),
  );
}

/**
 * Create the generic renderer used by convertMarkdown by default.
 *
 * Pause mapping is intentionally small and deterministic:
 * - 0 ms: no output
 * - 1–349 ms: comma + space (or only space after existing punctuation)
 * - 350–749 ms: period + space (or only space after sentence punctuation)
 * - 750 ms and above: period + blank line (or only the blank line after
 *   sentence punctuation)
 * - At the start of output, no punctuation or whitespace is introduced.
 *   Next to whitespace already carried by a text token, no duplicate
 *   punctuation or whitespace is added.
 * - At the end of output, no trailing punctuation or whitespace is added.
 * - A compiler boundary between otherwise adjacent words becomes sentence
 *   punctuation (or one space when the preceding text is already punctuated).
 */
export function createPlainTextRenderer(): NarrationRenderer {
  return Object.freeze({
    id: "plain-text",
    capabilities: Object.freeze({
      exactPauses: false,
      emphasis: false,
      tone: false,
      speakingRate: false,
      voiceRoles: false,
    }),
    render(plan: NarrationPlan) {
      assertNarrationPlan(plan);

      let text = "";
      let boundarySinceLastText = false;
      const diagnostics: NarrationDiagnostic[] = [];
      const seen = new Set<string>();
      let lastTextIndex = -1;
      for (let index = plan.tokens.length - 1; index >= 0; index -= 1) {
        if (plan.tokens[index]?.kind === "text") {
          lastTextIndex = index;
          break;
        }
      }
      for (let index = 0; index < plan.tokens.length; index += 1) {
        const token = plan.tokens[index];
        if (token === undefined) continue;
        if (token.kind === "boundary") {
          if (text.length > 0) boundarySinceLastText = true;
          continue;
        }
        if (token.kind === "text") {
          reportUnsupportedStyles(token.style, diagnostics, seen);
          if (
            boundarySinceLastText &&
            !/\s$/u.test(text) &&
            !/^[\s.,!?;:)\]}]/u.test(token.value)
          ) {
            const punctuation = finalPunctuation(text);
            text += punctuation !== undefined && ".,!?;:".includes(punctuation) ? " " : ". ";
          }
          text += token.value;
          boundarySinceLastText = false;
          continue;
        }

        reportApproximatedPause(token, diagnostics, seen);
        // A trailing request still produces an approximation diagnostic, but
        // punctuation/whitespace with no following speech would be audible as
        // nothing and would leave an unnatural trailing string suffix.
        if (index < lastTextIndex) {
          let followingText: string | undefined;
          for (let nextIndex = index + 1; nextIndex <= lastTextIndex; nextIndex += 1) {
            const next = plan.tokens[nextIndex];
            if (next?.kind === "text") { followingText = next.value; break; }
          }
          text += pauseText(token.durationMs, text, followingText);
        }
      }

      return { text, diagnostics };
    },
  });
}
