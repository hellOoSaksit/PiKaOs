/* Schedule tab (backups-tab-rbac spec §4/§5): queue a backup for later + the backup rows of the
   shared schedule store. One store, two views — the Modules screen renders the non-backup rows;
   `isBackupEntry` is the single place that split is defined. Terminal rows stay listed on purpose:
   they are the audit trail, and what HAPPENED arrives through the notification bell, which owns
   read/unread. Per-file primitive imports, per McpSkillHub's header note. */
import React from 'react';
const { useEffect, useState } = React;
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Panel from '../../components/ui/Panel.jsx';
import * as api from '../../lib/api.js';
import { localInputToUtcIso, localNowInputValue, utcIsoToLocalLabel } from '../../lib/schedule-time.js';
import { SCHED_VARIANT, isBackupEntry } from './BackupsPanel.logic.js';

export default function BackupsSchedule({ t }) {
  const [items, setItems] = useState([]);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const load = () => api.listSchedules()
    .then(r => setItems((Array.isArray(r) ? r : []).filter(isBackupEntry)))
    .catch(() => {});
  useEffect(() => { load(); }, []);

  const schedule = async () => {
    setBusy(true); setErr(false);
    try { await api.scheduleBackup(localInputToUtcIso(when)); setWhen(''); await load(); }
    catch (e) { setErr(true); }
    finally { setBusy(false); }
  };

  return (
    <Panel title={t('backup.tab.schedule')} en="SCHEDULE">
      {err && <p role="alert" style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--crimson-deep)' }}>{t('backup.failed')}</p>}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="row" style={{ gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span className="faint">{t('backup.scheduleField')}</span>
          {/* `min` is a hint only — the store refuses a past time anyway; it just stops the
              ordinary mistake at the source (same note as the version picker's field). */}
          <input className="bf-input" type="datetime-local" value={when} min={localNowInputValue()}
            aria-label={t('backup.schedule')} disabled={busy}
            onChange={e => setWhen(e.target.value)} />
        </label>
        <Button kind="gold" size="sm" disabled={busy || !when} onClick={schedule}>
          {busy ? '…' : t('backup.schedule')}
        </Button>
      </div>
      {items.length === 0 && (
        <div className="faint" style={{ padding: '10px 2px', fontSize: 12.5 }}>{t('backup.sched.empty')}</div>
      )}
      {items.map(e => (
        <div key={e.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center',
          gap: 8, padding: '7px 2px', borderBottom: '1px solid var(--line-soft)' }}>
          <span className="mono" style={{ fontSize: 12.5 }}>
            {t('sched.at', { time: utcIsoToLocalLabel(e.at) })}
            <Badge variant={SCHED_VARIANT[e.status] || 'st-queued'} className="qb-inline">
              {t('sched.status.' + e.status)}
            </Badge>
          </span>
          {e.status === 'pending' && (
            <Button kind="ghost" size="sm" onClick={() => api.cancelSchedule(e.id).then(load)}>
              {t('sched.cancel')}
            </Button>
          )}
        </div>
      ))}
    </Panel>
  );
}
