/* Options — Cobalt.* vem de cobalt.js (todo o código é local, sem scripts remotos). */
const B = (typeof browser !== "undefined") ? browser : chrome;
const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  instanceUrl: "", apiKey: "",
  downloadMode: "auto", videoQuality: "1080",
  audioFormat: "mp3", filenameStyle: "basic",
  localAuto: true,
  sessionToken: "", sessionExp: 0, sessionInstance: ""
};

async function restore() {
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
    el.textContent = "usando Api-Key (token manual desnecessário)";
  } else if (Cobalt.isSessionValid(s, base)) {
    el.textContent = "válida até " + new Date(s.sessionExp).toLocaleString();
  } else if (s.sessionToken) {
    el.textContent = "expirado — cole um token válido";
  } else {
    el.textContent = "ausente";
  }
}

async function save() {
  const prev = await B.storage.sync.get(DEFAULTS);
  const instanceUrl = $("instanceUrl").value.trim().replace(/\/+$/, "");
  // Trocar de instância invalida a sessão antiga.
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
  $("msg").textContent = "Salvo!";
  renderSessionStatus(await B.storage.sync.get(DEFAULTS));
  setTimeout(() => ($("msg").textContent = ""), 2000);
}

async function test() {
  const base = Cobalt.normalizeInstance($("instanceUrl").value);
  if (!base) { $("msg").textContent = "Informe a URL primeiro."; return; }
  $("msg").textContent = "Testando…";
  try {
    const { json, status } = await Cobalt.fetchInstanceInfo(base);
    if (json.cobalt) {
      const c = json.cobalt;
      $("msg").textContent = `OK: Cobalt ${c.version}, ${c.services.length} serviços.` +
        (c.turnstileSitekey ? " Protegida: configure Api-Key ou JWT manual." : " Aberta (sem auth).");
    } else {
      $("msg").textContent = `HTTP ${status}: resposta inesperada.`;
    }
  } catch (e) {
    $("msg").textContent = e && e.message === "not-json-frontend"
      ? "URL do site/frontend, não da API (retornou HTML)."
      : "Falha: " + (e && e.message || e);
  }
}

async function clearSession() {
  await B.storage.sync.set({ sessionToken: "", sessionExp: 0, sessionInstance: "" });
  $("jwtToken").value = "";
  renderSessionStatus(await B.storage.sync.get(DEFAULTS));
  $("msg").textContent = "Sessão limpa.";
  setTimeout(() => ($("msg").textContent = ""), 2000);
}

async function refreshAntibot() {
  const el = $("antibotStatus");
  el.textContent = "consultando…";
  const r = await Cobalt.localHost(B, { cmd: "status" });
  if (!r || r.error === "native-missing") {
    el.textContent = "host nativo não instalado";
    return;
  }
  if (!r.ok) { el.textContent = "erro: " + (r.message || r.error); return; }
  const stack = r.stack || {};
  const yt = stack["cobalt-yt-session"] ? "poToken: gerador rodando" : "poToken: gerador parado";
  const ck = r.cookies || {};
  const cookies = ck.present
    ? (ck.services.length ? "cookies: " + ck.services.join(", ") : "cookies: arquivo vazio")
    : "cookies: ausente (~/cobalt-local/cookies.json)";
  el.textContent = `${yt} · ${cookies}`;
}

async function instanceRestart() {
  $("antibotStatus").textContent = "reiniciando…";
  await Cobalt.localHost(B, { cmd: "stop" });
  const r = await Cobalt.localHost(B, { cmd: "ensure-up", wait: 120 });
  await refreshAntibot();
  await refreshLocalStatus();
  $("msg").textContent = r && r.ok ? "Instância reiniciada." : "Falha: " + ((r && (r.message || r.error)) || "?");
}

async function refreshLocalStatus() {
  const el = $("localStatus");
  el.textContent = "consultando…";
  const r = await Cobalt.localHost(B, { cmd: "status" });
  if (!r || r.error === "native-missing") {
    el.textContent = "host nativo não instalado (rode native-host/install-host.sh)";
  } else if (!r.ok) {
    el.textContent = "erro: " + (r.message || r.error);
  } else if (r.running) {
    el.textContent = `rodando (Cobalt ${r.version || "?"})`;
  } else {
    el.textContent = "parada";
  }
}

async function localStart() {
  $("localStatus").textContent = "subindo…";
  const r = await Cobalt.localHost(B, { cmd: "ensure-up", wait: 90 });
  await refreshLocalStatus();
  $("msg").textContent = r && r.ok ? `Instância local no ar (Cobalt ${r.version}).` : "Falha: " + ((r && (r.message || r.error)) || "?");
}

async function localStop() {
  const r = await Cobalt.localHost(B, { cmd: "stop" });
  await refreshLocalStatus();
  $("msg").textContent = r && r.ok ? "Instância local parada." : "Falha: " + ((r && (r.message || r.error)) || "?");
}

async function localUse() {
  await B.storage.sync.set({ instanceUrl: Cobalt.LOCAL.url });
  $("instanceUrl").value = Cobalt.LOCAL.url;
  $("msg").textContent = "Instância local selecionada. Salve (ou já vale para o popup).";
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
