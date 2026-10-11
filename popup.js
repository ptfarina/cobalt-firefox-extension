/* Popup — chama a API atual do Cobalt (POST /) e trata tunnel/redirect/picker/error.
 * Helpers compartilhados em cobalt.js (global Cobalt), carregado antes deste script. */
const B = (typeof browser !== "undefined") ? browser : chrome;
const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const s = await B.storage.sync.get({
    instanceUrl: "", apiKey: "",
    downloadMode: "auto", videoQuality: "1080",
    audioFormat: "mp3", audioBitrate: "128", filenameStyle: "basic",
    sessionToken: "", sessionExp: 0, sessionInstance: ""
  });
  $("downloadMode").value = s.downloadMode;
  $("videoQuality").value = s.videoQuality;
  $("audioFormat").value = s.audioFormat;
  $("filenameStyle").value = s.filenameStyle;
  $("instanceLine").textContent = s.instanceUrl ? Cobalt.normalizeInstance(s.instanceUrl) : "instância não configurada";
  const sessEl = $("sessionLine");
  if (sessEl) {
    if ((s.apiKey || "").trim()) {
      sessEl.textContent = "Auth: Api-Key configurada";
    } else if (Cobalt.isSessionValid(s, s.instanceUrl)) {
      sessEl.textContent = "Sessão válida até " + new Date(s.sessionExp).toLocaleString();
    } else {
      sessEl.textContent = "Sem sessão — se a instância for protegida, configure Api-Key/JWT nas opções (⚙)";
    }
  }
  return s;
}

async function fillCurrentTabUrl() {
  try {
    const [tab] = await B.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:/.test(tab.url) && !$("url").value) {
      $("url").value = tab.url;
    }
  } catch {}
}

function showStatus(text, isError = false) {
  const el = $("status");
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("error", !!isError);
}

function fmtSize(n) {
  if (!n || n <= 0) return "?";
  return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
}

/** Inicia o download e acompanha o progresso real (não fica preso no "iniciando"). */
async function startTrackedDownload(url, filename) {
  if (!Cobalt.isSafeUrl(url)) {
    showStatus("URL insegura bloqueada (a instância retornou um protocolo inesperado).", true);
    return;
  }
  let id;
  try {
    id = await B.downloads.download({ url, filename, saveAs: false, conflictAction: "uniquify" });
  } catch (e) {
    showStatus(`Não foi possível iniciar o download: ${e.message}.`, true);
    renderFallback(url, filename);
    return;
  }
  showStatus(`Baixando: ${filename}…`);
  const t0 = Date.now();
  while (Date.now() - t0 < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    let it;
    try { it = (await B.downloads.search({ id }))[0]; } catch { break; }
    if (!it) break;
    if (it.state === "complete") {
      showStatus(`Concluído: ${filename} (veja about:downloads)`);
      return;
    }
    if (it.state === "interrupted") {
      showStatus(`Download falhou (${it.error || "interrompido"}). Tente o link direto ou baixe de novo.`, true);
      renderFallback(url, filename);
      return;
    }
    if (it.paused) {
      showStatus(`Pausado no gerenciador de downloads: ${filename}`);
    } else if (it.totalBytes > 0) {
      showStatus(`Baixando: ${filename} — ${fmtSize(it.bytesReceived)} de ${fmtSize(it.totalBytes)}…`);
    }
  }
}

/** Botões de saída quando o download direto falha: abrir link / copiar / repetir. */
function renderFallback(url, filename) {
  const box = $("picker");
  box.innerHTML = "";
  if (!Cobalt.isSafeUrl(url)) {
    showStatus("URL insegura bloqueada (a instância retornou um protocolo inesperado).", true);
    box.hidden = true;
    return;
  }
  const mk = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", fn);
    box.appendChild(b);
    return b;
  };
  mk("Abrir link direto (ver/salvar manual)", () => B.tabs.create({ url }));
  mk("Copiar link", async () => {
    try { await navigator.clipboard.writeText(url); showStatus("Link copiado."); }
    catch { showStatus("Não copiou. Link: " + url, true); }
  });
  mk("Tentar download de novo", () => startTrackedDownload(url, filename));
  box.hidden = false;
}

function renderPicker(result) {
  const box = $("picker");
  box.innerHTML = "";
  const items = result.picker || [];
  if (result.audio && Cobalt.isSafeUrl(result.audio)) {
    const b = document.createElement("button");
    b.textContent = `⬇ Áudio geral (${result.audioFilename || "audio"})`;
    b.onclick = () => B.downloads.download({ url: result.audio, filename: result.audioFilename || undefined });
    box.appendChild(b);
  }
  items.forEach((it, i) => {
    if (!it || !Cobalt.isSafeUrl(it.url)) return; // ignora item malicioso
    const div = document.createElement("div");
    div.className = "item";
    if (it.thumb && Cobalt.isSafeUrl(it.thumb)) {
      const img = document.createElement("img");
      img.src = it.thumb;
      div.appendChild(img);
    }
    const span = document.createElement("span");
    span.textContent = `${it.type || "media"} ${i + 1}`;
    div.appendChild(span);
    const btn = document.createElement("button");
    btn.textContent = "Baixar";
    btn.onclick = () => B.downloads.download({ url: it.url, saveAs: false });
    div.appendChild(btn);
    box.appendChild(div);
  });
  box.hidden = items.length === 0 && !result.audio;
}

async function doDownload() {
  const s = await B.storage.sync.get({ instanceUrl: "", apiKey: "", sessionToken: "", sessionExp: 0, sessionInstance: "", localAuto: true });
  const base = Cobalt.normalizeInstance(s.instanceUrl);
  if (!base) {
    showStatus("Configure a instância nas opções (⚙) antes de baixar. Veja instances.cobalt.best para instâncias comunitárias ou hospede a sua.", true);
    return;
  }
  if (Cobalt.isLocalUrl(base) && s.localAuto !== false) {
    showStatus("Subindo instância local…");
    const up = await Cobalt.ensureLocalIfNeeded(B, base);
    if (!up.ok) { showStatus(up.message, true); return; }
  }
  const target = $("url").value.trim();
  if (!target) { showStatus("Cole a URL da mídia primeiro.", true); return; }
  // persiste preferências da sessão
  await B.storage.sync.set({
    downloadMode: $("downloadMode").value,
    videoQuality: $("videoQuality").value,
    audioFormat: $("audioFormat").value,
    filenameStyle: $("filenameStyle").value
  });
  showStatus("Consultando a instância…");
  $("picker").hidden = true;

  const headers = Cobalt.authHeaders(s.apiKey, s, base);

  try {
    const res = await fetch(base + "/", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: target,
        downloadMode: $("downloadMode").value,
        videoQuality: $("videoQuality").value,
        audioFormat: $("audioFormat").value,
        audioBitrate: "128",
        filenameStyle: $("filenameStyle").value
      })
    });
    const json = await Cobalt.readApiJson(res);
    if (json.status === "tunnel" || json.status === "redirect") {
      await startTrackedDownload(json.url, json.filename || "arquivo");
    } else if (json.status === "picker") {
      showStatus(`${json.picker.length} itens encontrados — escolha abaixo:`);
      renderPicker(json);
    } else if (json.status === "local-processing") {
      showStatus("Esta instância exige processamento local (túneis). Abrindo lista…");
      renderPicker({ picker: (json.tunnel || []).map((u) => ({ type: json.type || "file", url: u })) });
    } else {
      const code = (json.error && json.error.code) || `http-${res.status}`;
      showStatus(`Erro: ${code}. ${Cobalt.friendlyError(code)}`, true);
    }
  } catch (e) {
    if (e && e.message === "not-json-frontend") {
      showStatus(Cobalt.frontendWarning({ status: e.httpStatus }), true);
    } else if (e && e.message === "bad-json") {
      showStatus(`A instância retornou JSON inválido (HTTP ${e.httpStatus}). Tente outra instância.`, true);
    } else {
      showStatus(`Falha de rede/CORS: ${e.message}. Confira a URL da instância e se ela permite acesso (Api-Key/JWT).`, true);
    }
  }
}

async function testInstance() {
  const s = await B.storage.sync.get({ instanceUrl: "" });
  const base = Cobalt.normalizeInstance(s.instanceUrl);
  if (!base) { showStatus("Configure a instância primeiro.", true); return; }
  showStatus("Testando GET / …");
  try {
    const { json, status } = await Cobalt.fetchInstanceInfo(base);
    if (json.cobalt) {
      const c = json.cobalt;
      let extra = "";
      if (c.turnstileSitekey) extra = " · protegida (Api-Key/JWT nas opções ⚙)";
      showStatus(`OK: Cobalt ${c.version} · ${c.services.length} serviços (${c.services.slice(0, 8).join(", ")}…)${extra}`);
    } else {
      showStatus(`Resposta inesperada (HTTP ${status}). É uma instância Cobalt atual?`, true);
    }
  } catch (e) {
    if (e && e.message === "not-json-frontend") {
      showStatus(Cobalt.frontendWarning({ status: e.httpStatus }), true);
    } else {
      showStatus(`Instância inacessível: ${e.message}`, true);
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await fillCurrentTabUrl();
  $("download").addEventListener("click", doDownload);
  $("testInstance").addEventListener("click", testInstance);
  $("openOptions").addEventListener("click", () => B.runtime.openOptionsPage());
});
