import assert from "node:assert/strict";
import test from "node:test";
import {
  compileMarkdown,
  convertMarkdown,
  renderNarration,
  type NarrationConfigurationOverrides,
} from "../src/index.js";

test("README quick start matches the documented transcript", () => {
  const markdown = `# Deploy

1. Build
2. Test

Run \`status === "ready"\`.`;
  const result = convertMarkdown(markdown);

  assert.equal(
    result.text,
    "Deploy. One. Build. Two. Test. Run status is strictly equal to string ready.",
  );
  assert.equal(result.plan.schemaVersion, 1);
  assert.ok(result.diagnostics.every(({ severity }) => severity === "info"));
});

test("README lower-level API example compiles and renders independently", () => {
  const { plan, diagnostics: compilerDiagnostics } = compileMarkdown("# Hello");
  const { text, diagnostics: rendererDiagnostics } = renderNarration(plan);

  assert.equal(text, "Hello");
  assert.deepEqual(compilerDiagnostics, []);
  assert.ok(rendererDiagnostics.every(({ code }) => code.startsWith("RENDERER_")));
});

test("README configuration example uses valid public overrides", () => {
  const markdown = `# Status

- [x] Build
- [ ] Publish

[Guide](https://example.test/guide)

| Service | Status |
| --- | --- |
| API | |

![diagram](diagram.png)

\`\`\`ts
const ready = status === "ready";
\`\`\``;

  const narration = {
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
  } satisfies NarrationConfigurationOverrides;

  const result = convertMarkdown(markdown, { narration });
  assert.match(result.text, /^Main title\. Status/u);
  assert.match(result.text, /Done\. Build\. Pending\. Publish/u);
  assert.match(result.text, /Guide at https:\/\/example\.test\/guide/u);
  assert.match(result.text, /API\. not provided/u);
  assert.match(result.text, /Snippet\. TypeScript language\./u);
  assert.match(result.text, /status exactly matches the string ready/u);
  assert.match(result.text, /End snippet\.$/u);
  assert.doesNotMatch(result.text, /diagram/u);
});
