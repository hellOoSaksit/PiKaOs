/* PiKaOs — ES module (migrated from PiKaOs-Core/app.jsx). */
import React from 'react';
import { createPortal } from 'react-dom';
const { useState, useEffect } = React;
import { NAV } from './data/data.jsx';
import { loadNav, saveNav, mergeWithDefault } from './data/data-nav.jsx';
import { getNavConfig, setNavConfig, getMySettings, setMySetting, getGlobalConfig, setGlobalConfig, setupStatus, setToken, getCapabilities } from './lib/api.js';
import { resolveShellMode } from './lib/shell-mode.js';
import { applyGlobalConfig } from './lib/characters.jsx';
import { Settings } from './screens/screens-extra.jsx';
import { FirstRun } from './screens/FirstRun.jsx';
import { KernelOnlyShell } from './screens/KernelOnlyShell.jsx';
import { KernelHome } from './screens/KernelHome.jsx';
import { PluginsManager } from './screens/screens-plugins.jsx';
import { ToolsManager } from './screens/screens-tools.jsx';
import { ComponentLibrary } from './screens/screens-library.jsx';
import { useAuth } from './lib/auth.jsx';
import { BottomUtilityBar } from './components/ui/BottomUtilityBar.jsx';
import { renderIcon } from './components/ui/icons.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { UILoadingHost, UIModalHost } from './lib/ui-modal.jsx';
import { makeT, DEFAULT_LANG, DEFAULT_STYLE, packById, defaultPack, defaultPackForLang, LEX_PACKS } from './lib/i18n.jsx';
import { renderPluginRoute, PLUGIN_ROUTE_META } from './plugins/index.jsx';

// ชุดเริ่มต้นตอนเปิดแอป = master ของ i18n (English + Formal — มาจาก flag isDefault* ในไฟล์ ไม่ hardcode)
const I18N_DEFAULT_PACK = (LEX_PACKS.find(p => p.lang === DEFAULT_LANG && p.styleKey === DEFAULT_STYLE) || defaultPack() || {}).id || "english_pro";

/* ============================================================
   APP SHELL — sidebar, topbar, routing, drawers, login gate
   ============================================================ */

const ROUTE_META = {
  home:    { icon: "home", title: "หน้าหลัก", en: "Home" },
  toolsmgr:{ icon: "tools", title: "จัดการเครื่องมือ", en: "Tools" },
  install: { icon: "download", title: "ติดตั้ง", en: "Install" },
  modules: { icon: "puzzle", title: "โมดูล / ปลั๊กอิน", en: "Modules / Plugins" },
  marketplace: { icon: "cart", title: "มาร์เก็ตเพลส", en: "Marketplace" },
  mypackages: { icon: "package", title: "แพ็กเกจของฉัน", en: "My Packages & Share" },
  localmcp: { icon: "monitor", title: "Local MCP", en: "Local MCP" },
  settings:{ icon: "settings", title: "ตั้งค่าระบบ", en: "Settings" },
  library: { icon: "components", title: "คลังคอมโพเนนต์", en: "Component Library" },
  ...PLUGIN_ROUTE_META,   // plugin routes contribute their own topbar metadata (Phase 6 seam)
};

const NAV_GROUP_KEY = { "หน้าหลัก": "home", "ศูนย์บัญชาการ": "command", "ความรู้และความทรงจำ": "knowledge", "ทรัพยากร": "resources", "ผู้ดูแลระบบ": "admin" };

// does this node, or any descendant, match the current route? → keep that branch expanded
function navContains(node, route) {
  if (node.id === route) return true;
  return (node.children || []).some(c => navContains(c, route));
}

/* one sidebar row + its (recursive) children — supports up to 3 levels (Main -> Sub -> Sub).
   hidden nodes, and perm-gated nodes the user can't reach, are dropped; a node with visible
   children shows a caret that collapses them. Indent grows with depth. */
function NavNode({ node, depth, route, go, t, can, navOpen, setNavOpen }) {
  const kids = (node.children || []).filter(c => !c.hidden && (!c.perm || (can && can(c.perm)))
    && (!c.desktopOnly || window.pikaosDesktop?.isDesktop));
  const hasKids = kids.length > 0;
  const branchActive = kids.some(c => navContains(c, route));
  const isOpen = branchActive || (node.id in navOpen ? navOpen[node.id] : route === node.id);
  return (
    <React.Fragment>
      <div className={`nav-item ${depth > 0 ? "nav-subitem" : ""} ${route === node.id ? "active" : ""}`}
        style={depth > 0 ? { marginLeft: depth * 16 } : undefined} onClick={() => go(node.id)}>
        <span className="ni-icon">{renderIcon(node.icon)}</span>
        <span style={{ flex: 1 }}>{node.customLabel || t("nav." + node.id)}</span>
        {node.tag && <span className={`ni-tag ${node.tag === "live" ? "alert" : ""}`}>{node.tag === "live" ? "● LIVE" : node.tag}</span>}
        {hasKids && (
          <button type="button" className={`nav-caret ${isOpen ? "open" : ""}`} aria-label="toggle submenu"
            onClick={(e) => { e.stopPropagation(); setNavOpen(o => ({ ...o, [node.id]: !isOpen })); }}>▾</button>
        )}
      </div>
      {hasKids && (
        <div className={`nav-sub ${isOpen ? "open" : ""}`}>
          {kids.map(c => (
            <NavNode key={c.id} node={c} depth={depth + 1} route={route} go={go} t={t} can={can} navOpen={navOpen} setNavOpen={setNavOpen} />
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function Sidebar({ route, go, t, can, nav, openMode }) {
  const [navOpen, setNavOpen] = useState({});   // node id -> expanded (overrides the route-based default)
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
        {(nav || NAV).map(g => {
          const items = g.items.filter(it => !it.hidden && (!it.perm || (can && can(it.perm))));
          if (items.length === 0) return null;
          return (
            <div className="nav-group" key={g.group}>
              <div className="nav-label">{t("navgroup." + (NAV_GROUP_KEY[g.group] || g.group))}</div>
              {items.map(it => (
                <NavNode key={it.id} node={it} depth={0} route={route} go={go} t={t} can={can} navOpen={navOpen} setNavOpen={setNavOpen} />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        {openMode && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em',
            color: 'var(--gold)', padding: '4px 8px', marginBottom: 8,
            border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
            {t('open.badge')}
          </div>
        )}
        <div className="row"><span className="pulse-dot" /><span>{t("foot.online")}</span></div>
        <div className="faint">{t("foot.version")}</div>
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

function ProfileMenu({ me, t, onSignOut, onSaveProfile }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [draft, setDraft] = useState({ display: me.display || me.display_name || me.username || "", email: me.email || "", avatar: me.avatar || "🧙" });
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
  useEffect(() => { if (open) { setDraft({ display: me.display || me.display_name || me.username || "", email: me.email || "", avatar: me.avatar || "🧙" }); setDirty(false); setAvPick(false); setSaved(false); } }, [open]);
  const accent = "var(--gold)";
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
              <div className="pm-field"><span className="pm-flabel">{t("profile.username")}</span><span className="pm-fval mono">@{me.username}</span></div>
              <div className="pm-field"><span className="pm-flabel">{t("profile.status")}</span><span className="pm-fval">{me.status === "suspended" ? t("profile.suspended") : t("profile.active")}</span></div>
              <div className="pm-field"><span className="pm-flabel">{t("profile.joined")}</span><span className="pm-fval">{me.joined || "—"}</span></div>
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

function Topbar({ route, theme, setTheme, user, language, t, me, onSignOut, onSaveProfile }) {
  const m = ROUTE_META[route] || ROUTE_META.home;   // home is the kernel landing — safe fallback if a plugin route is disabled
  const title = t("route." + route + ".title");
  const live = route === "hall" || route === "meeting" || route === "world";
  const tEn = makeT("en", "formal");
  return (
    <header className="topbar" data-no-lex>
      <div className="topbar-title">
        <span className="tt-icon">{renderIcon(m.icon)}</span>
        <h1>{title}</h1>
        {language !== "en" && <span className="tt-en">{tEn("route." + route + ".title")}</span>}
        {live && <span className="live-badge" style={{ marginLeft: 6 }}><span className="pulse-dot" />LIVE</span>}
      </div>
      <div className="topbar-spacer" />
      <div className="theme-toggle">
        <button className={theme === "pro" ? "on" : ""} onClick={() => setTheme("pro")} title={t("theme.day")}>☀️</button>
        <button className={theme === "pro-dark" ? "on" : ""} onClick={() => setTheme("pro-dark")} title={t("theme.night")}>🌙</button>
      </div>
      {me
        ? <ProfileMenu me={me} t={t} onSignOut={onSignOut} onSaveProfile={onSaveProfile} />
        : <div className="avatar sm" style={{ "--av": "var(--gold)", color: "var(--gold-bright)" }} title={user}><span>🧙</span></div>}
    </header>
  );
}

function App() {
  const auth = useAuth();                                  // { user, ready, loggedIn, login, logout }
  const currentUser = auth.user;                           // backend account or null
  const username = currentUser?.username || "somchai";     // for the topbar avatar label

  // Kernel-only bootstrap gate (no auth plugin installed yet — 2026-07-02-bootstrap-install-shell-
  // design.md): a stored session token from a verified setup code unlocks a minimal install shell.
  // `null` = not checked yet (avoid flashing FirstRun before we know); re-checked after FirstRun's
  // onVerified stores a fresh token, so a page load with a still-valid token skips straight past it.
  const [bootstrap, setBootstrap] = useState(null);
  const refreshBootstrap = React.useCallback(() => {
    setupStatus().then(setBootstrap).catch(() => setBootstrap({ needsSetup: false, bootstrapAuthorized: false }));
  }, []);
  useEffect(() => { refreshBootstrap(); }, [refreshBootstrap]);

  // C1 capability handshake (spec §2): the server declares authMode. 404/network (legacy or dead
  // server) resolves as login mode so the pre-handshake flow is byte-identical (spec §2 fallback).
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    getCapabilities().then(setCaps).catch(() => setCaps({ v: 0, authMode: 'login' }));
  }, []);
  const openMode = caps?.authMode === 'open';
  const signedIn = auth.loggedIn || openMode;

  const [route, setRoute] = useState("home");
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

  const [navCfg, setNavCfg] = useState(() => loadNav());   // global sidebar arrangement (admin-set, shared)

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
  useEffect(() => { saveNav(navCfg); }, [navCfg]);   // local cache for instant render next load
  // pull the shared arrangement from the server once signed in (authoritative; overrides the cache)
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    getNavConfig().then(r => { if (alive && r && r.value) setNavCfg(mergeWithDefault(r.value)); }).catch(() => {});
    return () => { alive = false; };
  }, [signedIn]);
  // per-user prefs (theme, lexicon) — load this user's saved values on sign-in (so they follow the
  // user across devices), then persist any change. localStorage stays only as an instant-render cache.
  const settingsLoaded = React.useRef(false);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    getMySettings().then(r => {
      const v = (r && r.values) || {};
      if (alive) { if (v.theme) setTheme(v.theme); if (v.lex) setLex(v.lex); }
    }).catch(() => {}).finally(() => { settingsLoaded.current = true; });
    return () => { alive = false; };
  }, [signedIn]);
  useEffect(() => { if (settingsLoaded.current) setMySetting("theme", theme).catch(() => {}); }, [theme]);
  useEffect(() => { if (settingsLoaded.current) setMySetting("lex", lex).catch(() => {}); }, [lex]);
  // global Tools/roster config (positions/skills, tool catalog, skill docs) — shared by everyone.
  // Pull into the local cache on sign-in; admin edits push back (save* fire window.__syncGlobal).
  useEffect(() => {
    if (!signedIn) return;
    window.__syncGlobal = (key, value) => { if (can("options.manage")) setGlobalConfig(key, value).catch(() => {}); };
    let alive = true;
    ["options", "skill_docs", "tool_cfgs"].forEach(k =>
      getGlobalConfig(k).then(r => { if (alive && r && r.value != null) applyGlobalConfig(k, r.value); }).catch(() => {}));
    return () => { alive = false; };
  }, [signedIn]);
  // ทุกอย่างมาจากชุดที่กำลังใช้ — ภาษา/โหมดองค์กร derive จากข้อมูลในไฟล์ ไม่มี hardcode
  const activePack = packById(lex) || defaultPack() || {};
  const language = activePack.lang || "th";
  const formal = !!activePack.formal;
  const styleKey = activePack.styleKey || "formal";   // รูปแบบคำศัพท์สำหรับ i18n key-based
  const t = makeT(language, styleKey);                // t("some.key", { var }) — ไม่ hardcode
  lastByLang.current[language] = lex;   // จำสไตล์ล่าสุดของภาษาปัจจุบัน

  const go = (r) => {
    // closing every open overlay/popup when navigating away
    try { window.dispatchEvent(new Event("guildos-route-change")); } catch (e) { }
    try { document.body.classList.remove("nav-open"); } catch (e) { }
    setRoute(r);
    document.querySelector(".content")?.scrollTo(0, 0);
    if (r === "search") { const h = window.uiLoading && window.uiLoading({ title: "กำลังเชื่อมต่อคลังความรู้…", message: "ผู้ควบคุมกลาง Recall" }); setTimeout(() => h && h.close(), 820); }
  };
  window.__guildGo = go;

  // ---- current user + permissions come from the SERVER (F1) ----
  const T = (en, th) => language === "en" ? en : th;
  // The signed-in identity and its effective permissions are whatever the backend `/auth/me` returned
  // (currentUser.permissions) — never client seed data. Knowing a username is not permission, and there
  // is no "fall back to the seeded admin" path: a real user who isn't an admin gets a non-admin UI. An
  // admin holds every key (admin-implicit-all, resolved server-side).
  // Open mode grants a synthetic owner (spec §4). KernelHome doesn't read cosmetic profile fields, so
  // this is minimal: identity label + empty permissions. Permissions still come from the server signal
  // (openMode ⇒ allow-all via `can`), never client seed data (F1).
  const me = currentUser || (openMode ? { username: t('open.owner'), display_name: t('open.owner'), permissions: [] } : null);
  const mePerms = React.useMemo(() => new Set(currentUser?.permissions || []), [currentUser]);
  // openMode ⇒ allow-all is the SERVER's declaration (authMode:"open"), not a client fallback — the
  // F1 rule stands: without that server signal, permissions come only from /auth/me.
  const can = (k) => openMode || mePerms.has(k);

  // persist a nav edit: update the UI now + push to the shared server config (best-effort)
  const saveNavCfg = (cfg) => { setNavCfg(cfg); setNavConfig(cfg).catch(() => {}); };

  const Sys = { t, T, can, me, go, language, nav: navCfg, setNav: saveNavCfg };

  const shell = resolveShellMode({ ready: auth.ready, caps, bootstrap, loggedIn: auth.loggedIn });
  if (shell === 'loading') return null;   // avoid flashing the setup screen while restoring
  if (shell === 'kernel-shell') return <KernelOnlyShell language={language} />;
  if (shell === 'firstrun') {
    return <FirstRun t={t} language={language} onLang={pickLanguage}
      onVerified={(token) => {
        setToken(token);
        refreshBootstrap();
        // verify-code flips the server open (spec §4) — refetch so this render pass sees it
        getCapabilities().then(setCaps).catch(() => {});
      }} />;
  }

  const screen = (() => {
    const guard = (perm, el) => can(perm) ? el : <KernelHome Sys={Sys} caps={caps} go={go} />;
    switch (route) {
      case "home": return <KernelHome Sys={Sys} caps={caps} go={go} />;
      case "toolsmgr": return guard("options.manage", <ToolsManager can={can} t={t} Sys={Sys} />);
      // "install" is the sidebar parent — clicking it lands on the installed-plugins list
      case "install": return guard("plugins.manage", <PluginsManager Sys={Sys} view="modules" />);
      case "modules": return guard("plugins.manage", <PluginsManager Sys={Sys} view="modules" />);
      case "marketplace": return guard("plugins.manage", <PluginsManager Sys={Sys} view="market" />);
      case "mypackages": return guard("plugins.manage", <PluginsManager Sys={Sys} view="mine" />);
      // Local MCP moved into the Marketplace hub's "Local MCP" tab (desktop-only) — no standalone route.
      case "settings": return <Settings theme={theme} setTheme={setTheme} lex={lex} setLex={setLex} pickLanguage={pickLanguage} language={language} formal={formal} go={go} t={t} />;
      case "library": return <ComponentLibrary onBack={() => go("settings")} t={t} />;
      default: {
        // a route owned by an enabled plugin (Phase 6 seam) — else fall back to kernel Home.
        const pluginEl = renderPluginRoute(route, { t, can, language, go, me });
        return pluginEl || <KernelHome Sys={Sys} caps={caps} go={go} />;
      }
    }
  })();

  return (
    <ToastProvider>
    <div className="app" key={lex}>
      <Sidebar route={route} go={go} t={t} can={can} nav={navCfg} openMode={openMode} />
      <div className="main">
        <Topbar route={route} theme={theme} setTheme={setTheme} user={username} language={language} t={t}
          me={me} onSignOut={auth.logout}
          onSaveProfile={() => { /* profile edit is a follow-up: needs a backend PATCH /auth/me — demo no-op */ }} />
        <div className="content">{screen}</div>
      </div>
      <BottomUtilityBar
        t={t} route={route} onHome={() => go("home")} me={me}
        theme={theme} onToggleTheme={() => setTheme(theme === "pro" ? "pro-dark" : "pro")}
        onSignOut={auth.logout}
        notifications={[]} chatThreads={[]}
      />
      <UIModalHost />
      <UILoadingHost />
    </div>
    </ToastProvider>
  );
}

export default App;
