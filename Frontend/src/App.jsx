/* PiKaOs — ES module (migrated from PiKaOs/app.jsx). */
import React from 'react';
import { createPortal } from 'react-dom';
const { useState, useEffect } = React;
import { AUDIT_SEED, ROLES_SEED, ROLE_PERMS_SEED, USERS_SEED, USER_PERMS_SEED, fmtTok, loadU, resolvePerms, roleByKey, saveU, userById } from './data/data-users.jsx';
import { TOOL_RUNS_SEED, WORKFLOWS_SEED, loadWF, saveWF } from './data/data-workflows.jsx';
import { MANA, NAV, NAV_GROUP_FORMAL, NAV_LABEL_FORMAL, QUESTS, ROUTE_TITLE_FORMAL, byId } from './data/data.jsx';
import { Admin } from './screens/screens-admin.jsx';
import { CharacterBuilder } from './screens/screens-builder.jsx';
import { Chronicle, Codex, Mana, QuestLog, Recall, Settings, Treasury, Watchtower } from './screens/screens-extra.jsx';
import { Login } from './screens/Login.jsx';
import { MyDashboard } from './screens/screens-me.jsx';
import { AuditLog, PermissionsCatalog, RolesPermissions, UserDetail, UserForm } from './screens/screens-rbac.jsx';
import { AgentDrawer, Agents, Meeting, QuestBoard, QuestDrawer } from './screens/screens-secondary.jsx';
import { SitemapAudit } from './screens/screens-sitemap.jsx';
import { Compare } from './screens/screens-compare.jsx';
import { ToolsManager } from './screens/screens-tools.jsx';
import { ComponentLibrary } from './screens/screens-library.jsx';
import { Workflows } from './screens/screens-workflows.jsx';
import { useAuth } from './lib/auth.jsx';
import { Menu } from './components/ui/Dropdown.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { World } from './screens/screens-world.jsx';
import { SAMPLE_CHARS, loadArchived, loadChars, randPos, saveArchived, saveChars } from './lib/store.jsx';
import { UILoadingHost, UIModalHost } from './lib/ui-modal.jsx';
import { makeT, DEFAULT_LANG, DEFAULT_STYLE, packById, defaultPack, defaultPackForLang, LEX_PACKS } from './lib/i18n.jsx';

// ชุดเริ่มต้นตอนเปิดแอป = master ของ i18n (English + Formal — มาจาก flag isDefault* ในไฟล์ ไม่ hardcode)
const I18N_DEFAULT_PACK = (LEX_PACKS.find(p => p.lang === DEFAULT_LANG && p.styleKey === DEFAULT_STYLE) || defaultPack() || {}).id || "english_pro";

/* ============================================================
   APP SHELL — sidebar, topbar, routing, drawers, login gate
   ============================================================ */

const ROUTE_META = {
  me:      { icon: "🧭", title: "แดชบอร์ดของฉัน", en: "My Dashboard" },
  hall:    { icon: "🏰", title: "ห้องกิลด์", en: "Guild Hall" },
  agents:  { icon: "🎭", title: "เหล่านักผจญภัย", en: "Adventurers" },
  quests:  { icon: "📜", title: "กระดานภารกิจ", en: "Quest Board" },
  world:   { icon: "🌍", title: "สถานะโลก", en: "World State" },
  meeting: { icon: "💬", title: "ห้องประชุม Agent", en: "Council" },
  codex:   { icon: "📚", title: "บันทึกความรู้", en: "Codex" },
  search:  { icon: "🔍", title: "ค้นหาความรู้", en: "Recall" },
  sitemap: { icon: "🗺️", title: "ตรวจไซต์แมพ", en: "Sitemap Match" },
  compare: { icon: "🔀", title: "เทียบเนื้อหา", en: "Compare Content" },
  mana:    { icon: "🔵", title: "มานา (Token)", en: "Mana" },
  treasury:{ icon: "💰", title: "คลังสมบัติ", en: "Treasury" },
  stats:   { icon: "📊", title: "สถิติการผจญภัย", en: "Chronicle" },
  admin:   { icon: "👥", title: "จัดการผู้ใช้", en: "User Management" },
  toolsmgr:{ icon: "🧰", title: "จัดการเครื่องมือ", en: "Tools" },
  roles:   { icon: "🔑", title: "บทบาทและสิทธิ์", en: "Roles & Access" },
  workflows: { icon: "⚗️", title: "โต๊ะปรุงเวท", en: "Workflows" },
  audit:   { icon: "📋", title: "บันทึกการตรวจสอบ", en: "Audit Log" },
  userDetail: { icon: "👤", title: "ข้อมูลสมาชิก", en: "User" },
  settings:{ icon: "⚙️", title: "ตั้งค่ากิลด์", en: "Settings" },
  library: { icon: "🧩", title: "คลังคอมโพเนนต์", en: "Component Library" },
  history: { icon: "🗂️", title: "ประวัติภารกิจ", en: "Quest Log" },
  watch:   { icon: "🛡️", title: "ระบบเฝ้าระวัง", en: "Watchtower" },
};

const NAV_GROUP_KEY = { "ศูนย์บัญชาการ": "command", "ความรู้และความทรงจำ": "knowledge", "ทรัพยากร": "resources", "ผู้ดูแลกิลด์": "admin" };

function Sidebar({ route, go, t, can }) {
  return (
    <aside className="sidebar" data-no-lex>
      <div className="brand">
        <span className="brand-logo"><span className="ltr">P</span></span>
        <div>
          <div className="brand-name">{t("brand.name")}</div>
          <div className="brand-sub">{t("brand.sub")}</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map(g => {
          const items = g.items.filter(it => !it.perm || (can && can(it.perm)));
          if (items.length === 0) return null;
          return (
          <div className="nav-group" key={g.group}>
            <div className="nav-label">{t("navgroup." + (NAV_GROUP_KEY[g.group] || g.group))}</div>
            {items.map(it => (
              <div key={it.id} className={`nav-item ${route === it.id ? "active" : ""}`} onClick={() => go(it.id)}>
                <span className="ni-icon">{it.icon}</span>
                <span style={{ flex: 1 }}>{t("nav." + it.id)}</span>
                {it.tag && <span className={`ni-tag ${it.tag === "live" ? "alert" : ""}`}>{it.tag === "live" ? "● LIVE" : it.tag}</span>}
              </div>
            ))}
          </div>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="row"><span className="pulse-dot" /><span>{t("foot.online")}</span></div>
        <div className="faint">{t("foot.version", { n: (window.__chars || []).length })}</div>
      </div>
    </aside>
  );
}

/* ---- Profile popup (avatar → account card: identity, personal tokens, change password, sign out) ---- */
/* render overlays at <body> so the topbar's stacking context can't clip/overlap them */
function portalBody(node) {
  try { if (typeof createPortal === "function") return createPortal(node, document.body); } catch (e) { }
  try { return ReactDOM.createPortal(node, document.body); } catch (e) { }
  return node;
}
function ChangePwModal({ t, onClose }) {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [cf, setCf] = useState("");
  const [err, setErr] = useState(""); const [done, setDone] = useState(false);
  const submit = () => {
    if (!cur) { setErr(t("pw.errCurrent")); return; }
    if (nw.length < 6) { setErr(t("pw.errShort")); return; }
    if (nw !== cf) { setErr(t("pw.errMatch")); return; }
    setDone(true); setTimeout(onClose, 1150);
  };
  return portalBody(
    <div className="uim-overlay" onClick={onClose} data-no-lex style={{ zIndex: 4200 }}>
      <div className="uim" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div className="uim-title" style={{ marginTop: 8 }}>{t("pw.success")}</div>
          </div>
        ) : (<>
          <div className="uim-title">🔑 {t("pw.title")}</div>
          <div className="pp-pwform">
            <label className="bf-label">{t("pw.current")}</label>
            <input className="uim-input" type="password" value={cur} onChange={e => { setCur(e.target.value); setErr(""); }} autoFocus />
            <label className="bf-label">{t("pw.new")}</label>
            <input className="uim-input" type="password" value={nw} onChange={e => { setNw(e.target.value); setErr(""); }} />
            <label className="bf-label">{t("pw.confirm")}</label>
            <input className="uim-input" type="password" value={cf} onChange={e => { setCf(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} />
            {err && <div className="uim-warn">{err}</div>}
          </div>
          <div className="uim-actions">
            <button className="uim-btn ghost" onClick={onClose}>{t("pw.cancel")}</button>
            <button className="uim-btn primary" onClick={submit}>{t("pw.save")}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

const AV_PRESETS = ["🧙", "🦉", "🛠️", "📜", "👁️", "🌙", "🧑‍💻", "🦊", "🐼", "🚀", "🎯", "🧠"];
const isAvImg = (a) => typeof a === "string" && (a.startsWith("data:") || a.startsWith("http"));
function Av({ a, fallback = "🧙" }) { return isAvImg(a) ? <img className="av-img" src={a} alt="" /> : <span>{a || fallback}</span>; }

function ProfileMenu({ me, roles, t, onSignOut, onSaveProfile }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [draft, setDraft] = useState({ display: me.display, email: me.email || "", avatar: me.avatar });
  const [dirty, setDirty] = useState(false);
  const [avPick, setAvPick] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = React.useRef(null);
  const ref = React.useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) { setDraft({ display: me.display, email: me.email || "", avatar: me.avatar }); setDirty(false); setAvPick(false); setSaved(false); } }, [open]);
  const role = roleByKey(roles, me.role) || { en: me.role, th: me.role, color: "" };
  const roleLabel = (t.lang === "en") ? role.en : role.th;
  const quota = me.quota, used = me.used || 0;
  const remaining = quota == null ? null : Math.max(0, quota - used);
  const pct = quota == null ? 0 : Math.min(100, Math.round(used / quota * 100));
  const periodKey = me.period === "monthly" ? "profile.period.monthly" : "profile.period.weekly";
  const accent = role.color || "var(--gold)";
  const setField = (k, v) => { setDraft(d => ({ ...d, [k]: v })); setDirty(true); setSaved(false); };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return; const rd = new FileReader(); rd.onload = () => setField("avatar", rd.result); rd.readAsDataURL(f);
    setAvPick(false);
  };
  const save = () => {
    if (!dirty) return;
    onSaveProfile && onSaveProfile({ display: (draft.display || "").trim() || me.display, email: (draft.email || "").trim(), avatar: draft.avatar });
    setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 1800);
  };
  return (
    <div className="profile-wrap" ref={ref} data-no-lex>
      <button className="avatar sm profile-trigger" style={{ "--av": "var(--gold)", color: "var(--gold-bright)" }} title={me.display} onClick={() => setOpen(o => !o)}>
        <Av a={me.avatar} />
      </button>
      {open && portalBody(
        <div className="profile-overlay" onClick={() => setOpen(false)} data-no-lex>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <button className="profile-close" onClick={() => setOpen(false)} title="✕">✕</button>
            <div className="pm-kicker mono">{t("profile.title")}</div>
            <div className="pm-head">
              <div className="pm-avwrap">
                <button className="pm-av pm-av-btn" style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }} onClick={() => setAvPick(v => !v)} title={t("profile.editAvatar")}>
                  <Av a={draft.avatar} />
                  <span className="pm-av-edit">✎</span>
                </button>
              </div>
              <div className="pm-id">
                <input className="pm-name-input" value={draft.display} onChange={e => setField("display", e.target.value)} placeholder={t("profile.namePh")} aria-label={t("profile.name")} />
                <div className="pm-sub">
                  <span className="pp-role" style={{ color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 36%, transparent)` }}>{roleLabel}</span>
                  <span className="pm-username mono">@{me.username}</span>
                </div>
              </div>
            </div>
            {avPick && (
              <div className="pm-avpick">
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
                <button className="pm-av-upload" onClick={() => fileRef.current && fileRef.current.click()}>📷 {t("profile.upload")}</button>
                <div className="pm-av-or">{t("profile.choose")}</div>
                <div className="pm-av-emos">
                  {AV_PRESETS.map(e => (
                    <button key={e} className={"pm-av-emo" + (draft.avatar === e ? " on" : "")} onClick={() => { setField("avatar", e); setAvPick(false); }}>{e}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="pm-grid">
              <div className="pm-field pm-field-full">
                <span className="pm-flabel">{t("profile.email")}</span>
                <input className="pm-input" type="email" value={draft.email} onChange={e => setField("email", e.target.value)} placeholder={t("profile.emailPh")} />
              </div>
              <div className="pm-field"><span className="pm-flabel">{t("profile.role")}</span><span className="pm-fval">{roleLabel}</span></div>
              <div className="pm-field"><span className="pm-flabel">{t("profile.username")}</span><span className="pm-fval mono">@{me.username}</span></div>
              <div className="pm-field"><span className="pm-flabel">{t("profile.status")}</span><span className="pm-fval">{me.status === "suspended" ? t("profile.suspended") : t("profile.active")}</span></div>
              <div className="pm-field"><span className="pm-flabel">{t("profile.joined")}</span><span className="pm-fval">{me.joined || "—"}</span></div>
            </div>
            <div className="pp-tokens">
              <div className="pp-tok-head">
                <span className="pp-tok-title">🔵 {t("profile.tokens")}</span>
                <span className="pp-tok-period mono">{t(periodKey)}</span>
              </div>
              <div className="pp-bar"><div className={"pp-bar-fill" + (pct >= 90 ? " hot" : "")} style={{ width: (quota == null ? 6 : pct) + "%" }} /></div>
              <div className="pp-tok-row">
                <span><b>{fmtTok(used)}</b> {t("profile.used")}</span>
                <span>{quota == null ? t("profile.unlimited") : <span><b>{fmtTok(remaining)}</b> {t("profile.remaining")}</span>}</span>
              </div>
              <div className="pp-tok-quota mono">{t("profile.quota")}: {quota == null ? "∞" : fmtTok(quota)}</div>
            </div>
            <button className={"pm-save" + (dirty ? " on" : "") + (saved ? " saved" : "")} onClick={save} disabled={!dirty && !saved}>
              {saved ? "✓ " + t("profile.saved") : t("profile.save")}
            </button>
            <div className="pm-actions">
              <button className="pp-btn" onClick={() => { setPwOpen(true); }}><span>🔑</span>{t("profile.changePw")}</button>
              <button className="pp-btn danger" onClick={() => { setOpen(false); onSignOut && onSignOut(); }}><span>🚪</span>{t("profile.signOut")}</button>
            </div>
          </div>
        </div>
      )}
      {pwOpen && <ChangePwModal t={t} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

/* ---------------- View-as (impersonation preview) ---------------- */
/* Admin-only control to preview the app exactly as another user sees it.
   Gated upstream by realCan("user.manage"); the banner+exit ride on the
   REAL identity so a preview can never trap you. */
function ViewAsControl({ viewAs }) {
  const { users, roles, realMe, onPick, T, t } = viewAs;
  const items = users
    .filter(u => u.id !== realMe.id)
    .map(u => {
      const r = roleByKey(roles, u.role);
      return {
        label: <span className="va-pick"><span className="va-pick-av">{u.avatar}</span>
          <span className="va-pick-name">{u.display}</span>
          <span className={`va-pick-role badge ${r.color || ""}`}>{T(r.en, r.th)}</span></span>,
        onSelect: () => onPick(u.id),
      };
    });
  return (
    <div className="viewas-ctl" title={t("viewas.hint")}>
      <Menu label={<span className="va-trigger">👁️ {t("viewas.enter")}</span>} items={items} minWidth={150} />
    </div>
  );
}

/* The persistent banner shown while previewing as someone, with the exit. */
function ViewAsBanner({ user, roles, onExit, t, T }) {
  const r = roleByKey(roles, user.role);
  return (
    <div className="viewas-banner" data-no-lex role="status">
      <span className="vb-eye">👁️</span>
      <span className="vb-text">
        {t("viewas.banner")} <b>{user.avatar} {user.display}</b>
        <span className={`badge ${r.color || ""}`} style={{ marginLeft: 6 }}>{T(r.en, r.th)}</span>
      </span>
      <button className="vb-exit" onClick={onExit}>✕ {t("viewas.exit")}</button>
    </div>
  );
}

function Topbar({ route, theme, setTheme, user, language, viewAs, t, me, roles, onSignOut, onSaveProfile }) {
  const m = ROUTE_META[route] || ROUTE_META.hall;
  const title = t("route." + route + ".title");
  const live = route === "hall" || route === "meeting" || route === "world";
  const tEn = makeT("en", "formal");
  return (
    <header className="topbar" data-no-lex>
      <div className="topbar-title">
        <span className="tt-icon">{m.icon}</span>
        <h1>{title}</h1>
        {language !== "en" && <span className="tt-en">{tEn("route." + route + ".title")}</span>}
        {live && <span className="live-badge" style={{ marginLeft: 6 }}><span className="pulse-dot" />LIVE</span>}
      </div>
      <div className="topbar-spacer" />
      {viewAs && <ViewAsControl viewAs={viewAs} />}
      <div className="tb-stat" data-no-lex>
        <span className="tbs-ico">🔵</span>
        <span className="tbs-num">{(MANA.balance/1000).toFixed(1)}K</span>
        <span className="tbs-lbl">{t("topbar.tokens")}</span>
      </div>
      {window.TodoBell
        ? <window.TodoBell t={t} formal={false} activeCount={QUESTS.filter(q => q.status === "active").length} route={route} />
        : <div className="tb-stat">
            <span className="tbs-ico">📜</span>
            <span className="tbs-lbl">{t("topbar.tasks")}</span>
          </div>}
      <div className="theme-toggle">
        <button className={theme === "pro" ? "on" : ""} onClick={() => setTheme("pro")} title={t("theme.day")}>☀️</button>
        <button className={theme === "pro-dark" ? "on" : ""} onClick={() => setTheme("pro-dark")} title={t("theme.night")}>🌙</button>
      </div>
      {me
        ? <ProfileMenu me={me} roles={roles} t={t} onSignOut={onSignOut} onSaveProfile={onSaveProfile} />
        : <div className="avatar sm" style={{ "--av": "var(--gold)", color: "var(--gold-bright)" }} title={user}><span>🧙</span></div>}
    </header>
  );
}

function App() {
  const auth = useAuth();                                  // { user, ready, loggedIn, login, logout }
  const currentUser = auth.user;                           // backend account or null
  const username = currentUser?.username || "somchai";     // for the topbar avatar label
  const [route, setRoute] = useState("me");
  const [theme, setThemeState] = useState(() => { const t = localStorage.getItem("guild-theme"); return (t === "pro" || t === "pro-dark") ? t : "pro"; });
  // active lexicon = ภาษาที่แสดง + รูปแบบคำศัพท์ รวมเป็นชุดเดียว (รหัสชุดจาก data/lexicons/*.json)
  const [lex, setLexState] = useState(() => {
    const saved = localStorage.getItem("guild-lex");
    if (saved && packById(saved)) return saved;
    // migrate จากคีย์เก่า (ถ้าเคยตั้งไว้)
    const oldLang = localStorage.getItem("guild-language");
    const oldStyle = localStorage.getItem("guild-style");
    if (oldLang || oldStyle) {
      const id = oldLang === "en" ? (oldStyle === "formal" ? "english_pro" : "english") : (oldStyle || "formal");
      if (packById(id)) return id;
    }
    return I18N_DEFAULT_PACK;   // ผู้ใช้ใหม่ → ภาษา/รูปแบบเริ่มต้นตาม i18n (English + Formal)
  });
  const lastByLang = React.useRef({});
  const [agentSel, setAgentSel] = useState(null);
  const [questSel, setQuestSel] = useState(null);
  const [chars, setChars] = useState(() => loadChars());
  const [archived, setArchived] = useState(() => loadArchived());
  const [builder, setBuilder] = useState(null);   // null | {} | {existing char}

  // ---- RBAC / users (Phase 4) ----
  const [users, setUsers] = useState(() => loadU("users", USERS_SEED));
  const [roles, setRoles] = useState(() => loadU("roles", ROLES_SEED));
  const [rolePerms, setRolePerms] = useState(() => {
    const loaded = loadU("rolePerms", ROLE_PERMS_SEED);
    // migrate: ensure newer room.* permissions exist per seed (union, never removes)
    const out = { ...loaded };
    for (const rk of Object.keys(ROLE_PERMS_SEED)) {
      const cur = new Set(out[rk] || []);
      ROLE_PERMS_SEED[rk].filter(k => /^room\.|^character\.|^options\./.test(k)).forEach(k => cur.add(k));
      out[rk] = [...cur];
    }
    return out;
  });
  const [userPerms, setUserPerms] = useState(() => loadU("userPerms", USER_PERMS_SEED));
  const [audit, setAudit] = useState(() => loadU("audit", AUDIT_SEED));
  const [workflows, setWorkflows] = useState(() => loadWF("workflows", WORKFLOWS_SEED));
  const [toolRuns, setToolRuns] = useState(() => loadWF("runs", TOOL_RUNS_SEED));
  // slug used by the (still client-side) RBAC seed: "u_somchai" etc.
  const currentUserId = currentUser ? ("u_" + currentUser.username) : "u_somchai";
  const [viewAs, setViewAs] = useState(null);   // user id being previewed (in-memory only — never persisted)
  const [userSel, setUserSel] = useState(null);         // selected user id (detail)
  const [userForm, setUserForm] = useState(null);       // null | {} | user

  const setTheme = (t) => { setThemeState(t); localStorage.setItem("guild-theme", t); };
  // เลือก "รูปแบบคำศัพท์" ตรง ๆ ด้วยรหัสชุด
  const setLex = (id) => {
    if (!packById(id)) return;
    setLexState(id);
    localStorage.setItem("guild-lex", id);
    const p = packById(id); if (p) lastByLang.current[p.lang] = id;
  };
  // เลือก "ภาษาที่แสดง" → สลับไปชุดที่เคยใช้ของภาษานั้น (หรือชุดเริ่มต้นของภาษานั้น)
  const pickLanguage = (code) => {
    const remembered = lastByLang.current[code];
    const target = (remembered && packById(remembered)) ? remembered : (defaultPackForLang(code) || {}).id;
    if (target) setLex(target);
  };
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => { saveChars(chars); }, [chars]);
  useEffect(() => { saveArchived(archived); window.__archived = archived; }, [archived]);
  useEffect(() => { saveU("users", users); }, [users]);
  useEffect(() => { saveU("roles", roles); }, [roles]);
  useEffect(() => { saveU("rolePerms", rolePerms); }, [rolePerms]);
  useEffect(() => { saveU("userPerms", userPerms); }, [userPerms]);
  useEffect(() => { saveU("audit", audit); }, [audit]);
  useEffect(() => { saveWF("workflows", workflows); }, [workflows]);
  useEffect(() => { window.__workflows = workflows; }, [workflows]);
  useEffect(() => { saveWF("runs", toolRuns); }, [toolRuns]);
  // ทุกอย่างมาจากชุดที่กำลังใช้ — ภาษา/โหมดองค์กร derive จากข้อมูลในไฟล์ ไม่มี hardcode
  const activePack = packById(lex) || defaultPack() || {};
  const language = activePack.lang || "th";
  const formal = !!activePack.formal;
  const styleKey = activePack.styleKey || "formal";   // รูปแบบคำศัพท์สำหรับ i18n key-based
  const t = makeT(language, styleKey);                // t("some.key", { var }) — ไม่ hardcode
  lastByLang.current[language] = lex;   // จำสไตล์ล่าสุดของภาษาปัจจุบัน

  // expose live roster to data.jsx getters / byId
  window.__chars = chars;
  window.__charById = Object.fromEntries(chars.map(c => [c.id, c]));

  const go = (r) => {
    // closing every open overlay/popup when navigating away
    setAgentSel(null); setQuestSel(null); setBuilder(null);
    setUserForm(null); setUserSel(null);
    try { window.dispatchEvent(new Event("guildos-route-change")); } catch (e) { }
    try { document.body.classList.remove("nav-open"); } catch (e) { }
    setRoute(r);
    document.querySelector(".content")?.scrollTo(0, 0);
    if (r === "search") { const h = window.uiLoading && window.uiLoading({ title: "กำลังเชื่อมต่อคลังความรู้…", message: "HERMES Recall" }); setTimeout(() => h && h.close(), 820); }
  };
  window.__guildGo = go;

  const S = {
    chars,
    byId: (id) => chars.find(c => c.id === id),
    add: (c) => setChars(prev => [...prev, c]),
    update: (c) => setChars(prev => prev.map(x => x.id === c.id ? c : x)),
    remove: (id) => { const c = (window.__chars || []).find(x => x.id === id); if (c && c.locked) { try { window.uiAlert({ title: "ลบไม่ได้", message: "Agent CEO เป็นตำแหน่งตายตัว ลบไม่ได้ทุกสิทธิ์ (รวมถึงผู้ดูแลระบบ)" }); } catch (e) { } return; } setChars(prev => prev.filter(x => x.id !== id)); if (c) setArchived(a => [c, ...a.filter(x => x.id !== id)]); },
    archived,
    restore: (id) => { const c = (window.__archived || []).find(x => x.id === id); if (c) setChars(cs => cs.find(x => x.id === id) ? cs : [...cs, { ...c, pos: randPos() }]); setArchived(a => a.filter(x => x.id !== id)); },
    purge: (id) => setArchived(a => a.filter(x => x.id !== id)),
    openBuilder: (initial) => setBuilder(initial || {}),
    loadSamples: () => setChars(SAMPLE_CHARS.map(c => ({ ...c, pos: randPos() }))),
  };

  const saveChar = (c) => {
    if (chars.find(x => x.id === c.id)) S.update(c); else S.add(c);
    setBuilder(null);
  };

  // ---- resolve current user + permissions ----
  const T = (en, th) => language === "en" ? en : th;
  // REAL identity — never affected by "view as". The view-as entry + exit ride on this,
  // so previewing as a viewer can never trap you (you keep your real ability to leave).
  const realMe = userById(users, currentUserId) || users[0];
  const realPerms = resolvePerms(realMe.role, rolePerms, userPerms[realMe.id]);
  const realCan = (k) => realPerms.has(k);
  // EFFECTIVE identity — who you're previewing as (their role + their own overrides), or yourself.
  const viewUser = viewAs ? userById(users, viewAs) : null;
  const viewingAs = (viewUser && viewUser.id !== realMe.id) ? viewUser : null;
  const me = viewUser || realMe;
  const mePerms = resolvePerms(me.role, rolePerms, userPerms[me.id]);
  const can = (k) => mePerms.has(k);
  const logAudit = (action, targetType, target, meta) =>
    setAudit(prev => [{ id: "ev" + Date.now(), actor: currentUserId, action, targetType, target, meta, time: T("just now", "เมื่อสักครู่") }, ...prev]);

  const Sys = {
    users, roles, rolePerms, userPerms, audit, me, can, T, language, go,
    workflows, toolRuns,
    toggleWorkflow: (w) => {
      setWorkflows(prev => prev.map(x => x.id === w.id ? { ...x, enabled: !x.enabled } : x));
      logAudit("workflow.toggle", "workflow", w.id, (w.enabled ? "− disabled" : "+ enabled"));
    },
    recordRun: (wf, input, res) => {
      const run = { id: "tr_" + Date.now(), wf: wf.id, agent: null, quest: null,
        status: res.status, started: { en: "just now", th: "เมื่อสักครู่" }, dur: res.dur,
        input, output: res.output, error: res.error };
      setToolRuns(prev => [run, ...prev]);
      setWorkflows(prev => prev.map(x => x.id === wf.id ? { ...x, runs: (x.runs || 0) + 1, lastStatus: res.status } : x));
    },
    openBuilder: S.openBuilder,
    openUserForm: (u) => setUserForm(u || {}),
    saveUser: (f, edit) => {
      if (edit) { setUsers(prev => prev.map(x => x.id === f.id ? { ...x, ...f } : x)); logAudit("user.update", "user", f.id, T("profile updated", "แก้ไขโปรไฟล์")); }
      else {
        const id = "u_" + String(f.username || ("user" + Date.now())).toLowerCase();
        setUsers(prev => [...prev, { ...f, id, used: 0, lastLogin: T("never", "ยังไม่เข้า"), joined: T("just now", "เพิ่งสร้าง") }]);
        logAudit("user.create", "user", id, T(roleByKey(roles, f.role).en, roleByKey(roles, f.role).th));
      }
    },
    toggleSuspend: (u) => {
      const next = u.status === "active" ? "suspended" : "active";
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: next } : x));
      logAudit(next === "suspended" ? "user.suspend" : "user.update", "user", u.id, next === "suspended" ? T("suspended", "ระงับบัญชี") : T("restored", "คืนสถานะ"));
    },
    setRole: (u, role) => { setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role } : x)); logAudit("role.update", "user", u.id, "→ " + T(roleByKey(roles, role).en, roleByKey(roles, role).th)); },
    setQuota: (u, q) => { setUsers(prev => prev.map(x => x.id === u.id ? { ...x, quota: q } : x)); logAudit("quota.update", "user", u.id, q == null ? T("unlimited", "ไม่จำกัด") : fmtTok(q)); },
    resetUsage: (u) => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, used: 0 } : x)),
    setUserPerm: (u, key, effect) => {
      setUserPerms(prev => {
        const cur = { ...(prev[u.id] || {}) };
        if (effect == null) delete cur[key]; else cur[key] = effect;
        return { ...prev, [u.id]: cur };
      });
      if (effect) logAudit(effect === "grant" ? "permission.grant" : "permission.deny", "user", u.id, (effect === "grant" ? "+ " : "− ") + key);
    },
    setRolePerm: (roleKey, key, on) => {
      setRolePerms(prev => {
        const cur = new Set(prev[roleKey] || []);
        if (on) cur.add(key); else cur.delete(key);
        return { ...prev, [roleKey]: [...cur] };
      });
      logAudit("role.update", "role", roleKey, (on ? "+ " : "− ") + key);
    },
    addRole: () => {
      const key = "role_" + Date.now();
      window.uiPrompt({ title: T("New role", "เพิ่มบทบาท"), placeholder: T("Role name", "ชื่อบทบาท") }).then(name => {
        if (!name) return;
        setRoles(prev => [...prev, { key, th: name, en: name, desc: "", system: false, color: "" }]);
        setRolePerms(prev => ({ ...prev, [key]: [] }));
      });
    },
  };

  // auto-redirect away from a protected route the current (possibly switched) role can't see
  const ROUTE_PERM = { admin: "user.view.any", userDetail: "user.view.any", roles: "role.manage", permissions: "user.view.any", audit: "audit.view" };
  useEffect(() => {
    const need = ROUTE_PERM[route];
    if (need && !can(need)) go("me");
  }, [route, viewAs, rolePerms, userPerms]);

  if (!auth.ready) return null;   // avoid flashing the login screen while restoring a session
  if (!auth.loggedIn) return <Login onLogin={auth.login} t={t} />;

  const screen = (() => {
    const guard = (perm, el) => can(perm) ? el : <MyDashboard Sys={Sys} onAgent={setAgentSel} onQuest={setQuestSel} />;
    switch (route) {
      case "me": return <MyDashboard Sys={Sys} onAgent={setAgentSel} onQuest={setQuestSel} />;
      case "hall": return <World onAgent={setAgentSel} S={S} can={can} t={t} />;
      case "agents": return <Agents onAgent={setAgentSel} S={S} can={can} t={t} />;
      case "quests": return <QuestBoard onQuest={setQuestSel} can={can} t={t} />;
      case "world": return <World onAgent={setAgentSel} S={S} can={can} t={t} />;
      case "meeting": return <Meeting S={S} t={t} />;
      case "codex": return <Codex t={t} can={can} />;
      case "search": return <Recall lang={language} />;
      case "sitemap": return <SitemapAudit t={t} lang={language} can={can} actor={me.display_name || me.username || "ผู้ใช้"} />;
      case "compare": return <Compare t={t} lang={language} />;
      case "mana": return <Mana S={S} t={t} />;
      case "treasury": return <Treasury t={t} />;
      case "stats": return <Chronicle S={S} t={t} />;
      case "admin": return guard("user.view.any", <Admin Sys={Sys} onUser={(id) => { setUserSel(id); go("userDetail"); }} />);
      case "toolsmgr": return guard("options.manage", <ToolsManager can={can} t={t} />);
      case "userDetail": return guard("user.view.any", <UserDetail Sys={Sys} userId={userSel} onAgent={setAgentSel} />);
      case "roles": return guard("role.manage", <RolesPermissions Sys={Sys} />);
      case "permissions": return guard("user.view.any", <PermissionsCatalog Sys={Sys} />);
      case "audit": return guard("audit.view", <AuditLog Sys={Sys} />);
      case "workflows": return <Workflows Sys={Sys} />;
      case "settings": return <Settings theme={theme} setTheme={setTheme} lex={lex} setLex={setLex} pickLanguage={pickLanguage} language={language} formal={formal} go={go} t={t} />;
      case "library": return <ComponentLibrary onBack={() => go("settings")} t={t} />;
      case "history": return <QuestLog t={t} />;
      case "watch": return <Watchtower t={t} />;
      default: return <MyDashboard Sys={Sys} onAgent={setAgentSel} onQuest={setQuestSel} />;
    }
  })();

  return (
    <ToastProvider>
    <div className="app" key={lex}>
      <Sidebar route={route} go={go} t={t} can={can} />
      <div className="main">
        <Topbar route={route} theme={theme} setTheme={setTheme} user={username} language={language} t={t}
          me={me} roles={roles} onSignOut={auth.logout}
          onSaveProfile={(u) => setUsers(prev => prev.map(x => x.id === currentUserId ? { ...x, ...u } : x))}
          viewAs={realCan("user.manage") ? { users, roles, realMe, current: viewingAs, onPick: setViewAs, T, t } : null} />
        {viewingAs && <ViewAsBanner user={viewingAs} roles={roles} onExit={() => setViewAs(null)} t={t} T={T} />}
        <div className="content">{screen}</div>
      </div>
      {userForm && <UserForm Sys={Sys} initial={userForm.id ? userForm : null} onClose={() => setUserForm(null)} />}
      {agentSel && <AgentDrawer a={agentSel} onClose={() => setAgentSel(null)} t={t}
        onEdit={(c) => { setAgentSel(null); setBuilder(c); }}
        onDelete={async (id) => { const c = chars.find(x => x.id === id); if (c && c.locked) { await window.uiAlert({ title: t("ad.cantDelTitle"), message: t("ad.ceoLockedAlert") }); return; } setAgentSel(null); S.remove(id); }} />}
      {questSel && <QuestDrawer q={questSel} onClose={() => setQuestSel(null)} t={t} onAgent={(a) => { setQuestSel(null); setAgentSel(a); }} />}
      {builder && <CharacterBuilder initial={builder.id ? builder : null} onSave={saveChar} onClose={() => setBuilder(null)} can={can} archived={archived} t={t} onRestore={(id) => { S.restore(id); setBuilder(null); }} />}
      <UIModalHost />
      <UILoadingHost />
    </div>
    </ToastProvider>
  );
}

export default App;
