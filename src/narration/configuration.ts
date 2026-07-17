import type { NarrationFragment, NarrationStyle } from "./tokens.js";

export type NarrationTemplateFactory<Context> = (
  context: Readonly<Context>,
) => readonly NarrationFragment[];

export interface NarrationNodeRule<Context> {
  readonly skip?: boolean;
  readonly before?: readonly NarrationFragment[];
  readonly after?: readonly NarrationFragment[];
  readonly contentStyle?: NarrationStyle;
  readonly compile?: NarrationTemplateFactory<Context>;
}

export interface DocumentNarrationContext {
  readonly text: string;
}

export interface HeadingNarrationContext {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}

export interface ParagraphNarrationContext {
  readonly text: string;
}

export interface EmphasisNarrationContext {
  readonly text: string;
}

export interface StrongNarrationContext {
  readonly text: string;
}

export interface LinkNarrationContext {
  readonly text: string;
  readonly destination?: string;
  readonly title?: string;
  readonly reference?: string;
}

export type HeadingLevel = HeadingNarrationContext["level"];

export interface NarrationConfiguration {
  readonly document: NarrationNodeRule<DocumentNarrationContext>;
  readonly headings: Readonly<Record<HeadingLevel, NarrationNodeRule<HeadingNarrationContext>>>;
  readonly paragraph: NarrationNodeRule<ParagraphNarrationContext>;
  readonly italic: NarrationNodeRule<EmphasisNarrationContext>;
  readonly strong: NarrationNodeRule<StrongNarrationContext>;
  readonly link: NarrationNodeRule<LinkNarrationContext>;
}

export interface NarrationNodeRuleOverrides<Context> {
  readonly skip?: boolean;
  readonly before?: readonly NarrationFragment[];
  readonly after?: readonly NarrationFragment[];
  readonly contentStyle?: NarrationStyle;
  readonly compile?: NarrationTemplateFactory<Context>;
}

export interface HeadingNarrationOverrides {
  readonly 1?: NarrationNodeRuleOverrides<HeadingNarrationContext>;
  readonly 2?: NarrationNodeRuleOverrides<HeadingNarrationContext>;
  readonly 3?: NarrationNodeRuleOverrides<HeadingNarrationContext>;
  readonly 4?: NarrationNodeRuleOverrides<HeadingNarrationContext>;
  readonly 5?: NarrationNodeRuleOverrides<HeadingNarrationContext>;
  readonly 6?: NarrationNodeRuleOverrides<HeadingNarrationContext>;
}

/** Purpose-built deep overrides. Arrays and callbacks replace default values. */
export interface NarrationConfigurationOverrides {
  readonly document?: NarrationNodeRuleOverrides<DocumentNarrationContext>;
  readonly headings?: HeadingNarrationOverrides;
  readonly paragraph?: NarrationNodeRuleOverrides<ParagraphNarrationContext>;
  readonly italic?: NarrationNodeRuleOverrides<EmphasisNarrationContext>;
  readonly strong?: NarrationNodeRuleOverrides<StrongNarrationContext>;
  readonly link?: NarrationNodeRuleOverrides<LinkNarrationContext>;
}

const HEADING_PAUSES: Readonly<Record<HeadingLevel, readonly [number, number]>> = {
  1: [700, 500],
  2: [550, 400],
  3: [450, 350],
  4: [350, 300],
  5: [350, 300],
  6: [350, 300],
};

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const RULE_KEYS = ["skip", "before", "after", "contentStyle", "compile"] as const;
const STYLE_KEYS = ["role", "tone", "rate", "emphasis"] as const;

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function createDefaults(): NarrationConfiguration {
  const headings = Object.fromEntries(HEADING_LEVELS.map((level) => {
    const [before, after] = HEADING_PAUSES[level];
    return [level, {
      skip: false,
      before: [{ kind: "pause", durationMs: before }],
      after: [{ kind: "pause", durationMs: after }],
      contentStyle: { role: "heading", emphasis: "strong" },
    }];
  })) as unknown as NarrationConfiguration["headings"];

  return {
    document: { skip: false, before: [], after: [] },
    headings,
    paragraph: {
      skip: false,
      before: [],
      after: [{ kind: "pause", durationMs: 400 }],
    },
    italic: {
      skip: false,
      before: [],
      after: [],
      contentStyle: { role: "emphasis", emphasis: "moderate" },
    },
    strong: {
      skip: false,
      before: [],
      after: [],
      contentStyle: { role: "strong-emphasis", emphasis: "strong" },
    },
    link: { skip: false, before: [], after: [] },
  };
}

export const defaultNarrationConfiguration: NarrationConfiguration = deepFreeze(createDefaults());

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(path: string, message: string): never {
  throw new TypeError(`Invalid narration configuration at ${path}: ${message}`);
}

function assertDataObject(value: unknown, path: string, allowed: readonly string[]): void {
  if (!isPlainRecord(value)) fail(path, "must be a plain object");
  const record = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") fail(path, "must not contain symbol properties");
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      fail(`${path}.${key}`, "must be an enumerable data property");
    }
    if (!allowed.includes(key)) fail(`${path}.${key}`, "is not supported");
  }
}

function validateStyle(value: unknown, path: string): void {
  assertDataObject(value, path, STYLE_KEYS);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") fail(`${path}.${key}`, "must be a string");
  }
}

function cloneStyle(value: NarrationStyle | undefined, path: string): NarrationStyle | undefined {
  if (value === undefined) return undefined;
  validateStyle(value, path);
  return deepFreeze({ ...value });
}

function resolveStyle(
  base: NarrationStyle | undefined,
  override: NarrationStyle | undefined,
  path: string,
): NarrationStyle | undefined {
  if (override === undefined) return base;
  validateStyle(override, path);
  const resolved: NarrationStyle = {};
  for (const key of STYLE_KEYS) {
    const value = override[key] ?? base?.[key];
    if (value !== undefined) resolved[key] = value;
  }
  return deepFreeze(resolved);
}

function validateArrayShape(value: readonly unknown[], path: string): void {
  const expected = new Set(Array.from({ length: value.length }, (_, index) => String(index)));
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !expected.has(key)) fail(path, "must be a dense array without custom properties");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) fail(`${path}[${key}]`, "must be a data property");
  }
}

export function cloneAndValidateNarrationFragments(value: unknown, path: string): readonly NarrationFragment[] {
  if (!Array.isArray(value)) fail(path, "must be an array of narration fragments");
  validateArrayShape(value, path);
  const fragments = value.map((fragment, index): NarrationFragment => {
    const fragmentPath = `${path}[${index}]`;
    const kind = isPlainRecord(fragment) ? fragment["kind"] : undefined;
    assertDataObject(fragment, fragmentPath, kind === "text"
      ? ["kind", "value", "style", "literal"]
      : ["kind", "durationMs"]);
    const record = fragment as Record<string, unknown>;
    if (record["kind"] === "boundary") fail(`${fragmentPath}.kind`, "boundary fragments are compiler-owned");
    if (record["kind"] === "text") {
      if (typeof record["value"] !== "string") fail(`${fragmentPath}.value`, "must be a string");
      if (Object.hasOwn(record, "literal") && typeof record["literal"] !== "boolean") {
        fail(`${fragmentPath}.literal`, "must be a boolean");
      }
      const style = Object.hasOwn(record, "style")
        ? cloneStyle(record["style"] as NarrationStyle, `${fragmentPath}.style`)
        : undefined;
      return deepFreeze({
        kind: "text",
        value: record["value"],
        ...(style === undefined ? {} : { style }),
        ...(Object.hasOwn(record, "literal") ? { literal: record["literal"] as boolean } : {}),
      });
    }
    if (record["kind"] === "pause") {
      const durationMs = record["durationMs"];
      if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0 || Object.is(durationMs, -0)) {
        fail(`${fragmentPath}.durationMs`, "must be a finite, non-negative number");
      }
      return deepFreeze({ kind: "pause", durationMs });
    }
    fail(`${fragmentPath}.kind`, "must be text or pause");
  });
  return deepFreeze(fragments);
}

function resolveRule<Context>(
  base: NarrationNodeRule<Context>,
  override: NarrationNodeRuleOverrides<Context> | undefined,
  path: string,
): NarrationNodeRule<Context> {
  if (override === undefined) return base;
  assertDataObject(override, path, RULE_KEYS);
  if (Object.hasOwn(override, "skip") && typeof override.skip !== "boolean") fail(`${path}.skip`, "must be a boolean");
  if (Object.hasOwn(override, "compile") && typeof override.compile !== "function") fail(`${path}.compile`, "must be a function");
  const before = Object.hasOwn(override, "before")
    ? cloneAndValidateNarrationFragments(override.before, `${path}.before`)
    : base.before;
  const after = Object.hasOwn(override, "after")
    ? cloneAndValidateNarrationFragments(override.after, `${path}.after`)
    : base.after;
  const contentStyle = Object.hasOwn(override, "contentStyle")
    ? resolveStyle(base.contentStyle, override.contentStyle, `${path}.contentStyle`)
    : base.contentStyle;
  return deepFreeze({
    skip: override.skip ?? base.skip ?? false,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(contentStyle === undefined ? {} : { contentStyle }),
    ...((override.compile ?? base.compile) === undefined ? {} : { compile: override.compile ?? base.compile }),
  });
}

/** Validate, clone, deeply resolve, and freeze narration overrides. */
export function resolveNarrationConfiguration(
  overrides?: NarrationConfigurationOverrides,
): NarrationConfiguration {
  if (overrides === undefined) return defaultNarrationConfiguration;
  assertDataObject(overrides, "narration", ["document", "headings", "paragraph", "italic", "strong", "link"]);
  if (overrides.headings !== undefined) {
    assertDataObject(overrides.headings, "narration.headings", HEADING_LEVELS.map(String));
  }
  const headings = Object.fromEntries(HEADING_LEVELS.map((level) => [
    level,
    resolveRule(defaultNarrationConfiguration.headings[level], overrides.headings?.[level], `narration.headings.${level}`),
  ])) as unknown as NarrationConfiguration["headings"];
  return deepFreeze({
    document: resolveRule(defaultNarrationConfiguration.document, overrides.document, "narration.document"),
    headings,
    paragraph: resolveRule(defaultNarrationConfiguration.paragraph, overrides.paragraph, "narration.paragraph"),
    italic: resolveRule(defaultNarrationConfiguration.italic, overrides.italic, "narration.italic"),
    strong: resolveRule(defaultNarrationConfiguration.strong, overrides.strong, "narration.strong"),
    link: resolveRule(defaultNarrationConfiguration.link, overrides.link, "narration.link"),
  });
}
