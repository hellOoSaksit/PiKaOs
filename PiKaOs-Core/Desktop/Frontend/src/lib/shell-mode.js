/* PiKaOs — which shell App renders, as one pure function (capability-handshake spec §4, phase 1).
   The server decides authMode (C1); the client only maps signals to a shell. Kept out of App.jsx so
   the decision is unit-testable without mounting the app. */
export function resolveShellMode({ ready, caps, bootstrap, loggedIn }) {
  if (!ready || !caps || !bootstrap) return 'loading';          // don't flash FirstRun mid-restore
  if (bootstrap.needsDbConfig) return 'db-choice';               // configure the system DB before the app
  if (loggedIn || caps.authMode === 'open') return 'full';      // open = server-declared (F1-safe)
  if (bootstrap.needsFirstAdmin) return 'first-admin';          // auth enabled, zero users — create the owner
  if (bootstrap.bootstrapAuthorized) return 'kernel-shell';     // verified setup code, legacy shell
  return 'firstrun';
}
