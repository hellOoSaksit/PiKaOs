import { existsSync } from 'node:fs'
import { delimiter, join, dirname } from 'node:path'

// npx is a .cmd shim on Windows, and Node refuses to spawn .cmd/.bat without a shell
// (BatBadBut fix). Rewriting to `node <npx-cli.js> ...` keeps the spawn shell-less —
// same security posture, args stay an array. The STORED def keeps the user's original
// `npx`: this rewrite happens at spawn time only, so the consent hash and the consent
// dialog text never change.
export class NodeMissingError extends Error {
  constructor() { super('node-missing') }
}

export interface SpawnPlan { command: string; args: string[] }

export function resolveSpawn(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): SpawnPlan {
  const lower = command.toLowerCase()
  const isNpx = lower === 'npx' || lower === 'npx.cmd'
  if (platform !== 'win32' || !isNpx) return { command, args }

  const node = findOnPath('node.exe', env.PATH ?? '')
  if (!node) throw new NodeMissingError()
  // npm ships inside the node install dir on Windows; npx-cli.js is its real entry.
  const npxCli = join(dirname(node), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  if (!existsSync(npxCli)) throw new NodeMissingError()
  return { command: node, args: [npxCli, ...args] }
}

function findOnPath(exe: string, path: string): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, exe)
    if (existsSync(candidate)) return candidate
  }
  return null
}
