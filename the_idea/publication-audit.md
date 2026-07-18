# `speakable-text` 0.1.0 publication audit

**Audit date:** 2026-07-18
**Registry check:** 2026-07-18T08:05:09Z
**Candidate baseline audited:** `0d555cf` plus the corrections described below

## Decision

The corrected candidate has no known code, package-artifact, or release-
automation blocker. Publication is intentionally still blocked on maintainer
actions: commit and push the correction, let the remote Node 20/22/24 CI matrix
pass, create and push the exact `v0.1.0` tag, and perform the one-time interactive
npm bootstrap described in `RELEASING.md`.

The authoritative npm registry returned `E404 Not Found` for
`speakable-text@*` at the timestamp above. The unscoped name was unregistered at
that instant, but availability is first-come, first-served and must be checked
again immediately before publication.

## Corrected blocker

The initial tarball shipped a self-contained browser bundle containing
third-party MIT-licensed code without the corresponding third-party copyright
and permission notices. The browser build now derives
`dist/browser/THIRD_PARTY_LICENSES.txt` from the exact esbuild input graph,
fails if a bundled package lacks a top-level license file, and publishes that
file. The packed-consumer audit requires the notice and checks every direct
runtime dependency/version entry.

The documented local and bootstrap preflight commands now pass
`--require-clean`, so the existing dirty-tree guard is not merely available in
the script but is actually invoked by the release procedure.

## Evidence

- Package identity is `speakable-text@0.1.0`; `package.json` and lockfile root
  metadata agree on name, version, license, engines, and exact dependencies.
- Author, repository, homepage, issues, public access, registry, ESM-only
  package type, and Node `>=20` metadata are internally consistent.
- The root export resolves declarations from `dist/index.d.ts`, server ESM from
  `dist/index.js`, and the browser condition from the self-contained
  `dist/browser/index.js`. Packed tests reject unintended deep imports.
- `npm run check` passed 115 tests plus strict type checking, declaration/server
  build, browser build, DOM-free worker and browser-bundle smokes, and 22-case
  server/browser runtime parity.
- The exact tarball passed clean isolated installations and Node ESM, NodeNext
  TypeScript, browser-condition, browser-bundler, and export-boundary consumers
  under Node 20.20.2 and Node 22.23.1.
- Positive `v0.1.0` preflight passed. Wrong-version, missing-`v`, unknown-option,
  and dirty-tree negative cases failed as intended.
- `npm pack --dry-run`, bootstrap-equivalent
  `npm publish --dry-run --access public --provenance=false`, and
  `npm pkg fix --dry-run` passed without publishing.
- Both workflow files parsed as YAML. CI has read-only contents permission and
  no OIDC permission. Publishing is a direct manual dispatch restricted to the
  canonical repository and `main`, checks out the supplied tag, verifies exact
  tag identity and ancestry from `main`, uses an `npm` environment, scopes
  `id-token: write` to the publish job, checks stable version monotonicity,
  reruns all gates, and performs exactly one tokenless `npm publish`.
- The tracked-file and packed-file secret-shaped scans found no credentials,
  auth files, private keys, or npm token configuration. The tarball allowlist
  excludes workflows, tests, sources, and internal design documents.
- README examples are executable tests and match the public types and behavior.
  The changelog version and release-tag link match `v0.1.0`.

## Accepted non-blocking observations

- The browser artifact is approximately 687 kB uncompressed and its embedded-
  source map is approximately 1.45 MB. The complete tarball was approximately
  543 kB before adding the highly compressible third-party notices. The spec
  defines no size budget; optimization can follow measured consumer needs.
- Browser source maps embed source content and are usable without publishing
  `src/`. Server JavaScript and declaration maps instead reference omitted
  `src/` files, so source navigation from those maps may be incomplete. This
  does not affect runtime, declarations, exports, or documented behavior, but
  a later release should either publish `src/` or stop shipping those maps.
- The publication workflow and metadata exist only in local commits until the
  maintainer pushes them. Trusted publishing cannot be configured until the
  package exists, so 0.1.0 remains the documented tokenless-workflow exception:
  it is published interactively with provenance disabled, then the trusted
  publisher is configured for all subsequent versions.

## Authoritative platform references

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) documents
  the npm/Node minimums, GitHub-hosted runner requirement, exact workflow-
  filename configuration, OIDC permission, environment option, token
  restriction, and automatic provenance behavior.
- [npm provenance statements](https://docs.npmjs.com/generating-provenance-statements/)
  documents supported build environments and public-repository requirements.
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
  documents environment protection and deployment branch/tag rules.

## Maintainer actions remaining

1. Review and commit the audit correction; push all publication commits to the
   public `atacan/speakable-text` repository.
2. Require the remote CI jobs for Node 20, 22, and 24 plus the exact-package job
   to pass on that commit.
3. Recheck `npm view speakable-text` immediately before bootstrap.
4. Follow `RELEASING.md` exactly to tag the CI-approved commit and publish
   0.1.0 interactively without provenance. Do not dispatch `publish.yml` for
   0.1.0.
5. Configure npm's GitHub Actions trusted publisher for `publish.yml` and the
   `npm` environment, configure the matching protected GitHub environment,
   disallow traditional npm tokens, then use the workflow only for later
   versions.
