/* MCP & Skills — the hub owning the three tabs (Local MCP · Online MCP · Skills). It used to be the
   `market` view of PluginsManager, which manages plugin lifecycle and shared nothing with it but a
   file. Local MCP drives the user's own machine, so that tab is desktop-shell only (absent on web)
   and the default falls to the first web-visible tab; the other two are placeholders this round.

   Primitives are imported per-file rather than from the `components/ui` barrel, matching LocalMcp.jsx
   next door: the barrel re-exports TitleBar -> AppBoot -> lib/i18n, which touches `window` at module
   scope and so cannot be imported by node-environment tests. */
import React from 'react';
const { useState } = React;
import Empty from '../../components/ui/Empty.jsx';
import PageHead from '../../components/ui/PageHead.jsx';
import Segmented from '../../components/ui/Segmented.jsx';
import { LocalMcp } from './LocalMcp.jsx';

export function McpSkillHub({ Sys }) {
  const { t } = Sys;
  const isDesktop = !!window.pikaosDesktop?.isDesktop;
  const [tab, setTab] = useState(isDesktop ? 'localmcp' : 'onlinemcp');
  const tabs = [
    ...(isDesktop ? [{ value: 'localmcp' }] : []),
    { value: 'onlinemcp' },
    { value: 'skills' },
  ];
  const active = tabs.find(x => x.value === tab) || tabs[0];
  // Header + tab bar in one content-pad; the tab body renders as a SIBLING so LocalMcp's own
  // content-pad (it brings its own chrome) doesn't nest and double the padding.
  return (
    <div className="fade-in" data-no-lex>
      <div className="content-pad" style={{ paddingBottom: 0 }}>
        <PageHead kicker={t('mcpskill.kicker')} title={t('mcpskill.title')} desc={t('mcpskill.pagedesc')} />
        <Segmented
          options={tabs.map(x => ({ value: x.value, label: t('mcpskill.tab.' + x.value) }))}
          value={active.value} onChange={setTab} />
        <p className="faint" style={{ margin: '10px 2px 4px', fontSize: 13, lineHeight: 1.5 }}>
          {t('mcpskill.tabdesc.' + active.value)}
        </p>
      </div>
      {active.value === 'localmcp' && <LocalMcp Sys={Sys} />}
      {active.value === 'onlinemcp' && (
        <div className="content-pad"><Empty icon="🌐" title={t('mcpskill.soon', { name: t('mcpskill.tab.onlinemcp') })} sub={t('mcpskill.tabdesc.onlinemcp')} /></div>
      )}
      {active.value === 'skills' && (
        <div className="content-pad"><Empty icon="🧠" title={t('mcpskill.soon', { name: t('mcpskill.tab.skills') })} sub={t('mcpskill.tabdesc.skills')} /></div>
      )}
    </div>
  );
}
