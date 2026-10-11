# Cobalt Media Downloader (Firefox)

A Firefox extension that uses the **current Cobalt API** ([imputnet/cobalt](https://github.com/imputnet/cobalt), see `docs/api.md`):

- `POST {instance}/` with `Accept: application/json` + `Content-Type: application/json`
- `tunnel` / `redirect` responses → downloaded via `downloads.download`
- `picker` → item list to choose from (popup + `picker.html`)
- `local-processing` → tunnel list
- `error` (incl. `api.auth.*`) → friendly message
- `GET {instance}/` → instance check (version + services)
- `Authorization: Api-Key …` / `Bearer …` support (protected instances)

## Why another extension?

| Existing extension | Status (Oct 2026) |
|---|---|
| `dimdenGD/cobalt-extension` (AMO `cobalt-downloader` v1.0.7, Nov 2024) | Uses legacy `GET /api/serverInfo` and `POST /api/json` endpoints (v7, shut down 11/11/2024) + `api.cobalt.tools` with bot protection. Stalled since 11/22/2024. **Broken.** |
| `kivirnz/cobalt-extension-fixed` (fork) | Same old code, only swaps the default to `cobalt.meowing.de`; `getApiVersion(/api/serverInfo)` fails on the new API → falls back to opening `?u=` on the web. MV3 manifest with `service_worker` (incompatible with Firefox) and fixed `host_permissions`. 2025 commits are README-only. **Not functionally maintained.** |
| `Solyphonous/CobaltExtension` (AMO `cobaltextension` v1.12.0) | Its own README warns the main API went down on 10/14/2024. Last commit 10/28/2024. **Abandoned.** |
| `quick cobalt`, `Cobalt Downloader for Rutube…`, `for YouTube` | Just open `cobalt.tools` with the URL — **they don't use the API**. |

In short: no Firefox extension correctly uses the current API (`POST /`, `status: tunnel|redirect|picker|error`, Api-Key/Bearer auth). Hence this one.

## Temporary install (testing)

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on** → select this folder's `manifest.json`.
3. Open **Options** and configure:
   - Instance URL (your own via [run-an-instance.md](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md), or a community one from https://instances.cobalt.best with the owner's permission).
   - Api-Key, if the instance requires it.
4. Use the toolbar button, the context menu (page/link/video), or the popup.

> The official `api.cobalt.tools` instance is **not** open to third parties (bot protection, requires permission). Don't use it as default.

## Local instance (recommended — starts with Firefox, stops on close)

Architecture: extension → native host (`native-host/cobalt_host.py`, via `nativeMessaging`)
→ docker container `cobalt-local` (image `ghcr.io/imputnet/cobalt:11`, API-only on 9000,
bound to `127.0.0.1`, no auth — localhost is trusted).

Lifecycle (zero cost with Firefox closed):
- opening Firefox → `ensure-up` (starts and waits for the API, up to ~60s on first run);
- every download with a local URL → ensured up before `POST /`;
- heartbeat every 2 min while open (only if the local instance was used this session);
- **closing Firefox → immediate `stop`** (`runtime.onSuspend`) + host supervisor
  that stops the container after ~6 min without heartbeat (covers crash, kill, suspend).

One-time setup:
```bash
sudo systemctl start docker        # daemon must be running (near-zero cost when idle)
cd cobalt-firefox-extension/native-host && ./install-host.sh
```
The script registers the native host in `~/.mozilla/native-messaging-hosts/`,
pulls the image and creates the container (`--restart no`: never starts on boot, only via Firefox).
Then, in the extension Options: **Use local instance** (fills `http://localhost:9000`).

Update the image: `docker pull ghcr.io/imputnet/cobalt:11` (with the container stopped).
Logs: `docker logs cobalt-local`. The port only listens on `127.0.0.1` (not exposed to the network).

## Anti-bot and logins (what was done, limits of each)

The local instance runs as a stack: `cobalt-local` (API) + `cobalt-yt-session`
(YouTube poToken generator, `YOUTUBE_SESSION_SERVER` already pointed). Idle cost:
~95 MB combined, 0% CPU — and everything stops with Firefox.

| Service | Mechanism | Status here |
|---|---|---|
| YouTube | automatic poToken | ❌ generator blocked on this IP (BotGuard times out — same block that empties streams); way out: cookies (below) |
| YouTube | `cookies.json` (your session) | ⏳ configured (`COOKIE_PATH` mounted, `cookies loaded successfully!`), **you still need to fill it in** |
| Instagram / Reddit / Twitter-X / Vimeo | `cookies.json` | ⏳ same scheme (see `~/cobalt-local/cookies.example.json`) |
| TikTok | — | out of scope (right-clicking the video already works) |
| VK / OK / Snapchat / Bilibili | — | no mechanism in Cobalt; still blocked |

How to fill in (5 min, only with your own accounts): install **Get cookies.txt LOCALLY** in
Firefox, export while logged into the service, and build `~/cobalt-local/cookies.json` in
the `cookies.example.json` format (only the cookies listed per service; e.g. YouTube: the
`cookie` and `b` values). Permission `600`. Then: Options → **Restart instance**.
Status (generator + services with cookies) shows in Options → Anti-bot. Privacy:
cookies are your account session — they never leave your machine (`127.0.0.1` bind).

## Per-service compatibility (tested 10/11/2026, local instance 11.7.1)

Real `POST /` matrix (the same call the extension makes) + picker UI validated
with a genuine 10-item Instagram response:

| Service | Result | Detail |
|---|---|---|
| YouTube | ⚠️ partial | `tunnel` OK (metadata), but the stream came back empty from this IP — typical anti-bot block; fixed with `cookies.json` on the instance (see below) |
| Twitter/X | ✅ | `redirect` straight to `video.twimg.com` |
| TikTok | ❌ | `fetch.fail` ×3 (TikTok anti-bot block) |
| Vimeo | ❌ | `fetch.fail` ×3, including a fresh URL (block) |
| Reddit | ❌ | `fetch.fail` (block/removed content) |
| SoundCloud | ✅ | valid `tunnel` MP3 (3.8 MB, with ID3) |
| Dailymotion | ✅ | 1080p `tunnel` |
| Facebook | ✅ | `redirect` to `fbcdn.net` (no login!) |
| Instagram | ✅ | `picker` with 10 items (carousel) |
| Bluesky | ✅ | mp4 `tunnel` |
| Tumblr | ✅ | `redirect` to `va.media.tumblr.com` |
| Pinterest | ✅ | `redirect` to `pinimg` |
| Twitch (clips) | ✅ | 1080p `redirect` |
| Rutube | ✅ | 1080p `tunnel` |
| Loom | ✅ | `redirect` to `cdn.loom.com` (2nd URL; 1st was dead) |
| Bilibili | ❌ | `fetch.empty` (page 403s from here — geo/block) |
| VK / OK | ❌ | `fetch.critical` (require login/token) |
| Snapchat | ❌ | `fetch.fail` (login required) |
| Streamable | ❌ | test IDs deleted (`empty`) |
| Newgrounds | ❌ | `critical`/`empty` (login or removed) |

All services are recognized (no `service.unsupported`); errors arrive
with clean codes that the popup translates (v1.1.2+). Instance limit: 40 req/60s —
parallel bursts yield `rate_exceeded`; the extension does 1 req per click.

**YouTube asking for cookies?** Create `~/cobalt-local/cookies.json` in the format of
[examples/cookies.example.json](https://github.com/imputnet/cobalt/blob/main/docs/examples/cookies.example.json),
recreate the container with `-v ~/cobalt-local/cookies.json:/cookies.json -e COOKIE_PATH=/cookies.json`
and done (cookies from your Google account, exported via the browser).

## If a download gets stuck on "starting"

Since v1.1.1 the extension truly tracks downloads:
- **Popup**: shows progress (downloaded/total MB), "Done" or the failure reason
  (`NETWORK_FAILED`, `FILE_ACCESS_DENIED`…) with **Open direct link**,
  **Copy link** and **Retry** buttons. Also check `about:downloads`.
- **Context menu**: notifies on completion; on failure the notification opens the direct link.
- Note: `redirect` responses (e.g. Twitter → `video.twimg.com`) are direct service
  links — if the manager stalls, the direct link in a new tab almost always works.

## Which API URL should I use?

- The **site** `https://cobalt.meowing.de` is just the web frontend (returns HTML — causes JSON errors).
- The **API** is `https://cobalt-api.meowing.de` (verified: Cobalt 11.7.1, 22 services).
  It requires authentication, and the paths that work in extensions are **Api-Key**
  (requested from the owner) or a manually pasted **JWT** in Options (the extension reads
  validity from the token itself). The Turnstile challenge can't run inside the extension:
  AMO policy forbids remote code and Cloudflare only accepts the site's own domain.
- Alternatives: your own instance ([guide](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md))
  or community APIs from https://instances.cobalt.best (with the owner's permission).

## Privacy

The extension sends the media URL **only** to the Cobalt instance you configure
(which is why `manifest.json` declares `data_collection_permissions: ["websiteActivity"]`).
Api-Key and session token live in `storage.sync` (synced with your Firefox account
in plaintext — standard extension behavior; use a password-protected profile).
No data is sent to the extension authors. Leave the instance blank
to transmit nothing.

Security (audited): no `eval`/`innerHTML` with external data (`textContent` only),
no inline scripts (strict CSP), API URLs validated to `http(s)` before
downloading/opening (blocks `javascript:`/`data:` from a malicious instance), native host
restricted to fixed docker commands, no `shell=True`.

## License

MIT © 2026 ptfarina — see [LICENSE](LICENSE). In short: you may use, copy, modify,
merge, publish, distribute, sublicense and sell this software, provided the copyright
notice is kept; it comes **without any warranty**. `native-host/` and docs are covered
by the same license. This project is independent from Cobalt itself
([imputnet/cobalt](https://github.com/imputnet/cobalt), AGPL-3.0): it only talks to
Cobalt instances over HTTP and bundles none of their code, so no copyleft applies here.
The icons are original artwork drawn for this project.

## Packaging for AMO

```bash
# from the repo root; versioned file, e.g.:
python3 -c "
import zipfile
files = ['manifest.json','cobalt.js','background.js','popup.html','popup.js','popup.css','options.html','options.js','picker.html','picker.js','icons/icon-48.png','icons/icon-96.png','icons/icon-128.png']
with zipfile.ZipFile('cobalt-firefox-extension-amo-1.3.0.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in files: z.write('cobalt-firefox-extension/'+f, f)
"
```

Then submit at https://addons.mozilla.org/developers/ (listed channel).
`native-host/`, docs and screenshots stay out of the package by design.

## Structure

- `manifest.json` (MV2, `browser_specific_settings.gecko`, `default_locale: en`)
- `_locales/en` + `_locales/pt_BR` — full UI i18n (extension picks the browser language)
- `cobalt.js` — shared helpers: API calls, auth headers, session/JWT, URL allow-list
- `background.js` — context menus + local lifecycle (ensure-up/heartbeat/stop) + download tracking
- `popup.html/js/css` — quick UI (URL, mode, quality, progress, picker)
- `options.html/js` — instance, Api-Key/JWT, local stack, cookies, defaults
- `picker.html/js` — fallback for `picker` results coming from the context menu
- `native-host/` — `cobalt_host.py` lifecycle host + `install-host.sh` installer
