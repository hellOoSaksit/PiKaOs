import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'

// ONE definition, imported by both the gateway Server and the shim. While Electron main is
// unreachable the shim answers `initialize` itself, and the client then acts on whatever it was
// told — so if these two ever disagreed, the client would believe a capability set the server does
// not have. Sharing the constant makes the agreement structural; gateway-shim.test.ts pins it
// against a real SDK Server anyway, because a shared constant cannot catch the SDK changing what
// it derives from that constant.
export const GATEWAY_SERVER_INFO = { name: 'pikaos', version: '1.0.0' } as const
export const GATEWAY_CAPABILITIES = { tools: { listChanged: true } } as const

export const OFFLINE_MESSAGE = 'PiKaOs is not running. Open PiKaOs and try again.'

// The only methods whose answer can prove the shim's link is usable — because they are the only ones
// server.ts routes through a handler that sits behind `requirePaired()`. Every other request is
// answered by the SDK's own Protocol, upstream of that gate and therefore upstream of pairing: `ping`
// gets an automatic `{}` pong (a handler Protocol's constructor installs) and any unregistered method
// gets -32601 straight out of `_onrequest` — both of them sent to a client main is in the middle of
// denying. So the shim's proof keys on the METHOD it asked, never on the id and never on "some
// response arrived" (see Shim.linkProven).
//
// It lives HERE, next to the other two halves of the shim↔gateway agreement, because it is one: the
// shim's retry cadence is only correct while this set is exactly the set of gated handlers in
// server.ts. gateway-server.test.ts pins the two against each other, since a shared constant cannot
// catch a THIRD gated handler being registered without being added here.
export const PAIRED_METHODS: ReadonlySet<string> = new Set(['tools/list', 'tools/call'])

// Mirrors the SDK Server's own negotiation: echo the client's version when we support it,
// otherwise answer with our latest and let the client decide.
export function cannedInitializeResult(params: { protocolVersion?: string } | undefined) {
  const requested = params?.protocolVersion
  return {
    protocolVersion: requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested : LATEST_PROTOCOL_VERSION,
    capabilities: GATEWAY_CAPABILITIES,
    serverInfo: GATEWAY_SERVER_INFO,
  }
}
