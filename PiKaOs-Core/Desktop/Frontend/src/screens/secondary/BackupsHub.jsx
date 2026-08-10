/* Backups — its own ADMINISTRATION screen (backups-tab-rbac spec §4), two tabs: the archive list
   (files) and the backup schedule. Split off the Modules screen: backups answer to backups.manage,
   not plugins.manage, and a destructive surface deserves its own room.

   Primitives are imported per-file rather than from the `components/ui` barrel, matching
   McpSkillHub.jsx next door: the barrel re-exports TitleBar -> AppBoot -> lib/i18n, which touches
   `window` at module scope and so cannot be imported by node-environment tests. */
import React from 'react';
const { useState } = React;
import PageHead from '../../components/ui/PageHead.jsx';
import Segmented from '../../components/ui/Segmented.jsx';
import BackupsPanel from './BackupsPanel.jsx';
import BackupsSchedule from './BackupsSchedule.jsx';

export function BackupsHub({ Sys }) {
  const { t } = Sys;
  const [tab, setTab] = useState('files');
  const tabs = [{ value: 'files' }, { value: 'schedule' }];
  const active = tabs.find(x => x.value === tab) || tabs[0];
  // Header + tab bar in one content-pad; the tab body renders as a SIBLING so a body that brings
  // its own content-pad doesn't nest and double the padding (McpSkillHub's arrangement).
  return (
    <div className="fade-in" data-no-lex>
      <div className="content-pad" style={{ paddingBottom: 0 }}>
        <PageHead kicker={t('backup.kicker')} title={t('backup.title')} desc={t('backup.pagedesc')} />
        <Segmented
          options={tabs.map(x => ({ value: x.value, label: t('backup.tab.' + x.value) }))}
          value={active.value} onChange={setTab} />
        <p className="faint" style={{ margin: '10px 2px 4px', fontSize: 13, lineHeight: 1.5 }}>
          {t('backup.tabdesc.' + active.value)}
        </p>
      </div>
      {active.value === 'files' && <div className="content-pad"><BackupsPanel t={t} /></div>}
      {active.value === 'schedule' && <div className="content-pad"><BackupsSchedule t={t} /></div>}
    </div>
  );
}
