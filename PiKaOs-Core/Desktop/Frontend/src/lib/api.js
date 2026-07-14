// Tiny fetch wrapper for the PiKaOs backend.
// - prefixes VITE_API_BASE (default "/api", proxied to FastAPI in dev)
// - attaches the access token (in MEMORY only — never localStorage, so XSS can't read it)
// - sends cookies (httpOnly refresh token) with credentials: "include"
// - on 401, refreshes once then retries the original request

let base = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

// Access token lives in memory only (F2). The httpOnly refresh cookie is the durable seam: restore()
// mints a fresh access token from it on every page load, so persisting the access token buys nothing and
// only exposes it to XSS. Best-effort scrub of any token left by the old localStorage-mirror build.
let accessToken = null;
try { localStorage.removeItem("pikaos.access"); } catch (e) { /* ignore */ }

let mode = "cookie";                       // "cookie" (web) | "token" (desktop)
let provider = null;                       // { get, refresh, onLogout }

// Runtime transport config for the desktop shell: point at a remote base URL and/or supply a
// token provider (bearer auth instead of the httpOnly cookie). Web keeps the defaults (cookie
// mode, relative /api base) unless this is called.
export function configureTransport({ apiBase, tokenProvider }) {
  if (apiBase) base = apiBase.replace(/\/$/, "");
  provider = tokenProvider || null;
  mode = provider ? "token" : "cookie";
}

export function getToken() { return accessToken; }
export function setToken(tok) {
  accessToken = tok || null;   // memory only — no localStorage mirror (F2)
}

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.detail) || `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function raw(path, { method = "GET", body, form, auth = true, signal, _retry = false } = {}) {
  const headers = {};
  // JSON body sets its content-type; a FormData (file upload) must NOT — the browser sets the
  // multipart boundary itself.
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    // Desktop (provider/token mode) reads the live session token from the provider; but the
    // kernel-only setup-code bootstrap has no session yet — its token is stored via setToken().
    // Fall back to that in-memory token when the provider yields none, so the follow-up
    // GET /api/setup/status carries the bootstrap token and FirstRun can advance (a provider
    // session token still wins once the user is actually logged in). Cookie mode is unchanged.
    const tok = (provider ? await provider.get() : null) || accessToken;
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }

  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      ...(mode === "cookie" ? { credentials: "include" } : {}),
      signal,                                  // lets callers abort (cancel) the request
      body: form !== undefined ? form : (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (e) {
    // a caller-initiated abort surfaces as AbortError — propagate it so callers can
    // tell "cancelled" apart from a real failure (don't mask it as a network error)
    if (e && e.name === "AbortError") throw e;
    // network/connection failure (backend down, offline)
    throw new ApiError(0, { detail: "network" });
  }

  // transparent refresh-once on expired access token
  if (res.status === 401 && auth && !_retry && path !== "/auth/refresh") {
    const ok = await doRefresh();
    if (ok) return raw(path, { method, body, form, auth, signal, _retry: true });
  }

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }

  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// refresh seam: token mode delegates to the injected provider; cookie mode uses the
// httpOnly refresh-cookie flow below. Used by raw()'s 401-retry and restore() (session
// revive on app boot).
async function doRefresh() { return provider ? provider.refresh() : tryRefresh(); }

let refreshInFlight = null;
async function tryRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const data = await raw("/auth/refresh", { method: "POST", auth: false });
        setToken(data?.token?.accessToken);
        return true;
      } catch (e) {
        setToken(null);
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

// --- auth API ---
export async function login(usernameOrEmail, password) {
  if (mode === "token" && window.pikaosDesktop) {           // desktop: main process holds the token
    const { user } = await window.pikaosDesktop.auth.login(usernameOrEmail, password);
    // the real session now lives in the provider (SessionBroker); drop any setup-code bootstrap
    // token still in memory so it can never resurface as the raw() fallback (see raw()'s tok line).
    setToken(null);
    return user;
  }
  const data = await raw("/auth/login", { method: "POST", auth: false, body: { usernameOrEmail, password } });
  setToken(data.token.accessToken);
  return data.user;
}

export async function logout() {
  // Clear the in-memory token in BOTH modes. Token mode never reached setToken(null) before, so a
  // setup-code bootstrap token (set at FirstRun) lingered and raw()'s provider-null fallback would
  // re-send it as `Bearer <bootstrap>` on post-logout requests — a stale-credential leak.
  if (mode === "token" && window.pikaosDesktop) { await window.pikaosDesktop.auth.logout(); setToken(null); return; }
  try { await raw("/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
  setToken(null);
}

export async function me() {
  return raw("/auth/me");
}

export async function restore() {
  // revive a session on page load using the refresh cookie
  const ok = await doRefresh();
  if (!ok) return null;
  try { return await me(); } catch (e) { return null; }
}

export async function forgotPassword(usernameOrEmail) {
  return raw("/auth/forgot-password", { method: "POST", auth: false, body: { usernameOrEmail } });
}

// --- first-run setup (kernel console-code gate) ---
// The Core prints a rotating setup code to the server console (stdout) on startup; the operator
// pastes it here to unlock the install page (Jupyter-token pattern) before any account exists.
// setupStatus() sends whatever token is stored (auth: true, the default) — the backend reads it as an
// OPTIONAL signal, never requires it, and reports back whether it's still a valid bootstrap session
// (`bootstrapAuthorized`) so a stored-but-stale token (e.g. after a restart) falls back to FirstRun.
export async function setupStatus() { return raw("/setup/status"); }   // { needsSetup, bootstrapAuthorized }
export async function verifySetupCode(code) {
  // unauthenticated by definition — proving the code IS the auth; verifying it hands back the
  // session token (setToken() it on success) that unlocks the kernel-only install shell.
  return raw("/setup/verify-code", { method: "POST", auth: false, body: { code } });
}
export async function bootstrapAdmin({ setupCode, username, password, confirmPassword }) {
  // one-shot create-first-admin (auth enabled, zero users) — the setup code IS the auth
  return raw("/auth/bootstrap-admin", { method: "POST", auth: false,
    body: { setupCode, username, password, confirmPassword } });
}

// --- DB-choice (Step 1 of install, gated on the bootstrap Bearer verify-code already handed back —
// setToken() stored it, so `auth: true` (default) picks it up the same way setupStatus() does).
// Routes are owned by the postgres plugin (R1: zero-core, no sqlalchemy in the kernel), not the
// kernel's own /setup/*; the client stays here since other plugin API clients (knowledge, below)
// follow the same precedent — Core's api.js is the one fetch transport every screen shares. ---
export async function dbTest(payload) { return raw("/postgres/db-test", { method: "POST", body: payload }); }
export async function dbConfig(payload) { return raw("/postgres/db-config", { method: "POST", body: payload }); }  // { ok, restart_required }
// Whether Step 1 (DB choice) still needs completing — App.jsx merges this into its `bootstrap` state
// alongside /setup/status (resolveShellMode() reads bootstrap.needsDbConfig). Tolerate a 404 (plugin
// not installed/enabled) or network failure by resolving `needsDbConfig: false` — the caller catches.
export async function dbStatus() { return raw("/postgres/db-status"); }   // { needsDbConfig }

// --- app version / build hash (AppBoot's mascot-cache check; also the seam release-and-
// rollback.md §4's SPA version-skew policy is meant to use) ---
export async function getVersion() { return raw("/version", { auth: false }); }   // { version, build, name }

// --- C1 capability handshake (capability-handshake spec §2) — public; authenticated callers may
// see a fuller plugin list in production, so send the token when we have one (auth defaults true).
export async function getCapabilities() { return raw("/capabilities"); }
// The active API base — per-server client-data namespacing keys off it (spec §5).
export function getApiBase() { return base; }

// The `/llm/*` client (provider connections + per-role assignment) lived here for the Tools screen's
// AI-model panel. Both the panel and those routes left Core — the engine and its providers are the
// `ai` plugin now — so a plugin that ships that panel brings its own client with it.

// --- knowledge / codex documents API (markdown-as-truth store + RAG search) ---
// Files live in MinIO; the backend chunks + embeds them in the background (ingest_status).
// Upload/delete need the knowledge.manage permission; list/get/search are any authenticated user
// (scoped to what the caller may read, server-side).
export async function listDocuments({ kind, limit, offset } = {}) {
  const qs = new URLSearchParams();
  if (kind) qs.set("kind", kind);
  if (limit != null) qs.set("limit", limit);
  if (offset != null) qs.set("offset", offset);
  const s = qs.toString();
  return raw("/knowledge/docs" + (s ? `?${s}` : ""));
}
export async function getDocument(id) { return raw(`/knowledge/docs/${id}`); }  // includes a presigned `url`
export async function uploadDocument(file, departmentId) {
  const form = new FormData();
  form.append("file", file);
  if (departmentId) form.append("department_id", departmentId);
  return raw("/knowledge/docs", { method: "POST", form });
}
export async function deleteDocument(id) { return raw(`/knowledge/docs/${id}`, { method: "DELETE" }); }
// Semantic (RAG) search over the codex — returns matching chunks ranked by similarity.
export async function searchKnowledge(q, k) {
  const qs = new URLSearchParams({ q });
  if (k) qs.set("k", k);
  return raw(`/knowledge/search?${qs.toString()}`);
}
// Ask a question and get an answer synthesized from the codex with citations (E8). Any logged-in
// user (knowledge.view); scope is enforced server-side. k omitted → server default. Returns
// { answer, sources:[{n, document_id, document_name, heading, score}], rewritten_query, used_chunks }.
export async function askKnowledge(question, k) {
  return raw("/knowledge/answer", { method: "POST", body: { question, ...(k ? { k } : {}) } });
}
// Rebuild the RAG index from the markdown source ('single rebuild command' — knowledge-rag.md §3).
// Needs knowledge.manage. onlyStale=true (default) re-embeds only docs not on the current model — use
// after switching the embedder; false forces a full rebuild. Returns { matched, queued, model }.
export async function reindexKnowledge(onlyStale = true) {
  return raw(`/knowledge/reindex?only_stale=${onlyStale ? "true" : "false"}`, { method: "POST" });
}

// --- shared sidebar nav arrangement (server-scoped; admin edits, every user/device sees the same) ---
export async function getNavConfig() { return raw("/settings/nav"); }                                          // any authenticated user
export async function setNavConfig(value) { return raw("/settings/nav", { method: "PUT", body: { value } }); }  // requires options.manage

// --- per-user settings (theme/lexicon; follow the user across devices) ---
export async function getMySettings() { return raw("/settings/me"); }                                           // { values: {...} }
export async function setMySetting(key, value) { return raw(`/settings/me/${key}`, { method: "PUT", body: { value } }); }

// --- plugins (the install / Modules screen — reads are any authenticated user; mutations need
// plugins.manage). Mutations return { plugins:[...], restart_required } (restart-to-apply). ---
export async function listPlugins() { return raw("/plugins"); }
export async function pluginInstallPlan(id) { return raw(`/plugins/${id}/install-plan`); }                       // {target,order,already_installed,to_install}
export async function installPlugin(id) { return raw(`/plugins/${id}/install`, { method: "POST" }); }
export async function enablePlugin(id) { return raw(`/plugins/${id}/enable`, { method: "POST" }); }
export async function disablePlugin(id) { return raw(`/plugins/${id}/disable`, { method: "POST" }); }
export async function uninstallPlugin(id) { return raw(`/plugins/${id}`, { method: "DELETE" }); }
export async function installFromGit(repoUrl, opts = {}) {
  const { ref, allowHead } = opts;
  return raw("/plugins/install-from-git", {
    method: "POST",
    body: { repoUrl, ref: ref || undefined, allowHead: allowHead || undefined },
  });
}
export async function checkPluginUpdate(id) { return raw(`/plugins/${id}/check-update`); }               // { latestVersion, hasUpdate }
export async function updatePlugin(id) { return raw(`/plugins/${id}/update`, { method: "POST" }); }
export async function purgePlugin(id) { return raw(`/plugins/${id}/purge`, { method: "POST" }); }         // only valid when state === 'pending_purge'
export async function setGitCredential(host, token) {
  return raw(`/plugins/git-credentials/${host}`, { method: "PUT", body: { token } });
}
