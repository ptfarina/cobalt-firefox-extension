/* Cobalt Media Downloader — background (MV2, Firefox-first)
 * Compatible with the current imputnet/cobalt API:
 *   POST {instance}/  (Accept + Content-Type: application/json)
 *   GET  {instance}/  (instance info)
 * Respostas: tunnel | redirect | picker | error (+ local-processing)
 */

const B = (typeof browser !== "undefined") ? browser : chrome;

// true if we started the local instance this session: enables heartbeat and stop on close.
let localActive = false;

const SUPPORTED_PATTERNS = [
  "*://*.youtube.com/*",
  "*://youtu.be/*",
  "*://*.tiktok.com/*",
  "*://*.instagram.com/*",
  "*://*.twitter.com/*",
  "*://*.x.com/*",
  "*://*.facebook.com/*",
  "*://*.reddit.com/*",
  "*://*.vimeo.com/*",
  "*://*.dailymotion.com/*",
  "*://*.soundcloud.com/*",
  "*://*.twitch.tv/*",
  "*://*.bilibili.com/*",
  "*://*.pinterest.com/*",
  "*://*.tumblr.com/*",
  "*://*.vk.com/*",
  "*://*vkvideo.ru/*",
  "*://*.ok.ru/*",
  "*://*.rutube.ru/*",
  "*://*.twitch.tv/*",
  "*://*.streamable.com/*",
  "*://*.bsky.app/*",
  "*://*.loom.com/*",
  "*://*.newgrounds.com/*",
  "*://*.snapchat.com/*"
];

function normalizeInstance(raw) {
  let u = (raw || "").trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

async function getSettings() {
  const d = await B.storage.sync.get({
    instanceUrl: "",
    apiKey: "",
    downloadMode: "auto",
    videoQuality: "1080",
    audioFormat: "mp3",
    audioBitrate: "128",
    filenameStyle: "basic",
    localAuto: true,
    sessionToken: "",
    sessionExp: 0,
    sessionInstance: ""
  });
  return d;
}

/** Main call to the current Cobalt API. Returns the parsed JSON. */
async function cobaltRequest(instanceUrl, apiKey, body, settings) {
  const base = normalizeInstance(instanceUrl);
  if (!base) throw new Error("missing-instance");
  const headers = Cobalt.authHeaders(apiKey, settings, base);
  const res = await fetch(base + "/", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!(res.headers.get("content-type") || "").includes("application/json")) {
    // Probably the web frontend URL (HTML) instead of the API, or an http→https redirect.
    throw new Error("not-json-frontend");
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`http-${res.status}`);
  }
  if (!res.ok && json.status !== "error") {
    throw new Error(`http-${res.status}`);
  }
  return json;
}

async function downloadUrl(url, filename) {
  if (!Cobalt.isSafeUrl(url)) {
    notify(Cobalt.T("notifUnsafeUrlT"), Cobalt.T("errUnsafeUrl"));
    return;
  }
  let id;
  try {
    id = await B.downloads.download({ url, filename: filename || undefined, saveAs: false, conflictAction: "uniquify" });
  } catch (e) {
    // immediate fallback: open in a new tab (useful for direct service redirects)
    try { await B.tabs.create({ url }); } catch {}
    return;
  }
  // records it so onChanged can report the result (persisted to survive an unload)
  try {
    const store = await B.storage.local.get({ pendingDl: {} });
    store.pendingDl[id] = { url, filename: filename || Cobalt.T("defaultFilename"), at: Date.now() };
    await B.storage.local.set({ pendingDl: store.pendingDl });
  } catch {}
}

// Follows downloads started from the menu: reports completion and, on failure,
// offers the direct link (the "starting" status never goes silent).
B.downloads && B.downloads.onChanged && B.downloads.onChanged.addListener(async (delta) => {
  if (!delta || delta.id == null || !delta.state || !delta.state.current) return;
  const cur = delta.state.current;
  if (cur !== "complete" && cur !== "interrupted") return;
  let entry;
  try {
    const store = await B.storage.local.get({ pendingDl: {} });
    entry = store.pendingDl[delta.id];
    delete store.pendingDl[delta.id];
    await B.storage.local.set({ pendingDl: store.pendingDl });
  } catch {}
  if (!entry) return;
  if (cur === "complete") {
    notify(Cobalt.T("notifDoneT"), entry.filename);
    return;
  }
  let reason = "interrompido";
  try {
    const it = (await B.downloads.search({ id: delta.id }))[0];
    if (it && it.error) reason = it.error;
  } catch {}
  notifyFailure(entry, reason);
});

const fallbackTabs = {}; // notificationId -> url do link direto
function notifyFailure(entry, reason) {
  const msg = Cobalt.T("notifFailM", [entry.filename, reason]);
  try {
    const p = B.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: Cobalt.T("notifFailT"),
      message: String(msg).slice(0, 200),
      buttons: [{ title: Cobalt.T("notifOpenLink") }]
    });
    Promise.resolve(p).then((nid) => { fallbackTabs[nid] = entry.url; });
  } catch {
    notify(Cobalt.T("notifFailT"), msg);
  }
}

function openFallback(nid) {
  const url = fallbackTabs[nid];
  if (!url || !Cobalt.isSafeUrl(url)) return;
  delete fallbackTabs[nid];
  B.tabs.create({ url }).catch(() => {});
  try { B.notifications.clear(nid); } catch {}
}

B.notifications && B.notifications.onButtonClicked && B.notifications.onButtonClicked.addListener(openFallback);
B.notifications && B.notifications.onClicked && B.notifications.onClicked.addListener(openFallback);

function notify(title, message) {
  try {
    return B.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title,
      message: String(message).slice(0, 200)
    });
  } catch { /* sem permissão — ignora */ }
}

async function handleDownload(sourceUrl) {
  const s = await getSettings();
  if (!s.instanceUrl) {
    notify(Cobalt.T("notifNoInstanceT"), Cobalt.T("notifNoInstanceM"));
    B.runtime.openOptionsPage && B.runtime.openOptionsPage();
    return { status: "error", error: { code: "extension.missing-instance" } };
  }
  if (Cobalt.isLocalUrl(s.instanceUrl) && s.localAuto !== false) {
    const up = await Cobalt.ensureLocalIfNeeded(B, Cobalt.normalizeInstance(s.instanceUrl));
    if (!up.ok) {
      notify(Cobalt.T("notifLocalT"), up.message);
      return { status: "error", error: { code: "extension.local-down" } };
    }
    localActive = true;
  }
  try {
    const json = await cobaltRequest(s.instanceUrl, s.apiKey, {
      url: sourceUrl,
      downloadMode: s.downloadMode || "auto",
      videoQuality: s.videoQuality || "1080",
      audioFormat: s.audioFormat || "mp3",
      audioBitrate: s.audioBitrate || "128",
      filenameStyle: s.filenameStyle || "basic"
    }, s);

    if (json.status === "tunnel" || json.status === "redirect") {
      await downloadUrl(json.url, json.filename);
      return json;
    }
    if (json.status === "picker") {
      // Saved for picker.html to display; opens a tab with the options.
      await B.storage.local.set({ lastPicker: { sourceUrl, at: Date.now(), result: json } });
      await B.tabs.create({ url: B.runtime.getURL("picker.html") });
      return json;
    }
    if (json.status === "local-processing") {
      await B.storage.local.set({ lastPicker: { sourceUrl, at: Date.now(), result: json } });
      await B.tabs.create({ url: B.runtime.getURL("picker.html") });
      return json;
    }
    // error
    const code = (json.error && json.error.code) || "unknown";
    if (Cobalt.needsAuth(code) && !(s.apiKey || "").trim()) {
      // Missing/expired session (JWT): clears it and asks the user to reconfigure.
      try { await B.storage.sync.set({ sessionToken: "", sessionExp: 0 }); } catch {}
      notify(Cobalt.T("notifAuthT"), Cobalt.friendlyError(code));
    } else {
      notify(Cobalt.T("notifFailT"), friendlyError(code));
    }
    return json;
  } catch (e) {
    if (e && e.message === "not-json-frontend") {
      notify(Cobalt.T("notifFrontendT"), Cobalt.T("notifFrontendM"));
    } else {
      notify(Cobalt.T("notifNetT"), String((e && e.message) || e));
    }
    return { status: "error", error: { code: "extension.fetch-failed", context: { message: String((e && e.message) || e) } } };
  }
}

function friendlyError(code) {
  return Cobalt.friendlyError(code);
}

// ---- context menus ----
function setupMenus() {
  try { B.contextMenus.removeAll(() => createMenus()); }
  catch { createMenus(); }
}
function createMenus() {
  try {
    B.contextMenus.create({
      id: "cobalt-page",
      title: Cobalt.T("menuPage"),
      contexts: ["page"],
      documentUrlPatterns: SUPPORTED_PATTERNS
    });
    B.contextMenus.create({
      id: "cobalt-link",
      title: Cobalt.T("menuLink"),
      contexts: ["link"],
      targetUrlPatterns: SUPPORTED_PATTERNS
    });
    B.contextMenus.create({
      id: "cobalt-video",
      title: Cobalt.T("menuMedia"),
      contexts: ["video", "audio"]
    });
  } catch (e) { console.warn("menus:", e); }
}

B.runtime.onInstalled.addListener(onBoot);
B.runtime.onStartup && B.runtime.onStartup.addListener(onBoot);
try { onBoot(); } catch {}

async function onBoot() {
  setupMenus();
  try { B.alarms.create("cobalt-heartbeat", { periodInMinutes: Cobalt.LOCAL.heartbeatMinutes }); } catch {}
  try {
    const s = await getSettings();
    if (Cobalt.isLocalUrl(s.instanceUrl) && s.localAuto !== false) {
      const up = await Cobalt.ensureLocalIfNeeded(B, Cobalt.normalizeInstance(s.instanceUrl));
      if (up.ok) localActive = true;
      else console.warn("cobalt local:", up.message);
    }
  } catch (e) { console.warn("cobalt boot:", e); }
}

B.alarms && B.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm && alarm.name === "cobalt-heartbeat" && localActive) {
    try { await Cobalt.localHost(B, { cmd: "ping" }); } catch {}
  }
});

// Best effort: stop when Firefox closes. Even if this message never
// reaches the shutdown handler, the host supervisor stops the container on idle
// (no heartbeat => Firefox closed), so the instance always shuts down.
B.runtime.onSuspend && B.runtime.onSuspend.addListener(() => {
  if (localActive) {
    try { B.runtime.sendNativeMessage(Cobalt.LOCAL.host, { cmd: "stop" }); } catch {}
  }
});

B.contextMenus.onClicked.addListener(async (info, tab) => {
  // For the media item (<video>/<audio>) the target is the file itself (info.srcUrl),
  // not the page containing it; link uses info.linkUrl and anything else uses the tab.
  const target = info.menuItemId === "cobalt-link"
    ? info.linkUrl
    : ((info.menuItemId === "cobalt-video" && info.srcUrl) || (tab && tab.url));
  if (target) await handleDownload(target);
});

// Icon click without the popup? (the popup exists; this listener stays as a fallback)
B.browserAction && B.browserAction.onClicked && B.browserAction.onClicked.addListener(async (tab) => {
  if (tab && tab.url && /^https?:/.test(tab.url)) await handleDownload(tab.url);
});

// Messages from the popup/options/picker (reusing the same logic)
B.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === "cobalt-download") {
      sendResponse(await handleDownload(msg.url));
    } else if (msg && msg.type === "cobalt-request") {
      const s = await getSettings();
      sendResponse(await cobaltRequest(
        msg.instanceUrl || s.instanceUrl,
        msg.apiKey !== undefined ? msg.apiKey : s.apiKey,
        msg.body,
        s
      ));
    } else if (msg && msg.type === "cobalt-instance-info") {
      const base = normalizeInstance(msg.instanceUrl || (await getSettings()).instanceUrl);
      const r = await fetch(base + "/", { headers: { "Accept": "application/json" } });
      if (!(r.headers.get("content-type") || "").includes("application/json")) {
        sendResponse({ ok: false, status: r.status, notJson: true });
      } else {
        sendResponse({ ok: r.ok, status: r.status, json: await r.json() });
      }
    }
  })().catch((e) => {
    try { sendResponse({ status: "error", error: { code: "extension.fetch-failed", context: { message: String(e && e.message || e) } } }); } catch {}
  });
  return true; // resposta assíncrona
});
