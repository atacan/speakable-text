# Security policy

## Supported versions

Security fixes are provided for the latest `0.1.x` release. Please update to
the newest patch release before reporting an issue that may already be fixed.

| Version | Supported |
| --- | --- |
| Latest `0.1.x` | Yes |
| Earlier releases | No |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use
[GitHub private vulnerability reporting](https://github.com/atacan/speakable-text/security/advisories/new)
so details can be reviewed before they are disclosed.

Include, when possible:

- the affected package version and runtime;
- a minimal reproduction or proof of concept;
- the security impact and any known prerequisites; and
- suggested mitigations or fixes.

Avoid including real credentials, personal data, or third-party confidential
information. We aim to acknowledge reports within seven days. We will
coordinate validation, remediation, and disclosure through the private
advisory. Please allow reasonable time for a fix before public disclosure.

The package converts untrusted Markdown to text but does not execute Markdown,
raw HTML, or JavaScript. Reports about escaping in a custom renderer should
demonstrate an issue in `speakable-text` itself rather than missing escaping in
application-provided renderer code.
