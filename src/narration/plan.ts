import type {
  BoundaryNarrationToken,
  NarrationPlan,
  NarrationStyle,
  NarrationToken,
  TextNarrationToken,
} from "./tokens.js";

const BOUNDARIES = new Set<BoundaryNarrationToken["boundary"]>([
  "document",
  "heading",
  "paragraph",
  "list",
  "list-item",
  "blockquote",
  "code-block",
  "table",
  "table-row",
  "table-cell",
]);

const STYLE_PROPERTIES = ["role", "tone", "rate", "emphasis"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(message: string): never {
  throw new TypeError(`Invalid narration plan: ${message}`);
}

function validateStyle(style: unknown, tokenIndex: number): void {
  if (!isRecord(style)) fail(`token ${tokenIndex} has a non-object style`);

  for (const key of Object.keys(style)) {
    if (!(STYLE_PROPERTIES as readonly string[]).includes(key)) {
      fail(`token ${tokenIndex} has unknown style property ${JSON.stringify(key)}`);
    }
  }

  for (const property of STYLE_PROPERTIES) {
    const value = style[property];
    if (Object.hasOwn(style, property) && typeof value !== "string") {
      fail(`token ${tokenIndex} style ${property} must be a string`);
    }
  }
}

function validateKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  description: string,
): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(`${description} has a symbol property`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      fail(`${description} property ${JSON.stringify(key)} must be an enumerable data property`);
    }
    if (!allowed.includes(key)) fail(`${description} has unknown property ${JSON.stringify(key)}`);
  }
}

function describeSchemaVersion(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) return "null";
  return typeof value;
}

function validateMetadata(metadata: unknown, tokenIndex: number): void {
  if (!isRecord(metadata)) fail(`token ${tokenIndex} has non-object metadata`);

  for (const [key, value] of Object.entries(metadata)) {
    const validPrimitive =
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0));
    if (!validPrimitive) {
      fail(`token ${tokenIndex} metadata ${JSON.stringify(key)} must be a string, boolean, or finite number`);
    }
  }
}

function validateToken(token: unknown, tokenIndex: number): asserts token is NarrationToken {
  if (!isRecord(token)) fail(`token ${tokenIndex} must be an object`);

  switch (token["kind"]) {
    case "text": {
      validateKeys(token, ["kind", "value", "style", "literal"], `token ${tokenIndex}`);
      if (typeof token["value"] !== "string") {
        fail(`token ${tokenIndex} text value must be a string`);
      }
      if (Object.hasOwn(token, "literal") && typeof token["literal"] !== "boolean") {
        fail(`token ${tokenIndex} literal must be a boolean`);
      }
      if (Object.hasOwn(token, "style")) validateStyle(token["style"], tokenIndex);
      return;
    }
    case "pause": {
      validateKeys(token, ["kind", "durationMs"], `token ${tokenIndex}`);
      const duration = token["durationMs"];
      if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration < 0 ||
        Object.is(duration, -0)
      ) {
        fail(`token ${tokenIndex} pause duration must be a finite, non-negative number`);
      }
      return;
    }
    case "boundary": {
      validateKeys(token, ["kind", "boundary", "phase", "metadata"], `token ${tokenIndex}`);
      if (!BOUNDARIES.has(token["boundary"] as BoundaryNarrationToken["boundary"])) {
        fail(`token ${tokenIndex} has an unsupported boundary`);
      }
      if (token["phase"] !== "start" && token["phase"] !== "end") {
        fail(`token ${tokenIndex} boundary phase must be start or end`);
      }
      if (Object.hasOwn(token, "metadata")) validateMetadata(token["metadata"], tokenIndex);
      return;
    }
    default:
      fail(`token ${tokenIndex} has an unsupported kind`);
  }
}

function validateTokens(tokens: readonly unknown[]): asserts tokens is readonly NarrationToken[] {
  const openBoundaries: BoundaryNarrationToken["boundary"][] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    validateToken(token, index);
    if (token.kind !== "boundary") continue;

    if (token.phase === "start") {
      openBoundaries.push(token.boundary);
      continue;
    }

    const open = openBoundaries.pop();
    if (open === undefined) {
      fail(`token ${index} closes ${token.boundary} without an opening boundary`);
    }
    if (open !== token.boundary) {
      fail(`token ${index} closes ${token.boundary} while ${open} is still open`);
    }
  }

  const unclosed = openBoundaries.at(-1);
  if (unclosed !== undefined) fail(`unclosed ${unclosed} boundary`);
}

function validateTokenArrayStructure(tokens: readonly unknown[]): void {
  const expectedIndices = new Set(Array.from({ length: tokens.length }, (_, index) => String(index)));
  for (const key of Reflect.ownKeys(tokens)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !expectedIndices.has(key)) {
      fail("tokens array has a non-index property");
    }
  }
}

/** Validate an externally supplied or JSON-round-tripped plan at runtime. */
export function assertNarrationPlan(plan: unknown): asserts plan is NarrationPlan {
  if (!isRecord(plan)) fail("plan must be an object");
  validateKeys(plan, ["schemaVersion", "tokens"], "plan");
  if (plan["schemaVersion"] !== 1) {
    fail(`unsupported schemaVersion ${describeSchemaVersion(plan["schemaVersion"])}`);
  }
  if (!Array.isArray(plan["tokens"])) fail("tokens must be an array");
  validateTokenArrayStructure(plan["tokens"]);
  validateTokens(plan["tokens"]);
  validateNormalizedTokens(plan["tokens"]);
}

function stylesEqual(left: NarrationStyle | undefined, right: NarrationStyle | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return STYLE_PROPERTIES.every((property) => left[property] === right[property]);
}

function textTokensAreCompatible(left: TextNarrationToken, right: TextNarrationToken): boolean {
  return left.literal === right.literal && stylesEqual(left.style, right.style);
}

function validateNormalizedTokens(tokens: readonly NarrationToken[]): void {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind === "text" && token.value.length === 0) {
      fail(`token ${index} is an empty text token`);
    }

    const previous = index === 0 ? undefined : tokens[index - 1];
    if (token?.kind === "pause" && previous?.kind === "pause") {
      fail(`tokens ${index - 1} and ${index} are adjacent pauses`);
    }
    if (
      token?.kind === "text" &&
      previous?.kind === "text" &&
      textTokensAreCompatible(previous, token)
    ) {
      fail(`tokens ${index - 1} and ${index} are compatible adjacent text tokens`);
    }
  }
}

/**
 * Merge nested styles from outermost to innermost. Undefined properties do not
 * erase an outer value. The canonical property order keeps serialized plans
 * stable even when caller objects were constructed in a different order.
 */
export function mergeNarrationStyles(
  ...styles: readonly (NarrationStyle | undefined)[]
): NarrationStyle | undefined {
  const merged: NarrationStyle = {};
  let hasValue = false;
  for (const style of styles) {
    if (style === undefined) continue;
    for (const property of STYLE_PROPERTIES) {
      const value = style[property];
      if (value !== undefined) {
        merged[property] = value;
        hasValue = true;
      }
    }
  }
  return hasValue ? merged : undefined;
}

/** Normalize compiler output and verify all narration-plan invariants. */
export function normalizeNarrationPlan(tokens: readonly NarrationToken[]): NarrationPlan {
  // Validate before normalization so invalid values cannot disappear merely
  // because their containing token would otherwise be collapsed or removed.
  validateTokens(tokens);

  const normalized: NarrationToken[] = [];
  for (const token of tokens) {
    if (token.kind === "text" && token.value.length === 0) continue;

    const previous = normalized.at(-1);
    if (
      token.kind === "text" &&
      previous?.kind === "text" &&
      textTokensAreCompatible(previous, token)
    ) {
      normalized[normalized.length - 1] = { ...previous, value: previous.value + token.value };
      continue;
    }

    if (token.kind === "pause" && previous?.kind === "pause") {
      normalized[normalized.length - 1] = {
        kind: "pause",
        durationMs: Math.max(previous.durationMs, token.durationMs),
      };
      continue;
    }

    normalized.push(token);
  }

  return { schemaVersion: 1, tokens: normalized };
}
