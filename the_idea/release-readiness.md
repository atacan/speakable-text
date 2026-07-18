# Version 1 release-readiness audit

**Audit date:** 2026-07-18
**Normative source:** [`specs.md`](./specs.md), draft v0.2  
**Golden corpus:** [`behavior-contract.md`](./behavior-contract.md)

## Release decision

The implementation satisfies acceptance criteria 1–20. Automated evidence is
supplemented by a successful 22-case run in a real browser and a human review
of the S06 transcript through OpenAI and ElevenLabs text-to-speech systems.
No blocking comprehension issue was reported.

Version 1 behavioral acceptance is complete. Publication metadata and a clean
network-enabled consumer installation remain release-process tasks rather than
specification failures.

## Automated evidence

Run from the repository root:

```sh
npm run check
npm_config_cache=/tmp/speakable-text-npm-cache npm pack --dry-run
```

At this audit, `npm run check` covers:

- strict TypeScript checking;
- 115 unit, golden, recovery, configuration, renderer, documentation, and API tests;
- declaration/ESM build and browser-target bundle build;
- DOM-free worker parser smoke;
- the self-contained classic-script browser smoke bundle in an isolated,
  process-free DOM harness;
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

The exact tarball and its dependencies were installed from the public registry
in credential-sanitized, disposable consumers under Node 20.20.2 and Node
22.23.1. Both runs passed the Node ESM, NodeNext TypeScript, browser-bundler,
browser-condition parity, and export-boundary checks.

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
| 17 | Pass | Server/browser artifact parity and DOM-free worker smoke pass; the project owner confirmed all 22 cases passed in the Codex in-app browser. |
| 18 | Pass | Exact snapshots/golden assertions and three repeated conversions per runtime case are stable. |
| 19 | Pass | Every content fixture plus S06 mechanical order/relationship/delimiter checks; adversarial recovery corpus checks visible markers and balanced boundaries. |
| 20 | Pass | F08/F09/F15 semantic golden tests and S06 mechanical review pass; the project owner reported no blocking issue after listening with OpenAI and ElevenLabs. |

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

## Completed manual sign-offs

### Real browser and extension-relevant runtime

- **Reviewer:** project owner
- **Date:** 2026-07-18
- **Library commit:** `d1e0b7c`
- **Runtime:** Codex in-app browser on macOS; browser version was not exposed
- **Result:** `data-status="passed"`; 22 browser corpus cases passed
- **Scope note:** no extension content-script or service-worker context was
  exercised; run that separately before advertising extension-specific
  compatibility.

### Listening review

- **Reviewer:** project owner
- **Date:** 2026-07-18
- **Library commit and renderer:** `d1e0b7c`, built-in plain-text renderer
- **Systems:** OpenAI and ElevenLabs; specific models/voices were not recorded
- **Blocking comprehension issues:** none reported (“they sounded OK”)
- **Decision:** pass

## Publication status

The package identity, version, MIT license, public README, changelog, exact
tarball consumer checks, CI, and guarded trusted-publishing workflow are now
prepared. The independent release-candidate evidence and remaining maintainer
actions are recorded in [`publication-audit.md`](./publication-audit.md).
