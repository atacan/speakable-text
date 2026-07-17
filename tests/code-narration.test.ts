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
  assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.code === "CODE_LITERAL_FALLBACK").length, 2);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "UNSUPPORTED_CODE_LANGUAGE"), false);
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
  assert.equal(aliases.diagnostics.filter((diagnostic) => diagnostic.code === "CODE_LITERAL_FALLBACK").length, 2);
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
