import { readFileSync, writeFileSync, existsSync } from 'node:fs'

/**
 * Which external MCP clients may talk to this gateway.
 *
 * The client name comes from MCP's `clientInfo`, which the client declares about ITSELF — it is a
 * label to show the user, never evidence of identity. The actual defence is that a dialog the user
 * did not initiate appears at all, so a leaked token cannot be used silently.
 *
 * Allow is persisted. Deny is remembered only for this launch: persisting it would silently lock a
 * user out of a client they later want, while forgetting it immediately would let a reconnect loop
 * drill them with dialogs until they clicked Allow to stop the noise. Same "no means not this
 * time" rule as consent/gate.ts, with the anti-spam floor added.
 */
export function makeClientGate(storePath: string, ask: (clientName: string) => Promise<boolean>) {
  const load = (): string[] => {
    if (!existsSync(storePath)) return []
    try { const v = JSON.parse(readFileSync(storePath, 'utf8')); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }
  const save = (names: string[]) => writeFileSync(storePath, JSON.stringify(names))
  const deniedThisLaunch = new Set<string>()

  return {
    async allow(clientName: string): Promise<boolean> {
      if (load().includes(clientName)) return true
      if (deniedThisLaunch.has(clientName)) return false
      const ok = await ask(clientName)
      if (ok) save([...new Set([...load(), clientName])])
      else deniedThisLaunch.add(clientName)
      return ok
    },
    list: () => load(),
    revoke(clientName: string) {
      save(load().filter(n => n !== clientName))
      deniedThisLaunch.delete(clientName)   // revoke means "ask me again", not "stay denied"
    },
  }
}
