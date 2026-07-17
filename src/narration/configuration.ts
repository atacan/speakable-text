import type { NarrationFragment, NarrationStyle } from "./tokens.js";
import {
  DEFAULT_OPERATOR_PHRASES,
  type CodeOperator,
  type OperatorPhrasebook,
} from "../code/operators.js";

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

export interface ListNarrationContext {
  readonly ordered: boolean;
  readonly depth: number;
  readonly itemCount: number;
  readonly start?: number;
  readonly text: string;
}

export interface ListItemNarrationContext {
  readonly ordered: boolean;
  readonly depth: number;
  readonly index: number;
  readonly number?: number;
  readonly checked?: boolean;
  readonly text: string;
}

export interface BlockquoteNarrationContext {
  readonly text: string;
}

export interface ImageNarrationContext {
  readonly alt?: string;
  readonly destination?: string;
  readonly title?: string;
  readonly reference?: string;
}

export interface InlineCodeNarrationContext {
  readonly code: string;
}

export interface CodeBlockNarrationContext {
  readonly code: string;
  readonly language?: string;
  readonly supported: boolean;
}

export interface CodeBlockNarrationConfiguration extends NarrationNodeRule<CodeBlockNarrationContext> {
  readonly startAnnouncement: readonly NarrationFragment[];
  readonly languageAnnouncement: NarrationTemplateFactory<CodeBlockNarrationContext>;
  readonly endAnnouncement: readonly NarrationFragment[];
  readonly commentStyle: NarrationStyle;
  readonly linePauseMs: number;
}

export interface CodeNarrationConfiguration {
  readonly mode: "natural";
  readonly operators: OperatorPhrasebook;
  readonly inline: NarrationNodeRule<InlineCodeNarrationContext>;
  readonly block: CodeBlockNarrationConfiguration;
}

export type TableNarrationMode =
  | "headers-then-rows"
  | "header-per-cell"
  | "cells-only";

export interface TableNarrationContext {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly headers: readonly string[];
  readonly text: string;
}

export interface TableNarrationConfiguration extends NarrationNodeRule<TableNarrationContext> {
  readonly mode: TableNarrationMode;
  readonly announceTableStart: boolean;
  readonly announceTableEnd: boolean;
  readonly announceRowNumbers: boolean;
  readonly repeatColumnHeaders: boolean;
  readonly emptyCellText?: string;
}

export interface ListItemNarrationRule extends NarrationNodeRule<ListItemNarrationContext> {
  readonly itemSeparator: readonly NarrationFragment[];
  readonly nestedItemSeparator: readonly NarrationFragment[];
  readonly orderedPrefix: NarrationTemplateFactory<ListItemNarrationContext>;
  readonly completedTaskPrefix: readonly NarrationFragment[];
  readonly incompleteTaskPrefix: readonly NarrationFragment[];
  readonly nestingPrefix: NarrationTemplateFactory<ListItemNarrationContext>;
}

export type HeadingLevel = HeadingNarrationContext["level"];

export interface NarrationConfiguration {
  readonly document: NarrationNodeRule<DocumentNarrationContext>;
  readonly headings: Readonly<Record<HeadingLevel, NarrationNodeRule<HeadingNarrationContext>>>;
  readonly paragraph: NarrationNodeRule<ParagraphNarrationContext>;
  readonly italic: NarrationNodeRule<EmphasisNarrationContext>;
  readonly strong: NarrationNodeRule<StrongNarrationContext>;
  readonly link: NarrationNodeRule<LinkNarrationContext>;
  readonly orderedList: NarrationNodeRule<ListNarrationContext>;
  readonly unorderedList: NarrationNodeRule<ListNarrationContext>;
  readonly listItem: ListItemNarrationRule;
  readonly blockquote: NarrationNodeRule<BlockquoteNarrationContext>;
  readonly image: NarrationNodeRule<ImageNarrationContext>;
  readonly table: TableNarrationConfiguration;
  readonly code: CodeNarrationConfiguration;
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

export interface ListItemNarrationOverrides extends NarrationNodeRuleOverrides<ListItemNarrationContext> {
  readonly itemSeparator?: readonly NarrationFragment[];
  readonly nestedItemSeparator?: readonly NarrationFragment[];
  readonly orderedPrefix?: NarrationTemplateFactory<ListItemNarrationContext>;
  readonly completedTaskPrefix?: readonly NarrationFragment[];
  readonly incompleteTaskPrefix?: readonly NarrationFragment[];
  readonly nestingPrefix?: NarrationTemplateFactory<ListItemNarrationContext>;
}

export interface TableNarrationOverrides extends NarrationNodeRuleOverrides<TableNarrationContext> {
  readonly mode?: TableNarrationMode;
  readonly announceTableStart?: boolean;
  readonly announceTableEnd?: boolean;
  readonly announceRowNumbers?: boolean;
  readonly repeatColumnHeaders?: boolean;
  readonly emptyCellText?: string;
}

export interface CodeBlockNarrationOverrides extends NarrationNodeRuleOverrides<CodeBlockNarrationContext> {
  readonly startAnnouncement?: readonly NarrationFragment[];
  readonly languageAnnouncement?: NarrationTemplateFactory<CodeBlockNarrationContext>;
  readonly endAnnouncement?: readonly NarrationFragment[];
  readonly commentStyle?: NarrationStyle;
  readonly linePauseMs?: number;
}

export interface CodeNarrationOverrides {
  readonly mode?: "natural";
  readonly operators?: Partial<Record<CodeOperator, string>>;
  readonly inline?: NarrationNodeRuleOverrides<InlineCodeNarrationContext>;
  readonly block?: CodeBlockNarrationOverrides;
}

/** Purpose-built deep overrides. Arrays and callbacks replace default values. */
export interface NarrationConfigurationOverrides {
  readonly document?: NarrationNodeRuleOverrides<DocumentNarrationContext>;
  readonly headings?: HeadingNarrationOverrides;
  readonly paragraph?: NarrationNodeRuleOverrides<ParagraphNarrationContext>;
  readonly italic?: NarrationNodeRuleOverrides<EmphasisNarrationContext>;
  readonly strong?: NarrationNodeRuleOverrides<StrongNarrationContext>;
  readonly link?: NarrationNodeRuleOverrides<LinkNarrationContext>;
  readonly orderedList?: NarrationNodeRuleOverrides<ListNarrationContext>;
  readonly unorderedList?: NarrationNodeRuleOverrides<ListNarrationContext>;
  readonly listItem?: ListItemNarrationOverrides;
  readonly blockquote?: NarrationNodeRuleOverrides<BlockquoteNarrationContext>;
  readonly image?: NarrationNodeRuleOverrides<ImageNarrationContext>;
  readonly table?: TableNarrationOverrides;
  readonly code?: CodeNarrationOverrides;
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
const LIST_ITEM_RULE_KEYS = [
  ...RULE_KEYS,
  "itemSeparator",
  "nestedItemSeparator",
  "orderedPrefix",
  "completedTaskPrefix",
  "incompleteTaskPrefix",
  "nestingPrefix",
] as const;
const TABLE_RULE_KEYS = [
  ...RULE_KEYS,
  "mode",
  "announceTableStart",
  "announceTableEnd",
  "announceRowNumbers",
  "repeatColumnHeaders",
  "emptyCellText",
] as const;
const CODE_KEYS = ["mode", "operators", "inline", "block"] as const;
const CODE_BLOCK_RULE_KEYS = [
  ...RULE_KEYS,
  "startAnnouncement",
  "languageAnnouncement",
  "endAnnouncement",
  "commentStyle",
  "linePauseMs",
] as const;

const SMALL_NUMBERS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
] as const;
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"] as const;

function englishInteger(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 1_000_000) return String(value);
  if (value < 20) return SMALL_NUMBERS[value] ?? String(value);
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)] ?? "";
    const remainder = value % 10;
    return remainder === 0 ? tens : `${tens}-${SMALL_NUMBERS[remainder]}`;
  }
  if (value < 1_000) {
    const remainder = value % 100;
    const hundreds = `${SMALL_NUMBERS[Math.floor(value / 100)]} hundred`;
    return remainder === 0 ? hundreds : `${hundreds} ${englishInteger(remainder).toLowerCase()}`;
  }
  const remainder = value % 1_000;
  const thousands = `${englishInteger(Math.floor(value / 1_000))} thousand`;
  return remainder === 0 ? thousands : `${thousands} ${englishInteger(remainder).toLowerCase()}`;
}

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
    orderedList: { skip: false, before: [], after: [] },
    unorderedList: { skip: false, before: [], after: [] },
    listItem: {
      skip: false,
      before: [],
      after: [],
      contentStyle: { role: "list-item" },
      itemSeparator: [{ kind: "pause", durationMs: 400 }],
      nestedItemSeparator: [{ kind: "pause", durationMs: 550 }],
      orderedPrefix: ({ number }) => [{ kind: "text", value: `${englishInteger(number ?? 1)}. ` }],
      completedTaskPrefix: [{ kind: "text", value: "Completed item. " }],
      incompleteTaskPrefix: [{ kind: "text", value: "Incomplete item. " }],
      nestingPrefix: () => [],
    },
    blockquote: {
      skip: false,
      before: [{ kind: "pause", durationMs: 500 }],
      after: [{ kind: "pause", durationMs: 500 }],
      contentStyle: { role: "quotation" },
    },
    image: {
      skip: false,
      before: [{ kind: "text", value: "Image. ", style: { role: "image" } }],
      after: [],
      contentStyle: { role: "image" },
    },
    table: {
      skip: false,
      before: [],
      after: [],
      contentStyle: { role: "table" },
      mode: "header-per-cell",
      announceTableStart: true,
      announceTableEnd: true,
      announceRowNumbers: true,
      repeatColumnHeaders: true,
      emptyCellText: "empty",
    },
    code: {
      mode: "natural",
      operators: DEFAULT_OPERATOR_PHRASES,
      inline: {
        skip: false,
        before: [{ kind: "pause", durationMs: 150 }],
        after: [{ kind: "pause", durationMs: 150 }],
        contentStyle: { role: "inline-code" },
      },
      block: {
        skip: false,
        before: [],
        after: [],
        contentStyle: { role: "code" },
        startAnnouncement: [{ kind: "text", value: "Code block. " }],
        languageAnnouncement: ({ language }) => language === undefined ? [] : [{
          kind: "text",
          value: `${language}. `,
        }],
        endAnnouncement: [{ kind: "text", value: "End code block." }],
        commentStyle: { role: "code-comment" },
        linePauseMs: 400,
      },
    },
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

function resolveListItemRule(
  base: ListItemNarrationRule,
  override: ListItemNarrationOverrides | undefined,
): ListItemNarrationRule {
  if (override === undefined) return base;
  assertDataObject(override, "narration.listItem", LIST_ITEM_RULE_KEYS);
  const commonOverride: NarrationNodeRuleOverrides<ListItemNarrationContext> = Object.fromEntries(
    RULE_KEYS.flatMap((key) => Object.hasOwn(override, key) ? [[key, override[key]]] : []),
  );
  const common = resolveRule(base, commonOverride, "narration.listItem");
  for (const key of ["orderedPrefix", "nestingPrefix"] as const) {
    if (Object.hasOwn(override, key) && typeof override[key] !== "function") {
      fail(`narration.listItem.${key}`, "must be a function");
    }
  }
  const fragments = <Key extends "itemSeparator" | "nestedItemSeparator" | "completedTaskPrefix" | "incompleteTaskPrefix">(
    key: Key,
  ): ListItemNarrationRule[Key] => Object.hasOwn(override, key)
    ? cloneAndValidateNarrationFragments(override[key], `narration.listItem.${key}`)
    : base[key];
  return deepFreeze({
    ...common,
    itemSeparator: fragments("itemSeparator"),
    nestedItemSeparator: fragments("nestedItemSeparator"),
    orderedPrefix: override.orderedPrefix ?? base.orderedPrefix,
    completedTaskPrefix: fragments("completedTaskPrefix"),
    incompleteTaskPrefix: fragments("incompleteTaskPrefix"),
    nestingPrefix: override.nestingPrefix ?? base.nestingPrefix,
  });
}

function resolveTableRule(
  base: TableNarrationConfiguration,
  override: TableNarrationOverrides | undefined,
): TableNarrationConfiguration {
  if (override === undefined) return base;
  assertDataObject(override, "narration.table", TABLE_RULE_KEYS);
  const commonOverride: NarrationNodeRuleOverrides<TableNarrationContext> = Object.fromEntries(
    RULE_KEYS.flatMap((key) => Object.hasOwn(override, key) ? [[key, override[key]]] : []),
  );
  const common = resolveRule(base, commonOverride, "narration.table");
  const modes: readonly TableNarrationMode[] = ["headers-then-rows", "header-per-cell", "cells-only"];
  if (Object.hasOwn(override, "mode") && !modes.includes(override.mode as TableNarrationMode)) {
    fail("narration.table.mode", "must be headers-then-rows, header-per-cell, or cells-only");
  }
  for (const key of [
    "announceTableStart", "announceTableEnd", "announceRowNumbers", "repeatColumnHeaders",
  ] as const) {
    if (Object.hasOwn(override, key) && typeof override[key] !== "boolean") {
      fail(`narration.table.${key}`, "must be a boolean");
    }
  }
  if (Object.hasOwn(override, "emptyCellText") && typeof override.emptyCellText !== "string") {
    fail("narration.table.emptyCellText", "must be a string");
  }
  return deepFreeze({
    ...common,
    mode: override.mode ?? base.mode,
    announceTableStart: override.announceTableStart ?? base.announceTableStart,
    announceTableEnd: override.announceTableEnd ?? base.announceTableEnd,
    announceRowNumbers: override.announceRowNumbers ?? base.announceRowNumbers,
    repeatColumnHeaders: override.repeatColumnHeaders ?? base.repeatColumnHeaders,
    ...(Object.hasOwn(override, "emptyCellText")
      ? { emptyCellText: override.emptyCellText }
      : base.emptyCellText === undefined ? {} : { emptyCellText: base.emptyCellText }),
  });
}

function resolveCodeConfiguration(
  base: CodeNarrationConfiguration,
  override: CodeNarrationOverrides | undefined,
): CodeNarrationConfiguration {
  if (override === undefined) return base;
  assertDataObject(override, "narration.code", CODE_KEYS);
  if (Object.hasOwn(override, "mode") && override.mode !== "natural") {
    fail("narration.code.mode", "must be natural");
  }
  let operators = base.operators;
  if (override.operators !== undefined) {
    const allowed = Object.keys(DEFAULT_OPERATOR_PHRASES);
    assertDataObject(override.operators, "narration.code.operators", allowed);
    const merged = { ...base.operators };
    for (const [operator, phrase] of Object.entries(override.operators)) {
      if (typeof phrase !== "string") fail(`narration.code.operators.${operator}`, "must be a string");
      merged[operator as CodeOperator] = phrase;
    }
    operators = deepFreeze(merged);
  }
  const inline = resolveRule(base.inline, override.inline, "narration.code.inline");
  const blockOverride = override.block;
  if (blockOverride === undefined) return deepFreeze({ mode: "natural", operators, inline, block: base.block });
  assertDataObject(blockOverride, "narration.code.block", CODE_BLOCK_RULE_KEYS);
  const commonOverride: NarrationNodeRuleOverrides<CodeBlockNarrationContext> = Object.fromEntries(
    RULE_KEYS.flatMap((key) => Object.hasOwn(blockOverride, key) ? [[key, blockOverride[key]]] : []),
  );
  const common = resolveRule(base.block, commonOverride, "narration.code.block");
  if (Object.hasOwn(blockOverride, "languageAnnouncement") && typeof blockOverride.languageAnnouncement !== "function") {
    fail("narration.code.block.languageAnnouncement", "must be a function");
  }
  if (Object.hasOwn(blockOverride, "linePauseMs") && (
    typeof blockOverride.linePauseMs !== "number" || !Number.isFinite(blockOverride.linePauseMs) ||
    blockOverride.linePauseMs < 0 || Object.is(blockOverride.linePauseMs, -0)
  )) fail("narration.code.block.linePauseMs", "must be a finite, non-negative number");
  const startAnnouncement = Object.hasOwn(blockOverride, "startAnnouncement")
    ? cloneAndValidateNarrationFragments(blockOverride.startAnnouncement, "narration.code.block.startAnnouncement")
    : base.block.startAnnouncement;
  const endAnnouncement = Object.hasOwn(blockOverride, "endAnnouncement")
    ? cloneAndValidateNarrationFragments(blockOverride.endAnnouncement, "narration.code.block.endAnnouncement")
    : base.block.endAnnouncement;
  const commentStyle = Object.hasOwn(blockOverride, "commentStyle")
    ? resolveStyle(base.block.commentStyle, blockOverride.commentStyle, "narration.code.block.commentStyle") ?? {}
    : base.block.commentStyle;
  return deepFreeze({
    mode: "natural",
    operators,
    inline,
    block: {
      ...common,
      startAnnouncement,
      languageAnnouncement: blockOverride.languageAnnouncement ?? base.block.languageAnnouncement,
      endAnnouncement,
      commentStyle,
      linePauseMs: blockOverride.linePauseMs ?? base.block.linePauseMs,
    },
  });
}

/** Validate, clone, deeply resolve, and freeze narration overrides. */
export function resolveNarrationConfiguration(
  overrides?: NarrationConfigurationOverrides,
): NarrationConfiguration {
  if (overrides === undefined) return defaultNarrationConfiguration;
  assertDataObject(overrides, "narration", [
    "document", "headings", "paragraph", "italic", "strong", "link", "orderedList", "unorderedList",
    "listItem", "blockquote", "image", "table",
    "code",
  ]);
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
    orderedList: resolveRule(defaultNarrationConfiguration.orderedList, overrides.orderedList, "narration.orderedList"),
    unorderedList: resolveRule(defaultNarrationConfiguration.unorderedList, overrides.unorderedList, "narration.unorderedList"),
    listItem: resolveListItemRule(defaultNarrationConfiguration.listItem, overrides.listItem),
    blockquote: resolveRule(defaultNarrationConfiguration.blockquote, overrides.blockquote, "narration.blockquote"),
    image: resolveRule(defaultNarrationConfiguration.image, overrides.image, "narration.image"),
    table: resolveTableRule(defaultNarrationConfiguration.table, overrides.table),
    code: resolveCodeConfiguration(defaultNarrationConfiguration.code, overrides.code),
  });
}
