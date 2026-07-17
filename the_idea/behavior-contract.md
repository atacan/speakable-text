# Version 1 behavioral acceptance contract

**Status:** Initial golden corpus for specification v0.2
**Authority:** [`specs.md`](./specs.md) remains normative. This file turns its
requirements into a compact, reviewable acceptance corpus; it does not add
requirements.

## How to read this contract

Each fixture defines observable behavior at three levels:

- **Speakable transcript** describes the words a listener must receive, in
  order. Text marked **exact** is fixed by a stated specification default.
  Text marked **provisional** uses editorial wording that the specification
  calls suggested, possible, or otherwise leaves open. Provisional wording
  must be approved before it becomes an exact narration snapshot.
- **Plan expectations** describe semantic tokens, styles, boundaries, and
  pauses. A duration is exact only where the specification supplies one.
- **Preservation invariants** are hard requirements even when wording is
  provisional.

Rendered punctuation and whitespace are intentionally not frozen here. The
plain-text renderer must approximate pauses, but the specification does not
yet define one exact punctuation algorithm. Until that is decided, renderer
tests should compare normalized spoken phrases and order, while plan tests
should compare exact token structure and configured durations.

All fixtures use the default profile and plain-text renderer unless stated
otherwise. Every returned plan has `schemaVersion: 1`, contains only
JSON-compatible data, has balanced and properly nested boundaries, and obeys
the normalization rules in section 8 of the specification.

## Golden content fixtures

### F01 — Headings, paragraphs, emphasis, and a link

**Categories:** headings, paragraphs, emphasis, links

**Markdown input**

```markdown
# Release notes

Read the *important* **migration guide** in [the documentation](https://example.test/guide).
```

**Expected speakable transcript**

- **Exact content and order:** “Release notes. Read the important migration
  guide in the documentation.”
- The URL and the words “heading” and “link” are not spoken.
- Punctuation shown between structural units is a provisional plain-text pause
  approximation, not an exact renderer snapshot.

**Plan expectations**

- Balanced document, H1 heading, and paragraph boundaries occur in source
  order.
- H1 requests a 700 ms pause before and 500 ms after, and its text has
  `role: "heading"` and strong emphasis.
- “important” has the default italic style (`role: "emphasis"`, moderate
  emphasis); “migration guide” has the default strong style
  (`role: "strong-emphasis"`, strong emphasis).
- Link text inherits its surrounding content behavior; the destination emits
  no text token.

**Expected diagnostics:** none.

**Preservation invariants:** all visible words occur once and in source order;
Markdown delimiters and the link destination are absent.

---

### F02 — Ordered, unordered, and nested lists

**Categories:** ordered lists, unordered lists, nested lists

**Markdown input**

```markdown
3. Prepare
4. Deploy
   - Watch logs
   - Check health

- Notify the team
```

**Expected speakable transcript**

- **Provisional editorial wording:** “Three. Prepare. Four. Deploy. Watch
  logs. Check health. Notify the team.”
- The computed ordered values must be three and four. Bullet characters,
  “list begins,” “list ends,” and nesting depth are not spoken.

**Plan expectations**

- Balanced list and list-item boundaries preserve nesting and item order.
- Ordered-item metadata preserves computed item numbers; unordered items do
  not acquire spoken bullets.
- Items are separated by pauses, with stronger separation for the nested list.

**Expected diagnostics:** none.

**Preservation invariants:** every item is present once; `Watch logs` and
`Check health` remain children of `Deploy`, and `Notify the team` remains in a
separate top-level list.

---

### F03 — Task-list state

**Category:** task lists

**Markdown input**

```markdown
- [x] Compile
- [ ] Publish
```

**Expected speakable transcript**

- **Exact default state phrases and content:** “Completed item. Compile.
  Incomplete item. Publish.”

**Plan expectations**

- Balanced list/list-item boundaries preserve checked and unchecked metadata.
- The checkbox markup itself produces no spoken punctuation.

**Expected diagnostics:** none.

**Preservation invariants:** state stays paired with the correct item; neither
item text nor state is lost.

---

### F04 — Blockquote

**Category:** blockquotes

**Markdown input**

```markdown
> Keep the rollback ready.
>
> Verify metrics first.
```

**Expected speakable transcript**

- **Exact content and order:** “Keep the rollback ready. Verify metrics
  first.”
- The phrase “quotation begins” is not spoken.

**Plan expectations**

- One balanced blockquote boundary contains both paragraphs.
- Quoted content receives `role: "quotation"`; pauses occur before and after
  the quotation and between its paragraphs.

**Expected diagnostics:** none.

**Preservation invariants:** both paragraphs remain inside the quotation and
the `>` delimiters are not spoken.

---

### F05 — Inline code

**Category:** inline code

**Markdown input**

```markdown
Use `get_user_id != expectedID` before retrying.
```

**Expected speakable transcript**

- **Exact phrasebook/identifier transformation:** “Use get user I D is not
  equal to expected I D before retrying.”
- “code begins” is not spoken.

**Plan expectations**

- The normalized inline-code phrase has `role: "inline-code"` and small pauses
  around it.
- No code-block boundary is emitted.

**Expected diagnostics:** none.

**Preservation invariants:** both identifiers and the inequality relationship
remain audible; backticks and raw `!=` are not spoken.

---

### F06 — Table with recursively narrated cell Markdown

**Category:** tables

**Markdown input**

```markdown
| Name | Status |
| --- | --- |
| Build | **Passing** |
| Tests | |
```

**Expected speakable transcript**

- **Provisional editorial wording:** “Table. Columns: Name and Status. Row
  one. Name: Build. Status: Passing. Row two. Name: Tests. Status: empty. End
  table.”
- **Exact configured/default value:** the empty cell is narrated as “empty.”

**Plan expectations**

- Balanced table, row, and cell boundaries preserve row-major order.
- Default mode is `header-per-cell`; start/end and row numbers are announced,
  and column headers are repeated for values.
- `Passing` retains the default strong-emphasis style while being narrated
  recursively as cell content.

**Expected diagnostics:** none.

**Preservation invariants:** each body value remains associated with its row
and header; empty-cell presence is not erased; pipe and separator syntax is not
spoken.

---

### F07 — Images with and without alternative text

**Category:** images

**Markdown input**

```markdown
![Deployment diagram](https://example.test/deploy.png)

![](https://example.test/decorative.png)
```

**Expected speakable transcript**

- **Exact default wording:** “Image. Deployment diagram.”
- The empty-alt image produces no spoken output. Neither image URL is spoken.

**Plan expectations**

- The narrated image text has `role: "image"`.
- The empty image contributes no empty text token after normalization.

**Expected diagnostics:** an informational missing-alt diagnostic is permitted
but not required by the current specification; no warning/error is expected.

**Preservation invariants:** non-empty alternative text is preserved exactly;
image markup and URLs are absent.

---

### F08 — Python minimum semantic surface

**Category:** Python code blocks

**Markdown input**

````markdown
```python
from users import Repository
# Find active users
limit: int = 2
def get_active(repo: Repository, names: list[str]) -> list[str]:
    results = []
    for name in names:
        user = repo.get_user(name)
        if user.active and not user.deleted:
            results.append(user.name)
    while len(results) < limit:
        results += ["unknown"]
    return results
```
````

**Expected speakable transcript**

The following is **provisional editorial wording**, except that identifier
splitting, the comment prefix “Comment,” and operator phrases are required
defaults:

> Code block. Python. From users import Repository. Comment. Find active
> users. Set limit of type integer to two. Define function get active. It
> takes repo of type Repository and names of type list of string. It returns
> list of string. Set results to an empty list. For each name in names. Set
> user to the result of calling repo get user with name. If user active and
> not user deleted, then. Call results append with user name. While the length
> of results is less than limit. Increase results by a list containing the
> string unknown. Return results. End code block.

**Plan expectations**

- One balanced code-block boundary encloses a start announcement, language
  announcement, AST-derived statements, and end announcement.
- Code text uses the code role; the comment uses `role: "code-comment"`.
- AST-based narration covers import, annotated assignment, function and typed
  parameters/return, empty and string/list literals, `for`, call/property
  access, conditional with boolean/unary operators, `while`, comparison,
  augmented assignment, and return.
- Literal fallback is not used for the required constructs in this fixture.

**Expected diagnostics:** none.

**Preservation invariants:** every statement and literal contributes audible
meaning in source order; loop/conditional nesting and expression relationships
remain comprehensible; raw code punctuation is not read.

---

### F09 — TypeScript minimum semantic surface

**Category:** TypeScript code blocks

**Markdown input**

````markdown
```ts
import { getUser } from "./users";
// Find an active user
const names: string[] = ["Ada", "Lin"];
function findActive(limit: number, enabled: boolean): string {
  let index = 0;
  while (index < limit && enabled) {
    const user = getUser(names[index]);
    if (user?.status === "active" || user.score >= 10) {
      return user.name;
    }
    index += 1;
  }
  for (const name of names) {
    getUser(name);
  }
  return "none";
}
```
````

**Expected speakable transcript**

The following is **provisional editorial wording**, except that identifier
splitting, “Comment,” and the operator phrases are required defaults:

> Code block. TypeScript. Import get user from dot slash users. Comment. Find
> an active user. Set constant names of type array of string to a list
> containing the strings Ada and Lin. Define function find active. It takes
> limit of type number and enabled of type boolean. It returns string. Set
> index to zero. While index is less than limit and enabled. Set constant user
> to the result of calling get user with names at index. If user optionally
> access status is strictly equal to the string active, or user score is
> greater than or equal to ten, then. Return user name. Increase index by one.
> For each name of names. Call get user with name. Return the string none. End
> code block.

**Plan expectations**

- The same code-block structure and roles as F08 apply.
- AST-based narration covers import, typed variable declarations, collection
  and primitive literals, typed function/return, `while`, boolean and binary
  expressions, optional property access, strict comparison, call/index/property
  access, conditional, augmented assignment, `for`, and returns.
- Literal fallback is not used for the required constructs in this fixture.

**Expected diagnostics:** none.

**Preservation invariants:** all declarations, statements, literals, operators,
and control-flow relationships remain audible and ordered; syntax delimiters
are not spoken.

---

### F10 — Unsupported code language

**Category:** unsupported code languages

**Markdown input**

````markdown
```ruby
user_name = get_user(id)
total += price * count
```
````

**Expected speakable transcript**

- **Provisional editorial wording with exact phrase transformations:** “Code
  block. Ruby. user name set to get user, I D. total increase by price
  multiplied by count. End code block.”

**Plan expectations**

- Deterministic lexical fallback preserves both lines and normalizes line
  boundaries into pauses.
- Fallback text tokens have `literal: true`; common identifiers/operators are
  normalized without pretending to have semantic Ruby support.

**Expected diagnostics:** one `UNSUPPORTED_CODE_LANGUAGE` diagnostic in stable
traversal order. A `CODE_LITERAL_FALLBACK` diagnostic is also permitted only
if the implementation uses it consistently and documents that choice.

**Preservation invariants:** both assignments, operands, and their order remain
audible; no line is discarded; fallback is lexical rather than a chain of
whole-language regex replacements.

---

### F11 — Incomplete supported code

**Category:** incomplete code

**Markdown input**

````markdown
```python
result = get_user(
if result != None:
    return result
```
````

**Expected speakable transcript**

- **Provisional editorial wording:** “Code block. Python. Set result to call
  get user. If result is not equal to None, then. Return result. End code
  block.”
- Exact elegance is not required, but all recoverable content must be heard.

**Plan expectations**

- Safely parsed portions may receive semantic narration; unparsed portions
  receive `literal: true` fallback.
- Code-block boundaries remain balanced despite parser recovery.

**Expected diagnostics:** `CODE_PARSE_RECOVERY` warning, followed in stable
order by `CODE_LITERAL_FALLBACK` if literal fallback is used.

**Preservation invariants:** `result`, `get_user`, the `!= None` condition, and
the return are not silently discarded; incomplete code alone never throws.

---

### F12 — Malformed Markdown and unsupported raw HTML

**Categories:** malformed Markdown

**Markdown input**

```markdown
Before <aside><strong>visible warning</strong></aside> after.

[unresolved reference][missing]

**unfinished emphasis
```

**Expected speakable transcript**

- **Exact visible content and order:** “Before visible warning after.
  unresolved reference. unfinished emphasis.”
- Raw HTML tags and Markdown delimiters are not spoken when child text is
  recoverable.

**Plan expectations**

- Visible child text is recovered first; literal source is used only where no
  visible child text/value can otherwise be recovered.
- Any literal fallback token has `literal: true`; all boundaries remain
  balanced.

**Expected diagnostics:** `UNSUPPORTED_MARKDOWN_NODE` for raw-HTML fallback;
`MARKDOWN_PARSE_RECOVERY` only if the selected parser reports/requires recovery
for this input. Diagnostics remain in traversal order.

**Preservation invariants:** visible warning, unresolved-reference text, and
unfinished-emphasis text survive; tag names, URLs, and formatting markers do
not replace safely recoverable text.

---

### F13 — Invisible Unicode cleanup

**Category:** invisible Unicode characters

**Markdown input**

The following code fence intentionally contains an invisible U+200B ZERO WIDTH
SPACE after `Deploy` and U+FEFF ZERO WIDTH NO-BREAK SPACE after `verify`. The
named positions make the otherwise invisible test data reviewable:

```text
Deploy​ now and verify﻿ metrics.
```

**Expected speakable transcript**

- **Exact visible content:** “Deploy now and verify metrics.”

**Plan expectations**

- Invisible formatting characters do not occur in any returned text-token
  value or rendered text.
- Natural spacing is retained after removal.

**Expected diagnostics:** one or more `INVISIBLE_CHARACTER_REMOVED` warnings,
in source traversal order. The implementation may aggregate adjacent removals
if deterministic.

**Preservation invariants:** removal neither joins visible words nor removes
neighboring visible characters.

---

### F14 — Empty nodes and conservative prose normalization

**Categories:** paragraphs, headings

**Markdown input**

```markdown
###

Version 2.4.1 uses API_v2.



Ready.
```

**Expected speakable transcript**

- **Exact content and order:** “Version 2.4.1 uses API_v2. Ready.”
- Advanced version/abbreviation normalization is not required.

**Plan expectations**

- The empty heading produces neither an empty text token nor heading speech.
- Multiple blank lines do not create unbounded pauses.
- Adjacent identical text styles merge; adjacent pauses without a boundary
  collapse to the longest requested duration.

**Expected diagnostics:** none.

**Preservation invariants:** meaningful punctuation/content is conservatively
preserved and each non-empty paragraph occurs once.

---

### F15 — Required identifier and operator phrasebook coverage

**Categories:** Python code blocks, TypeScript code blocks

**Markdown input**

````markdown
```python
def __init__(self):
    score = (base + bonus - penalty) * factor / divisor % modulus
    ready = count <= max_count or count > min_count
    same = left == right
```

```ts
const value = primary ?? fallback;
remaining -= 1;
const enabled = !disabled;
if (left !== right) return -offset;
```
````

**Expected speakable transcript**

Surrounding sentence templates and code-block announcements remain
**provisional**. These embedded default phrases are **exact**:

- `__init__` becomes “dunder init.”
- `+`, `-`, `*`, `/`, and `%` become “plus,” “minus,” “multiplied by,”
  “divided by,” and “modulo.”
- `<=`, `>`, Python `or`, and `==` become “is less than or equal to,” “is
  greater than,” “or,” and “is equal to.”
- `??`, `-=`, `!`, and `!==` become “otherwise use,” “decrease by,” “not,”
  and “is not strictly equal to.”
- Unary minus uses the configured `-` phrase “minus” unless a later exact
  unary-specific default is added to the specification.

**Plan expectations**

- Both supported blocks use AST-based narration, not lexical fallback.
- Parentheses affect expression grouping but are not spoken as raw
  punctuation. Boundaries and announcements remain balanced for both blocks.

**Expected diagnostics:** none.

**Preservation invariants:** operand order and grouping are preserved; every
operator relationship remains audible; no phrase is selected through host
locale behavior.

## Behavioral API and configuration scenarios

These scenarios reuse the content fixtures rather than expanding the content
corpus.

### S01 — Synchronous result and wire-format round trip

For F01, `convertMarkdown(markdown)` synchronously returns `{ plan, text,
diagnostics }`. `plan.schemaVersion` is exactly `1`. The value
`JSON.parse(JSON.stringify(result.plan))` is deeply equal to `result.plan` and
can be passed to a compatible renderer with equivalent output. The plan
contains no AST nodes, functions, class instances, non-finite values, or
runtime handles.

`compileMarkdown` returns an equivalent compilation plan/diagnostics, and
`renderNarration` can render that plan independently. No asynchronous duplicate
conversion API is required or exposed in v1.

### S02 — Configuration precedence, callbacks, and explicit skipping

Run selected fixtures with deterministic overrides:

1. F01: override H1 `before` with text “Main title.” and a 250 ms pause. The
   override replaces the applicable default array and precedes heading content;
   give H2 an independently different rule to prove level-specific resolution.
   Configure document `after` with “End of document.” to exercise both fragment
   positions.
2. F06: set the table rule's `skip: true`. The entire table subtree produces no
   narration and its callback is not invoked.
3. F08: set the code-block rule's `skip: true`. The complete block, including
   announcements and code, is omitted intentionally.
4. F03: replace task state wording through configuration.
5. Apply a node `compile` callback: its fragments replace that rule's
   before/content/style/after behavior, cannot emit boundaries, and are
   normalized into the final plan.

Major supported node rules default to `skip: false`. Preservation guarantees
exclude only content explicitly skipped by the caller. Invalid configuration
(including negative/non-finite pauses or non-finite numeric metadata) throws a
`TypeError` before conversion begins.

### S03 — Table and code phrase configuration

- Render F06 once in each required table mode: `headers-then-rows`,
  `header-per-cell`, and `cells-only`. Toggle start/end, row-number, and
  repeated-header announcements; set a custom `emptyCellText`. Every mode
  preserves cell order and visible cell content unless the table is explicitly
  skipped.
- Render F08/F09 with custom code-block start/language/end fragments and a
  changed phrase for at least `==` or `===`. Only configured wording changes;
  AST relationships and visible content remain preserved.

### S04 — Custom renderer, capability degradation, and escaping

Render the JSON-round-tripped F01 plan using a deterministic custom renderer.
It preserves all text in order. For unsupported heading role/emphasis and an
approximated pause, it returns stable `RENDERER_FEATURE_UNSUPPORTED` and
`RENDERER_FEATURE_APPROXIMATED` diagnostics after compiler diagnostics,
deduplicated by code and feature.

Render a text token whose value resembles provider markup (for example,
`<break time="9s"/>`). It is escaped and spoken as content; it never becomes
provider control syntax. A renderer rejects a plan with an unsupported
`schemaVersion` before rendering. Rendering performs no network request and
does not access credentials.

### S05 — Runtime parity and determinism

Run F01–F15 and S01–S04 in the supported browser and server builds using the
same library/configuration/renderer/parser versions. Narration plans, rendered
text, and diagnostic order are identical. Repeat runs are identical and do not
depend on time, randomness, locale, environment variables, filesystem, network,
or machine-learning inference.

### S06 — End-to-end preservation and listening review

Combine F01, F02, F06, F08, F09, F10, and F12 into a representative coding-agent
response. Verify mechanically that all visible content identified by the
fixtures appears as semantic narration or explicit literal fallback, in source
order, with table/control-flow relationships intact and no raw Markdown
delimiter speech outside explicit literal fallback. Manually listen using at
least two materially different TTS systems. Record reviewer, date, renderer,
systems, and any blocking comprehension issue. V1 requires no blocking issue;
editorial improvements may remain documented.

## Cross-fixture invariants

These apply to every fixture and scenario:

1. Malformed or unsupported input does not throw. Invalid configuration throws
   `TypeError` before conversion; an internal invariant failure may throw
   `Error`.
2. Diagnostics have stable traversal order; renderer diagnostics follow
   compiler diagnostics.
3. Spoken text is never discarded due to unsupported style/renderer features.
4. Unsupported visible content uses child-text recovery before literal source
   fallback, and fallback provenance is inspectable through `literal: true`.
5. Boundary pairs are balanced, properly nested, compiler-owned, and in source
   order.
6. Empty text tokens are absent; compatible adjacent text tokens merge; adjacent
   pauses without an intervening boundary collapse to the longest duration.
7. All pause durations and numeric boundary metadata are finite and
   non-negative where applicable.
8. Nested style resolution proceeds outer-to-inner, with inner properties
   overriding only explicitly defined properties.
9. No conversion path executes embedded HTML/JavaScript, performs network I/O,
   or requires provider credentials.

## Traceability matrix

### Version 1 acceptance criteria

| Criterion | Primary evidence |
| ---: | --- |
| 1. Synchronous conversion | S01 |
| 2. Typed normalized JSON-compatible schema v1 plan | S01; cross-fixture invariants 5–8 |
| 3. Plain speakable text | F01–F15; S01 |
| 4. Required GFM structures | F01–F12, F14 |
| 5. Required Python AST narration | F08, F15 |
| 6. Required TypeScript AST narration | F09, F15 |
| 7. Unsupported/unparseable deterministic code fallback | F10, F11 |
| 8. Unsupported Markdown visible/literal recovery | F12 |
| 9. Empty nodes ignored | F07, F14 |
| 10. Invisible characters removed with diagnostics | F13 |
| 11. Configurable before/after and major-node skip | S02 |
| 12. Heading behavior by level | F01, F14, S02 |
| 13. Table behavior configuration | F06, S03 |
| 14. Code phrases and block announcements configuration | F08–F11, S03 |
| 15. Custom renderer | S04 |
| 16. No core network requests | S04, S05; cross-fixture invariant 9 |
| 17. Browser/server fixture parity | S05 |
| 18. Snapshot-stable output | F01–F15, S05 |
| 19. Preservation/order/relationships/no delimiter speech | Every fixture; S06 |
| 20. Golden semantic-code narration and listening review | F08, F09, F15, S06 |

### Required fixture categories

| Required category | Fixture(s) |
| --- | --- |
| Headings | F01, F14 |
| Paragraphs | F01, F04, F14 |
| Emphasis | F01, F06 |
| Links | F01 |
| Ordered lists | F02 |
| Unordered lists | F02 |
| Nested lists | F02 |
| Task lists | F03 |
| Blockquotes | F04 |
| Inline code | F05 |
| Python code blocks | F08, F15 |
| TypeScript code blocks | F09, F15 |
| Unsupported code languages | F10 |
| Tables | F06 |
| Images | F07 |
| Malformed Markdown | F12 |
| Incomplete code | F11 |
| Invisible Unicode characters | F13 |

## Editorial decisions still required before exact snapshots

1. Exact plain-text mapping for pause durations, boundaries, and adjacent text
   (punctuation, whitespace, and capitalization).
2. Exact default wording for ordered numbers/ordinals, table introductions,
   columns, rows, header/value separators, and table conclusion.
3. Exact default code-block start, language, and end announcements.
4. Exact natural-language templates for each required Python and TypeScript AST
   construct, including import, declaration, call, property/index access,
   collection/type, loop, and return phrasing.
5. Spoken rendering of source/module strings, property chains, indexing,
   `None`/`null`/`undefined`, booleans, and numeric literals.
6. Exact lexical-fallback punctuation policy and whether
   `CODE_LITERAL_FALLBACK` accompanies `UNSUPPORTED_CODE_LANGUAGE`.
7. Whether missing/empty image alternative text always emits a diagnostic and,
   if so, its stable code.
8. Which invisible formatting code points are removed, how removals are
   aggregated diagnostically, and how word boundaries are repaired.
9. Whether parser recovery diagnostics are emitted based on parser-reported
   errors or library-observed fallback, so behavior stays parser-independent.
10. The concrete renderer and two TTS systems used for the recorded v1 manual
    listening gate.
