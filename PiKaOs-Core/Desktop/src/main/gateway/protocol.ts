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
