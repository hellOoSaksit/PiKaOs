import { describe, it, expect } from 'vitest';
import en from './en-formal.json';
import th from './th-formal.json';
import ja from './ja-formal.json';

// The server-Core update card, the schedule queue, and the notifications the runner emits
// (server-core-update spec §4/§6). Same shape as plugins-ver-keys.test.js — a key missing from a
// pack renders as a raw key string, and for notif.schedule.* that string is the ONLY output a
// scheduled update has: it fires while nobody is watching.
const keysOf = (pack, prefix) => Object.keys(pack.translations ?? pack).filter((k) => k.startsWith(prefix)).sort();
const at = (pack, k) => (pack.translations ?? pack)[k];
const PACKS = [['en', en], ['th', th], ['ja', ja]];

describe('core.update.* / sched.* / notif.schedule.* i18n parity', () => {
  for (const prefix of ['core.update.', 'sched.', 'notif.schedule.', 'compat.']) {
    it(`th and ja carry exactly the en ${prefix}* key set`, () => {
      const base = keysOf(en, prefix);
      expect(base.length).toBeGreaterThan(0);
      expect(keysOf(th, prefix)).toEqual(base);
      expect(keysOf(ja, prefix)).toEqual(base);
    });
  }

  // Every status the store can put on a row needs a label. A status with no key renders raw in the
  // queue — and `running` is the one the plan's own key list forgot.
  it('covers every schedule status the server can report', () => {
    for (const s of ['pending', 'running', 'done', 'failed', 'missed', 'cancelled'])
      for (const [name, pack] of PACKS)
        expect(at(pack, `sched.status.${s}`), `${name} is missing sched.status.${s}`).toBeTruthy();
  });

  // A translation that drops its placeholder still renders — as a notification naming no plugin.
  it('every pack keeps the placeholders its key promises', () => {
    const NEEDS = {
      'core.update.latest': ['{version}'],
      'core.update.blocked': ['{version}'],
      'core.update.current': ['{version}'],
      'sched.at': ['{time}'],
      'sched.later': ['{tag}'],
      'notif.schedule.done': ['{plugin}', '{tag}'],
      'notif.schedule.failed': ['{plugin}', '{tag}'],
      'notif.schedule.missed': ['{plugin}', '{tag}'],
      'notif.schedule.cancelled': ['{plugin}', '{tag}'],
    };
    for (const [name, pack] of PACKS)
      for (const [k, tokens] of Object.entries(NEEDS))
        for (const token of tokens)
          expect(at(pack, k), `${name}/${k} lost ${token}`).toContain(token);
  });

  // The runner builds its key as `notif.schedule.${status}`, so the packs have to carry exactly the
  // terminal statuses it can emit — no more (dead copy), no fewer (a raw key in the bell).
  it('matches the keys update_runner.announce can emit', () => {
    expect(keysOf(en, 'notif.schedule.')).toEqual(
      ['notif.schedule.backup', 'notif.schedule.backupfailed', 'notif.schedule.cancelled',
       'notif.schedule.core', 'notif.schedule.done', 'notif.schedule.failed',
       'notif.schedule.missed']);
  });

  // A backup entry has no pluginId/tag, so it takes its own keys rather than the shared ones — with
  // the shared key it would render "Scheduled update applied: → " for a backup that really ran.
  it('keeps the backup notifications free of plugin/tag placeholders', () => {
    for (const [name, pack] of PACKS)
      for (const k of ['notif.schedule.backup', 'notif.schedule.backupfailed']) {
        expect(at(pack, k), `${name} is missing ${k}`).toBeTruthy();
        expect(at(pack, k), `${name}/${k} promises a value the server never sends`).not.toContain('{');
      }
  });
});
