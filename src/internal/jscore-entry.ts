import { convertMarkdown } from "../convert-markdown.js";
import type { ConvertMarkdownOptions } from "../public-api.js";

/**
 * JSON-oriented bridge for host runtimes that only exchange strings with the
 * library, such as Apple's JavaScriptCore (`JSContext.evaluateScript`). This
 * module is the entry point for the `dist/jscore` bundle and must not be
 * imported from the ordinary Node/browser API surface.
 */

function parseOptions(optionsJSON: string | undefined): ConvertMarkdownOptions | undefined {
  if (optionsJSON === undefined) return undefined;
  if (typeof optionsJSON !== "string") {
    throw new TypeError(
      "SpeakableText.convertMarkdownJSON: optionsJSON must be a JSON string or omitted, " +
        `received ${typeof optionsJSON}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(optionsJSON);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`SpeakableText.convertMarkdownJSON: optionsJSON is not valid JSON (${message})`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(
      "SpeakableText.convertMarkdownJSON: optionsJSON must decode to a JSON object, " +
        `received ${parsed === null ? "null" : Array.isArray(parsed) ? "an array" : typeof parsed}`,
    );
  }

  // `ConvertMarkdownOptions.renderer` and narration callback fields are not
  // JSON-representable; a JSON-decoded value can never populate them, so any
  // such field is simply absent here and the library falls back to defaults.
  return parsed as ConvertMarkdownOptions;
}

/**
 * Converts Markdown to a narration plan, plain text, and diagnostics, then
 * returns `JSON.stringify` of the result -- the same shape `convertMarkdown`
 * returns from the ordinary npm API. `optionsJSON`, when supplied, must be a
 * JSON object matching `ConvertMarkdownOptions` (a `renderer` or narration
 * callback field cannot be represented in JSON and is ignored if present).
 *
 * Errors (malformed JSON, invalid configuration, internal invariant
 * failures) are thrown as ordinary JavaScript exceptions so a host's
 * `JSContext.exceptionHandler` observes them.
 */
export function convertMarkdownJSON(markdown: string, optionsJSON?: string): string {
  if (typeof markdown !== "string") {
    throw new TypeError(
      `SpeakableText.convertMarkdownJSON: markdown must be a string, received ${typeof markdown}`,
    );
  }

  const options = parseOptions(optionsJSON);
  const result = convertMarkdown(markdown, options);
  return JSON.stringify(result);
}
