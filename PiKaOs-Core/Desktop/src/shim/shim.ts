import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { cannedInitializeResult, OFFLINE_MESSAGE } from '../main/gateway/protocol'

export type Link = {
  send(m: JSONRPCMessage): void
  onMessage(cb: (m: JSONRPCMessage) => void): void
  onClose(cb: () => void): void
}

const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 5000
// A link that connected but died before ever proving useful is a gateway that accepted the socket
// and then rejected the client — denied, revoked, or unpaired-timeout; main deliberately won't say
// which (pipe.ts: a dropped connection is all a rejected client is entitled to know). Retrying that
// on the 5s track re-rings the refusal ~1/s forever (measured live, handoff LATEST-56 §4). Park it
// at a minute instead. Self-healing is preserved: socketLink re-reads the handshake file on every
// attempt, and an app restart rotates the pipe name — which lands a parked shim on the
// connect-rejected track below, where min() clamps it straight back to 5s.
const DEAD_LINK_MAX_MS = 60_000

// The only methods whose answer proves the link is usable — because they are the only ones main
// routes through a handler that sits behind `requirePaired()` (gateway/server.ts). Every other
// request is answered by the SDK's own Protocol, upstream of that gate and therefore upstream of
// pairing: `ping` gets an automatic `{}` pong (a handler Protocol's constructor installs) and any
// unregistered method gets -32601 straight out of `_onrequest` — both of them sent to a client main
// is in the middle of denying. So proof keys on the METHOD the shim asked, never on the id and never
// on "some response arrived"; stated once here so the rule cannot drift (see linkProven).
const PAIRED_METHODS = new Set(['tools/list', 'tools/call'])

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
  // Requests the shim forwarded to main and is still waiting on, id → method. One with no answer
  // when the link drops must be failed rather than left to hang forever. The method is kept beside
  // the id because a JSON-RPC response carries none of its own, and the proof rule needs it.
  private inFlight = new Map<string | number, string>()
  private delay = RETRY_MIN_MS
  // Whether the CURRENT link ever answered one of the requests that actually clear main's pairing
  // gate (PAIRED_METHODS). That — not a successful connect, and not any response — is what "working"
  // means here: main's SDK answers `initialize`, `ping`, and unknown methods on its own, all of it
  // upstream of requirePaired(), so anything weaker re-arms the fast retry track for denied clients.
  // Cleared at the top of dial(). Note the onMessage handler mutates `delay` as well as this flag,
  // so anything that could deliver a message after close would re-arm the fast track; the invariant
  // that rules it out (Node never emits 'data' after 'close', and both handlers are attached to the
  // same socket) lives in src/shim/pikaos-mcp.ts.
  private linkProven = false

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

  // Forward a client message to main, remembering its id and the method it asked (if it has an id)
  // so a link drop before the answer arrives can be turned into an error instead of an abandoned
  // request — and so the answer, when it comes, can be matched back to what was asked.
  //
  // `!= null` on purpose: a spec-conformant peer uses `id: null` on a parse-error response, which is
  // not a request awaiting an answer and must never take up residence in this map.
  private forward(m: JSONRPCMessage & { id?: string | number; method?: string }) {
    if (m.id != null) this.inFlight.set(m.id, m.method ?? '')
    this.link!.send(m)
  }

  private async dial() {
    // Cleared before the attempt, not after it: a connect that rejects must not leave the previous
    // link's verdict standing for the whole retry interval.
    this.linkProven = false
    try {
      const link = await this.connect()
      this.link = link
      link.onMessage((m) => {
        const id = (m as any).id
        // Main answers the replayed initialize too; the client already has an answer, and two
        // replies to one id would corrupt its request table. Also require this to actually be a
        // response ('result' or 'error' present) — a bare id match is a request/notification
        // coincidence away from swallowing something that was never main's reply to the replay.
        //
        // Ordered first because swallowId is captured at dial time: it still matches the id that was
        // actually replayed even if initReq is later replaced (a client re-initializing under a new
        // id), which is exactly when reading the id off initReq would miss.
        const isResponse = 'result' in (m as any) || 'error' in (m as any)
        if (this.swallowId !== null && id === this.swallowId && isResponse) { this.swallowId = null; return }
        // Proof the link is usable (see linkProven): a response to a request the shim itself
        // forwarded whose method has to clear main's pairing gate. Looked up BEFORE the delete
        // below, since inFlight is the only place the method survives.
        //
        // Deliberately NOT "any response carrying an id we did not expect": that counted the SDK's
        // automatic `ping` pong and its -32601 for unregistered methods, both of which main sends
        // from Protocol._onrequest to a client it is about to deny — proving a link that is being
        // refused and re-arming the 5s track for it. See PAIRED_METHODS.
        const asked = id != null ? this.inFlight.get(id) : undefined
        if (isResponse && asked && PAIRED_METHODS.has(asked)) {
          this.linkProven = true
          this.delay = RETRY_MIN_MS
        }
        if (id != null) this.inFlight.delete(id)
        this.write(m)
      })
      link.onClose(() => {
        this.link = null
        this.failInFlight()   // main will never answer these now — say so instead of hanging the client
        this.announce()      // the list is empty again — say so rather than let it go stale
        // Backed off like any other retry (not fired immediately): a flapping pipe must not turn
        // into a tight reconnect loop, and every reconnect re-announces, so a bare close→retry with
        // no gap would double-announce a link that never really changed.
        //
        // Where the attempt died picks the ceiling — a resilience signal, never a reason.
        //
        // The proven branch is INERT as written: proof sets `delay = RETRY_MIN_MS` in the same
        // statement that sets linkProven, and nothing else moves `delay` before the close, so
        // linkProven at close time implies delay === 1000 and min(2000, RETRY_MAX_MS) ===
        // min(2000, DEAD_LINK_MAX_MS). Do not read a working proven-link ceiling into it. Kept
        // because it states the intent correctly — a link that served a real request and then
        // dropped SHOULD reconnect fast — and stays correct if that reset ever moves.
        this.scheduleRetry(this.linkProven ? RETRY_MAX_MS : DEAD_LINK_MAX_MS)
      })
      if (this.initReq) {
        this.swallowId = (this.initReq as any).id
        link.send(this.initReq)
        if (this.initNote) link.send(this.initNote)
        this.announce()
      }
    } catch {
      // The pipe itself is absent — nobody rejected anything, so this is the ordinary "app not
      // running yet" case and stays on the fast 5s track.
      this.scheduleRetry(RETRY_MAX_MS)
    }
  }

  private scheduleRetry(ceiling: number) {
    // Clamp on entry too: a shim parked at the 60s dead-link ceiling whose next attempt gets
    // connect-refused (app restarted, pipe name rotated) must wait 5s, not one more minute.
    this.delay = Math.min(this.delay, ceiling)
    const t = setTimeout(() => void this.dial(), this.delay)
    if (typeof t.unref === 'function') t.unref()
    this.delay = Math.min(this.delay * 2, ceiling)
  }

  // Only meaningful once the client has initialized; before that there is no list to change.
  private announce() {
    if (!this.initReq) return
    this.write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' } as any)
  }

  // A request forwarded to main has nowhere else to get an answer once the link is gone — error
  // it the same way the offline path would, rather than leave the client's id hanging forever.
  //
  // `initialize` is the one exception: it is the request the client's OWN retry logic depends on
  // (an MCP client whose initialize fails marks the server failed and never retries), and it is
  // also the one request the shim always has a good local answer for regardless of link state — so
  // if the outstanding id is the client's own initialize (forwarded while the link was up, per
  // fromClient()), answer it the same way the fully-offline path does instead of erroring it.
  private failInFlight() {
    const initId = (this.initReq as (JSONRPCMessage & { id?: string | number }) | null)?.id
    for (const id of this.inFlight.keys()) {
      if (initId !== undefined && id === initId) {
        this.write({ jsonrpc: '2.0', id, result: cannedInitializeResult((this.initReq as any).params) } as any)
      } else {
        this.write({ jsonrpc: '2.0', id, error: { code: -32001, message: OFFLINE_MESSAGE } } as any)
      }
    }
    this.inFlight.clear()
  }
}
