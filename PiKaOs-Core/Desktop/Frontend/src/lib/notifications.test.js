import { describe, it, expect } from 'vitest';
import { toDisplayNotification, unreadCount } from './notifications.js';

const t = (key, vars) => `${key}:${JSON.stringify(vars)}`;

describe('notifications mapping', () => {
  it('localizes key+params client-side and formats the time', () => {
    const n = { id: 'ntf_1', kind: 'plugin', key: 'notif.plugin.installed',
                params: { plugin: 'crm' }, at: '2026-07-17T05:00:00+00:00', read: false };
    const d = toDisplayNotification(n, t);
    expect(d.id).toBe('ntf_1');
    expect(d.title).toBe('notif.plugin.installed:{"plugin":"crm"}');
    expect(d.read).toBe(false);
    expect(typeof d.time).toBe('string');
  });

  it('unreadCount counts only unread rows', () => {
    expect(unreadCount([{ read: false }, { read: true }, { read: false }])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});
