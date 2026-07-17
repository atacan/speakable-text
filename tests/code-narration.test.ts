import assert from "node:assert/strict";
import test from "node:test";
import {
  compileMarkdown,
  convertMarkdown,
  defaultNarrationConfiguration,
  type NarrationConfigurationOverrides,
} from "../src/index.js";
import { normalizeIdentifier } from "../src/code/identifier.js";
import { scanCodeLexically } from "../src/code/lexical-scanner.js";
import { DEFAULT_OPERATOR_PHRASES } from "../src/code/operators.js";

test("identifier normalization covers snake, camel, acronyms, privacy, kebab, and dunder forms", () => {
  assert.deepEqual(
    [
      "get_user_name", "getUserName", "userID", "HTTPResponse", "_private_value",
      "__init__", "expectedID", "max_count", "retry-count",
    ].map(normalizeIdentifier),
    [
      "get user name", "get user name", "user I D", "H T T P response", "private value",
      "dunder init", "expected I D", "max count", "retry count",
    ],
  );
});

test("the centralized default phrasebook contains every required operator phrase", () => {
  assert.deepEqual(DEFAULT_OPERATOR_PHRASES, {
    "===": "is strictly equal to", "!==": "is not strictly equal to",
    "==": "is equal to", "!=": "is not equal to",
    "<=": "is less than or equal to", ">=": "is greater than or equal to",
    "<": "is less than", ">": "is greater than",
    "&&": "and", "||": "or", and: "and", or: "or", "!": "not", not: "not",
    "=": "set to", "+=": "increase by", "-=": "decrease by", "+": "plus",
    "-": "minus", "*": "multiplied by", "/": "divided by", "%": "modulo",
    "??": "otherwise use", "?.": "optionally access",
  });
});

test("supported fallback applies the required F15 phrases until semantic narration lands", () => {
  const result = convertMarkdown([
    "```python",
    "__init__ = (base + bonus - penalty) * factor / divisor % modulus",
    "ready = count <= max_count or count > min_count and left == right",
    "```",
    "",
    "```ts",
    "value = primary ?? fallback; remaining -= 1; enabled = !disabled; left !== right",
    "```",
  ].join("\n"));
  for (const phrase of [
    "dunder init", "plus", "minus", "multiplied by", "divided by", "modulo",
    "is less than or equal to", "or", "is greater than", "and", "is equal to",
    "otherwise use", "decrease by", "not", "is not strictly equal to",
  ]) assert.equal(result.text.includes(phrase), true, `missing ${phrase}`);
  assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.code === "CODE_LITERAL_FALLBACK").length, 1);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "UNSUPPORTED_CODE_LANGUAGE"), false);
});

test("F08 Python narration has an exact semantic plan, transcript, and no compiler diagnostics", () => {
  const markdown = [
    "```python",
    "from users import Repository",
    "# Find active users",
    "limit: int = 2",
    "def get_active(repo: Repository, names: list[str]) -> list[str]:",
    "    results = []",
    "    for name in names:",
    "        user = repo.get_user(name)",
    "        if user.active and not user.deleted:",
    "            results.append(user.name)",
    "    while len(results) < limit:",
    "        results += [\"unknown\"]",
    "    return results",
    "```",
  ].join("\n");
  const compiled = compileMarkdown(markdown);
  assert.deepEqual(compiled.diagnostics, []);
  const values = [
    "Code block. Python. From users import Repository.",
    "Comment. Find active users.",
    "Set limit of type integer to two.",
    "Define function get active. It takes repo of type Repository and names of type list of string. It returns list of string.",
    "Set results to an empty list.",
    "For each name in names.",
    "Set user to the result of calling repo get user with name.",
    "If user active and not user deleted, then.",
    "Call results append with user name.",
    "While the length of results is less than limit.",
    "Increase results by a list containing the string unknown.",
    "Return results.",
    "End code block.",
  ];
  const expectedCodeTokens = values.flatMap((value, index) => [
    ...(index === 0 ? [] : [{ kind: "pause" as const, durationMs: 400 }]),
    {
      kind: "text" as const,
      value,
      style: { role: index === 1 ? "code-comment" : "code" },
    },
  ]);
  assert.deepEqual(compiled.plan.tokens, [
    { kind: "boundary", boundary: "document", phase: "start" },
    { kind: "boundary", boundary: "code-block", phase: "start", metadata: { language: "Python", supported: true } },
    ...expectedCodeTokens,
    { kind: "boundary", boundary: "code-block", phase: "end", metadata: { language: "Python", supported: true } },
    { kind: "boundary", boundary: "document", phase: "end" },
  ]);
  assert.equal(
    convertMarkdown(markdown).text,
    "Code block. Python. From users import Repository. Comment. Find active users. Set limit of type integer to two. Define function get active. It takes repo of type Repository and names of type list of string. It returns list of string. Set results to an empty list. For each name in names. Set user to the result of calling repo get user with name. If user active and not user deleted, then. Call results append with user name. While the length of results is less than limit. Increase results by a list containing the string unknown. Return results. End code block.",
  );
  assert.equal(compiled.plan.tokens.some((token) => token.kind === "text" && token.literal === true), false);
});

test("Python semantic fixtures cover imports, collections, access, primitives, and configured phrases", () => {
  const result = compileMarkdown([
    "```py",
    "import os",
    "from pkg import helper",
    "items = [1, True, None]",
    "mapping = {\"key\": 2}",
    "selected = items[0]",
    "ready = not disabled",
    "total = left + right",
    "```",
  ].join("\n"), { narration: { code: { operators: { "+": "combined with", not: "never" }, block: { linePauseMs: 275 } } } });
  assert.deepEqual(result.diagnostics, []);
  const spoken = result.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(" ");
  for (const phrase of [
    "Import os", "From pkg import helper", "a list containing one, true, and None",
    "a dictionary containing the string key mapped to two", "items at zero", "never disabled", "left combined with right",
  ]) assert.equal(spoken.includes(phrase), true, `missing ${phrase}`);
  assert.equal(result.plan.tokens.filter((token) => token.kind === "pause").every((token) => token.durationMs === 275), true);
  assert.equal(result.plan.tokens.some((token) => token.kind === "text" && token.literal === true), false);
});

test("F15 Python operators are semantic, grouped, deterministic, and lossless", () => {
  const markdown = [
    "```python",
    "def __init__(self):",
    "    score = (base + bonus - penalty) * factor / divisor % modulus",
    "    ready = count <= max_count or count > min_count",
    "    same = left == right",
    "```",
  ].join("\n");
  const first = compileMarkdown(markdown);
  const second = compileMarkdown(markdown);
  assert.deepEqual(second, first);
  assert.deepEqual(first.diagnostics, []);
  assert.equal(first.plan.tokens.some((token) => token.kind === "text" && token.literal === true), false);
  const spoken = first.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(" ");
  for (const phrase of [
    "dunder init", "base plus bonus minus penalty multiplied by factor divided by divisor modulo modulus",
    "count is less than or equal to max count or count is greater than min count", "left is equal to right",
  ]) assert.equal(spoken.includes(phrase), true, `missing ${phrase}`);
});

test("Python if/else narration owns each condition and body exactly once", () => {
  const markdown = [
    "```python",
    "if score >= limit:",
    "    accepted_marker = 1",
    "else:",
    "    rejected_marker = 2",
    "```",
  ].join("\n");
  const compiled = compileMarkdown(markdown);
  assert.deepEqual(compiled.diagnostics, []);
  assert.deepEqual(
    compiled.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value),
    [
      "Code block. Python. If score is greater than or equal to limit, then.",
      "Set accepted marker to one.",
      "Otherwise.",
      "Set rejected marker to two.",
      "End code block.",
    ],
  );
  assert.equal(
    convertMarkdown(markdown).text,
    "Code block. Python. If score is greater than or equal to limit, then. Set accepted marker to one. Otherwise. Set rejected marker to two. End code block.",
  );
  assert.equal(compiled.plan.tokens.some((token) => token.kind === "text" && token.literal === true), false);
  const spoken = compiled.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(" ");
  assert.equal((spoken.match(/accepted marker/gu) ?? []).length, 1);
  assert.equal((spoken.match(/rejected marker/gu) ?? []).length, 1);
});

test("Python if/elif/else narration is exact, ordered, semantic, and configured", () => {
  const markdown = [
    "```python",
    "if left == right:",
    "    equal_marker = 1",
    "elif left < right:",
    "    lower_marker = 2",
    "else:",
    "    greater_marker = 3",
    "```",
  ].join("\n");
  const compiled = compileMarkdown(markdown, { narration: { code: {
    operators: { "==": "matches", "<": "precedes" },
    block: { linePauseMs: 225 },
  } } });
  assert.deepEqual(compiled.diagnostics, []);
  assert.deepEqual(
    compiled.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value),
    [
      "Code block. Python. If left matches right, then.",
      "Set equal marker to one.",
      "Otherwise if left precedes right, then.",
      "Set lower marker to two.",
      "Otherwise.",
      "Set greater marker to three.",
      "End code block.",
    ],
  );
  assert.equal(compiled.plan.tokens.filter((token) => token.kind === "pause").every((token) => token.durationMs === 225), true);
  assert.equal(compiled.plan.tokens.some((token) => token.kind === "text" && token.literal === true), false);
  const spoken = compiled.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(" ");
  for (const marker of ["equal marker", "lower marker", "greater marker"]) {
    assert.equal(spoken.split(marker).length - 1, 1, `duplicate or missing ${marker}`);
  }
});

test("unsupported complete Python constructs own one literal fallback interval without duplicating content", () => {
  for (const [source, marker] of [
    ["class Worker:\n    marker = \"class_owned\"", "class_owned"],
    ["try:\n    risky_call()\nexcept Error:\n    marker = \"try_owned\"", "try_owned"],
    ["async def fetch():\n    marker = \"async_owned\"", "async_owned"],
  ] as const) {
    const result = compileMarkdown(`\`\`\`python\n${source}\n\`\`\``);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["CODE_LITERAL_FALLBACK"]);
    const literal = result.plan.tokens.flatMap((token) => token.kind === "text" && token.literal === true ? [token] : []);
    assert.ok(literal.length > 0);
    assert.ok(literal.every((token) => token.style?.role === "code"));
    const spoken = literal.map((token) => token.value).join(" ");
    assert.equal(spoken.split(marker).length - 1, 1, `duplicate or missing fallback marker ${marker}`);
  }
});

test("F11 Python recovery falls back once for the whole block and preserves every source line", () => {
  const result = compileMarkdown("```python\nresult = get_user(\nif result != None:\n    return result\n```");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["CODE_PARSE_RECOVERY", "CODE_LITERAL_FALLBACK"]);
  const literal = result.plan.tokens.flatMap((token) => token.kind === "text" && token.literal === true ? [token] : []);
  assert.ok(literal.length > 0);
  assert.ok(literal.every((token) => token.style?.role === "code"));
  const spoken = literal.map((token) => token.value).join(" ");
  assert.equal((spoken.match(/result/gu) ?? []).length, 3);
  assert.equal((spoken.match(/get user/gu) ?? []).length, 1);
  assert.equal(spoken.includes("is not equal to None"), true);
});

test("inline code uses light lexical narration, inline style, and no block boundary", () => {
  const result = convertMarkdown("Use `get_user_id != expectedID` before retrying.");
  assert.equal(result.text, "Use get user I D is not equal to expected I D before retrying.");
  assert.equal(result.text.includes("Code block"), false);
  assert.equal(result.plan.tokens.some((token) => token.kind === "boundary" && token.boundary === "code-block"), false);
  const inlineText = result.plan.tokens.find(
    (token) => token.kind === "text" && token.style?.role === "inline-code",
  );
  assert.deepEqual(inlineText, {
    kind: "text",
    value: "get user I D is not equal to expected I D",
    style: { role: "inline-code" },
    literal: true,
  });
  assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.code.startsWith("CODE_")), []);
});

test("unsupported fenced code is bounded, announced, preserved by line, and diagnosed", () => {
  const markdown = "```ruby\nuser_name = get_user(id)\ntotal += price * count\n```";
  const result = convertMarkdown(markdown);
  assert.equal(
    result.text,
    "Code block. Ruby. user name set to get user, I D. total increase by price multiplied by count. End code block.",
  );
  assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.code === "UNSUPPORTED_CODE_LANGUAGE").length, 1);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "CODE_LITERAL_FALLBACK"), false);
  const boundaries = result.plan.tokens.filter(
    (token) => token.kind === "boundary" && token.boundary === "code-block",
  );
  assert.deepEqual(boundaries, [
    { kind: "boundary", boundary: "code-block", phase: "start", metadata: { language: "Ruby", supported: false } },
    { kind: "boundary", boundary: "code-block", phase: "end", metadata: { language: "Ruby", supported: false } },
  ]);
  const fallback = result.plan.tokens.flatMap(
    (token) => token.kind === "text" && token.literal === true ? [token] : [],
  );
  assert.equal(fallback.length, 2);
  assert.ok(fallback.every((token) => token.style?.role === "code"));
});

test("lexical scanning is stateful, longest-match, and does not rewrite strings or comments", () => {
  const tokens = scanCodeLexically('value !== "a != b" // keep x == y\nnext?.item ?? fallback');
  assert.deepEqual(tokens.filter((token) => token.kind === "operator").map((token) => token.value), ["!==", "?.", "??"]);
  assert.deepEqual(tokens.filter((token) => token.kind === "string").map((token) => token.value), ["a != b"]);
  assert.deepEqual(tokens.filter((token) => token.kind === "comment").map((token) => token.value), ["keep x == y"]);

  const result = convertMarkdown('```ruby\nvalue !== "a != b" // keep x == y\nnext?.item ?? fallback\n```');
  assert.match(result.text, /value is not strictly equal to string a != b/u);
  assert.match(result.text, /Comment\. keep x == y/u);
  assert.match(result.text, /next optionally access item otherwise use fallback/u);
});

test("comments receive code-comment styling and line order is stable", () => {
  const plan = compileMarkdown("```ruby\nfirst = 1\n# Load current_user\nlast = 2\n```").plan;
  const literal = plan.tokens.flatMap(
    (token) => token.kind === "text" && token.literal === true ? [token] : [],
  );
  assert.deepEqual(literal.map((token) => token.value), [
    "first set to 1", "Comment. Load current_user", "last set to 2",
  ]);
  assert.deepEqual(literal.map((token) => token.style?.role), ["code", "code-comment", "code"]);
});

test("aliases are supported, missing tags remain neutral, and unknown language labels are sanitized", () => {
  const aliases = compileMarkdown("```py\nx = 1\n```\n\n```ts\ny = 2\n```");
  assert.deepEqual(
    aliases.plan.tokens.flatMap(
      (token) => token.kind === "boundary" && token.boundary === "code-block" && token.phase === "start"
        ? [token.metadata]
        : [],
    ),
    [{ language: "Python", supported: true }, { language: "TypeScript", supported: true }],
  );
  assert.equal(aliases.diagnostics.filter((diagnostic) => diagnostic.code === "CODE_LITERAL_FALLBACK").length, 1);
  assert.equal(aliases.diagnostics.some((diagnostic) => diagnostic.code === "UNSUPPORTED_CODE_LANGUAGE"), false);

  const missing = convertMarkdown("```\nx = 1\n```");
  assert.equal(missing.text.startsWith("Code block. x set to 1"), true);
  assert.equal(missing.diagnostics.some((diagnostic) => diagnostic.code === "UNSUPPORTED_CODE_LANGUAGE"), false);

  const unsafe = convertMarkdown("```<break-time=9s>\nx = 1\n```");
  assert.equal(unsafe.text.includes("<"), false);
  assert.match(unsafe.text, /Break time 9s/u);
});

test("incomplete supported code reports parse recovery before its marked literal fallback", () => {
  const result = compileMarkdown("```python\nresult = get_user(\nif result != None:\n    return result\n```");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "CODE_PARSE_RECOVERY",
    "CODE_LITERAL_FALLBACK",
  ]);
  assert.match(
    result.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(" "),
    /result set to get user/u,
  );
});

test("code configuration overrides phrases and announcements deeply", () => {
  const narration: NarrationConfigurationOverrides = { code: {
    operators: { "==": "matches exactly" },
    block: {
      contentStyle: { role: "custom-code", rate: "slow" },
      commentStyle: { role: "custom-comment" },
      startAnnouncement: [{ kind: "text", value: "Snippet starts. " }],
      languageAnnouncement: ({ language }) => [{ kind: "text", value: `Dialect ${language ?? "plain"}. ` }],
      endAnnouncement: [{ kind: "text", value: "Snippet ends." }],
    },
  } };
  const result = convertMarkdown("```ruby\nleft == right\n```", { narration });
  assert.equal(result.text, "Snippet starts. Dialect Ruby. left matches exactly right. Snippet ends.");
  assert.deepEqual(
    result.plan.tokens.flatMap((token) => token.kind === "text" ? [token.style] : []),
    Array.from({ length: 3 }, () => ({ role: "custom-code", rate: "slow" })),
  );
  assert.equal(defaultNarrationConfiguration.code.operators["=="], "is equal to");
});

test("code skips omit entire nodes and callbacks replace content inside compiler boundaries", () => {
  let calls = 0;
  const skipped = compileMarkdown("before\n\n```ruby\nx = 1\n```\n\nafter", { narration: { code: { block: {
    skip: true,
    compile: () => { calls += 1; return [{ kind: "text", value: "wrong" }]; },
  } } } });
  assert.equal(calls, 0);
  assert.equal(skipped.plan.tokens.some((token) => token.kind === "boundary" && token.boundary === "code-block"), false);

  const replaced = compileMarkdown("```ruby\nx = 1\n```", { narration: { code: { block: {
    compile: (context) => [{ kind: "text", value: `Replacement ${context.language}.` }],
  } } } });
  assert.deepEqual(replaced.plan.tokens.slice(1, -1), [
    { kind: "boundary", boundary: "code-block", phase: "start", metadata: { language: "Ruby", supported: false } },
    { kind: "text", value: "Replacement Ruby." },
    { kind: "boundary", boundary: "code-block", phase: "end", metadata: { language: "Ruby", supported: false } },
  ]);

  const inlineSkipped = convertMarkdown("before `x == y` after", { narration: { code: { inline: { skip: true } } } });
  assert.equal(inlineSkipped.text, "before after");

  const inlineReplaced = compileMarkdown("before `x == y` after", { narration: { code: { inline: {
    compile: (context) => [{ kind: "text", value: `Inline ${context.code}` }],
  } } } });
  assert.equal(
    inlineReplaced.plan.tokens.some((token) => token.kind === "boundary" && token.boundary === "code-block"),
    false,
  );
  assert.match(
    inlineReplaced.plan.tokens.filter((token) => token.kind === "text").map((token) => token.value).join(""),
    /Inline x == y/u,
  );
});

test("invalid code configuration is rejected before parsing", () => {
  for (const code of [
    { mode: "literal" },
    { operators: { "**": "power" } },
    { operators: { "==": 3 } },
    { block: { linePauseMs: Number.NaN } },
    { block: { startAnnouncement: [{ kind: "boundary", boundary: "code-block", phase: "start" }] } },
  ]) {
    assert.throws(
      () => compileMarkdown(null as unknown as string, { narration: { code } as never }),
      /Invalid narration configuration/u,
    );
  }
});
