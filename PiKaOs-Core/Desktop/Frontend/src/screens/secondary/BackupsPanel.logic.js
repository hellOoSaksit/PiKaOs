/* Pure helpers for the Backups panel — no React, so they are testable without a DOM harness
   (this repo has no component-test rig; see the plain-function idiom the other .logic.js files use). */

/* Literal in every language, like RESET on the recovery screen: the operator types the same word
   whatever the UI language is, and the server compares it byte-for-byte. */
export const RESTORE_TOKEN = 'RESTORE';

export const fmtBytes = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB`
  : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB`
    : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`);

/* What a schedule row says it will do. A backup entry carries no pluginId/tag, so the plugin-switch
   template would render "null → null" for the very rows this feature adds to the queue. */
export function scheduleRowLabel(entry, t) {
  if (entry?.kind === 'core-reminder') return t('core.update.title');
  if (entry?.kind === 'backup') return t('backup.title');
  return `${entry?.pluginId} → ${entry?.tag}`;
}

/* Restore is armed only by the exact token — trimmed, because a trailing space from a paste is not
   a different intent, but never case-folded: the whole point is that it cannot be typed by accident. */
export const restoreArmed = (typed) => (typed || '').trim() === RESTORE_TOKEN;

/* 409 is its own outcome, not a generic failure: the archive is fine, it was written under a
   different secret_key, and the operator has to decide whether to accept losing the stored secrets. */
export const restoreErrorKey = (status) => (status === 409 ? 'backup.keydiffer' : 'backup.failed');

/* One predicate, two views: the Backups schedule tab renders the entries this returns true for,
   the Modules queue renders the rest. A `?kind=` query param would be a second home for the same
   rule — the queue is small, so the split lives in the renderer. */
export const isBackupEntry = (entry) => entry?.kind === 'backup';

/* Schedule status → Badge variant (the qbadge tint recipe — cmp-badges). failed/missed are the
   loud ones: a backup that did not run is the one outcome an operator must not scroll past. */
export const SCHED_VARIANT = {
  pending: 'st-queued', running: 'st-active', done: 'st-done',
  failed: 'pr-urgent', missed: 'pr-high', cancelled: 'st-queued',
};
