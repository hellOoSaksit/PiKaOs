// Tiny fetch wrapper for the PiKaOs backend.
// - prefixes VITE_API_BASE (default "/api", proxied to FastAPI in dev)
// - attaches the access token (memory + localStorage mirror)
// - sends cookies (httpOnly refresh token) with credentials: "include"
// - on 401, refreshes once then retries the original request

const BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");
const TOKEN_KEY = "pikaos.access";

let accessToken = null;
try { accessToken = localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }

export function getToken() { return accessToken; }
export function setToken(tok) {
  accessToken = tok || null;
  try {
    if (tok) localStorage.setItem(TOKEN_KEY, tok);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* ignore */ }
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
  if (auth && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: "include",
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
    const ok = await tryRefresh();
    if (ok) return raw(path, { method, body, form, auth, signal, _retry: true });
  }

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }

  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

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
  const data = await raw("/auth/login", { method: "POST", auth: false, body: { usernameOrEmail, password } });
  setToken(data.token.accessToken);
  return data.user;
}

export async function logout() {
  try { await raw("/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
  setToken(null);
}

export async function me() {
  return raw("/auth/me");
}

export async function restore() {
  // revive a session on page load using the refresh cookie
  const ok = await tryRefresh();
  if (!ok) return null;
  try { return await me(); } catch (e) { return null; }
}

export async function forgotPassword(usernameOrEmail) {
  return raw("/auth/forgot-password", { method: "POST", auth: false, body: { usernameOrEmail } });
}

// --- first-run setup (kernel console-code gate) ---
// The Core prints a rotating setup code to the server console (stdout) on startup; the operator
// pastes it here to unlock the install page (Jupyter-token pattern). No auth — this gate runs
// before any account exists.
// TODO(kernel backend): POST /api/setup/verify-code + GET /api/setup/status don't exist yet — these
// 404 until that lands. The FirstRun screen handles the missing backend gracefully in dev preview.
export async function setupStatus() { return raw("/setup/status", { auth: false }); }   // { needsSetup, ... }
export async function verifySetupCode(code) {
  return raw("/setup/verify-code", { method: "POST", auth: false, body: { code } });
}

// --- LLM provider config API (admin: which provider/model/key the engine uses — no-hardcode) ---
// The API key is write-only: send it in the body to set/replace it; the server never returns it
// (responses carry `api_key_set` only). Omit it on update to keep the stored key unchanged.
export async function llmConnections() { return raw("/llm/connections"); }
export async function createLlmConnection(body) { return raw("/llm/connections", { method: "POST", body }); }
export async function updateLlmConnection(id, body) { return raw(`/llm/connections/${id}`, { method: "PATCH", body }); }
export async function activateLlmConnection(id) { return raw(`/llm/connections/${id}/activate`, { method: "POST" }); }
export async function deleteLlmConnection(id) { return raw(`/llm/connections/${id}`, { method: "DELETE" }); }

// Per-system LLM assignment: which connection a role (engine/search/summarize) uses.
// connectionId=null clears the binding → that system falls back to the active connection.
export async function llmRoles() { return raw("/llm/roles"); }
export async function setLlmRole(role, connectionId) { return raw(`/llm/roles/${role}`, { method: "PUT", body: { connection_id: connectionId } }); }

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

// --- object storage status (admin: see/test the configured store — read-only, no secrets) ---
// Storage creds are bootstrap config (env only); these endpoints never mutate them. Need infra.manage.
export async function storageStatus() { return raw("/storage/status"); }
export async function storageTest() { return raw("/storage/test", { method: "POST" }); }

// --- shared sidebar nav arrangement (server-scoped; admin edits, every user/device sees the same) ---
export async function getNavConfig() { return raw("/settings/nav"); }                                          // any authenticated user
export async function setNavConfig(value) { return raw("/settings/nav", { method: "PUT", body: { value } }); }  // requires options.manage

// --- per-user settings (theme/lexicon; follow the user across devices) ---
export async function getMySettings() { return raw("/settings/me"); }                                           // { values: {...} }
export async function setMySetting(key, value) { return raw(`/settings/me/${key}`, { method: "PUT", body: { value } }); }

// --- global config blobs (Tools/system settings; same for everyone) ---
export async function getGlobalConfig(key) { return raw(`/settings/global/${key}`); }                           // { value }
export async function setGlobalConfig(key, value) { return raw(`/settings/global/${key}`, { method: "PUT", body: { value } }); }  // options.manage

// --- plugins (the install / Modules screen — reads are any authenticated user; mutations need
// plugins.manage). Mutations return { plugins:[...], restart_required } (restart-to-apply). ---
export async function listPlugins() { return raw("/plugins"); }
export async function pluginInstallPlan(id) { return raw(`/plugins/${id}/install-plan`); }                       // {target,order,already_installed,to_install}
export async function installPlugin(id) { return raw(`/plugins/${id}/install`, { method: "POST" }); }
export async function enablePlugin(id) { return raw(`/plugins/${id}/enable`, { method: "POST" }); }
export async function disablePlugin(id) { return raw(`/plugins/${id}/disable`, { method: "POST" }); }
export async function uninstallPlugin(id) { return raw(`/plugins/${id}`, { method: "DELETE" }); }
