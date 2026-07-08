import type { SecretVault } from './vault'

const KEY = 'auth.refresh'

// fetch's json() is `unknown` — name the shape the auth endpoints actually return so the
// broker reads it type-checked rather than casting at each call site.
type AuthResponse = {
  token: { accessToken: string; expiresIn?: number }
  refreshToken?: string
  user?: unknown
}

/**
 * Main-process custody of the refresh token. The renderer never sees the
 * refresh token — only short-lived access tokens via getAccessToken().
 * Refresh token lives in the OS-encrypted vault; access token + expiry
 * live in memory only (main-process lifetime, not persisted).
 */
export class SessionBroker {
  private access: string | null = null
  private expiresAt = 0

  constructor(private vault: SecretVault, private getApiBase: () => string) {}

  isAuthenticated() { return !!this.vault.get(KEY) }

  private headers(extra: Record<string, string> = {}) {
    return { 'Content-Type': 'application/json', 'X-Client-Mode': 'token', ...extra }
  }

  private absorb(body: AuthResponse) {
    this.access = body.token.accessToken
    this.expiresAt = Date.now() + (body.token.expiresIn ?? 900) * 1000
    if (body.refreshToken) this.vault.set(KEY, body.refreshToken)
  }

  async login(u: string, p: string) {
    const r = await fetch(`${this.getApiBase()}/auth/login`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ usernameOrEmail: u, password: p }),
    })
    if (!r.ok) throw new Error(`login ${r.status}`)
    const body = await r.json() as AuthResponse
    this.absorb(body)
    return { user: body.user }
  }

  async getAccessToken(): Promise<string | null> {
    if (this.access && Date.now() < this.expiresAt - 30_000) return this.access
    const rt = this.vault.get(KEY)
    if (!rt) return null
    const r = await fetch(`${this.getApiBase()}/auth/refresh`, {
      method: 'POST',
      headers: this.headers({ 'X-Refresh-Token': rt }),
    })
    if (!r.ok) { this.vault.delete(KEY); this.access = null; return null }
    const body = await r.json() as AuthResponse
    this.absorb(body)
    return this.access
  }

  async logout() {
    const rt = this.vault.get(KEY)
    try {
      if (rt) await fetch(`${this.getApiBase()}/auth/logout`, {
        method: 'POST',
        headers: this.headers({ 'X-Refresh-Token': rt, Authorization: `Bearer ${this.access ?? ''}` }),
      })
    } catch {}
    this.vault.delete(KEY)
    this.access = null
    this.expiresAt = 0
  }
}
