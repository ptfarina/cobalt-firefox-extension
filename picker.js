/* Picker fallback — textos via Cobalt.T() / _locales. */
const B = (typeof browser !== "undefined") ? browser : chrome;
const T = (k, ...subs) => Cobalt.T(k, subs.length ? subs : undefined);
(async () => {
  Cobalt.applyI18n(document);
  const srcEl = document.getElementById("src");
  const box = document.getElementById("list");
  const { lastPicker } = await B.storage.local.get("lastPicker");
  if (!lastPicker) { srcEl.textContent = T("pickerNone"); return; }
  srcEl.textContent = T("pickerSrc", lastPicker.sourceUrl);
  const r = lastPicker.result;
  const add = (label, url, thumb) => {
    if (!Cobalt.isSafeUrl(url)) return; // ignora URL maliciosa da API
    const d = document.createElement("div");
    d.className = "item";
    if (thumb && Cobalt.isSafeUrl(thumb)) { const i = document.createElement("img"); i.src = thumb; d.appendChild(i); }
    const s = document.createElement("span");
    s.textContent = label;
    s.style.flex = "1";
    const b = document.createElement("button");
    b.textContent = T("downloadBtn");
    b.addEventListener("click", () => B.downloads.download({ url, saveAs: false }));
    d.append(s, b);
    box.appendChild(d);
  };
  if (r.audio) add(T("pickerAudio", r.audioFilename || "audio"), r.audio);
  (r.picker || []).forEach((it, i) => add(`${it.type || "media"} ${i + 1}`, it.url, it.thumb));
  (r.tunnel || []).forEach((u, i) => add(T("pickerTunnelFile", String(i + 1)), u));
  if (!box.children.length) box.textContent = "Resposta: " + JSON.stringify(r).slice(0, 500);
})();
