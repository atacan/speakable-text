# Parser and runtime architecture decisions

**Status:** Proposed for specification v0.2

**Decision date:** 2026-07-17

**Scope:** Markdown, Python, and TypeScript parsing only. This is not an
implementation plan.

## Decision summary

Use an ESM-first, pure-JavaScript parsing stack that is fully constructed by
ordinary module evaluation and is ready when the synchronous public API is
called:

| Input | Selected parser | Parser output |
| --- | --- | --- |
| Markdown/GFM | `unified` + `remark-parse` + `remark-gfm` | mdast |
| Python | `@lezer/python` | Lezer concrete syntax tree |
| TypeScript | `@lezer/javascript`, configured with `dialect: "ts"` | Lezer concrete syntax tree |

The package versions used in the disposable feasibility spike were
`unified@11.0.5`, `remark-parse@11.0.0`, `remark-gfm@4.0.1`,
`@lezer/python@1.1.19`, `@lezer/javascript@1.5.4`,
`@lezer/common@1.5.2`, and `@lezer/lr@1.4.10`. These are verified experiment
versions, not a perpetual instruction to install `latest`. The implementation
milestone should pin exact versions in its lockfile and rerun the parser
contract before upgrading them.

This selection satisfies the v1 synchronous lifecycle without a preload API,
filesystem access, network access, a WASM asset, or a native binary. Both Lezer
grammars export an already-built `LRParser`; parsing is a normal synchronous
function call.

Lezer produces a compact CST rather than a conventional semantic AST. That is
acceptable for the syntactic narration required by section 26: the verified
trees distinguish declarations, assignments, calls, member/index access,
types, expressions, loops, conditionals, imports, returns, literals, and
comments. The code compilers must remain behind parser adapters so a later
parser change does not affect the public API.

## Why this stack

### Markdown: remark/mdast with the GFM plugin

Construct one frozen parser during module evaluation:

```ts
const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)

function parseMarkdown(source: string): MdastRoot {
  return markdownProcessor.parse(source)
}
```

`processor.parse` is synchronous. Do not call `process`, add an async
transformer, stringify Markdown, or convert it to HTML. The compiler should
walk mdast directly.

The official remark documentation describes `remark-parse` as the Markdown to
syntax-tree plugin, and `remark-gfm` supplies autolinks, strikethrough, tables,
and task lists. The packages are ESM, ship TypeScript declarations, declare
their exports, and are marked side-effect free. See the official
[`remark-parse` documentation](https://github.com/remarkjs/remark/blob/main/packages/remark-parse/readme.md),
[`remark-gfm` documentation](https://github.com/remarkjs/remark-gfm/blob/main/readme.md),
[`unified` API](https://unifiedjs.com/explore/package/unified/), and
[`mdast` node specification](https://github.com/syntax-tree/mdast).

The spike verified the contract-relevant shapes:

- headings, paragraphs, emphasis, links, images, blockquotes, lists, inline
  code, and fenced code are structured mdast nodes;
- GFM tables contain recursive row/cell children, including emphasis inside a
  cell;
- task-list items expose `checked: true | false`;
- an ordered list exposes its starting number; the compiler computes each
  item's value as `start + itemIndex` rather than trusting the written marker;
- a fence info string whose first word is `ts` and whose remaining text is
  `extra words` yields `lang: "ts"`, `meta: "extra words"`, and a code value
  without the fence;
- inline raw HTML tags are `html` nodes while text between them remains normal
  visible text nodes;
- unresolved references and dangling emphasis are preserved as text rather
  than lost or thrown away.

Remark/micromark follows CommonMark's best-effort interpretation: much
"malformed Markdown" is valid literal text and does not produce a parse-error
object. Consequently `MARKDOWN_PARSE_RECOVERY` must not be tied to a parser
diagnostic that does not exist. Emit it only when the compiler itself applies a
documented recovery transformation, such as conservatively removing an
unmatched formatting delimiter while preserving its visible text. Raw HTML
uses `UNSUPPORTED_MARKDOWN_NODE`, independently of that recovery diagnostic.

F12 exposes an important compiler responsibility. The parser returns
`[unresolved reference][missing]` and `**unfinished emphasis` as literal text.
The contract expects the listener to hear `unresolved reference` and
`unfinished emphasis`. A small, deterministic Markdown-recovery routine must
handle those known forms from source text. General regex stripping of Markdown
is unsafe and must not be used.

Raw HTML remains unsupported. For inline tags, suppress the tag-only `html`
node, preserve surrounding mdast text, and emit `UNSUPPORTED_MARKDOWN_NODE`.
For a raw HTML node containing character data, use a non-executing lexical tag
scanner to recover character data and entity text; do not create DOM elements,
run scripts, or pass the input through `innerHTML`. If that scanner cannot
confidently distinguish visible content, use marked literal fallback rather
than dropping the node.

Do not enable front matter, MDX, math, directives, or raw-HTML-to-HAST plugins
in v1. That keeps the accepted language aligned with the specification.

### Python: `@lezer/python`

`@lezer/python` is a generated, pure-JavaScript LR grammar. Its exported
`parser.parse(source)` is immediately synchronous. Lezer's official guide says
that parser tables are generated offline and that error recovery is enabled by
default; ignored or skipped material appears under error nodes. See the
[`@lezer/python` source](https://code.haverbeke.berlin/lezer/python) and
[`Lezer system guide`](https://lezer.codemirror.net/docs/guide/).

The spike parsed F08 with zero error nodes. Its CST represented the import,
comment, annotated assignment, typed function and parameters, list/string
literals, `for`, `while`, `if`, boolean/unary/comparison expressions,
assignment/update, property/call access, and return. Named `Comment` tokens are
retained in the tree even though comments are syntactic skip tokens.

F11-like incomplete Python returned a tree synchronously with explicit `⚠`
error nodes and retained `result`, `get_user`, the comparison, and return
source. Recovery can reshape a larger ancestor than the exact error range, so
semantic narration must not blindly trust every non-error descendant.

### TypeScript: `@lezer/javascript` with the `ts` dialect

Configure one parser during module evaluation and reuse it:

```ts
const typescriptParser = javascriptParser.configure({dialect: "ts"})
```

The grammar's official README states that it parses modern JavaScript and has
a `ts` dialect for TypeScript. See the
[`@lezer/javascript` source](https://code.haverbeke.berlin/lezer/javascript)
and the official [Lezer guide](https://lezer.codemirror.net/docs/guide/).

The spike parsed F09 with zero error nodes. It distinguished the import,
`LineComment`, typed declarations, function parameters/return type, arrays,
calls, indexing, ordinary and optional member access, binary/logical/strict
comparison operators, `while`, `if`, `for...of`, update assignment, and
returns. An incomplete TypeScript sample also returned synchronously with
explicit error nodes while retaining later structures.

JavaScript is deliberately not routed to semantic TypeScript narration in v1,
even though the grammar can parse it. `js`, `javascript`, `jsx`, and `tsx`
therefore use the unsupported-language fallback until they have their own
advertised behavior and fixtures.

## Language-tag policy

The Markdown adapter owns a closed, deterministic alias table. Normalize only
by trimming and ASCII-lowercasing the mdast `lang` value:

| Fence tag | Route | Canonical announcement |
| --- | --- | --- |
| `python`, `py`, `python3` | Python adapter | `Python` |
| `typescript`, `ts` | TypeScript adapter | `TypeScript` |
| missing, blank, or anything else | lexical fallback | sanitized tag, or no language announcement |

Metadata after the first fence-info word is not part of the language tag and
must not influence routing. Do not infer a language from code contents, a file
name in surrounding prose, the host environment, or locale. Unknown tags are
spoken only as escaped content and produce `UNSUPPORTED_CODE_LANGUAGE`.

The `python3` alias is an adapter policy, not parser behavior; the other aliases
and the separation of `lang`/`meta` were directly exercised. Add the alias table
as an exact test so it cannot expand accidentally.

## Parser adapter boundaries

Parser-owned types and runtime objects must never enter `NarrationPlan`, public
configuration contexts, diagnostics, or renderer APIs.

Use three internal boundaries:

```ts
interface MarkdownParserAdapter {
  parse(source: string): MdastRoot
}

interface CodeParserAdapter<Tree> {
  readonly canonicalLanguage: "python" | "typescript"
  parse(source: string): CodeParseResult<Tree>
}

interface CodeParseResult<Tree> {
  readonly tree: Tree
  readonly recoveryRegions: readonly SourceInterval[]
}
```

`SourceInterval` is internal parsing bookkeeping, not source mapping in the
public narration plan. It allows safe ownership of recovered text without
violating the specification's prohibition on public source positions.

The Markdown compiler may know mdast node types, but all Lezer operations
should be concentrated in `code/python/parse-python.ts` and
`code/typescript/parse-typescript.ts`. Language narrators should use small
adapter helpers for node kind, child lookup, and exact source slicing rather
than importing Lezer throughout the project. Do not copy the CST into a second
hierarchical content AST. Walk it and emit narration fragments directly.

For malformed code:

1. Find every Lezer error node.
2. Expand it to the nearest enclosing statement/declaration that may have been
   structurally distorted by recovery.
3. Merge overlapping intervals deterministically.
4. Narrate complete, non-overlapping top-level constructs semantically.
5. Send each recovery interval through the lexical fallback exactly once.
6. Audit interval ownership so every non-whitespace source range belongs to a
   semantic node, a comment, or fallback; never narrate the same range twice.

If safe partitioning cannot be proven for a block, treat the complete block as
one fallback interval. This is less elegant but preserves the contract.
Always emit `CODE_PARSE_RECOVERY` first and `CODE_LITERAL_FALLBACK` second when
fallback is used.

## Initialization and runtime implications

- Parser construction happens during ordinary ESM module evaluation and is
  synchronous. There is no public `initialize`, `ready`, or async conversion
  API.
- Conversion uses only input strings and in-memory parser tables. It performs
  no I/O and needs no filesystem path, environment variable, worker, native
  add-on, or `.wasm` asset.
- Reuse immutable/frozen parser instances. Do not put parser trees or cursors
  into returned values. Let per-conversion trees become collectible after the
  narration plan is produced.
- Publish ESM and declarations. If a CommonJS compatibility build is later
  desired, it is a packaging decision; it must call the same synchronous
  adapters and pass the same fixtures.
- The selected stack bundled with `esbuild@0.28.1` using
  `--bundle --format=esm --platform=browser`. A minified bundle containing the
  Markdown parser and both Lezer grammars was 277,839 bytes (94,402 bytes with
  gzip) in the disposable spike. These measurements are evidence of bundler
  viability, not a package-size budget.
- Direct ESM execution and synchronous parsing were verified in Node.js
  v26.4.0. A real browser was unavailable, so actual browser execution is **not
  experimentally verified**. Before implementation proceeds past the walking
  skeleton, run the same smoke fixture in at least one real browser and one
  extension-relevant context.
- The browser-target bundle selected a browser implementation of named HTML
  entity decoding that expects `document`. This should work in a normal web
  page/content script but may not work in a Web Worker or extension service
  worker. Worker/service-worker support is **unverified** and must be treated as
  a release risk, not assumed from bundling success. If those contexts are in
  the supported browser matrix, configure or replace that dependency path and
  add a worker smoke test.

## Rejected alternatives

### `web-tree-sitter` plus Python and TypeScript WASM grammars

Reject for v1. The official setup requires `Parser.init()` to complete before
constructing a parser, and ordinary `Language.load(...)` is awaited. It also
requires distributing and locating the core WASM plus language WASM assets in
browser builds. The current documentation does offer `Language.loadSync` when
the host already supplies a precompiled `WebAssembly.Module`, but the core
`Parser.init()` lifecycle remains asynchronous and host-specific. That does not
satisfy a synchronous `convertMarkdown` that is ready after ordinary module
loading without a public lifecycle.

See the official
[`web-tree-sitter` setup and browser notes](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md).
The spike inspected `web-tree-sitter@0.26.11`: its declaration gives
`Parser.init(...): Promise<void>`, its implementation rejects parser
construction before initialization, and its normal language loader is async.

### Native `tree-sitter` Node binding

Reject because it depends on a native binding and language native add-ons. It
can be synchronous and fast in Node, but it is not the same runtime artifact in
browsers and would create two parser implementations whose trees and recovery
could diverge. The official Tree-sitter documentation describes the JavaScript
binding as a Node binding and generated Node grammars as C/C++ native bindings.

### TypeScript compiler API

Reject for v1 parsing. TypeScript 5.9.3's `createSourceFile` was synchronously
capable and produced useful parse diagnostics in the spike, but its
browser-target parser bundle alone was 3,561,674 bytes minified (1,022,811
bytes with gzip), versus 277,839/94,402 bytes for Markdown plus both selected
Lezer grammars. More importantly, the currently verified `typescript@7.0.2`
root export no longer exposes the historic `createSourceFile` compiler API;
the new APIs are under `unstable` entry points and include host/platform
machinery. Selecting an old major merely for its internal AST would introduce
a large, version-sensitive runtime dependency when type checking is not needed.

The compiler API would be worth reconsidering if v2 requires semantic type
resolution, but v1 narration is intentionally syntax based.

### `@typescript-eslint/typescript-estree`

Reject because it layers another AST and compatibility surface on the
TypeScript compiler, retains the compiler's weight/version concerns, and is
primarily designed for ESLint/ESTree consumers. V1 does not need ESTree.
This alternative was not experimentally installed or bundled.

### Regex-based parsing

Reject for all three languages. Regex may perform isolated normalization, but
cannot preserve nested Markdown, expression precedence, comments, strings,
or recovery boundaries reliably. It remains appropriate only inside the
specified language-neutral lexical fallback scanner for small token classes.

## Verification matrix

| Contract evidence | Markdown | Python | TypeScript | Result |
| --- | --- | --- | --- | --- |
| F01–F07 structural surface | mdast + GFM nodes | n/a | n/a | Parser shapes verified with representative heading, task-list, table, emphasis, and fence inputs; not every fixture replayed end to end |
| F08 complete semantic surface | code fence gives `lang`/value | Lezer CST | n/a | Zero error nodes; all required construct families and comment present |
| F09 complete semantic surface | code fence route | n/a | Lezer `ts` CST | Zero error nodes; all required construct families and line comment present |
| F10 unsupported Ruby | code fence retained | n/a | n/a | Routing policy selected; lexical narration not part of this spike |
| F11 incomplete Python | fence/content retained | explicit recovery nodes | n/a | No throw; recoverable source retained; recovery-interval algorithm still to implement |
| F12 malformed Markdown/raw HTML | visible text and raw-tag nodes retained | n/a | n/a | No throw; delimiters remain literal and require compiler recovery |
| F14 empty heading/prose | CommonMark parsing | n/a | n/a | Empty-heading exact fixture not separately executed; expected mdast behavior remains to verify in contract tests |
| F15 expression/operators | fence/content retained | grammar has grouped unary/binary CST | grammar has grouped unary/binary CST | Required operator families observed across F08/F09 and grammar; full F15 replay still required |
| S01 synchronous API | synchronous `parse` | synchronous `parse` | synchronous `parse` | Verified directly; returned values were not Promises |
| S05 server compatibility | direct ESM execution | direct ESM execution | direct ESM execution | Verified on Node.js v26.4.0 |
| S05 browser bundling | bundled for browser ESM | bundled for browser ESM | bundled for browser ESM | Build succeeded; actual browser and extension/worker runtime remain unverified |

## Remaining risks and required gates

1. Run the selected bundle in real Chrome/Firefox or equivalent, plus the
   actual browser-extension context the project intends to support. Include a
   worker/service-worker test if that is in scope.
2. Turn F01–F15 parser expectations into adapter contract tests before writing
   narration templates. Pin their exact tree-kind expectations only inside the
   adapter tests; narration tests should not expose parser vocabulary.
3. Prototype the recovery-interval ownership algorithm on F11 and adversarial
   truncations. Lezer error nodes prove recovery occurred but do not by
   themselves prove which ancestor is semantically trustworthy.
4. Define and test the narrow Markdown dangling-delimiter recovery required by
   F12. Remark intentionally treats that syntax as text.
5. Verify raw block-HTML visible-text recovery without DOM execution or silent
   loss.
6. Record bundle-size and cold-parse baselines in both browser and server CI.
   Performance is secondary to correctness, but accidental parser duplication
   should be caught.
7. Parser grammar node names are internal but version-sensitive. Upgrade only
   with adapter fixtures and the complete golden corpus passing.

These gates do not change the selected architecture. They are the evidence
needed before claiming full browser/runtime acceptance.
