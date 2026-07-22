/* One tool of a ready MCP server — STUB. Task 7 replaces this body with the argument form and
   the caller; the props are already the final contract so that swap is a drop-in:
     { t, tool, open, onToggle, onCall }   where onCall(args) -> Promise<result>
   Today it renders only what the old list rendered: the tool's name and description.

   No `components/ui` barrel import here — the barrel touches `window` at module scope, which
   breaks the node-environment component tests that import this file's parent (see LocalMcp.jsx). */
export function ToolRow({ tool }) {
  return (
    <div className="tool-row">
      <span className="tool-ic">🔧</span>
      <div className="tool-bd" style={{ minWidth: 0 }}>
        <div className="tool-name mono">{tool.name}</div>
        {tool.description && (
          <div className="faint" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.5 }}>{tool.description}</div>
        )}
      </div>
    </div>
  );
}
