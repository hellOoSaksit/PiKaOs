/* PiKaOs — kernel-only shell (the ONE screen reachable after a verified setup code, before any auth
   plugin is installed). Reuses the app-shell CSS classes (.app/.sidebar/.nav/.main/.topbar/.content) so
   it looks like the real thing, but is a small, standalone component — not App.jsx's full Sidebar/
   Topbar (those need `me`/`roles`/theme-menu wiring this mode doesn't have). One nav item: Install.
   Server-side `require_perm("plugins.manage")` is the real gate (the bootstrap session token
   authorizes it — app/core/identity.py's BootstrapProvider); client-side `can` always allows here.

   Design: docs/superpowers/specs/2026-07-02-bootstrap-install-shell-design.md. */
import React from 'react';

import { PluginsManager } from './screens-plugins.jsx';

export function KernelOnlyShell({ language }) {
  const T = (en, th) => (language === 'en' ? en : th);
  const Sys = { T, can: () => true };

  return (
    <div className="app">
      <aside className="sidebar" data-no-lex>
        <div className="brand">
          <span className="brand-logo"><span className="ltr">P</span></span>
          <div>
            <div className="brand-name">PIKA</div>
            <div className="brand-sub">{T('KERNEL MODE', 'โหมดเคอร์เนล')}</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <div className="nav-label">{T('System', 'ระบบ')}</div>
            <div className="nav-item active">
              <span className="ni-icon">⚙</span>
              <span style={{ flex: 1 }}>{T('Install', 'ติดตั้ง')}</span>
            </div>
          </div>
        </nav>
        <div className="sidebar-foot">
          <div className="row"><span className="pulse-dot" /><span>{T('No auth plugin yet', 'ยังไม่มีปลั๊กอินล็อกอิน')}</span></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="tt-icon">⚙</span>
            <h1>{T('Install', 'ติดตั้ง')}</h1>
            <span className="tt-en">{T('kernel bootstrap session', 'เซสชันเคอร์เนลชั่วคราว')}</span>
          </div>
          <div className="topbar-spacer" />
        </header>
        <div className="content"><div className="content-pad"><PluginsManager Sys={Sys} /></div></div>
      </div>
    </div>
  );
}
