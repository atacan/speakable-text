# speakable-text

[![npm package version](https://img.shields.io/npm/v/speakable-text?label=npm)](https://www.npmjs.com/package/speakable-text)
[![GitHub Actions CI status](https://github.com/atacan/speakable-text/actions/workflows/ci.yml/badge.svg)](https://github.com/atacan/speakable-text/actions/workflows/ci.yml)
[![Node.js 20 or newer](https://img.shields.io/node/v/speakable-text?logo=node.js&logoColor=white)](https://nodejs.org/en/about/previous-releases)
[![MIT license](https://img.shields.io/npm/l/speakable-text)](https://github.com/atacan/speakable-text/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/atacan/speakable-text)

`speakable-text` converts Markdown into deterministic text designed to be read
by a text-to-speech system. It turns headings, lists, tables, links, inline
code, and fenced code into spoken structure instead of passing Markdown and
programming punctuation directly to a voice provider.

The package produces text; it does not synthesize audio or call a TTS service.
It is synchronous, provider-independent, and usable in Node.js, browsers, and
workers.

## Installation

```sh
npm install speakable-text
```

Node.js 20 or newer is required. The package is ESM-only.

## Quick start

```ts
import { convertMarkdown } from "speakable-text";

const markdown = `# Deploy

1. Build
2. Test

Run \`status === "ready"\`.`;

const result = convertMarkdown(markdown);

console.log(result.text);
// Deploy. One. Build. Two. Test. Run status is strictly equal to string ready.

console.log(result.plan.schemaVersion); // 1
console.log(result.diagnostics);
```

`result.plan` retains boundaries, requested pauses, and speaking styles for
renderers that can represent them. `result.text` is the built-in plain-text
rendering. `result.diagnostics` may contain informational notices when that
renderer approximates a pause or cannot represent a style; the spoken content
is still preserved.

## API

All public APIs are exported from `speakable-text`:

- `convertMarkdown(markdown, options?)` compiles and renders in one call. It
  returns `{ plan, text, diagnostics }` and is the usual entry point.
- `compileMarkdown(markdown, options?)` returns a provider-independent
  `{ plan, diagnostics }` without rendering it.
- `renderNarration(plan, renderer?)` validates and renders an existing plan.
  This is useful for rendering one plan in several formats.
- `createPlainTextRenderer()` creates the renderer used by default. It emits
  ordinary text and approximates pauses with punctuation and whitespace.

For example, compilation and rendering can be kept separate:

```ts
import { compileMarkdown, renderNarration } from "speakable-text";

const { plan, diagnostics: compilerDiagnostics } = compileMarkdown("# Hello");
const { text, diagnostics: rendererDiagnostics } = renderNarration(plan);

console.log(text); // Hello
console.log([...compilerDiagnostics, ...rendererDiagnostics]);
```

Narration plans use the JSON-compatible `schemaVersion: 1` wire format. A plan
can be serialized, stored, and later passed to `renderNarration`. Rendering
rejects malformed plans and unsupported schema versions before calling a
custom renderer.

### Custom renderers

A custom `NarrationRenderer` can map pauses, roles, tones, rates, and emphasis
to a target text format. Its `capabilities` describe which semantic features
it can encode, and `render` returns both text and diagnostics. Renderer code is
responsible for escaping any control syntax it introduces; every text-token
value must be treated as spoken content, never trusted markup.

## Supported input

Markdown is parsed as GitHub Flavored Markdown. The built-in compiler handles:

- headings, paragraphs, italic and bold text, and links;
- ordered, unordered, nested, and GFM task lists;
- blockquotes and images with alternative text;
- GFM tables, including recursive Markdown inside cells and empty cells;
- inline code and fenced code blocks; and
- recoverable malformed Markdown and safe visible text inside raw HTML.

Python and TypeScript fenced blocks receive syntax-tree-based narration for
imports, declarations and assignments, functions and calls, types, access,
returns, conditionals, comparisons, boolean expressions, `for` and `while`
loops, basic literals and collections, comments, and common operators.
Recognized fence aliases are `python`, `py`, `python3`, `typescript`, and `ts`.

Unsupported languages use deterministic lexical narration and report
`UNSUPPORTED_CODE_LANGUAGE`. Unsupported constructs in Python or TypeScript
fall back locally—or for the whole block when parsing cannot safely
continue—without silently dropping source content. JavaScript may sometimes
produce useful fallback narration, but it is not a semantically supported
language in version 0.1.

## Configuration

Pass deep overrides under `narration`. Omitted properties retain their
defaults; arrays and callbacks replace their corresponding defaults rather
than merging element by element.

This example shows the main customization mechanisms together:

```ts
import { convertMarkdown } from "speakable-text";

const markdown = "# Status";

const result = convertMarkdown(markdown, {
  narration: {
    headings: {
      1: {
        before: [{ kind: "text", value: "Main title. " }],
      },
    },
    listItem: {
      completedTaskPrefix: [{ kind: "text", value: "Done. " }],
      incompleteTaskPrefix: [{ kind: "text", value: "Pending. " }],
    },
    table: {
      mode: "headers-then-rows",
      repeatColumnHeaders: false,
      emptyCellText: "not provided",
    },
    code: {
      operators: { "===": "exactly matches" },
      block: {
        startAnnouncement: [{ kind: "text", value: "Snippet. " }],
        languageAnnouncement: ({ language }) => [
          { kind: "text", value: `${language ?? "Unknown"} language. ` },
        ],
        endAnnouncement: [{ kind: "text", value: "End snippet." }],
      },
    },
    link: {
      compile: ({ text, destination }) => [
        { kind: "text", value: `${text} at ${destination ?? "unknown destination"}` },
      ],
    },
    image: { skip: true },
  },
});
```

Common node rules support:

- `before` and `after` narration fragments;
- `contentStyle` with semantic `role`, `tone`, `rate`, and `emphasis` values;
- `skip: true`, which omits the node and its complete subtree; and
- a synchronous `compile(context)` callback that replaces the rule's normal
  before/content/style/after behavior.

Callbacks receive frozen, parser-independent context and may return only text
and pause fragments. They are not called for skipped nodes. Keep callbacks
pure and deterministic if you need deterministic output.

Table modes are `header-per-cell` (the default), `headers-then-rows`, and
`cells-only`. Start/end announcements, row numbers, repeated headers, and
empty-cell wording can each be configured. Code configuration also exposes
inline/block rules, block announcements, line-pause duration, comment style,
and the exported `DEFAULT_OPERATOR_PHRASES` phrasebook.

The fully typed defaults are available as `defaultNarrationConfiguration`.
Use `resolveNarrationConfiguration(overrides)` when you need an immutable,
validated configuration with all defaults filled in.

## Diagnostics and errors

Diagnostics are stable and ordered: compiler diagnostics come first, followed
by renderer diagnostics. Their shape is:

```ts
interface NarrationDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}
```

Malformed or unsupported input is recovered where possible and does not throw
solely because it is incomplete. Diagnostics identify Markdown recovery,
unsupported code languages, code parse recovery, literal fallback, removed
invisible characters, and renderer capability degradation. Check `severity`
rather than treating every diagnostic as a failure.

Invalid configuration throws `TypeError` before Markdown parsing begins.
Invalid narration plans and internal invariant failures may also throw. Source
positions are not included in diagnostics in 0.1.

## Node.js, browsers, and workers

Server applications use the root ESM import shown above. Browser-aware
bundlers resolve the same root import to the package's self-contained browser
build:

```ts
import { convertMarkdown } from "speakable-text";

self.addEventListener("message", (event) => {
  const result = convertMarkdown(String(event.data));
  self.postMessage(result);
});
```

The conversion path does not require a DOM, Node.js built-ins, environment
variables, filesystem access, or asynchronous initialization. The browser
artifact exposes the same public root API and has been exercised with the same
runtime corpus as the server artifact, including a DOM-free worker smoke test.

If you load modules directly in a browser without a bundler, your server or
import map must resolve the bare package specifier. This package does not ship
a global variable or a script-tag CDN URL.

## JavaScriptCore

`dist/jscore/speakable-text.js` is a separate, self-contained build for hosts
that only supply the JavaScript language runtime, such as Apple's
[`JavaScriptCore`](https://developer.apple.com/documentation/javascriptcore)
(for example from a Swift package). It bundles every runtime dependency into
one classic (non-module) script, has no `import`, `export`, or `require`, and
does not reference `window`, `document`, `process`, `Buffer`, `fetch`, or any
other Node/browser global. Evaluating it (`JSContext.evaluateScript(...)`)
installs a single `SpeakableText` global object.

The ordinary TypeScript API is not JSON-safe end to end (it accepts callback
functions and custom renderer objects), so this build exposes a small
JSON-oriented bridge instead of the full API:

- `SpeakableText.convertMarkdownJSON(markdown, optionsJSON?)` — `markdown` is
  a string; `optionsJSON`, if supplied, is a JSON string decoding to a plain
  object matching `ConvertMarkdownOptions` (a `renderer` or narration
  `compile` callback cannot be represented in JSON and is ignored if
  present). It calls the same `convertMarkdown` used elsewhere and returns
  `JSON.stringify` of its `{ plan, text, diagnostics }` result. Malformed JSON
  or invalid configuration throws an ordinary JavaScript exception, which a
  host's `JSContext.exceptionHandler` observes.

This build exists specifically for embedding in a native host. Ordinary
JavaScript/TypeScript consumers should keep using the root import or the
browser build documented above.

## Determinism and security properties

With the same input, package version, configuration, renderer, and parser
versions, built-in behavior produces the same plan, text, and diagnostic
order. Conversion uses no randomness, clock, host locale, LLM, machine-learning
model, network service, or provider SDK.

Raw HTML and JavaScript are never executed. Visible text is recovered from raw
HTML conservatively, while executable and style content is suppressed. The
library does not read credentials or make network requests. Applications and
custom renderers must still escape output for their own destination and treat
untrusted Markdown as untrusted text.

## Limitations and non-goals

Version 0.1 intentionally does not include audio generation, provider API
calls, credential management, text chunking, a CLI, a web server, SSML or
provider-specific renderers, source-to-audio timing, MDX/JSX interpretation,
semantic raw-HTML narration, arbitrary parser plugins, or semantic narration
for languages other than Python and TypeScript.

It also does not yet perform advanced interpretation of math, Mermaid, emoji,
dates, currencies, measurements, unusual URLs, or multilingual pronunciation.
Unsupported visible content is preserved through recovery or literal fallback
where possible rather than interpreted.

## Development

```sh
npm install
npm run check
npm run test:package
```

`npm run check` performs strict TypeScript checking, the Node test suite,
declaration, browser, and JavaScriptCore builds, worker and browser-bundle
smoke tests, server/browser runtime parity checks, and the JavaScriptCore
bundle's shape, host-isolation, functional-parity, and failure-handling
tests (`npm run test:jscore`, `npm run build:jscore`). `npm pack --dry-run`
audits the files that would be published. `npm run test:package` creates the
exact npm tarball, installs it with its dependencies and consumer build tools
into an isolated temporary project, then verifies Node, TypeScript,
browser-bundler, JavaScriptCore-bundle, exports, and published-file behavior.
It requires registry access and never publishes.

Maintainers should follow [RELEASING.md](RELEASING.md) for the registry
bootstrap, trusted-publishing setup, and guarded release process. The release
workflow contains no npm credential or token secret.

## Versioning

The package follows Semantic Versioning. While the version is below 1.0, the
public API is still evolving: breaking API or default-narration changes may be
released in a new minor version, while patches are reserved for compatible
fixes. Snapshot changes to default narration should be reviewed as user-visible
behavior changes. Pin an exact version if transcript stability across upgrades
is critical.

## License

[MIT](LICENSE) © 2026 [atacan](https://github.com/atacan/)
