/* Curated Local-MCP presets — Node-runnable only (npx works via the Windows resolver;
   Python/uvx servers are deliberately excluded, no resolver exists for them).
   Copy lives in i18n: mcp.preset.<id>.name / .desc / .param.<param> (all 3 packs).
   Secret VALUES never live here — a preset names only the env var the server expects.
   Package names verified current via `npm view` on 2026-07-22 (see commit message). */
export const MCP_PRESETS = [
  {
    id: 'filesystem', icon: '📁', command: 'npx',
    argsTemplate: ['-y', '@modelcontextprotocol/server-filesystem', '{{folder}}'],
    params: [{ name: 'folder', type: 'path' }],
    secret: null,
  },
  {
    id: 'memory', icon: '🧠', command: 'npx',
    argsTemplate: ['-y', '@modelcontextprotocol/server-memory'],
    params: [], secret: null,
  },
  {
    id: 'sequential-thinking', icon: '🪜', command: 'npx',
    argsTemplate: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    params: [], secret: null,
  },
  {
    id: 'everything', icon: '🧪', command: 'npx',
    argsTemplate: ['-y', '@modelcontextprotocol/server-everything'],
    params: [], secret: null,
  },
]
