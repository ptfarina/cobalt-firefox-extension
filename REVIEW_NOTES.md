# Notas ao revisor (AMO) — Cobalt Media Downloader

> Colar no campo **Notes to reviewer**. Em inglês.

---

**No build step / no minification:** the package contains only hand-written
HTML/CSS/JS loaded as-is (no bundler, transpiler, or generated code). Nothing
to reproduce — the submitted files ARE the source. Icons are simple PNGs drawn
programmatically (flat download-arrow glyph); no layered source exists.

**How to test (2 min, no account needed):**
1. Run an open local API: `docker run -d -p 127.0.0.1:9000:9000 -e API_URL=http://localhost:9000/ ghcr.io/imputnet/cobalt:11`
2. Open the extension Options, set instance to `http://localhost:9000`, and
   UNCHECK "start with Firefox" (that checkbox needs the optional native host,
   see below) → click Test, then download e.g. a SoundCloud track or YouTube video.
3. Expected: `tunnel`/`redirect` downloads via `downloads.download` with live
   progress; carousels (e.g. Instagram) render a picker list.

**Sensitive permissions — justification:**
- `nativeMessaging` (host `com.cobalt.local`): OPTIONAL power feature that
  starts/stops the user's own local Cobalt Docker containers with Firefox.
  The host script only runs fixed `docker start/stop/inspect` commands against
  two hardcoded container names — never arbitrary input, no `shell=True`.
  The host is NOT in this package (AMO can't distribute native hosts); it is
  installed separately from the project's `native-host/install-host.sh`.
  Without it the extension shows "native host not installed" and works
  normally with remote instances. `allowed_extensions` matches this add-on ID.
- `<all_urls>`: the user may point the extension at ANY self-hosted API URL
  (including LAN/`localhost`), so hosts cannot be enumerated in advance.
- `downloads`: saves the resolved media files. `tabs`: prefill popup with the
  active tab URL + open direct-link fallback. `notifications`: completion/failure
  of context-menu downloads. `alarms`: 2-min heartbeat keeping the local stack
  alive while Firefox is open. `clipboardWrite`: "copy link" button.
  `storage`: instance URL, Api-Key/JWT, quality prefs. `contextMenus`/`menus`:
  page/link/media items.
- No remote code (a previous version loaded Cloudflare Turnstile; removed in
  1.3.0 — manifest has no custom CSP). No `eval`, no `innerHTML` with external
  data (only `textContent`), no inline scripts. API-returned URLs are
  allow-listed to `http(s)` before download/open (blocks `javascript:`/`data:`).

**Data & consent:** declares `websiteActivity` (the media URL is POSTed only to
the user-configured instance, only on explicit download click; blank instance =
zero transmission). Matches the filed Privacy Policy; qualifies for implicit
consent (self-evident single-use), and the listing states this upfront.
