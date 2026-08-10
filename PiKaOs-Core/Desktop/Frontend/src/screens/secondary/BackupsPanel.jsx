/* Backups panel (backup-restore spec §3) — lives on the Modules screen, beside the Core-update card
   and the schedule queue that lists the backup entries this panel queues. Same plugins.manage gate.

   Restore is the only destructive verb here and it is guarded twice: a typed RESTORE token (literal in
   every language, like the recovery screen's RESET) and a server that refuses an archive from a newer
   Core or a different secret_key. After it commits, the server restarts itself — so the panel polls
   /version until the new process answers rather than leaving the operator on a dead screen. */
import React, { useEffect, useState } from 'react';

import { Button, HelpNote, Panel } from '../../components/ui/index.js';
import * as api from '../../lib/api.js';
import { localInputToUtcIso, localNowInputValue, utcIsoToLocalLabel } from '../../lib/schedule-time.js';
import { RESTORE_TOKEN, fmtBytes, restoreArmed, restoreErrorKey } from './BackupsPanel.logic.js';

/* Two-click confirm — same arrangement as RecoveryView's ActionBtn: the first click arms and the
   label flips, and it disarms itself after 3s so a stray click never sits primed. */
function ArmedButton({ t, label, onRun, disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <Button kind="danger" size="sm" disabled={disabled} aria-pressed={armed}
      onClick={() => { if (armed) { setArmed(false); onRun(); } else setArmed(true); }}>
      {armed ? t('backup.confirmDelete') : label}
    </Button>
  );
}

export default function BackupsPanel({ t, onScheduled }) {
  const [items, setItems] = useState(null);      // null = loading
  const [busy, setBusy] = useState(null);        // 'create' | 'schedule' | a backup id
  const [err, setErr] = useState(null);          // an i18n key, never a server string
  const [typed, setTyped] = useState('');
  const [conflictId, setConflictId] = useState(null);   // 409: a backup from a different secret_key
  const [when, setWhen] = useState('');
  const [restarting, setRestarting] = useState(false);

  const load = () => api.listBackups()
    .then(r => setItems(Array.isArray(r) ? r : []))
    .catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const run = async (key, fn) => {
    setBusy(key); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(restoreErrorKey(e?.status)); }
    finally { setBusy(null); }
  };

  const download = (id) => run(id, async () => {
    const blob = await api.downloadBackup(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${id}.tar.gz`;
    a.click();
    // Revoked on a later tick: revoking synchronously can beat the browser to the blob it was
    // handed, and the download then arrives empty.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  /* The server SIGTERMs itself a moment after answering, so there is no request that can tell us it
     is back. Poll the one route that needs no session and reload once it answers. */
  const waitForServer = async () => {
    for (let i = 0; i < 60; i += 1) {
      try { await api.getVersion(); window.location.reload(); return; }
      catch (e) { await new Promise(r => setTimeout(r, 1000)); }
    }
    setRestarting(false);
    setErr('backup.failed');
  };

  const restore = async (id, acceptKeyChange = false) => {
    setBusy(id); setErr(null); setConflictId(null);
    try {
      await api.restoreBackup(id, acceptKeyChange);
      setRestarting(true);
      await waitForServer();
    } catch (e) {
      setErr(restoreErrorKey(e?.status));
      if (e?.status === 409) setConflictId(id);   // recoverable, and only the operator can decide
      await load();
    } finally { setBusy(null); }
  };

  const schedule = () => run('schedule', async () => {
    await api.scheduleBackup(localInputToUtcIso(when));
    setWhen('');
    onScheduled?.();
  });

  const armed = restoreArmed(typed);
  return (
    <Panel title={t('backup.title')} en="BACKUPS">
      <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>{t('backup.desc')}</div>
      {err && <p role="alert" style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--crimson-deep)' }}>{t(err)}</p>}
      {restarting && <HelpNote>{t('backup.restarting')}</HelpNote>}

      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button kind="gold" size="sm" disabled={!!busy} onClick={() => run('create', api.createBackup)}>
          {busy === 'create' ? t('backup.creating') : t('backup.create')}
        </Button>
        <label className="row" style={{ gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span className="faint">{t('sched.field')}</span>
          <input className="bf-input" type="datetime-local" value={when} min={localNowInputValue()}
            aria-label={t('backup.schedule')} disabled={!!busy}
            onChange={e => setWhen(e.target.value)} />
        </label>
        <Button kind="ghost" size="sm" disabled={!!busy || !when} onClick={schedule}>
          {busy === 'schedule' ? '…' : t('backup.schedule')}
        </Button>
      </div>

      {items !== null && items.length === 0 && (
        <div className="faint" style={{ padding: '10px 2px', fontSize: 12.5 }}>{t('backup.empty')}</div>
      )}
      {(items || []).map(m => (
        <div key={m.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center',
          gap: 8, padding: '7px 2px', borderBottom: '1px solid var(--line-soft)' }}>
          <span className="mono" style={{ fontSize: 12.5 }}>
            {utcIsoToLocalLabel(m.createdAt)} · {fmtBytes(m.bytes)}
            {m.stateOnly && <span className="badge idle" style={{ marginLeft: 8 }}>{t('backup.stateOnly')}</span>}
            {m.hasDb && <span className="badge info" style={{ marginLeft: 8 }}>{t('backup.withDb')}</span>}
            <span className="faint" style={{ marginLeft: 8, fontSize: 11 }}>{m.id}</span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Button kind="ghost" size="sm" disabled={!!busy} onClick={() => download(m.id)}>{t('backup.download')}</Button>
            <Button kind="danger" size="sm" disabled={!!busy || !armed} onClick={() => restore(m.id)}>
              {busy === m.id ? '…' : t('backup.restore')}
            </Button>
            <ArmedButton t={t} label={t('backup.delete')} disabled={!!busy}
              onRun={() => run(m.id, () => api.deleteBackup(m.id))} />
          </span>
        </div>
      ))}

      {/* Danger zone — the typed token arms every Restore button above at once, the same shape the
          recovery screen uses, so the destructive verb is never one stray click away. */}
      <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--crimson-deep)',
        borderRadius: 'var(--radius-sm)' }}>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
          {t('backup.confirmNote', { token: RESTORE_TOKEN })}
        </div>
        <input className="bf-input" style={{ maxWidth: 220 }} value={typed} placeholder={RESTORE_TOKEN}
          aria-label={t('backup.confirmNote', { token: RESTORE_TOKEN })}
          onChange={e => setTyped(e.target.value)} />
        {conflictId && (
          <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <HelpNote tag="tip">{t('backup.keydiffer')}</HelpNote>
            <Button kind="danger" size="sm" disabled={!!busy || !armed}
              onClick={() => restore(conflictId, true)}>{t('backup.restoreAnyway')}</Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
