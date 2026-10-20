# Security Policy

Cobalt Media Downloader is a Firefox extension (Manifest V2) that downloads media
through a [Cobalt](https://github.com/imputnet/cobalt) API instance. This document
explains how to report a vulnerability and, importantly, **what the extension trusts**
— so you can tell a real bug from expected behaviour.

## Supported versions

| Version | Supported |
| ------- | --------- |
| `v1.3.0` (latest release) | ✅ |
| `main` (unreleased, where fixes land first) | ✅ |
| `< v1.3.0` | ❌ — upgrade |

The extension requires Firefox **142+** (`browser_specific_settings.gecko.strict_min_version`).
There is no separate build for other browsers: the AMO package is plain HTML/CSS/JS with
no bundler, no minifier and no remote code.

## Reporting a vulnerability

**Do not open a public issue** for a security problem.

Use GitHub's private reporting — this repository has **private vulnerability reporting
enabled**: open the **Security** tab of
[ptfarina/cobalt-firefox-extension](https://github.com/ptfarina/cobalt-firefox-extension)
→ **Report a vulnerability**. You get a private thread that only the maintainer sees,
and you can stay anonymous.

If the issue affects a version already published on
[addons.mozilla.org](https://addons.mozilla.org/firefox/addon/cobalt-media-downloader/),
mention that in the report so it can be pulled while the fix is prepared.

Please include:

- the extension version (Help → About Add-ons) and Firefox version;
- the steps to reproduce, ideally with a URL or payload that demonstrates the issue;
- the expected behaviour and the impact you observed;
- whether the issue needs a hostile **instance** (see the trust model below) or happens
  with a normal one.

### What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement | 3 business days |
| Triage and severity assessment | 7 days |
| Fix released | 30 days for High/Critical, next release for Medium/Low |

You will be kept in the loop, and credited in the release notes unless you prefer
otherwise. If a fix needs a new release, the release is tagged and listed on the
Releases page; the advisory is published after the fix ships.

## Security model

This is the part that matters most for this project, because the extension talks to a
**third-party server that the user chooses**.

**Trusted by design (not a vulnerability):**

- **The Cobalt instance configured by the user.** It receives the media URL you ask to
  download and, if you set one, your `Api-Key`/JWT. A hostile or compromised instance can
  therefore see what you download and read your credentials. Use an instance you trust
  (your own, the local Docker one, or a community one you have permission to use).
- **The local Docker stack** (`cobalt-local`, `cobalt-yt-session`) and your
  `~/cobalt-local/cookies.json`. Those run under your own account, on your machine.
- **The native messaging host** (`native-host/cobalt_host.py`), installed by you from
  this repository. It is **not** part of the AMO package (AMO cannot distribute native
  hosts); it only issues fixed `docker start/stop/inspect` commands against two
  hardcoded container names, never with `shell=True` and never with user-supplied
  arguments.

**What the extension guarantees:**

- The media URL is sent **only** to the configured instance, and **only** when you
  trigger a download. With a blank instance URL, nothing is transmitted.
- **Every URL returned by the instance is validated** to `http:`/`https:` before it is
  downloaded or opened in a tab (`Cobalt.isSafeUrl`), so a malicious instance cannot
  hand you a `javascript:`, `data:` or `blob:` URL.
- **No remote code, no `eval`, no `new Function`, no `document.write`.** The Manifest V2
  default CSP (`script-src 'self'`) applies; there are no inline scripts.
- **No `innerHTML` with external data.** Data coming from the API is inserted with
  `textContent` and real DOM nodes. The only markup the extension renders is the
  static locale catalogue (`_locales/*/messages.json`), and it goes through an
  allowlist sanitizer (`renderLocaleMarkup`, in `cobalt.js`): only known tags
  (`b/strong/i/em/u/code/pre/br/p/span/ul/ol/li/a`) and, for `<a>`, only `href`/`title`
  with an `http(s)`-validated `href` survive.
- **No exfiltration.** There are no analytics, ads, remote logs or identifiers. The
  extension does not read cookies, history, bookmarks, `localStorage` or `sessionStorage`,
  and has no `content_scripts` — it never injects code into the pages you visit. The
  only outbound requests are to the instance you configured: the API call itself, and
  the thumbnails (if the instance provides them) that the picker/options list loads.
- **Permissions are minimal for what the extension does**: `tabs` (prefill the popup with
  the active tab), `downloads`, `notifications`, `alarms`, `storage`, `nativeMessaging`,
  `clipboardWrite`, `contextMenus` and `<all_urls>` — the last one only so the extension
  can call the instance URL *you* configure, including `localhost` or a LAN address.
  There is no `cookies`, `history`, `webRequest`, `bookmarks` or `management` permission.
- **Credentials** (`Api-Key`, manual JWT) live in `storage.sync`, i.e. they are stored
  in plaintext and synchronised with your Firefox account if sync is enabled. This is
  documented in [PRIVACY.md](PRIVACY.md). Use a password-protected browser profile if
  that matters to you.

**Please do report as a vulnerability (this is a bug, not expected behaviour):**

- an instance response that leads the extension to execute code, open a non-`http(s)`
  URL, or write attacker-controlled markup into a page;
- the extension sending data anywhere other than the configured instance;
- the native host executing a command that is not one of the fixed `docker` calls;
- anything that leaks your `Api-Key`, JWT, cookies or browsing data.

## Out of scope

- The behaviour of a **hostile instance** (as described above: it is trusted by
  design). Only *how* the extension handles that instance's responses is in scope.
- The [Cobalt project itself](https://github.com/imputnet/cobalt) (API, extractors,
  anti-bot handling, its own instances) — report those upstream.
- Your own Docker daemon, the `cookies.json` file, and the security of the
  `ghcr.io/imputnet/cobalt` image.
- Service-side blocks: rate limits, `fetch.fail`, anti-bot walls, and links that were
  removed or require a login are **functional** issues, not security issues.
- Feature requests, translation fixes and UI polish — open a normal issue for those.
- Reports generated only by an automated scanner, with no working proof of concept.

## Automated checks

The repository runs [CodeQL](https://codeql.github.com/) on every push and pull request
and weekly, for both JavaScript and Python (the native host). Security fixes land on
`main` through pull requests only; `main` is protected.
