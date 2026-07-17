# Markdown-to-Speakable-Text Library Specification

**Status:** Draft v0.2
**Target language:** TypeScript
**Primary environments:** Browser and server-side JavaScript runtimes
**Primary use case:** Converting AI-generated Markdown, especially coding-agent output, into natural, deterministic text suitable for text-to-speech systems

---

## Specification language

The words **must** and **will** indicate version 1 requirements. A stated **default** defines required built-in behavior. The words **should**, **may**, **possible**, and **suggested** describe guidance or illustrative examples and are not acceptance requirements.

Unless explicitly described as configurable, version 1 behavior must follow the stated defaults.

---

## 1. Summary

This project is a general-purpose TypeScript library that converts Markdown-formatted text into narration suitable for text-to-speech systems.

AI agents frequently produce responses containing Markdown headings, lists, tables, links, inline code, and fenced code blocks. Passing this content directly to a text-to-speech system often produces poor results because Markdown punctuation and programming-language syntax are not written for spoken delivery.

The library will parse Markdown structurally, interpret supported programming languages semantically, and produce:

1. A structured sequence of provider-independent narration tokens.
2. A rendered speakable-text string generated from those tokens.

The library will not synthesize audio, make network requests, manage credentials, divide content into provider-sized chunks, or depend on any particular text-to-speech service.

Its output may be rendered as plain text, SSML, or provider-specific annotated text through interchangeable renderers.

---

## 2. Product motivation

The primary users are people who consume large amounts of AI-agent output, especially:

* Developers using coding agents.
* Users of agent harnesses such as Codex.
* Professionals using work-related agents.
* People who want to rest their eyes while reviewing generated content.
* Developers building browser extensions, desktop applications, or server-side narration systems.

The desired experience is not merely having Markdown characters pronounced. The result should sound as though a human is reading the content to another human.

For example:

````markdown
## Installation

Run:

```bash
npm install example-package
```
````

The narration should resemble:

> Installation.  
> Run the following command.  
> Code block. Shell command. N P M install example package.  
> End code block.

The precise wording, pauses, and vocal styling will be configurable.

---

## 3. Goals

The first version must:

- Accept a Markdown string.
- Support GitHub Flavored Markdown.
- Produce deterministic output.
- Produce structured narration tokens.
- Render those tokens into a speakable-text string.
- Work without a text-to-speech provider.
- Avoid network requests.
- Work in browsers and server-side JavaScript environments.
- Handle malformed Markdown using best-effort parsing.
- Preserve unsupported visible content through child-text recovery or literal narration rather than silently dropping it.
- Provide a synchronous conversion API.
- Support natural code narration for the required Python and TypeScript constructs defined in section 26.
- Provide basic fallback narration for unsupported programming languages.
- Support configurable narration of headings, emphasis, lists, links, code, tables, images, and other Markdown structures.
- Allow text-to-speech provider behavior to be implemented through renderers.
- Allow users to inspect structured narration tokens before rendering.

Correctness and natural speech take priority over performance optimizations and advanced extensibility.

---

## 4. Non-goals

The first version will not:

- Synthesize or return audio.
- Call text-to-speech APIs.
- Manage API credentials.
- Estimate provider cost, token usage, or request limits.
- Detect or select a text-to-speech provider or model.
- Support multiple speakers, speaker assignment, or dialogue synthesis.
- Infer or return generated-audio duration, timestamps, or word alignment.
- Detect, validate, translate, or return metadata about the input language.
- Provide a command-line interface.
- Provide a web server.
- Provide an end-user application.
- Split output according to provider character limits.
- Synchronize narration with Markdown source positions.
- Preserve source line or column mappings.
- Use large language models.
- Use nondeterministic transformations.
- Generate summaries.
- Generate a table of contents.
- Estimate reading duration.
- Support MDX or JSX.
- Execute embedded HTML or JavaScript.
- Support provider-specific plugins as a formal plugin ecosystem.
- Support arbitrary custom Markdown node types.
- Support custom transformation pipelines.
- Interpret front matter.
- Provide semantic narration for every programming language.
- Normalize every possible date, version number, URL, emoji, unit, or mathematical expression.

These capabilities may be added in later versions without changing the fundamental architecture.

---

## 5. Terminology

### Markdown AST

The syntax tree produced by the Markdown parser.

### Code AST

The syntax tree produced by a programming-language parser for a fenced code block.

### Narration token

A provider-independent instruction representing spoken text, a pause, or vocal presentation metadata.

### Narration plan

An ordered, flat sequence of narration tokens.

A narration plan is not intended to become another general-purpose syntax tree. It is the final, linear representation of how the content should be spoken.

### Speakable text

The final string produced by rendering a narration plan.

Examples include:

- Plain natural-language text.
- SSML.
- Text containing provider-specific style annotations.
- Text containing provider-specific emotional tags.

### Renderer

A deterministic component that converts narration tokens into a string accepted by a target text-to-speech system.

A renderer does not call the provider.

A renderer is sometimes called a provider adapter, but it is not an API client. It only serializes a narration plan into a target text format; it does not select a model, validate request limits, estimate cost, manage credentials, or send requests.

---

## 6. Architectural overview

The processing pipeline will be:

```text
Markdown string
    ↓
Markdown parser
    ↓
GitHub Flavored Markdown AST
    ↓
Markdown narration compiler
    ↓
Code-language parsers where required
    ↓
Flat narration plan
    ↓
Narration renderer
    ↓
Speakable-text string
````

The architecture separates three responsibilities:

### Parsing

Parsing determines what the input structurally represents.

Examples:

* A level-two heading.
* An ordered-list item.
* An image with alternative text.
* A fenced Python code block.
* A Python function declaration.

### Narration compilation

Compilation determines how a structure should be represented as provider-independent narration tokens.

Examples:

* Insert a pause before a heading.
* Apply a heading voice role.
* Introduce a table row.
* Convert a Python equality comparison to “is equal to.”
* Convert `get_user_name` to “get user name.”

### Rendering

Rendering converts provider-independent tokens into the syntax understood by a text-to-speech system.

Examples:

* Convert a pause token to whitespace and punctuation.
* Convert a pause token to an SSML `<break>` element.
* Convert an `excited` tone into provider-specific markup.
* Ignore an unsupported tone while returning a diagnostic.

---

## 7. Important architectural decision: no additional content AST

The library will use the Markdown AST and programming-language ASTs for understanding source content.

It will not create another hierarchical document syntax tree.

It will, however, produce a flat narration plan because a plain string cannot safely represent:

* Pauses.
* Emphasis.
* Voice roles.
* Tone.
* Speaking rate.
* Code context.
* Provider capability degradation.
* Structured inspection before rendering.

A narration plan is therefore a typed output stream rather than a replacement syntax tree.

---

## 8. Core token model

The initial token model should remain small.

```ts
export type NarrationRole =
  | "narrator"
  | "heading"
  | "emphasis"
  | "strong-emphasis"
  | "inline-code"
  | "code"
  | "code-comment"
  | "quotation"
  | "list-item"
  | "table"
  | "table-header"
  | "table-cell"
  | "image"
  | "warning"
  | (string & {});

export type NarrationTone =
  | "neutral"
  | "calm"
  | "serious"
  | "excited"
  | "monotone"
  | "rushed"
  | (string & {});

export type NarrationRate =
  | "very-slow"
  | "slow"
  | "normal"
  | "fast"
  | "very-fast"
  | (string & {});

export type NarrationEmphasis =
  | "reduced"
  | "moderate"
  | "strong"
  | (string & {});

export interface NarrationStyle {
  role?: NarrationRole;
  tone?: NarrationTone;
  rate?: NarrationRate;
  emphasis?: NarrationEmphasis;
}

export interface TextNarrationToken {
  kind: "text";
  value: string;
  style?: NarrationStyle;

  /**
   * Indicates that the text came from content that could not be
   * interpreted semantically and should be preserved carefully.
   */
  literal?: boolean;
}

export interface PauseNarrationToken {
  kind: "pause";

  /**
   * Requested pause length.
   *
   * Renderers may approximate this value if the target format does
   * not support exact pause durations.
   */
  durationMs: number;
}

export interface BoundaryNarrationToken {
  kind: "boundary";
  boundary:
    | "document"
    | "heading"
    | "paragraph"
    | "list"
    | "list-item"
    | "blockquote"
    | "code-block"
    | "table"
    | "table-row"
    | "table-cell";
  phase: "start" | "end";
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export type NarrationFragment =
  | TextNarrationToken
  | PauseNarrationToken;

export type NarrationToken =
  | NarrationFragment
  | BoundaryNarrationToken;

export interface NarrationPlan {
  readonly schemaVersion: 1;
  readonly tokens: readonly NarrationToken[];
}
```

The style types are open string unions rather than runtime enums. Their predefined values represent portable narration semantics and provide editor autocomplete, while users may also provide any custom string for `role`, `tone`, `rate`, or `emphasis`. A renderer may map a custom value, approximate it, or ignore it with a diagnostic while preserving the spoken text.

A narration role describes presentation intent, such as heading or code. It does not identify a speaker or request a separate voice. Version 1 always represents a single narration stream.

`NarrationPlan` is a public, JSON-compatible wire format. It must contain only JSON-serializable data and must not contain parser AST nodes, functions, class instances, or runtime handles. Consumers may serialize it with `JSON.stringify`, store or transmit it, parse it later, and pass it to a compatible renderer. `schemaVersion` identifies the wire-format version independently of the npm package version.

A pause duration is a requested narration hint, not an observed audio duration or timestamp. The library cannot know actual timing because audio generation happens outside the library.

Boundary tokens are not necessarily spoken. They preserve useful semantic context for renderers without requiring another tree.

A plain-text renderer may ignore most boundary tokens. A specialized renderer may use them to alter voice, emotion, spacing, or provider markup.

The compiler alone emits boundary tokens. User configuration and callbacks may emit text and pause fragments but cannot emit boundaries.

### Plan invariants and normalization

Before a narration plan is returned, the compiler must normalize it deterministically:

* Remove empty text tokens.
* Merge adjacent text tokens when their style and `literal` values are identical.
* Collapse adjacent pause tokens with no intervening boundary to the longest requested duration.
* Require pause durations to be finite, non-negative numbers.
* Require numeric boundary metadata values to be finite.
* Emit balanced, properly nested boundary pairs.

Nested styles are merged from outer content to inner content. An inner style overrides only the properties it explicitly defines.

The `literal` property records fallback provenance for inspection. It does not authorize provider markup or change renderer escaping rules.

---

## 9. Diagnostics

Conversion must not fail merely because input is malformed or unsupported.

```ts
export type DiagnosticSeverity = "info" | "warning" | "error";

export interface NarrationDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
}
```

Source positions are intentionally excluded from the first version.

Example diagnostics:

* `MARKDOWN_PARSE_RECOVERY`
* `UNSUPPORTED_MARKDOWN_NODE`
* `UNSUPPORTED_CODE_LANGUAGE`
* `CODE_PARSE_RECOVERY`
* `CODE_LITERAL_FALLBACK`
* `INVISIBLE_CHARACTER_REMOVED`
* `RENDERER_FEATURE_UNSUPPORTED`
* `RENDERER_FEATURE_APPROXIMATED`

Errors should be reserved for situations in which conversion cannot reasonably continue, such as invalid library configuration or an internal invariant failure.

Malformed or unsupported input content must not throw. Invalid configuration must throw a `TypeError` before conversion begins, and an internal invariant failure may throw an `Error`. An `error` diagnostic is reserved for a localized failure from which conversion can continue, such as failure of one code-block compiler.

Diagnostics must be returned in stable traversal order. Renderer diagnostics follow compiler diagnostics. Repeated renderer capability diagnostics should be deduplicated by diagnostic code and feature within one conversion.

---

## 10. Public API

The primary API should return both structured tokens and rendered text.

```ts
export interface ConversionResult {
  readonly plan: NarrationPlan;
  readonly text: string;
  readonly diagnostics: readonly NarrationDiagnostic[];
}

export interface ConvertMarkdownOptions {
  readonly narration?: NarrationConfigurationOverrides;
  readonly renderer?: NarrationRenderer;
}

export function convertMarkdown(
  markdown: string,
  options?: ConvertMarkdownOptions,
): ConversionResult;
```

The default renderer will produce plain speakable text.

`NarrationConfigurationOverrides` is a purpose-built nested override type. Its nested properties are optional, while arrays and callback values replace the corresponding default rather than being merged element by element. A shallow `Partial<NarrationConfiguration>` must not be used for the public API.

An asynchronous convenience API may be added later if a supported parser or integration requires asynchronous initialization. Version 1 does not expose duplicate synchronous and asynchronous entry points.

Lower-level APIs should also be available:

```ts
export function compileMarkdown(
  markdown: string,
  options?: CompileMarkdownOptions,
): NarrationCompilationResult;

export function renderNarration(
  plan: NarrationPlan,
  renderer?: NarrationRenderer,
): NarrationRenderResult;
```

This allows users to:

* Inspect the narration plan.
* Modify their own application behavior based on tokens.
* Render the same plan for multiple providers.
* Test compilation separately from rendering.

---

## 11. Configuration architecture

The recommended configuration model is:

> Declarative typed token templates for common behavior, with optional pure callback overrides for dynamic behavior.

This approach is preferable to only using callbacks because:

* Defaults remain readable.
* Configuration remains type-safe.
* Common changes do not require writing functions.
* Snapshot testing remains straightforward.
* Provider profiles can be shared.
* Advanced behavior remains possible where static templates are insufficient.

It is preferable to only using static templates because structures such as ordered lists, headings, links, and table cells require runtime context.

### Configuration fragments

```ts
export type NarrationTemplateFactory<Context> = (
  context: Readonly<Context>,
) => readonly NarrationFragment[];
```

### General node rule

```ts
export interface NarrationNodeRule<Context> {
  /**
   * Omits the node and its complete subtree from narration.
   * Defaults to false.
   */
  readonly skip?: boolean;
  readonly before?: readonly NarrationFragment[];
  readonly after?: readonly NarrationFragment[];
  readonly contentStyle?: NarrationStyle;

  /**
   * Optional deterministic replacement for before/content/after behavior.
   */
  readonly compile?: NarrationTemplateFactory<Context>;
}
```

Callbacks must:

* Be deterministic.
* Have no required network behavior.
* Return narration fragments.
* Receive immutable context.
* Avoid modifying parser AST nodes.

Asynchronous callbacks are not part of the initial configuration contract. When `skip` is `true`, the compiler omits that node and its complete subtree without invoking its callback. Otherwise, a `compile` callback replaces that rule's `before`, compiled content, `contentStyle`, and `after` behavior; its returned fragments are preserved subject to plan normalization.

Skipping is always opt-in. Every node rule defaults to `skip: false`, and the default profile does not skip supported visible content. Content-preservation guarantees exclude nodes that the user explicitly skips.

---

## 12. Configuration precedence

Configuration will be resolved in this order:

1. Library defaults.
2. A selected built-in narration profile.
3. User-provided configuration overrides.
4. Node-specific callback output.

Front matter and inline narration directives will not affect configuration in version 1.

Input is treated as ordinary Markdown written for visual reading. Directive-like text inside the document has no special authority and cannot change narration configuration.

---

## 13. Default narration philosophy

Version 1's built-in narration language is English. Built-in behavior must not depend on the host environment's locale, and version 1 does not expose a locale option. The library does not detect or emit language metadata; the caller remains responsible for choosing the language and model used during later speech synthesis.

The default profile should sound like a human reading content rather than a screen reader exposing every structural detail.

Therefore, the default behavior should generally:

* Use pauses and speaking styles instead of repeatedly saying “heading level two.”
* Read visible link text without reading its destination.
* Preserve list structure through cadence and item separation.
* Announce code blocks because switching into code is semantically significant.
* Narrate tables more explicitly because table structure is otherwise difficult to understand.
* Narrate image alternative text.
* Avoid speaking raw Markdown punctuation.
* Avoid silently omitting unsupported content.

A more explicit accessibility-oriented profile may be introduced later.

---

## 14. Document behavior

The beginning and ending announcements are configurable.

Defaults:

```ts
document: {
  before: [],
  after: [],
}
```

Users may configure:

```ts
document: {
  before: [
    { kind: "text", value: "Document begins." },
    { kind: "pause", durationMs: 400 },
  ],
  after: [
    { kind: "pause", durationMs: 400 },
    { kind: "text", value: "End of document." },
  ],
}
```

The first version will not produce chapters, reading-time estimates, summaries, or provider-sized chunks.

---

## 15. Heading behavior

Heading rules are configurable by heading level.

Context:

```ts
export interface HeadingNarrationContext {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}
```

Default behavior:

* Do not say “heading” or “heading level.”
* Add a pause before the heading.
* Apply strong emphasis and a heading voice role.
* Add a pause after the heading.
* Use longer pauses for higher-level headings.
* Ignore empty headings.

Default pause values:

| Level | Before |  After |
| ----- | -----: | -----: |
| H1    | 700 ms | 500 ms |
| H2    | 550 ms | 400 ms |
| H3    | 450 ms | 350 ms |
| H4–H6 | 350 ms | 300 ms |

Users may override this with announcements:

```ts
headings: {
  1: {
    before: [
      { kind: "text", value: "Main title." },
      { kind: "pause", durationMs: 250 },
    ],
  },
  2: {
    before: [
      { kind: "text", value: "Section." },
      { kind: "pause", durationMs: 200 },
    ],
  },
}
```

---

## 16. Paragraphs and whitespace

Markdown paragraph boundaries will produce narration boundaries.

Defaults:

* Consecutive text inside a paragraph is normalized into natural spacing.
* Paragraph endings produce a configurable pause.
* Multiple Markdown blank lines do not produce unbounded pauses.
* Markdown formatting characters are not spoken.
* Escaped Markdown punctuation is interpreted as the escaped character.
* Invisible formatting characters are removed and generate a warning.
* Empty nodes are ignored.

Text-level normalization beyond Markdown structure should initially remain conservative.

Advanced handling of version strings, dates, emoji, units, abbreviations, and unusual punctuation is deferred.

---

## 17. Emphasis

Italic and bold content will retain their textual content and receive styles.

Defaults:

```ts
italic: {
  contentStyle: {
    role: "emphasis",
    emphasis: "moderate",
  },
},

strong: {
  contentStyle: {
    role: "strong-emphasis",
    emphasis: "strong",
  },
},
```

Renderers that do not support emphasis must preserve the text.

They may approximate emphasis using punctuation or pauses, but must not omit content.

---

## 18. Links

Default link behavior:

* Read the visible link text.
* Do not read the URL.
* Do not say “link.”
* Treat bare URLs as literal text and apply conservative URL normalization.
* Ignore reference-definition syntax that is not visible content.
* Preserve unresolved link text.

Configurable alternatives may:

* Say “link” before the text.
* Say “link” after the text.
* Include the domain.
* Read the full URL.
* Apply a link-specific voice role.

---

## 19. Lists

The Markdown parser must determine actual ordered-list numbering.

For Markdown such as:

```markdown
1. First
1. Second
1. Third
```

the narration compiler should treat the items as one, two, and three unless the parsed Markdown semantics indicate otherwise.

Default ordered-list behavior:

* Preserve computed item order.
* Introduce each item with an ordinal or number.
* Pause between items.
* Do not announce “list begins” or “list ends” by default.

Default unordered-list behavior:

* Add a short pause before each item.
* Do not pronounce the bullet character.
* Do not say “bullet” by default.

Task-list items should preserve checked and unchecked state where it is available from the GFM parser.

Default wording:

* “Completed item.”
* “Incomplete item.”

This wording must be configurable.

Nested lists should use stronger pauses and may optionally announce nesting depth. Depth announcements are disabled by default.

---

## 20. Blockquotes

Default behavior:

* Preserve all quotation content.
* Apply a quotation role.
* Add a pause before and after the quotation.
* Do not announce “quotation begins” by default.

Explicit start and end announcements must be configurable.

---

## 21. Images

Images will be narrated using their alternative text.

Default behavior:

```text
Image. [alternative text]
```

Rules:

* If alternative text exists, narrate it.
* If the alternative text is empty, produce no spoken output by default.
* The image URL is not narrated.
* Missing alternative text may produce an informational diagnostic.
* No image-analysis service is used.

---

## 22. Tables

Tables are a first-version requirement.

The default table strategy will be row-major narration with column names repeated for each value.

Example:

```markdown
| Name | Status |
|---|---|
| Build | Passing |
| Tests | Failing |
```

Suggested narration:

> Table.
> Columns: Name and Status.
> Row one. Name: Build. Status: Passing.
> Row two. Name: Tests. Status: Failing.
> End table.

This is more verbose than visual reading, but it preserves table relationships for listeners.

Configuration must support at least:

```ts
export type TableNarrationMode =
  | "headers-then-rows"
  | "header-per-cell"
  | "cells-only";

export interface TableNarrationConfiguration {
  readonly skip?: boolean;
  readonly mode: TableNarrationMode;
  readonly announceTableStart: boolean;
  readonly announceTableEnd: boolean;
  readonly announceRowNumbers: boolean;
  readonly repeatColumnHeaders: boolean;
  readonly emptyCellText?: string;
}
```

Default values:

```ts
{
  skip: false,
  mode: "header-per-cell",
  announceTableStart: true,
  announceTableEnd: true,
  announceRowNumbers: true,
  repeatColumnHeaders: true,
  emptyCellText: "empty",
}
```

Markdown contained inside a cell must be narrated recursively.

---

## 23. Code-block behavior

Code blocks will be narrated naturally.

Default code-block behavior:

1. Announce the beginning of the code block.
2. Announce the programming language when known.
3. Parse supported languages into a code AST.
4. Compile the AST into natural narration tokens.
5. Preserve comments, commands, literals, and statements.
6. Fall back to literal narration for unsupported or unparseable constructs.
7. Announce the end of the code block.

Example introduction:

> Code block. Python.

Example conclusion:

> End code block.

The phrases and vocal presentation must be configurable.

---

## 24. Supported programming languages

Version 1 will support semantic narration for:

* Python.
* TypeScript.

JavaScript syntax that is valid within the selected TypeScript parser may also receive useful narration, but JavaScript should not be advertised as fully supported until it has dedicated fixtures and tests.

The parser implementation is internal and must not become part of the public API.

Tree-sitter is an implementation candidate because it supports multiple programming-language grammars. It may be selected only if the chosen packages satisfy the synchronous browser and server runtime requirements in section 37. The architecture must allow the parser implementation to change without breaking public consumers.

---

## 25. Natural code narration

The first version will provide one default code mode:

```ts
type CodeNarrationMode = "natural";
```

Additional modes such as literal, token-by-token, reconstructable, or summary narration are deferred.

Natural narration should prioritize understandable meaning while remaining deterministic.

### Identifier normalization

Identifiers will be split into words.

Examples:

```text
get_user_name    → get user name
getUserName      → get user name
userID           → user I D
HTTPResponse     → H T T P response
_private_value   → private value
```

Initial rules:

* Split snake case on underscores.
* Split kebab-like identifiers on hyphens where syntactically appropriate.
* Split camel case at lower-to-upper transitions.
* Preserve consecutive capital letters as acronym groups.
* Pronounce short acronym groups letter by letter by default.
* Ignore leading privacy underscores unless syntactically meaningful.
* Preserve Python double-underscore methods using deterministic wording such as “dunder init.”

The acronym behavior must later be configurable through a pronunciation dictionary.

### Python defaults

Examples:

```python
def get_user(name: str, age: int) -> User:
```

Suggested narration:

> Define function get user. It takes name of type string and age of type integer. It returns User.

```python
if user_id == expected_id:
```

Suggested narration:

> If user I D is equal to expected I D, then.

```python
for item in items:
```

Suggested narration:

> For each item in items.

```python
return result
```

Suggested narration:

> Return result.

### TypeScript defaults

```ts
function getUser(name: string, age: number): User
```

Suggested narration:

> Define function get user. It takes name of type string and age of type number. It returns User.

```ts
const result = getUser(name, age);
```

Suggested narration:

> Set constant result to the result of calling get user with name and age.

```ts
if (result.status === "active")
```

Suggested narration:

> If result status is strictly equal to the string active, then.

The first implementation does not need to produce the most elegant possible narration for every syntax form. It must produce understandable, deterministic output and preserve content.

---

## 26. Minimum semantic code constructs

Python and TypeScript narrators must initially support natural narration for:

* Imports.
* Variable declarations and assignments.
* Function declarations, parameters, type annotations, and return types.
* Function calls, property access, and return statements.
* Conditional statements, comparisons, and boolean operators.
* `for` and `while` loops.
* Primitive and basic collection literals.
* Comments.
* Common unary and binary expressions covered by the default phrasebook.

Class declarations, exception handling, asynchronous constructs, and other unsupported AST nodes must use literal fallback narration in version 1. Implementations may narrate them semantically, but that behavior is not required for version 1 acceptance.

---

## 27. Default operator phrases

The initial phrasebook must include:

| Operator or construct | Spoken form                 |
| --------------------- | --------------------------- |
| `==`                  | is equal to                 |
| `===`                 | is strictly equal to        |
| `!=`                  | is not equal to             |
| `!==`                 | is not strictly equal to    |
| `<`                   | is less than                |
| `<=`                  | is less than or equal to    |
| `>`                   | is greater than             |
| `>=`                  | is greater than or equal to |
| `&&`                  | and                         |
| `\|\|`                | or                          |
| Python `and`          | and                         |
| Python `or`           | or                          |
| `!` / Python `not`    | not                         |
| `=`                   | set to                      |
| `+=`                  | increase by                 |
| `-=`                  | decrease by                 |
| `+`                   | plus                        |
| `-`                   | minus                       |
| `*`                   | multiplied by               |
| `/`                   | divided by                  |
| `%`                   | modulo                      |
| `??`                  | otherwise use               |
| `?.`                  | optionally access           |

These phrases must be represented in configurable code-narration settings rather than scattered throughout the implementation.

---

## 28. Code comments

Comments must be narrated.

Default behavior:

```python
# Load the current user
```

Becomes:

> Comment. Load the current user.

Comment markers are not spoken.

Documentation comments and docstrings may initially be treated as prose. Full JSDoc, TSDoc, and Python docstring interpretation is deferred.

Commented-out code does not need special detection in version 1.

---

## 29. Unsupported code languages

When a fenced code block uses an unsupported language:

1. Preserve all code content.
2. Normalize identifiers where safely detectable.
3. Replace common operators with spoken phrases.
4. Normalize line boundaries into pauses.
5. Avoid reading every punctuation character unless required for comprehension.
6. Mark the resulting tokens as literal or fallback narration.
7. Return an `UNSUPPORTED_CODE_LANGUAGE` diagnostic.

This fallback must use deterministic lexical scanning rather than relying entirely on a collection of regular-expression replacements.

Regular expressions may be used for small, isolated normalization tasks, but must not serve as the main parser.

---

## 30. Code parsing failure

When Python or TypeScript parsing fails:

1. Emit a `CODE_PARSE_RECOVERY` warning.
2. Narrate successfully parsed portions when safe.
3. Use literal fallback narration for the remaining content.
4. Never silently discard code.
5. Never throw solely because the code is incomplete.

This is important because AI agents frequently generate partial snippets.

---

## 31. Inline code

Inline code will use a lighter version of code narration.

Default behavior:

* Normalize identifiers.
* Replace common operators.
* Apply the `inline-code` voice role.
* Add small pauses around the code.
* Do not announce “code begins” for every inline fragment.

Long or structurally complex inline code may use the language-neutral fallback narrator.

---

## 32. Renderer interface

```ts
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
```

Capability booleans are high-level summaries, not promises that every predefined or custom style value is supported. A renderer must decide support for each encountered semantic value using its own explicit mapping. For example, a renderer may support some tones while approximating or ignoring others. `exactPauses` means the output format can encode the requested pause duration; it does not mean a speech model will honor it exactly or reveal the resulting audio timing.

A renderer must:

* Be deterministic.
* Make no network requests.
* Escape provider control syntax safely.
* Preserve all spoken text.
* Report unsupported or approximated features.
* Avoid exposing API credentials.
* Avoid assuming that its output will immediately be sent to a provider.
* Reject an unsupported narration-plan `schemaVersion` before rendering.

Every `TextNarrationToken.value`, including values originating in user configuration, must be treated as spoken content and escaped for the target format. Provider control syntax may be introduced only by renderer logic, never by passing markup through a text token.

---

## 33. Built-in renderers

The first version should provide a generic plain-text renderer.

### Plain-text renderer

The plain-text renderer will:

* Render text tokens directly.
* Approximate pauses using punctuation and whitespace.
* Preserve role and style boundaries only where a textual approximation is configured.
* Escape or normalize content as necessary.
* Return diagnostics when style information cannot be represented.

Potential later renderers include:

* SSML.
* ElevenLabs-compatible annotated text.
* Provider-specific emotional-tag formats.
* Debug narration format.

Provider formats should be implemented as renderers, not as branches inside the Markdown compiler.

---

## 34. Renderer profiles and provider customization

Providers expose different capabilities. Therefore, the core library will use abstract semantics such as:

* Pause for 400 milliseconds.
* Apply strong emphasis.
* Use a serious tone.
* Use the code voice role.
* Speak at a slower rate.

A renderer decides how these semantics are represented.

For example:

```ts
const renderer = createTaggedTextRenderer({
  pause: ({ durationMs }) => `[pause:${durationMs}]`,
  style: {
    excited: {
      open: "[excited]",
      close: "[/excited]",
    },
    monotone: {
      open: "[monotone]",
      close: "[/monotone]",
    },
  },
});
```

Provider-specific behavior belongs in renderer configuration.

The Markdown and code compilers must not directly output ElevenLabs tags, SSML elements, or another provider’s syntax.

Future official renderer profiles may encode the library's known mappings, limitations, and fallbacks for a specific provider format or model family, including SSML-style markup and provider-specific audio tags. Such a profile must identify its target explicitly. The caller chooses the profile; the library does not inspect or infer which provider or model will receive the result.

Provider knowledge is advisory and versioned because provider capabilities can change. An official renderer must degrade unsupported semantics according to section 35 and must never make a network request, even to discover capabilities.

---

## 35. Unsupported renderer features

A renderer may:

* Represent a feature exactly.
* Approximate a feature.
* Ignore presentation metadata while preserving text.

A renderer must never discard spoken content because a style is unsupported.

Example:

* If exact pauses are unsupported, use punctuation or whitespace.
* If emotional tone is unsupported, preserve the text and emit a diagnostic.
* If voice roles are unsupported, continue with the default voice.

---

## 36. Parser requirements

The Markdown parser must:

* Support GitHub Flavored Markdown.
* Produce a structured AST.
* Recover from malformed content where possible.
* Work without executing embedded content.
* Treat raw HTML as unsupported content in version 1.
* Decode escaped Markdown syntax into its intended textual value.
* Expose list ordering and table structure.
* Identify fenced code languages.
* Operate in browser and server environments or have runtime-compatible implementations.

The parser library should remain an internal dependency.

Users should not be required to understand its AST format.

For unsupported Markdown nodes, the compiler must first narrate recoverable visible child text. If no visible child text exists, it must narrate a textual node value or literal source representation when one is available. Markup delimiters, including raw HTML tags, must not be spoken when visible text can be recovered safely. The compiler must emit an `UNSUPPORTED_MARKDOWN_NODE` diagnostic whenever this fallback is used.

---

## 37. Runtime requirements

The core library must:

* Avoid filesystem assumptions.
* Avoid Node.js-only APIs in conversion logic.
* Avoid network APIs.
* Avoid environment variables.
* Accept strings and return JavaScript objects.
* Be usable inside browser extensions.
* Be usable inside server applications.
* Publish TypeScript declarations.
* Prefer an ESM-first design.
* Be distributed as an npm-compatible library package without a version 1 executable or CLI entry point.

Version 1 parser dependencies must be ready for synchronous use when `convertMarkdown` is called. Parser packages that require asynchronous runtime initialization are not suitable for the version 1 synchronous API unless that initialization is completed entirely during ordinary module loading without a separate public lifecycle.

---

## 38. Determinism

Given the same:

* Input Markdown.
* Library version.
* Configuration.
* Renderer.
* Parser versions.

the library must produce the same narration plan and rendered text.

This guarantee applies to built-in behavior. When users supply callbacks or renderers, determinism is guaranteed only if those components are themselves deterministic.

The implementation must not use:

* Random values.
* Time-dependent behavior.
* Locale-dependent behavior.
* Network services.
* Large language models.
* Machine-learning inference.

---

## 39. Testing strategy

The project should use separate test layers.

### Markdown parsing fixtures

Verify that Markdown constructs are identified correctly.

### Narration-plan snapshots

Verify the exact token sequence generated from each fixture.

### Renderer snapshots

Verify rendered strings independently from parsing.

### Code-language fixtures

Maintain Python and TypeScript examples covering supported syntax.

### Recovery fixtures

Test malformed Markdown and incomplete code.

### End-to-end listening fixtures

Maintain representative agent responses and manually evaluate whether their output sounds natural through multiple text-to-speech systems.

### Required fixture categories

* Headings.
* Paragraphs.
* Emphasis.
* Links.
* Ordered lists.
* Unordered lists.
* Nested lists.
* Task lists.
* Blockquotes.
* Inline code.
* Python code blocks.
* TypeScript code blocks.
* Unsupported code languages.
* Tables.
* Images.
* Malformed Markdown.
* Incomplete code.
* Invisible Unicode characters.

Snapshot changes affecting default narration should be treated as user-visible behavior changes.

---

## 40. Version 1 acceptance criteria

Version 1 is complete when:

1. A Markdown string can be converted synchronously.
2. Conversion returns a typed, normalized narration plan with `schemaVersion: 1` that survives a JSON serialization and parse round trip.
3. Conversion returns plain speakable text.
4. GitHub Flavored Markdown headings, paragraphs, emphasis, links, lists, blockquotes, tables, images, inline code, and code blocks are handled.
5. The required Python constructs in section 26 receive AST-based natural narration.
6. The required TypeScript constructs in section 26 receive AST-based natural narration.
7. Unsupported and unparseable code receives deterministic fallback narration.
8. Unsupported Markdown preserves visible child text or uses literal fallback when text cannot otherwise be recovered.
9. Empty nodes are ignored.
10. Invisible characters are removed with diagnostics.
11. Users can configure before and after fragments and can explicitly skip major Markdown node types, including tables and code blocks.
12. Users can configure heading behavior by level.
13. Users can configure table narration behavior.
14. Users can configure code phrases and code-block announcements.
15. Users can supply a custom renderer.
16. The core library performs no network requests.
17. Browser and server builds pass the same narration fixtures.
18. Output is stable enough for snapshot testing.
19. Representative fixtures demonstrate that visible content is not silently lost unless explicitly skipped by configuration, document order and relationships are preserved, and raw Markdown delimiters are not spoken except during explicit literal fallback.
20. Required semantic code fixtures match documented golden narration expectations, and a manual listening review finds no blocking comprehension issue in the representative end-to-end fixtures.

---

## 41. Deferred features

The following are intentionally deferred:

* Formal plugin architecture.
* User-supplied Markdown node parsers.
* User-supplied programming-language parsers.
* MDX and JSX.
* Semantic narration of raw HTML structure beyond visible-text recovery.
* An asynchronous conversion API and asynchronous parser adapters.
* Front matter configuration.
* Inline author narration directives.
* Full SSML support.
* Built-in provider packages.
* Audio generation.
* Chunking.
* Source-to-audio synchronization.
* Word timestamps.
* Mathematical syntax recognition and narration.
* Mermaid and diagram interpretation.
* Emoji interpretation.
* Advanced URL pronunciation.
* Date, currency, and measurement normalization.
* AI-generated summaries.
* AI-generated code explanations.
* Literal reconstructable code-reading mode.
* Full JavaScript language support.
* Additional programming languages.
* Interactive table navigation.
* Pronunciation dictionaries.
* Multilingual narration.

The public architecture should allow these features to be added without replacing the narration token model.

In version 1, Mermaid fences use unsupported-code fallback and mathematical syntax remains ordinary text. Neither receives semantic interpretation.

---

## 42. Recommended internal module structure

```text
src/
  index.ts

  markdown/
    parse-markdown.ts
    compile-markdown.ts
    markdown-types.ts
    rules/
      heading.ts
      paragraph.ts
      emphasis.ts
      link.ts
      list.ts
      blockquote.ts
      table.ts
      image.ts
      code-block.ts

  code/
    compile-code.ts
    identifier-normalizer.ts
    operator-phrasebook.ts
    fallback-code-narrator.ts

    python/
      parse-python.ts
      narrate-python.ts

    typescript/
      parse-typescript.ts
      narrate-typescript.ts

  narration/
    tokens.ts
    plan.ts
    configuration.ts
    diagnostics.ts

  renderers/
    renderer.ts
    plain-text-renderer.ts

  utilities/
    text-normalization.ts
    invisible-characters.ts
```

This is an internal organization rather than a mandatory public package structure.

---

## 43. Recommended naming

The formal API terminology should use:

* `NarrationToken`
* `NarrationPlan`
* `NarrationRenderer`
* `ConversionResult`
* `speakableText` or `text`

“Speakable text” is useful for explaining the final output, while “narration plan” is more appropriate for the typed intermediate output.

Possible project names include:

* Speakdown
* Narramark
* VocalMark
* Sayable Markdown
* Markdown Narrator
* Speakable Markdown

Package-name availability and trademarks must be checked before selecting a final name.

---

## 44. Example usage

```ts
import {
  convertMarkdown,
  createPlainTextRenderer,
} from "speakable-markdown";

const markdown = `
## User lookup

The function returns the current user.

\`\`\`python
def get_user(user_id: int) -> User:
    if user_id == 0:
        raise ValueError("Invalid user")
    return repository.get_user(user_id)
\`\`\`
`;

const result = convertMarkdown(markdown, {
  renderer: createPlainTextRenderer(),
});

console.log(result.text);
console.log(result.plan.tokens);
console.log(result.diagnostics);
```

Possible output:

```text
User lookup.

The function returns the current user.

Code block. Python.

Define function get user. It takes user I D of type integer. It returns User.

If user I D is equal to zero, then raise value error with the string invalid user.

Return the result of calling repository get user with user I D.

End code block.
```

---

## 45. Core design principle

The central design principle is:

> Parse structure once, compile it into portable narration semantics, and defer text-to-speech provider syntax to the final renderer.

This allows the same Markdown and code narration logic to work with local speech models, paid APIs, browser speech systems, SSML engines, and future providers without coupling the library to any of them.
