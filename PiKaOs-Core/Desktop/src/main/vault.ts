import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export class VaultUnavailableError extends Error {}

export class SecretVault {
  constructor(private storePath: string) {}
  isAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform === 'linux' && (safeStorage as any).getSelectedStorageBackend?.() === 'basic_text') return false
    return true
  }
  private read(): Record<string, string> { return existsSync(this.storePath) ? JSON.parse(readFileSync(this.storePath, 'utf8')) : {} }
  private write(m: Record<string, string>) { writeFileSync(this.storePath, JSON.stringify(m), { mode: 0o600 }) }
  get(key: string): string | null {
    const raw = this.read()[key]; if (!raw) return null
    return safeStorage.decryptString(Buffer.from(raw, 'base64'))
  }
  set(key: string, value: string): void {
    if (!this.isAvailable()) throw new VaultUnavailableError('OS keychain unavailable — install a keyring (gnome-keyring/kwallet)')
    const m = this.read(); m[key] = safeStorage.encryptString(value).toString('base64'); this.write(m)
  }
  delete(key: string): void { const m = this.read(); delete m[key]; this.write(m) }
}
