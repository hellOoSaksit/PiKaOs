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

async function raw(path, { method = "GET", body, auth = true, _retry = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // network/connection failure (backend down, offline)
    throw new ApiError(0, { detail: "network" });
  }

  // transparent refresh-once on expired access token
  if (res.status === 401 && auth && !_retry && path !== "/auth/refresh") {
    const ok = await tryRefresh();
    if (ok) return raw(path, { method, body, auth, _retry: true });
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

// --- UAT vs Production compare API ---
// POST /api/compare → coverage of Production's sitemap URLs against UAT.
export async function compareSites(body) {
  return raw("/compare", { method: "POST", body });
}

// POST /api/compare/deep → deep-compare one small batch of page pairs (client streams sets).
export async function compareDeep(body) {
  return raw("/compare/deep", { method: "POST", body });
}

// POST /api/compare/render → proxy a page's HTML (with injected <base>) so a site
// that blocks iframe embedding can still be previewed via a same-origin srcdoc.
export async function compareRender(body) {
  return raw("/compare/render", { method: "POST", body });
}
