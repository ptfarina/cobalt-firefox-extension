/* Cobalt API helpers compartilhados (background + popup + options).
 * Carregado antes dos demais scripts. Expõe o global `Cobalt`.
 * Segue docs/api.md do imputnet/cobalt: POST /, POST /session, GET /.
 */
var Cobalt = (() => {
  const LOCAL = {
    host: "com.cobalt.local", // nome do host nativo (native-host/install-host.sh)
    url: "http://localhost:9000",
    heartbeatMinutes: 2
  };

  function T(key, subs) {
    try {
      const B = (typeof browser !== "undefined") ? browser : chrome;
      const s = B.i18n.getMessage(key, subs);
      return s || key;
    } catch {
      return key;
    }
  }

  /** Aplica data-i18n / data-i18n-ph / data-i18n-title / data-i18n-html (estático, do catálogo). */
  function applyI18n(root) {
    const doc = root || (typeof document !== "undefined" ? document : null);
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = T(el.getAttribute("data-i18n")); });
    doc.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", T(el.getAttribute("data-i18n-ph"))); });
    doc.querySelectorAll("[data-i18n-title]").forEach((el) => { el.setAttribute("title", T(el.getAttribute("data-i18n-title"))); });
    doc.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = T(el.getAttribute("data-i18n-html")); });
  }

  function normalizeInstance(raw) {
    let u = (raw || "").trim().replace(/\/+$/, "");
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }

  function isSessionValid(s, base) {
    if (!s || !s.sessionToken || !s.sessionExp) return false;
    if (s.sessionInstance && normalizeInstance(s.sessionInstance) !== normalizeInstance(base)) return false;
    return Date.now() < (s.sessionExp - 60 * 1000); // 60s de margem
  }

  /** Api-Key tem prioridade; senão usa o Bearer JWT manual, se válido. */
  function authHeaders(apiKey, settings, base) {
    const h = { "Accept": "application/json", "Content-Type": "application/json" };
    const key = (apiKey || "").trim();
    if (key) {
      h["Authorization"] = /^(Bearer|Api-Key)\s+/i.test(key) ? key : `Api-Key ${key}`;
    } else if (isSessionValid(settings, base)) {
      h["Authorization"] = `Bearer ${settings.sessionToken}`;
    }
    return h;
  }

  function isJson(res) {
    return ((res.headers.get("content-type")) || "").includes("application/json");
  }

  function frontendWarning(res) {
    const http = res && res.status ? T("feHttp", String(res.status)) : "";
    return T("feHtml", http);
  }

  async function readApiJson(res) {
    if (!isJson(res)) {
      const err = new Error("not-json-frontend");
      err.httpStatus = res.status;
      throw err;
    }
    try {
      return await res.json();
    } catch {
      const err = new Error("bad-json");
      err.httpStatus = res.status;
      throw err;
    }
  }

  /** GET / — info da instância (versão, serviços, turnstileSitekey). */
  async function fetchInstanceInfo(base) {
    const r = await fetch(normalizeInstance(base) + "/", { headers: { "Accept": "application/json" } });
    const json = await readApiJson(r);
    return { ok: r.ok, status: r.status, json };
  }

  /** POST / — endpoint principal de processamento. */
  async function cobaltPost(base, headers, body) {
    const res = await fetch(normalizeInstance(base) + "/", {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    return await readApiJson(res);
  }

  /** Lê o exp (segundos) de um JWT e devolve em ms; null se opaco/inválido. */
  function jwtExpiryMs(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64));
      return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  function friendlyError(code) {
    const map = {
      "api.auth.api-key.missing": "errAuthApiKey",
      "api.auth.bearer.missing": "errAuthBearer",
      "error.api.auth.jwt.missing": "errAuthJwt",
      "error.api.auth.turnstile.missing": "errAuthTurnstile",
      "api.auth.invalid": "errAuthInvalid",
      "api.auth.ratelimit": "errAuthRatelimit",
      "error.api.link.invalid": "errLinkInvalid",
      "error.api.service.unsupported": "errServiceUnsupported",
      "error.api.fetch.fail": "errFetchFail",
      "error.api.fetch.empty": "errFetchEmpty",
      "error.api.fetch.critical": "errFetchCritical",
      "error.api.rate_exceeded": "errRateExceeded",
      "extension.missing-instance": "errMissingInstance"
    };
    return map[code] ? T(map[code]) : code;
  }

  /** Só permite http(s) — bloqueia javascript:/data:/blob: vindos da API (instância maliciosa). */
  function isSafeUrl(u) {
    try {
      const p = new URL(u).protocol;
      return p === "http:" || p === "https:";
    } catch {
      return false;
    }
  }

  function needsAuth(code) {
    return [
      "error.api.auth.jwt.missing",
      "api.auth.bearer.missing",
      "error.api.auth.turnstile.missing",
      "api.auth.invalid"
    ].includes(code);
  }

  function isLocalUrl(raw) {
    const u = normalizeInstance(raw);
    return /^http:\/\/(localhost|127\.0\.0\.1)(:9000)?\/?$/.test(u);
  }

  /** Fala com o host nativo (sobe/para a instância local). Nunca lança. */
  async function localHost(B, msg) {
    try {
      return await B.runtime.sendNativeMessage(LOCAL.host, msg);
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/no such native application/i.test(m)) {
        return { ok: false, error: "native-missing",
                 message: T("errNativeMissing") };
      }
      return { ok: false, error: "native-failed", message: m.slice(0, 200) };
    }
  }

  /** Garante a instância local de pé. Só age se a URL for local. */
  async function ensureLocalIfNeeded(B, base) {
    if (!isLocalUrl(base)) return { ok: true, remote: true };
    const r = await localHost(B, { cmd: "ensure-up", wait: 60 });
    if (r && r.ok) return { ok: true, version: r.version };
    const msg = (r && (r.message || r.error)) || "falha desconhecida";
    return { ok: false, message: T("errLocalDownFull", msg) };
  }

  return {
    LOCAL,
    T,
    applyI18n,
    isSafeUrl,
    isLocalUrl,
    localHost,
    ensureLocalIfNeeded,
    normalizeInstance,
    isSessionValid,
    authHeaders,
    isJson,
    frontendWarning,
    readApiJson,
    fetchInstanceInfo,
    cobaltPost,
    jwtExpiryMs,
    friendlyError,
    needsAuth
  };
})();
