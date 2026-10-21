/* Shared Cobalt API helpers (background + popup + options).
 * Loaded before the other scripts. Exposes the `Cobalt` global.
 * Follows imputnet/cobalt's docs/api.md: POST /, POST /session, GET /.
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

  // i18n keys must be stable identifiers, not arbitrary text/HTML.
  function isSafeI18nKey(key) {
    return typeof key === "string" && /^[A-Za-z0-9._-]+$/.test(key);
  }

  // Allowlist for the markup of locale strings (accepted tags and attributes).
  // Any other tag is removed; dangerous tags also lose their content.
  const LOCALE_TAGS = new Set([
    "B", "STRONG", "I", "EM", "U", "CODE", "PRE", "BR",
    "P", "SPAN", "UL", "OL", "LI", "A"
  ]);
  const LOCALE_DROP = new Set([
    "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT",
    "SVG", "MATH", "LINK", "META", "BASE", "FORM", "IMG", "VIDEO", "AUDIO",
    "SOURCE", "TRACK", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION"
  ]);
  const LOCALE_ATTRS = { A: new Set(["href", "title"]) };

  /** Converts the markup of a locale string into safe DOM nodes (no raw innerHTML). */
  function renderLocaleMarkup(el, html) {
    const src = new DOMParser().parseFromString(String(html || ""), "text/html");
    const build = (node, dest) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {                       // texto
          dest.appendChild(document.createTextNode(child.nodeValue));
          continue;
        }
        if (child.nodeType !== 1) continue;              // comments and the like are ignored
        const tag = child.tagName.toUpperCase();
        if (LOCALE_DROP.has(tag)) continue;              // drops the tag and its content
        if (!LOCALE_TAGS.has(tag)) { build(child, dest); continue; } // keeps only the text
        const out = document.createElement(tag.toLowerCase());
        const allowed = LOCALE_ATTRS[tag];
        if (allowed) {
          for (const attr of child.attributes) {
            const name = attr.name.toLowerCase();
            if (!allowed.has(name)) continue;
            if (name === "href" && !isSafeUrl(attr.value)) continue; // http(s) only
            out.setAttribute(name, attr.value);
          }
        }
        build(child, out);
        dest.appendChild(out);
      }
    };
    el.textContent = "";
    build(src.body, el);
  }

  /** Applies data-i18n / data-i18n-ph / data-i18n-title / data-i18n-html (static, from the catalog). */
  function applyI18n(root) {
    const doc = root || (typeof document !== "undefined" ? document : null);
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = T(el.getAttribute("data-i18n")); });
    doc.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", T(el.getAttribute("data-i18n-ph"))); });
    doc.querySelectorAll("[data-i18n-title]").forEach((el) => { el.setAttribute("title", T(el.getAttribute("data-i18n-title"))); });
    doc.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      const localized = isSafeI18nKey(key) ? T(key) : "";
      renderLocaleMarkup(el, localized);
    });
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

  /** The Api-Key takes priority; otherwise the manual Bearer JWT is used, if valid. */
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

  /** GET / — instance info (version, services, turnstileSitekey). */
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

  /** Reads the exp (seconds) of a JWT and returns it in ms; null if opaque/invalid. */
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

  /** Only allows http(s) — blocks javascript:/data:/blob: coming from the API (malicious instance). */
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

  /** Talks to the native host (starts/stops the local instance). Never throws. */
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

  /** Makes sure the local instance is up. Only acts if the URL is local. */
  async function ensureLocalIfNeeded(B, base) {
    if (!isLocalUrl(base)) return { ok: true, remote: true };
    const r = await localHost(B, { cmd: "ensure-up", wait: 60 });
    if (r && r.ok) return { ok: true, version: r.version };
    const msg = (r && (r.message || r.error)) || "unknown error";
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
