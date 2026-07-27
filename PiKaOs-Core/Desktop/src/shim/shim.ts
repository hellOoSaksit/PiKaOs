import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { cannedInitializeResult, OFFLINE_MESSAGE } from '../main/gateway/protocol'

export type Link = {
  send(m: JSONRPCMessage): void
  onMessage(cb: (m: JSONRPCMessage) => void): void
  onClose(cb: () => void): void
}

const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 5000

/**
 * Stdio ↔ pipe forwarder. When the pipe is up it is a byte pipe and knows nothing about MCP; when
 * it is down it answers the three methods a client needs to stay alive, and stores `initialize` so
 * the gateway can be handed the same handshake the client already received.
 *
 * Everything it does not know, it cannot get wrong — and it is the piece that is hardest to debug
 * (its stdio belongs to a process another application spawned) and hardest to redeploy (its command
 * line lives in another application's config file).
 */
export class Shim {
  private link: Link | null = null
  private initReq: JSONRPCMessage | null = null
  private initNote: JSONRPCMessage | null = null
  // Guards the one reply the shim itself provoked (the replayed `initialize` on connect/reconnect) —
  // narrow window, cleared on first match; see the comment on its use in dial() for why a bare id
  // match is safe here despite JSON-RPC replies carrying no method.
  private swallowId: string | number | null = null
  // ids the shim forwarded to main and is still waiting on. A request in this set that has no
  // answer when the link drops must be failed rather than left to hang forever.
  private inFlight = new Set<string | number>()
  private delay = RETRY_MIN_MS

  constructor(
    private write: (m: JSONRPCMessage) => void,
    private connect: () => Promise<Link>,
  ) {}

  start() { void this.dial() }

  fromClient(msg: JSONRPCMessage) {
    const m = msg as JSONRPCMessage & { method?: string; id?: string | number; params?: any }

    // `initialize` / `notifications/initialized` must be captured no matter what the link state
    // is — a reconnect (or a connect that raced the client's first message) needs the exact
    // handshake the client already completed in order to replay it to a fresh main-side session.
    if (m.method === 'initialize') {
      this.initReq = msg
      if (this.link) return this.forward(m)
      // Offline: answer the handshake ourselves so the client never sees a hang.
      return this.write({ jsonrpc: '2.0', id: m.id!, result: cannedInitializeResult(m.params) } as any)
    }
    if (m.method === 'notifications/initialized') {
      this.initNote = msg
      if (this.link) this.link.send(msg)
      return
    }
    if (this.link) return this.forward(m)
    if (m.method === 'tools/list') {
      return this.write({ jsonrpc: '2.0', id: m.id!, result: { tools: [] } } as any)
    }
    if (m.id !== undefined) {
      // -32001 is the SDK's server-error band; the text is the only thing the user can act on.
      this.write({ jsonrpc: '2.0', id: m.id, error: { code: -32001, message: OFFLINE_MESSAGE } } as any)
    }
  }

  // Forward a client message to main, remembering its id (if any) so a link drop before the
  // answer arrives can be turned into an error instead of an abandoned request.
  private forward(m: JSONRPCMessage & { id?: string | number }) {
    if (m.id !== undefined) this.inFlight.add(m.id)
    this.link!.send(m)
  }

  private async dial() {
    try {
      const link = await this.connect()
      this.delay = RETRY_MIN_MS
      this.link = link
      link.onMessage((m) => {
        const id = (m as any).id
        // Main answers the replayed initialize too; the client already has an answer, and two
        // replies to one id would corrupt its request table.
        if (this.swallowId !== null && id === this.swallowId) { this.swallowId = null; return }
        if (id !== undefined) this.inFlight.delete(id)
        this.write(m)
      })
      link.onClose(() => {
        this.link = null
        this.failInFlight()   // main will never answer these now — say so instead of hanging the client
        this.announce()      // the list is empty again — say so rather than let it go stale
        // Backed off like any other retry (not fired immediately): a flapping pipe must not turn
        // into a tight reconnect loop, and every reconnect re-announces, so a bare close→retry with
        // no gap would double-announce a link that never really changed.
        this.scheduleRetry()
      })
      if (this.initReq) {
        this.swallowId = (this.initReq as any).id
        link.send(this.initReq)
        if (this.initNote) link.send(this.initNote)
        this.announce()
      }
    } catch {
      this.scheduleRetry()
    }
  }

  private scheduleRetry() {
    const t = setTimeout(() => void this.dial(), this.delay)
    if (typeof t.unref === 'function') t.unref()
    this.delay = Math.min(this.delay * 2, RETRY_MAX_MS)
  }

  // Only meaningful once the client has initialized; before that there is no list to change.
  private announce() {
    if (!this.initReq) return
    this.write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' } as any)
  }

  // A request forwarded to main has nowhere else to get an answer once the link is gone — error
  // it the same way the offline path would, rather than leave the client's id hanging forever.
  private failInFlight() {
    for (const id of this.inFlight) {
      this.write({ jsonrpc: '2.0', id, error: { code: -32001, message: OFFLINE_MESSAGE } } as any)
    }
    this.inFlight.clear()
  }
}
