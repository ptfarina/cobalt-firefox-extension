# Listing description (AMO) — Cobalt Media Downloader

> Paste into the product page **Description** field. The first 250
> characters carry the essentials (as AMO recommends).

---

Download videos and audio from YouTube, TikTok, Instagram, Twitter/X, Reddit, Vimeo and more using the Cobalt API (imputnet/cobalt). The media URL is sent only to the instance configured by you, and only when you click to download — no tracking.

## Features

- **1-click download**: toolbar button, context menu (page, link, video/audio) and popup prefilled with the active tab.
- **Format options**: video/audio/mute mode, quality (144p–4K/max), audio (mp3, opus, ogg, wav), filename style.
- **Multiple items**: carousels and galleries (e.g. Instagram) open a list to choose what to download.
- **Real tracking**: progress in MB, completion notice and, on failure, the reason + direct-link, copy-link and retry buttons.
- **Any instance**: use your own instance, a community one, or the local one via Docker.
- **Authentication**: Api-Key or manual JWT token for protected instances.
- **Instance check**: verifies version and supported services before downloading.

## Local instance (optional, via Docker)

The extension can start its own API (`http://localhost:9000`) when Firefox opens and **stop it on close** — zero cost with the browser closed. Requires the Docker daemon and the `native-host/install-host.sh` installer (included in the repository). Includes a YouTube session generator and `cookies.json` support for login-walled services. Without the local part, the extension works normally with any remote instance.

## Supported services

YouTube, Twitter/X, TikTok, Instagram, Facebook, Reddit, Vimeo, Dailymotion, SoundCloud, Bluesky, Tumblr, Pinterest, Twitch (clips), Rutube, Loom, Bilibili, VK, OK, Snapchat, Streamable, Newgrounds — depending on the instance (the local one covers 21 services; tested: guide in the repository).

## Privacy

Only the URL you choose to download is sent, and only to your instance. With a blank instance (default), nothing is transmitted. No analytics, ads or identifiers. Details in the Privacy Policy. 100% local, auditable code.

## Common issues

- *"Frontend URL, not the API"*: set the base **API** URL (e.g. `https://cobalt-api.example`), not the website's.
- *JSON/auth error*: check Api-Key/JWT or use an open/local instance.
- *Login-walled service* (e.g. YouTube blocking streams): export your cookies to `cookies.json` — guide in the repository.
