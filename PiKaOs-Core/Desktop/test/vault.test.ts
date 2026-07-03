import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (s: string) => Buffer.from('enc:' + s),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ''),
  },
}))

it('round-trips a secret encrypted at rest', async () => {
  const { SecretVault } = await import('../src/main/vault')
  const v = new SecretVault(join(mkdtempSync(join(tmpdir(), 'v-')), 'secrets.json'))
  v.set('auth.refresh', 'RT_1')
  expect(v.get('auth.refresh')).toBe('RT_1')
  expect(v.get('missing')).toBeNull()
  v.delete('auth.refresh')
  expect(v.get('auth.refresh')).toBeNull()
})

it('refuses to store when encryption is unavailable', async () => {
  vi.doMock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false } }))
  vi.resetModules()
  const { SecretVault, VaultUnavailableError } = await import('../src/main/vault')
  const v = new SecretVault(join(mkdtempSync(join(tmpdir(), 'v-')), 'secrets.json'))
  expect(v.isAvailable()).toBe(false)
  expect(() => v.set('k', 'x')).toThrow(VaultUnavailableError)
})
