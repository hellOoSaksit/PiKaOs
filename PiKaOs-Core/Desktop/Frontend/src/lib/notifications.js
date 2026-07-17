// Notification rows arrive i18n-clean from the server ({key, params}) — the CLIENT localizes,
// so the language packs stay the single source of copy (audit-notifications v2 spec).
export function toDisplayNotification(n, t) {
  return {
    id: n.id,
    read: !!n.read,
    title: t(n.key, n.params || {}),
    time: new Date(n.at).toLocaleString(),
  };
}

export function unreadCount(rows) {
  return rows.filter((n) => !n.read).length;
}
