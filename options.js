/* Options — Cobalt.* comes from cobalt.js (all the code is local, no remote scripts).
 * Texts via Cobalt.T() / _locales (en default, pt_BR). */
const B = (typeof browser !== "undefined") ? browser : chrome;
const $ = (id) => document.getElementById(id);
const T = (k, ...subs) => Cobalt.T(k, subs.length ? subs : undefined);

const DEFAULTS = {
  instanceUrl: "", apiKey: "",
  downloadMode: "auto", videoQuality: "1080",
  audioFormat: "mp3", filenameStyle: "basic",
  localAuto: true,
  sessionToken: "", sessionExp: 0, sessionInstance: ""
};

async function restore() {
  Cobalt.applyI18n(document);
  const s = await B.storage.sync.get(DEFAULTS);
  $("instanceUrl").value = s.instanceUrl;
  $("apiKey").value = s.apiKey;
  $("downloadMode").value = s.downloadMode;
  $("videoQuality").value = s.videoQuality;
  $("audioFormat").value = s.audioFormat;
  $("filenameStyle").value = s.filenameStyle;
  $("localAuto").checked = s.localAuto !== false;
  $("jwtToken").value = s.sessionToken || "";
  renderSessionStatus(s);
  refreshLocalStatus();
  refreshAntibot();
}

function renderSessionStatus(s) {
  const el = $("sessionStatus");
  const base = Cobalt.normalizeInstance(s.instanceUrl || $("instanceUrl").value);
  if ((s.apiKey || "").trim()) {
    el.textContent = T("optSessionUsingKey");
  } else if (Cobalt.isSessionValid(s, base)) {
    el.textContent = T("optAuthSavedUntil", new Date(s.sessionExp).toLocaleString());
  } else if (s.sessionToken) {
    el.textContent = T("optSessionExpired");
  } else {
    el.textContent = T("optSessionAbsent");
  }
}

async function save() {
  const prev = await B.storage.sync.get(DEFAULTS);
  const instanceUrl = $("instanceUrl").value.trim().replace(/\/+$/, "");
  // Switching instance invalidates the old session.
  const sameInstance = Cobalt.normalizeInstance(prev.sessionInstance || prev.instanceUrl) === Cobalt.normalizeInstance(instanceUrl);
  const jwt = $("jwtToken").value.trim();
  let sessionToken = "", sessionExp = 0, sessionInstance = "";
  if (jwt) {
    const exp = Cobalt.jwtExpiryMs(jwt);
    sessionToken = jwt;
    sessionExp = exp || (Date.now() + 3600 * 1000); // sem exp legível: assume 1h
    sessionInstance = instanceUrl;
  } else if (sameInstance) {
    sessionToken = prev.sessionToken; sessionExp = prev.sessionExp; sessionInstance = prev.sessionInstance;
  }
  await B.storage.sync.set({
    instanceUrl,
    apiKey: $("apiKey").value.trim(),
    downloadMode: $("downloadMode").value,
    videoQuality: $("videoQuality").value,
    audioFormat: $("audioFormat").value,
    filenameStyle: $("filenameStyle").value,
    localAuto: $("localAuto").checked,
    sessionToken, sessionExp, sessionInstance
  });
  $("msg").textContent = T("optSaved");
  renderSessionStatus(await B.storage.sync.get(DEFAULTS));
  setTimeout(() => ($("msg").textContent = ""), 2000);
}

async function test() {
  const base = Cobalt.normalizeInstance($("instanceUrl").value);
  if (!base) { $("msg").textContent = T("optNeedUrl"); return; }
  $("msg").textContent = T("optTesting");
  try {
    const { json, status } = await Cobalt.fetchInstanceInfo(base);
    if (json.cobalt) {
      const c = json.cobalt;
      $("msg").textContent = T("optTestOk", String(c.version), String(c.services.length)) + " " +
        (c.turnstileSitekey ? T("optProtected") : T("optOpenInstance"));
    } else {
      $("msg").textContent = T("testUnexpected", String(status));
    }
  } catch (e) {
    $("msg").textContent = e && e.message === "not-json-frontend"
      ? T("optNotFrontend")
      : T("optLocalFailed", (e && e.message) || e);
  }
}

async function clearSession() {
  await B.storage.sync.set({ sessionToken: "", sessionExp: 0, sessionInstance: "" });
  $("jwtToken").value = "";
  renderSessionStatus(await B.storage.sync.get(DEFAULTS));
  $("msg").textContent = T("optSessionCleaned");
  setTimeout(() => ($("msg").textContent = ""), 2000);
}

async function refreshAntibot() {
  const el = $("antibotStatus");
  el.textContent = T("optLocalChecking");
  const r = await Cobalt.localHost(B, { cmd: "status" });
  if (!r || r.error === "native-missing") {
    el.textContent = T("optLocalNoHost");
    return;
  }
  if (!r.ok) { el.textContent = T("optLocalError", (r.message || r.error)); return; }
  const stack = r.stack || {};
  const yt = stack["cobalt-yt-session"] ? T("optYtOn") : T("optYtOff");
  const ck = r.cookies || {};
  const cookies = T("optCk", ck.present
    ? (ck.services.length ? ck.services.join(", ") : T("optCkEmpty"))
    : T("optCkAbsent"));
  el.textContent = `${yt} · ${cookies}`;
}

async function instanceRestart() {
  $("antibotStatus").textContent = T("optRestarting");
  await Cobalt.localHost(B, { cmd: "stop" });
  const r = await Cobalt.localHost(B, { cmd: "ensure-up", wait: 120 });
  await refreshAntibot();
  await refreshLocalStatus();
  $("msg").textContent = r && r.ok ? T("optRestarted") : T("optLocalFailed", ((r && (r.message || r.error)) || "?"));
}

async function refreshLocalStatus() {
  const el = $("localStatus");
  el.textContent = T("optLocalChecking");
  const r = await Cobalt.localHost(B, { cmd: "status" });
  if (!r || r.error === "native-missing") {
    el.textContent = T("optLocalNoHost");
  } else if (!r.ok) {
    el.textContent = T("optLocalError", (r.message || r.error));
  } else if (r.running) {
    el.textContent = T("optLocalRunning", String(r.version || "?"));
  } else {
    el.textContent = T("optLocalStopped");
  }
}

async function localStart() {
  $("localStatus").textContent = T("optLocalStarting");
  const r = await Cobalt.localHost(B, { cmd: "ensure-up", wait: 90 });
  await refreshLocalStatus();
  $("msg").textContent = r && r.ok ? T("optLocalStarted", String(r.version)) : T("optLocalFailed", ((r && (r.message || r.error)) || "?"));
}

async function localStop() {
  const r = await Cobalt.localHost(B, { cmd: "stop" });
  await refreshLocalStatus();
  $("msg").textContent = r && r.ok ? T("optLocalStoppedMsg") : T("optLocalFailed", ((r && (r.message || r.error)) || "?"));
}

async function localUse() {
  await B.storage.sync.set({ instanceUrl: Cobalt.LOCAL.url });
  $("instanceUrl").value = Cobalt.LOCAL.url;
  $("msg").textContent = T("optLocalUse");
  await save();
}

document.addEventListener("DOMContentLoaded", () => {
  restore();
  $("save").addEventListener("click", save);
  $("test").addEventListener("click", test);
  $("clearSession").addEventListener("click", clearSession);
  $("localUse").addEventListener("click", localUse);
  $("localStart").addEventListener("click", localStart);
  $("localStop").addEventListener("click", localStop);
  $("localRefresh").addEventListener("click", refreshLocalStatus);
  $("antibotRefresh").addEventListener("click", refreshAntibot);
  $("instanceRestart").addEventListener("click", instanceRestart);
});
