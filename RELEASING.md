# Releasing `speakable-text`

Releases after the initial registry bootstrap are published by manually
dispatching a guarded GitHub Actions workflow. The workflow uses npm trusted
publishing with short-lived OpenID Connect (OIDC) credentials and must never
receive an npm token. A GitHub Release records each release but does not trigger
publication.

## One-time bootstrap for version 0.1.0

As of July 2026, npm requires a package to already exist in the registry before
its trusted-publisher relationship can be configured. Because `speakable-text`
is currently unregistered, version 0.1.0 is the one exception to the automated
flow:

1. Confirm that you control the `atacan/speakable-text` public GitHub repository
   and an npm account with two-factor authentication enabled.
2. Merge the reviewed 0.1.0 release commit to `main` after CI passes. Create the
   `v0.1.0` tag on that exact commit and push the tag to GitHub. Check out that
   tag and verify `git status --short` is empty.
3. From that clean, detached `v0.1.0` checkout, run these commands in order:

   ```sh
   npm ci
   npm run check
   npm run release:preflight -- --tag v0.1.0
   npm run test:package
   npm pack --dry-run
   npm publish --access public --provenance=false
   ```

   The final override is limited to this bootstrap. The committed package
   policy keeps `publishConfig.provenance` set to `true`, but npm can generate
   provenance only inside a supported cloud CI/CD environment. The package
   cannot use that environment until it exists and its trusted publisher can
   be configured. Every subsequent OIDC release retains automatic provenance.
   Do not create the GitHub Release yet.
4. On npmjs.com, open the new package's **Settings → Trusted publishing** and
   configure exactly:

   - provider: **GitHub Actions**
   - organization or user: **atacan**
   - repository: **speakable-text**
   - workflow filename: **publish.yml** (filename only)
   - environment: **npm**
   - allowed action: **npm publish**

5. In GitHub repository settings, create an environment named **npm**. Under
   selected deployment branches and tags, allow the `main` branch—not `v*`—
   because GitHub evaluates this rule against the manual workflow run's
   `GITHUB_REF`. The workflow separately resolves and validates its required
   tag input. Add a required reviewer when another trusted maintainer is
   available, disable administrator bypass when practical, and do not add npm
   credentials as repository or environment secrets.
6. In npm package settings, select **Require two-factor authentication and
   disallow tokens** after the trusted publisher is configured.
7. Create the `v0.1.0` GitHub Release after the interactive npm publish if
   desired. Publishing a GitHub Release does not trigger the npm workflow, so
   it cannot cause a duplicate publication. Do not manually dispatch the
   workflow for `v0.1.0`. Every later version uses the automated flow below.

The package name is globally first-come, first-served. Recheck availability
immediately before bootstrap. A local interactive login/passkey is acceptable;
an npm token in GitHub, a workflow, a committed file, or shared release notes is
not.

## Routine release flow

1. Update `package.json` and `package-lock.json` to the same stable SemVer
   version, update `CHANGELOG.md`, and merge the release commit to `main` after
   CI passes.
2. Run the local candidate gates:

   ```sh
   npm ci
   npm run check
   npm run release:preflight -- --tag vX.Y.Z
   npm run test:package
   npm pack --dry-run
   ```

3. Create and push the `vX.Y.Z` tag from the release commit on `main`.
4. On the GitHub Actions page, select **Publish to npm**, choose **Run
   workflow** from `main`, and enter the exact `vX.Y.Z` tag. Approve the **npm**
   environment deployment if it is protected. The
   `.github/workflows/publish.yml` job rechecks the tag, main ancestry, package
   identity, changelog, registry version ordering, full suite, and
   packed-package consumers before its sole `npm publish` step. Release one
   version at a time; workflow concurrency prevents overlapping publishes.
5. Verify the npm page reports the expected version and provenance and install
   the released version in a clean project.
6. Only after npm verification succeeds, create the non-draft, non-prerelease
   GitHub Release for the same tag. GitHub Releases record publication; they do
   not trigger it.

Do not call the publish workflow from a reusable workflow or run it on a
self-hosted runner. Its direct manual dispatch is intentionally defined in
`publish.yml`; npm checks that calling workflow filename and the **npm**
environment. Trusted publishing currently requires GitHub-hosted runners,
npm 11.5.1 or newer, and Node 22.14.0 or newer. The workflow uses Node 24 and
the npm version supplied by that current runner. The workflow fails before
install or publish unless Node is at least 22.14.0 and npm is at least 11.5.1.

## Failure and rollback

Published npm artifacts are immutable: a used `name@version` cannot be replaced
or reused, even after unpublishing. Fix a bad release with a new patch version.
Use `npm deprecate speakable-text@X.Y.Z "reason and replacement"` to warn users
when appropriate. Entire-package unpublishing is policy-limited, can break
consumers, and blocks republishing the name for 24 hours; treat it as an
exception, not rollback.

## Credential policy

- Never create `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or an npm auth secret for this
  workflow.
- Never commit `.npmrc`, access tokens, one-time passwords, recovery codes, or
  private keys.
- Keep `id-token: write` scoped only to the publish job. CI has read-only
  repository permissions.
- The OIDC permission only lets the job request a short-lived identity token;
  npm still checks the repository, workflow filename, environment, and package
  trust configuration.

Current platform requirements should be rechecked before changing the release
workflow: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust/), and
[GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
