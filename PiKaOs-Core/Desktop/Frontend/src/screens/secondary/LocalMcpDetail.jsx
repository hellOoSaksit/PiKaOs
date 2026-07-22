/* Per-server detail page for Local MCP — STUB. Task 6 fills it in.
   Rendered by LocalMcp.jsx when `view !== 'list'`, with:
     { Sys, def, status, lastError, tools, busy, onBack, onStart, onStop, onDelete, onEditSave, onCallTool }
   where onCallTool(name, args) -> Promise<result>, onEditSave(def, secretKey, secretValue) -> Promise<void>,
   onDelete() -> Promise<void> (LocalMcp owns the confirm dialog).

   Keep this module free of top-level `window` access and of the `components/ui` barrel: the sibling
   component tests run in vitest's node environment and import LocalMcp.jsx, which imports this file. */
export function LocalMcpDetail() {
  return null;
}
