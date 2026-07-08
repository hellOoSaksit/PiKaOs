/* PiKaOs — ES module (migrated from PiKaOs-Core/app.jsx). */
import React from 'react';
const { useState, useEffect } = React;
import { NAV } from './data/data.jsx';
import { loadNav, saveNav, mergeWithDefault } from './data/data-nav.jsx';
import { getNavConfig, setNavConfig, getMySettings, setMySetting, setupStatus, setToken, getCapabilities } from './lib/api.js';
import { resolveShellMode } from './lib/shell-mode.js';
import { useShellNav } from './lib/shell-nav.js';
import { Settings } from './screens/screens-extra.jsx';
import { FirstRun } from './screens/FirstRun.jsx';
import { KernelOnlyShell } from './screens/KernelOnlyShell.jsx';
import { KernelHome } from './screens/KernelHome.jsx';
import { PluginsManager } from './screens/screens-plugins.jsx';
import { ToolsManager } from './screens/screens-tools.jsx';
import { ComponentLibrary } from './screens/screens-library.jsx';
import { useAuth } from './lib/auth.jsx';
import { BottomUtilityBar } from './components/ui/BottomUtilityBar.jsx';
import { Icon, renderIcon } from './components/ui/icons.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { UILoadingHost, UIModalHost } from './lib/ui-modal.jsx';
import { makeT, DEFAULT_LANG, DEFAULT_STYLE, packById, defaultPack, defaultPackForLang, LEX_PACKS } from './lib/i18n.jsx';
import { renderPluginRoute, renderPluginProfile, PLUGIN_ROUTE_META } from './plugins/index.jsx';

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
   children shows a caret that collapses them. Indent grows with depth.

   In the rail there is no room for a label, so a row is just its icon: the label becomes the
   tooltip, and a parent's children are unreachable until the rail widens — clicking one widens it. */
function NavNode({ node, depth, route, go, t, can, navOpen, setNavOpen, rail, onExpandShell }) {
  const kids = (node.children || []).filter(c => !c.hidden && (!c.perm || (can && can(c.perm)))
    && (!c.desktopOnly || window.pikaosDesktop?.isDesktop));
  const hasKids = kids.length > 0;
  const branchActive = kids.some(c => navContains(c, route));
  const isOpen = branchActive || (node.id in navOpen ? navOpen[node.id] : route === node.id);
  const label = node.customLabel || t("nav." + node.id);
  return (
    <React.Fragment>
      <div className={`nav-item ${depth > 0 ? "nav-subitem" : ""} ${route === node.id ? "active" : ""}`}
        style={depth > 0 && !rail ? { marginLeft: depth * 16 } : undefined}
        title={rail ? label : undefined}
        onClick={() => { if (rail && hasKids) onExpandShell(); go(node.id); }}>
        <span className="ni-icon">{renderIcon(node.icon)}</span>
        <span className="ni-label">{label}</span>
        {node.tag && <span className={`ni-tag ${node.tag === "live" ? "alert" : ""}`}>{node.tag === "live" ? "● LIVE" : node.tag}</span>}
        {hasKids && !rail && (
          <button type="button" className={`nav-caret ${isOpen ? "open" : ""}`} aria-label="toggle submenu"
            onClick={(e) => { e.stopPropagation(); setNavOpen(o => ({ ...o, [node.id]: !isOpen })); }}>▾</button>
        )}
      </div>
      {hasKids && !rail && (
        <div className={`nav-sub ${isOpen ? "open" : ""}`}>
          {kids.map(c => (
            <NavNode key={c.id} node={c} depth={depth + 1} route={route} go={go} t={t} can={can}
              navOpen={navOpen} setNavOpen={setNavOpen} rail={rail} onExpandShell={onExpandShell} />
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function Sidebar({ route, go, t, can, nav, openMode, rail, onToggle }) {
  const [navOpen, setNavOpen] = useState({});   // node id -> expanded (overrides the route-based default)
  const toggleLabel = t(rail ? "nav.expand" : "nav.collapse");
  return (
    <aside className="sidebar" data-no-lex>
      <div className="brand">
        {/* in the rail the logo IS the toggle — there's no width for a second control */}
        <button type="button" className="brand-logo" onClick={rail ? onToggle : undefined}
          title={rail ? toggleLabel : undefined} aria-label={rail ? toggleLabel : undefined}>
          <span className="ltr">P</span>
        </button>
        <div className="brand-id">
          <div className="brand-name">{t("brand.name")}</div>
          <div className="brand-sub">{t("brand.sub")}</div>
        </div>
        {!rail && (
          <button type="button" className="brand-toggle" onClick={onToggle}
            title={toggleLabel} aria-label={toggleLabel}>
            <Icon name="sidebar" />
          </button>
        )}
      </div>
      <nav className="nav">
        {(nav || NAV).map(g => {
          const items = g.items.filter(it => !it.hidden && (!it.perm || (can && can(it.perm))));
          if (items.length === 0) return null;
          return (
            <div className="nav-group" key={g.group}>
              <div className="nav-label">{t("navgroup." + (NAV_GROUP_KEY[g.group] || g.group))}</div>
              {items.map(it => (
                <NavNode key={it.id} node={it} depth={0} route={route} go={go} t={t} can={can}
                  navOpen={navOpen} setNavOpen={setNavOpen} rail={rail} onExpandShell={onToggle} />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        {openMode && <div className="open-badge">{t('open.badge')}</div>}
        <div className="row"><span className="pulse-dot" /><span className="sf-text">{t("foot.online")}</span></div>
        <div className="faint sf-text">{t("foot.version")}</div>
      </div>
    </aside>
  );
}

function Topbar({ route, language, t }) {
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
    </header>
  );
}

function App() {
  const auth = useAuth();                                  // { user, ready, loggedIn, login, logout }
  const currentUser = auth.user;                           // backend account or null

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
  const { rail: navRail, drawerOpen, toggle: toggleNav, closeDrawer } = useShellNav();

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
  // The `options`/`skill_docs`/`tool_cfgs` global blobs were pulled here on sign-in for the Tools
  // catalog + agent-builder screens. Both are gone, and nothing else ever read them — the sidebar
  // arrangement has its own `/api/settings/nav` route (getNavConfig/setNavConfig below).
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
    closeDrawer();   // choosing a destination dismisses the small-screen drawer
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
    <div className="app" key={lex} data-nav={navRail ? "rail" : "full"} data-drawer={drawerOpen ? "open" : undefined}>
      <Sidebar route={route} go={go} t={t} can={can} nav={navCfg} openMode={openMode}
        rail={navRail} onToggle={toggleNav} />
      <div className="nav-scrim" onClick={closeDrawer} />
      <div className="main">
        <Topbar route={route} language={language} t={t} />
        <div className="content">{screen}</div>
      </div>
      <BottomUtilityBar
        t={t} route={route} onHome={() => go("home")} onToggleNav={toggleNav}
        profile={renderPluginProfile({ t, me, onSignOut: auth.logout })}
        notifications={[]} chatThreads={[]}
      />
      <UIModalHost />
      <UILoadingHost />
    </div>
    </ToastProvider>
  );
}

export default App;
