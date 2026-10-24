# Security Policy

## Overview

Krunker Client Tools is an experimental browser userscript developed by [@cleonaia](https://github.com/cleonaia).

The project explores client-side overlays, browser scripting, input handling, and fail-closed validation of team metadata. It is not an official Krunker product.

Security reports are welcome, particularly reports involving unsafe behavior, incorrect target classification, unexpected browser interactions, or vulnerabilities in the userscript itself.

## Supported Versions

This project is experimental and does not currently guarantee long-term support for any release.

| Version | Security updates |
| --- | --- |
| Latest version on the default branch | Best effort |
| Older versions | Not guaranteed |

Please use the latest available version when reporting an issue.

## Reporting a Vulnerability

**Please do not publish sensitive vulnerability details in a public issue before coordinating responsible disclosure.**

To report a potential security vulnerability:

1. Open the repository's [Security Advisories](https://github.com/cleonaia/krunker-client-tools/security/advisories) page.
2. If private vulnerability reporting is enabled, submit a report there.
3. Include the affected version, browser and extension versions, reproduction steps, expected behavior, actual behavior, and relevant logs or screenshots.
4. Avoid including passwords, session cookies, authentication tokens, personal information, or other secrets.

If private reporting is unavailable, use GitHub's available contact options to request a private reporting channel. Do not assume that a public issue is confidential.

## Security Design Principles

The project aims to follow these principles:

- **Fail closed:** Unknown, unverified, stale, malformed, or inconsistent team metadata must not be treated as proof that an actor is an enemy.
- **Local-player exclusion:** The local player must never be selected as an enemy.
- **Ally exclusion:** Actors with the same verified team must be excluded from enemy selection.
- **Freshness checks:** Team metadata must have a valid timestamp and remain within the configured freshness window.
- **Minimal privileges:** The userscript declares `@grant none` and does not intentionally request privileged Tampermonkey APIs.
- **No credential collection:** The project should not collect or transmit passwords, session cookies, or authentication tokens.
- **Transparent limitations:** The script must not claim that its safety checks are effective in live gameplay unless the integration has been tested.

These principles describe intended behavior, not a guarantee that the current implementation is secure or compatible with every game version.

## Known Limitations

- The team-verification mechanism depends on a trusted source of team metadata. The current prototype does not independently establish that the game supplies trustworthy verification fields.
- Unit tests validate isolated safety-gate logic; they do not establish the security of the full userscript or its live-game integration.
- Internal game structures and browser behavior may change without notice.
- The project is not a substitute for the game's own security controls or anti-cheat systems.

## Scope

Reports are welcome for vulnerabilities in this repository's own code, including:

- Unsafe handling of browser events or page state.
- Unexpected script behavior or resource consumption.
- Incorrect handling of missing or malformed metadata.
- Failures in the intended local-player and teammate exclusion checks.
- Unintended collection or transmission of user data.

Do not access other users' accounts, attempt to obtain credentials, disrupt services, or test systems without authorization. Reports should use controlled, authorized testing.

## Disclosure and Response

The maintainer will review reports on a best-effort basis. A response timeline, severity classification, or security fix is not guaranteed.

If a report is accepted, the maintainer may investigate the issue, prepare a fix, and publish an advisory when appropriate.

## Maintainer

**GitHub:** [@cleonaia](https://github.com/cleonaia)

Thank you for helping improve the safety and reliability of this experimental project.
