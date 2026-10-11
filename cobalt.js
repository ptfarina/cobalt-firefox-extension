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
    const status = res && res.status ? ` (HTTP ${res.status})` : "";
    return `A instância retornou HTML${status} em vez de JSON. ` +
      "Você informou a URL do site/frontend (ex.: cobalt.meowing.de) e não a URL da API. " +
      "O frontend web não é a API: configure a URL base da API (ex.: https://cobalt-api.meowing.de, " +
      "sua própria instância ou uma API comunitária com permissão). Também prefira https:// a http://.";
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
      "api.auth.api-key.missing": "Esta instância exige Api-Key. Informe a chave nas opções.",
      "api.auth.bearer.missing": "Esta instância exige autenticação. Configure um Api-Key ou token JWT nas opções.",
      "error.api.auth.jwt.missing": "Sessão ausente/expirada. Cole um Api-Key ou token JWT válido nas opções.",
      "error.api.auth.turnstile.missing": "Esta instância exige autenticação. Configure um Api-Key ou token JWT nas opções.",
      "api.auth.invalid": "Chave/token inválido. Confira o Api-Key ou cole um novo token JWT.",
      "api.auth.ratelimit": "Limite de requisições excedido. Aguarde e tente de novo.",
      "error.api.link.invalid": "Link inválido ou não suportado pela instância.",
      "error.api.service.unsupported": "Serviço não suportado por esta instância.",
      "error.api.fetch.fail": "A instância não conseguiu ler o link (conteúdo removido, bloqueio anti-bot ou login exigido pelo serviço).",
      "error.api.fetch.empty": "Sem mídia pública nesse link (removido, privado, com restrição de região ou login exigido).",
      "error.api.fetch.critical": "Falha ao extrair — o serviço costuma exigir login. Tente outro link ou configure cookies.json na instância.",
      "error.api.rate_exceeded": "Limite da instância excedido. Aguarde ~1 min e tente de novo (evite disparos em paralelo).",
      "extension.missing-instance": "Configure a URL da instância primeiro."
    };
    return map[code] || code;
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
                 message: "Host nativo não instalado. Rode native-host/install-host.sh na pasta da extensão." };
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
    return { ok: false,
             message: "Instância local indisponível: " + msg + " (daemon docker rodando? container criado via install-host.sh?)" };
  }

  return {
    LOCAL,
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
