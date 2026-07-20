/* PiKaOs — crash-recovery boot flag (crash spec 2026-07-20 §3). Main signals "open Recovery on
   this load" via a #recovery URL hash: at render-process-gone time the renderer is dead, so the
   sessionStorage pattern (FORCE_CONNECT_KEY) can't be set — the URL is the one channel main owns
   without renderer JS. */
export const RECOVERY_HASH = '#recovery';

/** True exactly once per signalled load: reads the flag, then clears it from the address bar so
 *  a user-driven reload boots normally. */
export function consumeRecoveryHash(loc = window.location, hist = window.history) {
  if (loc.hash !== RECOVERY_HASH) return false;
  try { hist.replaceState(null, '', loc.pathname + loc.search); } catch (e) { /* ignore */ }
  return true;
}
