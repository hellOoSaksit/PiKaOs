/* Pure, React-free logic for AiConsole — the parts worth unit-testing in the house idiom
   (plain function calls, no render context). The component (AiConsole.jsx) is the thin React
   shell around these; the full stateful flow is verified live in Electron (Task 9 UAT). */

// The wire shape ai.chat() wants: strip any local-only fields off the log, keep {role,content}.
export function toChatMessages(log) {
  return log.map(({ role, content }) => ({ role, content }));
}

// A BYO-key cloud provider with no stored key needs the setup form first. Ollama is keyless by
// design, so it never "needs a key". admin mode never uses the local key path at all.
export function needsKey(cfg) {
  return !!cfg && cfg.mode !== 'admin' && cfg.provider !== 'ollama' && !cfg.hasKey;
}

// admin + a CLOUD provider: resolveRuntime returns apiKey:null (keys live server-side) and a
// client-side loop would 401 until a server-hosted loop exists (out of scope). So under admin we
// only let the user chat against a local/self-hosted runtime (ollama); a cloud pick is explained,
// not sent into a 401.
export function adminCloudLimited(cfg) {
  return cfg?.mode === 'admin' && cfg.provider !== 'ollama';
}

/* Which surface the console shows. adminError is a runtime flag: a prior admin send rejected
   because resolveRuntime could not reach the managed runtime (AI plugin absent / caller lacks
   llm.view). We surface that as its own state and NEVER silently fall back to byo-key. */
export function resolveSurface(cfg, adminError = false) {
  if (!cfg) return 'loading';
  if (cfg.mode === 'admin') return adminError ? 'admin-unavailable' : 'admin';
  return needsKey(cfg) ? 'setup' : 'chat';
}

// Append the truncation note only when the loop stopped at the step limit. Pure so the exact
// user-facing string is asserted without a renderer.
export function assistantText(result, truncatedNote) {
  return result.text + (result.truncated ? ` ${truncatedNote}` : '');
}
