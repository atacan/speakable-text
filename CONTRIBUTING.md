# Contributing

Thank you for helping improve `speakable-text`. Bug reports, focused feature
proposals, documentation improvements, and code contributions are welcome.

## Before you begin

- Use the issue forms for bugs and feature proposals.
- Report suspected vulnerabilities privately as described in
  [SECURITY.md](SECURITY.md), not in a public issue.
- Search existing issues and pull requests before starting substantial work.
- Keep changes focused. Discuss broad API or default-narration changes in an
  issue first because transcript changes are user-visible behavior.

Participation in this project should be respectful, constructive, and
accessible. When sharing images or recordings, also include a text description
or transcript so the evidence is usable without the media.

## Development setup

Node.js 20 or newer and npm are required. The package is ESM-only.

```sh
git clone https://github.com/atacan/speakable-text.git
cd speakable-text
npm ci
npm run check
```

The public package APIs are `convertMarkdown`, `compileMarkdown`,
`renderNarration`, and `createPlainTextRenderer`. Preserve server, browser, and
DOM-free worker behavior unless the proposed change explicitly alters their
contract.

## Tests and validation

Add or update focused tests for behavioral changes. Default narration is a
public, deterministic transcript contract, so review expected-output changes
carefully and explain intentional wording changes in the pull request.

Before opening a pull request, run:

```sh
npm run check
npm run test:package
```

`npm run check` performs strict type checking, Node tests, builds, worker and
browser smoke tests, and server/browser parity checks. `npm run test:package`
packs and installs the exact artifact in isolated consumers; it requires
network access to the npm registry and does not publish anything.

For documentation-only changes, run the relevant checks when practical and
state exactly what you did not run.

## Pull requests

Create a branch in your fork and open a pull request against `main`. Direct
pushes to protected `main` are not the contribution path. In the pull request:

- explain the user-visible problem and the chosen solution;
- link related issues;
- include tests or explain why none are needed;
- note transcript, diagnostic, API, browser, or packaging effects; and
- keep unrelated formatting or refactoring out of the change.

CI runs the full checks on Node.js 20, 22, and 24 and validates exact package
consumers. A maintainer may request changes before merging.

By contributing, you agree that your contribution is licensed under the
project's [MIT License](LICENSE).
