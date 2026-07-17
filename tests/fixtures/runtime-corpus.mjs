export const fixtures = Object.freeze({
  F01: `# Release notes

Read the *important* **migration guide** in [the documentation](https://example.test/guide).`,
  F02: `3. Prepare
4. Deploy
   - Watch logs
   - Check health

- Notify the team`,
  F03: `- [x] Compile
- [ ] Publish`,
  F04: `> Keep the rollback ready.
>
> Verify metrics first.`,
  F05: "Use `get_user_id != expectedID` before retrying.",
  F06: `| Name | Status |
| --- | --- |
| Build | **Passing** |
| Tests | |`,
  F07: `![Deployment diagram](https://example.test/deploy.png)

![](https://example.test/decorative.png)`,
  F08: `\`\`\`python
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
\`\`\``,
  F09: `\`\`\`ts
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
\`\`\``,
  F10: `\`\`\`ruby
user_name = get_user(id)
total += price * count
\`\`\``,
  F11: `\`\`\`python
result = get_user(
if result != None:
    return result
\`\`\``,
  F12: `Before <aside><strong>visible warning</strong></aside> after.

[unresolved reference][missing]

**unfinished emphasis`,
  F13: "Deploy\u200B now and verify\uFEFF metrics.",
  F14: `###

Version 2.4.1 uses API_v2.



Ready.`,
  F15: `\`\`\`python
def __init__(self):
    score = (base + bonus - penalty) * factor / divisor % modulus
    ready = count <= max_count or count > min_count
    same = left == right
\`\`\`

\`\`\`ts
const value = primary ?? fallback;
remaining -= 1;
const enabled = !disabled;
if (left !== right) return -offset;
\`\`\``,
});

export const representativeAgentResponse = [
  fixtures.F01,
  fixtures.F02,
  fixtures.F06,
  fixtures.F08,
  fixtures.F09,
  fixtures.F10,
  fixtures.F12,
].join("\n\n");

export const parityCases = Object.freeze([
  ...Object.entries(fixtures).map(([name, markdown]) => ({ name, markdown })),
  { name: "S06", markdown: representativeAgentResponse },
  {
    name: "S02-heading-task-overrides",
    markdown: `# Main\n\n## Detail\n\n- [x] Compile\n- [ ] Publish`,
    options: { narration: {
      headings: {
        1: { before: [{ kind: "text", value: "Main title. " }, { kind: "pause", durationMs: 250 }] },
        2: { before: [{ kind: "text", value: "Subsection. " }, { kind: "pause", durationMs: 125 }] },
      },
      document: { after: [{ kind: "text", value: " End of document." }] },
      listItem: {
        completedTaskPrefix: [{ kind: "text", value: "Done. " }],
        incompleteTaskPrefix: [{ kind: "text", value: "Pending. " }],
      },
    } },
  },
  {
    name: "S02-explicit-skips",
    markdown: `${fixtures.F06}\n\n${fixtures.F08}`,
    options: { narration: { table: { skip: true }, code: { block: { skip: true } } } },
  },
  ...["headers-then-rows", "header-per-cell", "cells-only"].map((mode) => ({
    name: `S03-table-${mode}`,
    markdown: fixtures.F06,
    options: { narration: { table: {
      mode,
      announceTableStart: mode !== "cells-only",
      announceTableEnd: mode !== "cells-only",
      announceRowNumbers: mode !== "cells-only",
      repeatColumnHeaders: mode === "header-per-cell",
      emptyCellText: "vacant",
    } } },
  })),
  {
    name: "S03-code-phrases",
    markdown: `${fixtures.F08}\n\n${fixtures.F09}`,
    options: { narration: { code: {
      operators: { "==": "matches", "===": "matches exactly" },
      block: {
        startAnnouncement: [{ kind: "text", value: "Snippet. " }],
        endAnnouncement: [{ kind: "text", value: "Done." }],
      },
    } } },
  },
]);
