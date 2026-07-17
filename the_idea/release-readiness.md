# Version 1 release-readiness audit

**Audit date:** 2026-07-17  
**Normative source:** [`specs.md`](./specs.md), draft v0.2  
**Golden corpus:** [`behavior-contract.md`](./behavior-contract.md)

## Release decision

The implementation satisfies acceptance criteria 1–16 and 18–19 with
automated evidence. Criteria 17 and 20 are only partially satisfied, so the
project must not yet claim full version 1 acceptance:

- The server build and browser-target bundle produce identical results for the
  complete runtime corpus, and the bundle works in a DOM-free worker-like
  runtime. The checked-in real-browser smoke page has not been executed in an
  actual browser or extension context in this environment.
- Python and TypeScript golden narration passes, and S06 passes its mechanical
  preservation review. A human has not listened to S06 through two materially
  different TTS systems.

Those are evidence gates, not known implementation failures.

## Automated evidence

Run from the repository root:

```sh
npm run check
npm_config_cache=/tmp/speakable-text-npm-cache npm pack --dry-run
```

At this audit, `npm run check` covers:

- strict TypeScript checking;
- 112 unit, golden, recovery, configuration, renderer, and API tests;
- declaration/ESM build and browser-target bundle build;
- DOM-free worker parser smoke;
- 22 runtime-corpus cases compared between the server artifact and browser
  artifact, repeated three times with `fetch` replaced by a throwing sentinel.

The runtime corpus includes F01–F15, S06, configuration overrides/skips, all
three table modes, and code-phrase overrides. Static bundle checks reject
Node built-in imports, environment access, network calls, and DOM-based entity
decoding.

### Packed-consumer verification

`npm pack` produced an npm tarball containing the root declarations, server
ESM entry, and bundled browser entry. A clean temporary consumer extracted
that tarball, resolved the exact already-installed lockfile dependencies, and
successfully:

1. type-checked imports of the public result, configuration, and renderer
   types under `moduleResolution: "NodeNext"`;
2. imported and used the root package API in Node;
3. imported the package with Node's `browser` condition and received the same
   conversion result;
4. called `convertMarkdown`, `compileMarkdown`, `renderNarration`, and
   `createPlainTextRenderer` from the packed public surface.

A normal clean `npm install` of the tarball could not resolve registry
dependencies because this environment has no registry network access. That
does not affect the packed-artifact checks above, but a publication candidate
should still be installed once in a network-enabled disposable project.

## Acceptance traceability

| # | Status | Evidence |
|---:|:---:|---|
| 1 | Pass | Synchronous parser adapters and S01 in `api-acceptance.test.ts`; no async conversion export. |
| 2 | Pass | `narration-plan.test.ts`, `public-api.test.ts`, and S01 cover normalization, schema 1, runtime validation, and JSON round trips. |
| 3 | Pass | Plain renderer snapshots plus every F fixture's transcript assertions. |
| 4 | Pass | F01–F07, F12, and F14 tests cover the required GFM structures; parser adapter tests cover GFM parsing. |
| 5 | Pass | F08/F15 and supplemental Python construct fixtures use the Lezer CST narrator without literal fallback for required constructs. |
| 6 | Pass | F09/F15, supplemental TypeScript fixtures, and classic/for-of loop tests use the Lezer CST narrator without literal fallback for required constructs. |
| 7 | Pass | F10/F11, malformed TypeScript, and lexical-scanner tests cover deterministic marked fallback and diagnostic order. |
| 8 | Pass | F12 and custom unsupported-node tests cover child-first recovery, safe raw-HTML recovery, diagnostics, and literal provenance. |
| 9 | Pass | F07/F14 and empty-document tests cover empty alt, empty heading, and empty token removal. |
| 10 | Pass | F13/invisible-run tests verify removal, repaired spacing, and stable warnings. |
| 11 | Pass | S02 and configuration tests exercise before/after/skip for every public major-node rule and callback suppression. |
| 12 | Pass | H1–H6 exact pause/style tests and independent level overrides. |
| 13 | Pass | F06/S03 exercise all modes, toggles, recursive cell content, empty cells, and skip. |
| 14 | Pass | S03 and code tests cover phrasebook overrides and start/language/end announcements. |
| 15 | Pass | S04 covers a custom renderer, escaping, capability degradation, diagnostic ordering/deduplication, and schema rejection. |
| 16 | Pass | Source/static-bundle audit plus throwing-`fetch` parity execution; conversion imports no I/O or network API. |
| 17 | Partial | Server/browser artifact parity and DOM-free worker smoke pass. Real browser/extension execution remains unsigned. |
| 18 | Pass | Exact snapshots/golden assertions and three repeated conversions per runtime case are stable. |
| 19 | Pass | Every content fixture plus S06 mechanical order/relationship/delimiter checks; adversarial recovery corpus checks visible markers and balanced boundaries. |
| 20 | Partial | F08/F09/F15 semantic golden tests and S06 mechanical transcript review pass. Two-system human listening is unsigned. |

## Requirement-family audit

The public implementation remains within the specified architecture:

- Parsing, compilation, and rendering are separate. Markdown uses synchronous
  remark/GFM parsing; Python and TypeScript use synchronous Lezer adapters.
  Parser trees and source intervals remain internal.
- The output is one flat, JSON-compatible narration plan. Boundaries are
  compiler-owned, callbacks can return only fragments, and invalid plans or
  configuration fail before unsafe data reaches a renderer.
- Diagnostics are stable and compiler diagnostics precede renderer
  diagnostics. Malformed/unsupported content uses localized or whole-block
  recovery without throwing or silently dropping visible content.
- Configuration is a purpose-built deep override model. Arrays/callbacks
  replace defaults, callbacks receive frozen AST-free contexts, skip owns the
  complete subtree, and outer-to-inner styles merge predictably.
- The operator phrasebook is centralized and configurable. Required Python
  and TypeScript constructs are syntax-tree narrated; unsupported languages
  use the stateful lexical scanner.
- The package is ESM-first, publishes declarations, has no executable entry,
  and exposes the same root API through its browser condition.

## Explicit non-goal audit

No public API, package entry, or conversion path implements the v1 non-goals:

| Area | Confirmed absent |
|---|---|
| Provider/audio | Audio synthesis or return values; TTS API calls; credentials; provider/model selection; cost/limit estimation; provider-sized chunking; formal provider plugin ecosystem. |
| Speech metadata | Multiple speakers; speaker assignment; generated-audio duration; timestamps; alignment; input-language detection/validation/translation/metadata. |
| Applications and I/O | CLI/executable; web server; end-user app; filesystem assumptions; environment variables; network I/O. |
| Source augmentation | Source line/column mappings; source-to-audio synchronization; front-matter interpretation; inline narration directives; TOC, summary, reading-time estimate, or other generated editorial content. |
| Unsupported syntax/extensibility | MDX/JSX interpretation; embedded HTML/JavaScript execution; arbitrary custom Markdown parsers; custom transformation pipelines; semantic narration for every programming language. |
| Advanced normalization | Exhaustive date/version/URL/emoji/unit/math normalization; Mermaid and math remain ordinary/unsupported fallback content as specified. |
| Nondeterminism | LLMs, machine-learning inference, randomness, time, host locale, and network-derived behavior. |

## S06 mechanical transcript review

The representative response contains F01, F02, F06, F08, F09, F10, and F12
in that order. Automated review confirms:

- visible fixture markers occur once and in source order;
- nested list, table header/value, and code control-flow relationships remain
  explicit;
- supported code remains semantic and Ruby remains inspectably literal;
- raw Markdown/HTML delimiters are absent outside literal fallback;
- boundaries are balanced and no error diagnostic occurs.

This audit found and fixed two plain-renderer hazards before sign-off:

- structural blocks could run together (`teamTable`, `table.Code`);
- an inline-code trailing pause before a source period could render as `, .`.

After the fix, structural transitions are sentence-separated and source
punctuation wins over an adjacent approximated pause. Remaining editorial
risks to listen for are the intentionally verbose table, the phrase “optionally
access,” and punctuation cadence in lexical fallback. Mechanical inspection
cannot establish how two speech engines realize those phrases.

## Required manual sign-offs

### Real browser and extension-relevant runtime

Serve the repository after `npm run check`, open
`tests/browser-smoke.html` in a supported real browser, and record:

- browser/version and operating system;
- `data-status="passed"` and the reported corpus count;
- the actual extension context (content script, service worker, or both) if
  the release advertises it.

### Listening review

Listen to S06 through the plain-text renderer in two materially different TTS
systems and record:

- reviewer and date;
- library commit and renderer;
- TTS system/model A and B;
- any blocking comprehension issue, with the source phrase;
- final decision: **pass only when neither system has a blocking issue**.

Do not replace this gate with transcript inspection or claim it passed without
hearing the audio.

## Publication-only checklist

Before an npm release, separately choose a non-placeholder version, confirm
the final package name, add/confirm license and user-facing README metadata,
install the tarball in a network-enabled disposable consumer, and run the
browser and listening sign-offs above. These publication choices do not change
the conversion architecture or current behavioral evidence.
