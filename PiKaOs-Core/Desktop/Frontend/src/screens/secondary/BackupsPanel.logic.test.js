import { describe, it, expect } from 'vitest';
import { fmtBytes, restoreArmed, restoreErrorKey, scheduleRowLabel, RESTORE_TOKEN }
  from './BackupsPanel.logic.js';

const t = (k) => k;

describe('schedule row label', () => {
  it('names a backup entry instead of rendering an empty plugin switch', () => {
    // the regression this exists for: `${pluginId} → ${tag}` on a backup row reads "null → null"
    expect(scheduleRowLabel({ kind: 'backup', pluginId: null, tag: null }, t)).toBe('backup.title');
  });

  it('still renders the plugin switch and the core reminder', () => {
    expect(scheduleRowLabel({ kind: 'plugin-update', pluginId: 'crm', tag: 'v1.2.0' }, t))
      .toBe('crm → v1.2.0');
    expect(scheduleRowLabel({ kind: 'core-reminder' }, t)).toBe('core.update.title');
  });
});

describe('restore arming', () => {
  it('accepts only the exact token', () => {
    expect(restoreArmed(RESTORE_TOKEN)).toBe(true);
    expect(restoreArmed(`  ${RESTORE_TOKEN} `)).toBe(true);      // a pasted trailing space is not intent
    expect(restoreArmed('restore')).toBe(false);                 // never case-folded
    expect(restoreArmed('')).toBe(false);
    expect(restoreArmed(undefined)).toBe(false);
  });
});

describe('restore failure reporting', () => {
  it('tells a key mismatch apart from a broken restore', () => {
    expect(restoreErrorKey(409)).toBe('backup.keydiffer');
    expect(restoreErrorKey(422)).toBe('backup.failed');
    expect(restoreErrorKey(500)).toBe('backup.failed');
  });
});

describe('size formatting', () => {
  it('scales and never renders undefined', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(5 * 1048576)).toBe('5.0 MB');
    expect(fmtBytes(undefined)).toBe('0 B');
  });
});
