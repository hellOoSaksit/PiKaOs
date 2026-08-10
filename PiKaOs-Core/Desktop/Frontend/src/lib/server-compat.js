/* Desktop↔server minimum (server-core-update spec §8.4): WARN — never block — when the connected
   server's Core is older than this desktop build was written against.

   Never block, deliberately: the desktop and the server update on separate schedules and by
   different people, and a shell that refuses to open is a shell that cannot show the operator how
   to fix it. Anything unreadable is treated as "cannot tell" and stays silent — a warning that
   fires on a version string it does not understand is a warning people learn to ignore. */

// Bump this alongside a breaking API change, NOT alongside every Core release: it is the oldest
// server this build still works against, not the newest one it knows about.
export const MIN_SERVER_VERSION = '0.1.0';

function parse(v) {
  const core = String(v ?? '').trim().replace(/^v/, '').split('-')[0].split('+')[0];
  const parts = core.split('.');
  // Strict digits, not parseInt: parseInt('1abc') is 1, so a build string that merely STARTS with a
  // number would be compared as if it were a version.
  if (parts.length > 3 || !parts.every(p => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  while (nums.length < 3) nums.push(0);          // "0.2" means 0.2.0, same as the server's parser
  return nums;
}

export function serverTooOld(serverVersion, min = MIN_SERVER_VERSION) {
  const server = parse(serverVersion);
  const floor = parse(min);
  if (!server || !floor) return false;           // unknown → stay quiet
  for (let i = 0; i < 3; i++) if (server[i] !== floor[i]) return server[i] < floor[i];
  return false;                                  // equal is fine — the minimum is inclusive
}
