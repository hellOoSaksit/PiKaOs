/* PiKaOs — DbChoice screen's save-gate rule, kept out of the component (same reasoning as
   shell-mode.js: unit-testable without mounting React / pulling in browser-only globals). */

// Bundled needs no probe (the built-in DSN is always reachable) so it may save immediately;
// external providers (pg/supabase) must pass a `/api/setup/db-test` first.
export function canSaveDb(provider, testState) {
  return provider === 'bundled' || testState === 'ok';
}
