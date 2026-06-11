import { useEffect, useRef, useState } from 'react';
import Segmented from './Segmented.jsx';
import Button from './Button.jsx';

/**
 * Notifications — bell trigger + floating notification center.
 * items: [{ id, av, avTone, actor, text, time, unread, action }]
 *   av: emoji or initials; avTone: gold|emerald|amber|neutral|initials
 *   action: "accept-decline" renders Accept/Decline → swaps to a mono result.
 * Unread = gold 6% tint + gold dot; badge counts unread; All/Unread tabs.
 */
export default function Notifications({ items: initial = [] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState(initial);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const unread = items.filter((i) => i.unread).length;
  const markRead = (id) => setItems((l) => l.map((i) => (i.id === id ? { ...i, unread: false } : i)));
  const markAll = () => setItems((l) => l.map((i) => ({ ...i, unread: false })));
  const respond = (id, ok) => setItems((l) => l.map((i) => (i.id === id ? { ...i, unread: false, result: ok ? 'ok' : 'no' } : i)));

  return (
    <div className={'notif' + (open ? ' open' : '')} ref={ref}>
      <button type="button" className="btn btn-ghost notif-bell" onClick={() => setOpen((o) => !o)}>
        🔔 <span className="notif-bell-txt">Notifications</span>
        <span className={'notif-badge' + (unread === 0 ? ' zero' : '')}>{unread}</span>
      </button>
      <div className="notif-panel">
        <div className="notif-head">
          <h4>Notifications</h4>
          <button type="button" className="notif-markall" onClick={markAll}>Mark all read</button>
        </div>
        <div className="notif-tabs">
          <Segmented options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} value={tab} onChange={setTab} />
        </div>
        <div className={'notif-list' + (tab === 'unread' ? ' filter-unread' : '')}>
          {items.map((n) => (
            <div key={n.id} className={'notif-item' + (n.unread ? ' unread' : '')} onClick={() => markRead(n.id)}>
              <span className={'notif-av ' + (n.avTone || 'neutral') + (n.avTone === 'initials' ? ' initials' : '')}>{n.av}</span>
              <div className="notif-body">
                <div className="notif-text"><b>{n.actor}</b> {n.text}</div>
                <div className="notif-time">{n.time}</div>
                {n.action === 'accept-decline' && !n.result && (
                  <div className="notif-actions" onClick={(e) => e.stopPropagation()}>
                    <Button kind="gold" size="sm" onClick={() => respond(n.id, true)}>Accept</Button>
                    <Button kind="ghost" size="sm" onClick={() => respond(n.id, false)}>Decline</Button>
                  </div>
                )}
                {n.result && <div className={'notif-result ' + n.result}>{n.result === 'ok' ? '✓ Accepted' : '✕ Declined'}</div>}
              </div>
              <span className="notif-dot" />
            </div>
          ))}
          <div className="notif-empty">You're all caught up.</div>
        </div>
        <div className="notif-foot"><button type="button" className="notif-viewall">View all activity</button></div>
      </div>
    </div>
  );
}
