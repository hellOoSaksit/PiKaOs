/* PiKaOs — server-address helpers for the desktop Connect-Server screen (spec 2026-07-06).
   The allow-logic MIRRORS Desktop/src/main/config.ts — the main process is the security
   boundary; this copy only powers instant renderer feedback. Keep the two in sync. */

const HTTP_OK_RANGES = [
  [0x7f000000, 8],  // 127.0.0.0/8   loopback
  [0x0a000000, 8],  // 10.0.0.0/8    RFC1918
  [0xac100000, 12], // 172.16.0.0/12 RFC1918
  [0xc0a80000, 16], // 192.168.0.0/16 RFC1918
  [0x64400000, 10], // 100.64.0.0/10 CGNAT / VPN overlay (Tailscale)
];

function ipv4ToInt(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

export function isHttpAllowedHost(hostname) {
  if (hostname === 'localhost') return true;
  const n = ipv4ToInt(hostname);
  if (n === null) return false;
  return HTTP_OK_RANGES.some(([net, bits]) => (n >>> (32 - bits)) === (net >>> (32 - bits)));
}

// trim → default scheme (http only for trusted-hop hosts, https otherwise) → force the /api
// base. Returns { url, plainHttp } — plainHttp drives the "unencrypted" warning (loopback is
// exempt: same machine, nothing crosses a wire). Throws Error('empty'|'invalid'|'http_not_allowed').
export function normalizeServerInput(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('empty');
  let candidate = text;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    let host;
    try { host = new URL(`http://${candidate}`).hostname; } catch { throw new Error('invalid'); }
    if (!host) throw new Error('invalid');
    candidate = `${isHttpAllowedHost(host) ? 'http' : 'https'}://${candidate}`;
  }
  let u;
  try { u = new URL(candidate); } catch { throw new Error('invalid'); }
  if (!u.hostname) throw new Error('invalid');
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('invalid');
  if (u.protocol === 'http:' && !isHttpAllowedHost(u.hostname)) throw new Error('http_not_allowed');
  let path = u.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/api')) path += '/api';
  return {
    url: `${u.protocol}//${u.host}${path}`,
    plainHttp: u.protocol === 'http:' && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost',
  };
}

// One probe = one truth everywhere: HTTP 200 with a JSON body ⇒ reachable (a kernel-mode
// "degraded" health is still a healthy kernel — spec "Probe" section).
export async function probeServer(apiBaseUrl, { timeoutMs = 5000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBaseUrl}/health`, { signal: ctl.signal });
    if (!res.ok) return false;
    await res.json();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
