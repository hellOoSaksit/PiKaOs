/* PiKaOs — ES module (migrated from PiKaOs-Core/notify.jsx). */
import React from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
const ReactDOM = { createPortal, createRoot };

/* ============================================================
   NOTIFY — Boss question alerts with a countdown, then routed to
   the topbar "งาน" Todo bell.
   • A fresh question shows as a floating card with a countdown.
   • When the countdown ends (or ✕), it collapses into the topbar
     Todo badge (📜 งาน) instead of staying on screen.
   • The Todo bell lists pending questions; each has “เข้าไปต่อ”
     that jumps into the relevant room.
   ============================================================ */
const NOTIFY_LS = "guildos.notify.v1";
const NOTIFY_COUNTDOWN = 7000; // ms a card stays before collapsing to the bell
function loadNotify() { try { return JSON.parse(localStorage.getItem(NOTIFY_LS) || "[]"); } catch (e) { return []; } }
function saveNotify(a) { try { localStorage.setItem(NOTIFY_LS, JSON.stringify(a)); } catch (e) { } try { window.dispatchEvent(new Event("guildos-notify")); } catch (e) { } }
function pushNotify(n) {
  const a = loadNotify();
  a.unshift({ id: "nt" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), seen: false, ...n });
  saveNotify(a.slice(0, 20));
}
function markSeen(id) { saveNotify(loadNotify().map(x => x.id === id ? { ...x, seen: true } : x)); }
function resolveNotify(id) { saveNotify(loadNotify().filter(x => x.id !== id)); }
/* mark a task done/acted — keeps it in history instead of deleting */
function markDone(id) { saveNotify(loadNotify().map(x => x.id === id ? { ...x, done: true, seen: true } : x)); }
function undoneNotify(id) { saveNotify(loadNotify().map(x => x.id === id ? { ...x, done: false } : x)); }
function toggleStar(id) { saveNotify(loadNotify().map(x => x.id === id ? { ...x, starred: !x.starred } : x)); }
function _rooms() { try { return JSON.parse(localStorage.getItem("guildos.rooms.v2") || "{}").rooms || []; } catch (e) { return []; } }
function _enterRoom(n) { if (n.roomId) window.__pendingRoom = n.roomId; if (window.__guildGo) window.__guildGo("world"); try { window.dispatchEvent(new Event("guildos-enter-room")); } catch (e) { } markDone(n.id); }
/* navigate to the page a notification relates to:
   room → world+enter room · explicit n.route → that page · otherwise the Task Board (approvals/tasks live there) */
function _goNotify(n) {
  if (n.roomId) { window.__pendingRoom = n.roomId; if (window.__guildGo) window.__guildGo("world"); try { window.dispatchEvent(new Event("guildos-enter-room")); } catch (e) { } }
  else if (n.route && window.__guildGo) window.__guildGo(n.route);
  else if (window.__guildGo) window.__guildGo("quests");
  markDone(n.id);   // ไปอยู่ในประวัติหลังกด
}
function _goLabel(n) { return n.roomId ? "เข้าไปต่อ" : (n.route ? "ไปที่หน้า" : "ไปกระดานงาน"); }
function clearNotify() { saveNotify([]); }
function relTime(ts) {
  const s = Math.floor((Date.now() - (ts || Date.now())) / 1000);
  if (s < 60) return "เมื่อสักครู่";
  const m = Math.floor(s / 60); if (m < 60) return m + " นาทีที่แล้ว";
  const h = Math.floor(m / 60); if (h < 24) return h + " ชม.ที่แล้ว";
  return Math.floor(h / 24) + " วันที่แล้ว";
}
const _isSystem = (n) => /hermes|ระบบ/i.test(n.from || "");
Object.assign(window, { pushNotify, resolveNotify, markSeen, markDone, undoneNotify, toggleStar, loadNotify, clearNotify });

/* ---- floating cards (fresh questions, with countdown) ---- */
function NotifyDock() {
  const [items, setItems] = React.useState(loadNotify);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const h = () => setItems(loadNotify());
    window.addEventListener("guildos-notify", h); window.addEventListener("storage", h);
    const iv = setInterval(() => { setNow(Date.now()); }, 250);
    return () => { window.removeEventListener("guildos-notify", h); window.removeEventListener("storage", h); clearInterval(iv); };
  }, []);
  const visible = items.filter(n => !n.seen);
  // auto-collapse to the bell when countdown elapses
  React.useEffect(() => {
    visible.forEach(n => { if (now - n.ts >= NOTIFY_COUNTDOWN) markSeen(n.id); });
  }, [now, visible.map(n => n.id).join(",")]);
  if (!visible.length) return null;
  const rooms = _rooms();
  return (
    <div className="notify-dock">
      {visible.slice(0, 3).map(n => {
        const rm = rooms.find(r => r.id === n.roomId);
        const left = Math.max(0, Math.ceil((n.ts + NOTIFY_COUNTDOWN - now) / 1000));
        return (
          <div key={n.id} className="notify-card">
            <div className="notify-head">
              <span className="notify-ic">❓</span>
              <span className="notify-from">{n.from || "Agent"}</span>
              <span className="notify-count" title="จะย้ายไปแถบงาน (Todo)">⏱ {left}s</span>
              <button className="notify-x" title="ส่งไปแถบงานเลย" onClick={() => markSeen(n.id)}>✕</button>
            </div>
            <div className="notify-q">{n.question}</div>
            <div className="notify-foot">
              <span className="notify-meta mono">{rm ? "🏠 " + rm.name : (n.taskTitle ? "📌 " + n.taskTitle : "")}</span>
              <button className="notify-go" onClick={() => _goNotify(n)}>{_goLabel(n)} →</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- topbar Todo bell (collapsed questions live here) ---- */
function TodoBell({ t, formal, activeCount, route }) {
  const [items, setItems] = React.useState(loadNotify);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState("new");
  React.useEffect(() => { setOpen(false); }, [route]);
  React.useEffect(() => {
    const h = () => setItems(loadNotify());
    window.addEventListener("guildos-notify", h);
    const iv = setInterval(h, 1200);
    return () => { window.removeEventListener("guildos-notify", h); clearInterval(iv); };
  }, []);
  const L = (k) => (t ? t(k) : k);
  const rooms = _rooms();
  const newItems = items.filter(n => !n.done);
  const histItems = items.filter(n => n.done);
  const starItems = items.filter(n => n.starred);
  const count = newItems.length;                 // badge = new & not done
  const TABS = [["new", newItems.length], ["history", histItems.length], ["starred", starItems.length]];
  const list = tab === "history" ? histItems : tab === "starred" ? starItems : newItems;
  const emptyKey = tab === "history" ? "notif.empty.history" : tab === "starred" ? "notif.empty.starred" : "notif.empty.new";

  return (
    <div className={`tb-stat tb-todo ${open ? "open" : ""}`} onClick={() => setOpen(o => !o)}>
      <span className="tbs-ico">📜</span>
      <span className="tbs-lbl">{t ? t("topbar.tasks") : (formal ? "งาน" : "งาน")}</span>
      {count > 0 && <span className="tb-badge">{count}</span>}
      {open && ReactDOM.createPortal((<>
        <div className="notif-scrim" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
        <div className="notif-pop open" style={{ top: 70, right: 18 }} onClick={e => e.stopPropagation()}>
          <div className="notif-pop-head">
            <h4>{L("notif.title")}</h4>
            <span className="notif-head-acts">
              {histItems.length > 0 && tab === "history" && <button className="notif-clear" onClick={() => { saveNotify(loadNotify().filter(x => !x.done)); }}>{L("notif.clearAll")}</button>}
              <button className="notif-pop-close" onClick={() => setOpen(false)}>✕</button>
            </span>
          </div>
          <div className="notif-tabs">
            {TABS.map(([k, n]) => (
              <button key={k} className={`notif-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
                {k === "starred" ? "★ " : ""}{L("notif.tab." + k)}{n > 0 && <span className="notif-tab-n">{n}</span>}
              </button>
            ))}
          </div>
          <div className="notif-pop-list">
            {list.length === 0
              ? <div className="notif-pop-empty">{L(emptyKey)}</div>
              : list.map(n => {
                const rm = rooms.find(r => r.id === n.roomId);
                const sys = _isSystem(n);
                return (
                  <div key={n.id} className={`notif-row ${n.seen ? "" : "unread"} ${n.done ? "done" : ""}`}>
                    <span className={`notif-av ${sys ? "sys" : ""}`}>{sys ? "🤖" : "❓"}</span>
                    <div className="notif-bd">
                      <div className="notif-toprow">
                        <span className="notif-from">{n.from || "Agent"}</span>
                        <button className={`notif-star ${n.starred ? "on" : ""}`} title={L("notif.star")} onClick={(e) => { e.stopPropagation(); toggleStar(n.id); }}>{n.starred ? "★" : "☆"}</button>
                        <span className="notif-time mono">{relTime(n.ts)}</span>
                      </div>
                      <div className="notif-q">{n.question}</div>
                      <div className="notif-row-foot">
                        <span className="notif-room">{rm ? "🏠 " + rm.name : (n.taskTitle ? "📌 " + n.taskTitle : "")}</span>
                        <span className="notif-row-acts">
                          {n.done
                            ? <button className="btn btn-ghost btn-sm" onClick={() => resolveNotify(n.id)}>{L("notif.del")}</button>
                            : <button className="btn btn-ghost btn-sm" onClick={() => markDone(n.id)}>✓ {L("notif.markDone")}</button>}
                          <button className="btn btn-gold btn-sm" onClick={() => { _goNotify(n); setOpen(false); }}>{_goLabel(n)} →</button>
                        </span>
                      </div>
                    </div>
                    {!n.seen && <span className="notif-dot" />}
                  </div>
                );
              })}
          </div>
        </div>
      </>), document.body)}
    </div>
  );
}
window.TodoBell = TodoBell;

(function mountNotify() {
  const mount = () => {
    let host = document.getElementById("notify-root");
    if (!host) { host = document.createElement("div"); host.id = "notify-root"; document.body.appendChild(host); }
    try { ReactDOM.createRoot(host).render(<NotifyDock />); } catch (e) { /* ignore */ }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();

export {
  NOTIFY_COUNTDOWN,
  NOTIFY_LS,
  NotifyDock,
  TodoBell,
  _enterRoom,
  _rooms,
  clearNotify,
  loadNotify,
  markSeen,
  pushNotify,
  relTime,
  resolveNotify,
  saveNotify
};
