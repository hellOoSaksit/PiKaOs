import { readFileSync, writeFileSync, existsSync } from 'node:fs'

/**
 * Which external MCP clients may talk to this gateway.
 *
 * The client name comes from MCP's `clientInfo`, which the client declares about ITSELF — it is a
 * label to show the user, never evidence of identity. The actual defence is that a dialog the user
 * did not initiate appears at all, so a leaked token cannot be used silently.
 *
 * Allow is persisted. Deny is remembered only for the life of this gate instance (i.e. for as long
 * as the gateway process that created it keeps running): persisting it would silently lock a user
 * out of a client they later want, while forgetting it immediately would let a reconnect loop drill
 * them with dialogs until they clicked Allow to stop the noise. Same "no means not this time" rule
 * as consent/gate.ts, with the anti-spam floor added.
 */
export function makeClientGate(storePath: string, ask: (clientName: string) => Promise<boolean>) {
  const load = (): string[] => {
    if (!existsSync(storePath)) return []
    try { const v = JSON.parse(readFileSync(storePath, 'utf8')); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }
  const save = (names: string[]) => writeFileSync(storePath, JSON.stringify(names))
  const deniedThisLaunch = new Set<string>()
  // The gateway makes one MCP server per pipe connection, so two connections from the same
  // unknown client can call allow() before either await settles (check-then-act race). Caching
  // the in-flight promise per name lets concurrent callers share one ask() instead of each
  // triggering their own approval dialog.
  const inFlight = new Map<string, Promise<boolean>>()

  return {
    async allow(clientName: string): Promise<boolean> {
      if (load().includes(clientName)) return true
      if (deniedThisLaunch.has(clientName)) return false
      const pending = inFlight.get(clientName)
      if (pending) return pending
      const promise = ask(clientName).then(ok => {
        if (ok) save([...new Set([...load(), clientName])])
        else deniedThisLaunch.add(clientName)
        return ok
      }).finally(() => inFlight.delete(clientName))
      inFlight.set(clientName, promise)
      return promise
    },
    list: () => load(),
    revoke(clientName: string) {
      save(load().filter(n => n !== clientName))
      deniedThisLaunch.delete(clientName)   // revoke means "ask me again", not "stay denied"
    },
  }
}
