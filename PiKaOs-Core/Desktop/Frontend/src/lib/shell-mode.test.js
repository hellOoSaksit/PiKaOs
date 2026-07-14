import { it, expect } from 'vitest';
import { resolveShellMode } from './shell-mode.js';

const base = { ready: true, caps: { authMode: 'login' }, bootstrap: { bootstrapAuthorized: false }, loggedIn: false };

it('waits for auth restore, bootstrap status AND capabilities before deciding', () => {
  expect(resolveShellMode({ ...base, ready: false })).toBe('loading');
  expect(resolveShellMode({ ...base, caps: null })).toBe('loading');
  expect(resolveShellMode({ ...base, bootstrap: null })).toBe('loading');
});

it('server-declared open mode renders the full app with no login (F1-safe: server decided)', () => {
  expect(resolveShellMode({ ...base, caps: { authMode: 'open' } })).toBe('full');
});

it('a logged-in session renders the full app regardless of mode', () => {
  expect(resolveShellMode({ ...base, loggedIn: true })).toBe('full');
});

it('login mode + bootstrap token falls back to the kernel-only install shell', () => {
  expect(resolveShellMode({ ...base, bootstrap: { bootstrapAuthorized: true } })).toBe('kernel-shell');
});

it('login mode with nothing else lands on FirstRun', () => {
  expect(resolveShellMode(base)).toBe('firstrun');
});

it('auth enabled + zero users → first-admin', () => {
  expect(resolveShellMode({ ready: true, caps: { authMode: 'login' },
    bootstrap: { needsSetup: false, bootstrapAuthorized: false, needsFirstAdmin: true },
    loggedIn: false })).toBe('first-admin');
});

it('first-admin window never overrides a live session', () => {
  expect(resolveShellMode({ ready: true, caps: { authMode: 'login' },
    bootstrap: { needsFirstAdmin: true }, loggedIn: true })).toBe('full');
});

it('authorized operator with no DB configured → db-choice (before the app)', () => {
  expect(resolveShellMode({ ready: true, caps: { authMode: 'open' }, loggedIn: false,
    bootstrap: { needsDbConfig: true, bootstrapAuthorized: true } })).toBe('db-choice');
});
it('db-choice takes precedence over open/full so the DB is set before use', () => {
  expect(resolveShellMode({ ready: true, caps: { authMode: 'open' }, loggedIn: true,
    bootstrap: { needsDbConfig: true } })).toBe('db-choice');
});
it('once a DB is configured, open mode renders full again', () => {
  expect(resolveShellMode({ ready: true, caps: { authMode: 'open' }, loggedIn: false,
    bootstrap: { needsDbConfig: false, bootstrapAuthorized: true } })).toBe('full');
});
