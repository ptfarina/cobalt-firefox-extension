# Compatibility + 1.3.0 release notes (AMO)

## Compatibility (Version Compatibility field)

- **Firefox desktop: 142.0 or later** (`strict_min_version: 142.0`,
  required by `data_collection_permissions`)
- **Firefox for Android: 142.0 or later** — full core (popup,
  download with progress, picker, options). Android caveats: context-menu
  items depend on OS support and the **local Docker instance feature does not
  apply** (no `nativeMessaging` on Android — the extension says so and keeps
  working with remote instances).
- **Manifest V2** (supported by Firefox, no announced removal).
- No OS dependency beyond Firefox (Docker/native host is optional and
  only for the local instance on Linux desktop; tested on Linux).

## 1.3.0 release notes (Release Notes field) — first public release

First public release of the extension.

- Video and audio downloads via the current Cobalt API (`imputnet/cobalt`):
  `tunnel`/`redirect` responses with **real progress**, `picker` with a choice
  list, and translated error messages.
- Works with **any instance**: your own, a community one, or a local one via
  Docker (starts when Firefox opens, stops on close; requires separate installer).
- **Authentication** for protected instances via Api-Key or manual JWT token,
  with validity readout and an instance check button (version + services).
- **Privacy**: with a blank instance (default), no network transmission happens;
  privacy policy included in the listing.
- Fully self-contained package (no remote code, no build) — Mozilla automated
  validation: 0 errors, 0 warnings, 0 notices.
