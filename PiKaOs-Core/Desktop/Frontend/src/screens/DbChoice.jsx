/* PiKaOs — DB-choice screen (Step 1 of install, 2026-07-14 spec). Shown once the operator holds a
   verified bootstrap Bearer (FirstRun's onVerified stored it via setToken()) but the system has no
   DB configured yet (`/api/setup/status` → needsDbConfig). The operator picks Bundled / external
   Postgres / Supabase, tests connectivity, then saves — same chrome/props/error-pattern as
   FirstAdmin.jsx, same bootstrap-token transport (raw() already attaches the in-memory token, see
   api.js's dbTest/dbConfig). All copy via t(key) (dbchoice.* ×3 packs). */
import React from 'react';
const { useState } = React;
import * as api from '../lib/api.js';
import { canSaveDb } from '../lib/db-choice.js';
import Segmented from '../components/ui/Segmented.jsx';
import { DisconnectButton } from '../components/ui/DisconnectButton.jsx';

export function DbChoice({ t, language, onLang }) {
  const [provider, setProvider] = useState('bundled');
  const [fields, setFields] = useState({ host: '', port: '', user: '', password: '', dbname: '', connectionString: '' });
  const [testState, setTestState] = useState('idle');   // idle | testing | ok | failed
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k) => (e) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setTestState('idle');   // a field edit invalidates a prior test result
    setError('');
  };

  const pickProvider = (p) => { setProvider(p); setTestState('idle'); setError(''); };

  const payload = () => {
    if (provider === 'pg') {
      return { provider, host: fields.host.trim(), port: fields.port ? Number(fields.port) : undefined,
        user: fields.user.trim(), password: fields.password, dbname: fields.dbname.trim() };
    }
    if (provider === 'supabase') return { provider, connectionString: fields.connectionString.trim() };
    return { provider };
  };

  const test = async () => {
    if (testState === 'testing') return;
    setTestState('testing');
    setError('');
    try {
      await api.dbTest(payload());
      setTestState('ok');
    } catch (err) {
      setTestState('failed');
      setError(err.status === 0 ? t('firstadmin.errNetwork') : t('dbchoice.failed'));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || saved || !canSaveDb(provider, testState)) return;
    setSaving(true);
    setError('');
    try {
      await api.dbConfig(payload());
      setSaved(true);
    } catch (err) {
      setError(err.status === 0 ? t('firstadmin.errNetwork') : t('dbchoice.failed'));
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, type, extra = {}) => (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={`db-${key}`} style={{ display: 'block', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>{label}</label>
      <input id={`db-${key}`} className="auth-input" type={type} value={fields[key]} onChange={set(key)}
        disabled={saving || saved} autoComplete="off" spellCheck={false} {...extra} />
    </div>
  );

  const canSave = canSaveDb(provider, testState);

  return (
    <div className="auth-screen">
      {onLang && (
        <div className="auth-lang" role="group" aria-label="language">
          <button type="button" className={language === 'en' ? 'on' : ''} onClick={() => onLang('en')}>EN</button>
          <button type="button" className={language === 'th' ? 'on' : ''} onClick={() => onLang('th')}>ไทย</button>
        </div>
      )}
      <div className="auth-hero">
        <div style={{ display: 'flex', gap: 10, position: 'relative', zIndex: 2 }}>
          {['P', 'I', 'K', 'A'].map((ch, i) => (<span key={i} className="ltr" style={{ fontSize: 52 }}>{ch}</span>))}
        </div>
      </div>
      <div className="auth-formpane">
        <form onSubmit={save} style={{ width: '100%', maxWidth: 420 }} noValidate>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />{t('dbchoice.kicker')}
          </div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 29, margin: '14px 0 8px', color: 'var(--ink)' }}>{t('dbchoice.title')}</h1>
          <p style={{ margin: '0 0 22px', color: 'var(--ink-3)', fontSize: 14.5, lineHeight: 1.55 }}>{t('dbchoice.scopeNote')}</p>

          <Segmented
            className="auth-provider-seg"
            options={[
              { value: 'bundled', label: t('dbchoice.bundled') },
              { value: 'pg', label: t('dbchoice.pg') },
              { value: 'supabase', label: t('dbchoice.supabase') },
            ]}
            value={provider}
            onChange={(p) => { if (!saving && !saved) pickProvider(p); }}
          />

          <div style={{ margin: '18px 0' }}>
            {provider === 'pg' && (
              <>
                {field('host', t('dbchoice.host'), 'text')}
                {field('port', t('dbchoice.port'), 'number', { placeholder: '5432' })}
                {field('user', t('dbchoice.user'), 'text')}
                {field('password', t('dbchoice.password'), 'password', { autoComplete: 'new-password' })}
                {field('dbname', t('dbchoice.dbname'), 'text')}
              </>
            )}
            {provider === 'supabase' && (
              <>
                {field('connectionString', t('dbchoice.connString'), 'text', { className: 'auth-input mono', placeholder: 'postgresql://postgres:***@db.xxxx.supabase.co:5432/postgres' })}
                <p style={{ margin: '-8px 0 0', fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>{t('dbchoice.poolerWarn')}</p>
              </>
            )}
          </div>

          {provider !== 'bundled' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button type="button" className="btn btn-ghost" disabled={testState === 'testing' || saving || saved} onClick={test}>
                {testState === 'testing' ? t('dbchoice.testing') : t('dbchoice.test')}
              </button>
              {testState === 'ok' && (
                <span style={{ color: 'var(--emerald)', fontSize: 13.5 }}>✓ {t('dbchoice.ok')}</span>
              )}
              {testState === 'failed' && (
                <span style={{ color: 'var(--crimson-deep)', fontSize: 13.5 }}>✗ {t('dbchoice.failed')}</span>
              )}
            </div>
          )}

          {error && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16, padding: '11px 14px', borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--crimson) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--crimson) 35%, transparent)', color: 'var(--crimson-deep)', fontSize: 13.5 }}>
              <span style={{ fontWeight: 700 }}>!</span>{error}
            </div>
          )}
          {saved && (
            <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--emerald) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--emerald) 35%, transparent)', color: 'var(--emerald)', fontSize: 13.5 }}>
              {t('dbchoice.saved')}
            </div>
          )}

          <button type="submit" className="btn btn-gold" disabled={saving || saved || !canSave} style={{ width: '100%', padding: 14, fontSize: 15.5 }}>
            {t('dbchoice.save')}
          </button>
          {!saved && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
              <DisconnectButton t={t} className="btn btn-ghost btn-sm" />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
