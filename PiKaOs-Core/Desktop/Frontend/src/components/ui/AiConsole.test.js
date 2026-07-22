import { it, expect, afterEach } from 'vitest';
import { AiConsole } from './AiConsole.jsx';
import {
  toChatMessages, needsKey, needsBaseUrl, adminCloudLimited, resolveSurface, assistantText, canSaveSetup,
} from './AiConsole.logic.js';

/* This Frontend ships NO @testing-library/react and NO jsdom, and the plan forbids adding deps
   (see task-8-report.md "TEST SPLIT"). The brief's literal render()/screen tests can't run here.
   So coverage is split:
     1. structural guard — AiConsole's off-desktop/closed return is hook-free, so it's plain-callable
     2. pure logic — the real behavioral surface lives in AiConsole.logic.js, tested directly
     3. the full stateful flow (send→busy→answer, setup form, admin states) → Task 9 live Electron UAT */

const t = (k) => k;   // keys-as-text: also proves no hardcoded copy sneaks into the tested paths

afterEach(() => { if (typeof window !== 'undefined') delete window.pikaosDesktop; });

// ---- 1. structural guard (hook-free outer function) ----
it('renders nothing when closed (open=false), even with the bridge present', () => {
  globalThis.window = globalThis.window || {};
  window.pikaosDesktop = { isDesktop: true, ai: {} };
  expect(AiConsole({ t, open: false, onClose: () => {} })).toBe(null);
});

it('renders nothing at all off-desktop (no bridge)', () => {
  if (typeof window !== 'undefined') delete window.pikaosDesktop;
  expect(AiConsole({ t, open: true, onClose: () => {} })).toBe(null);
});

// ---- 2. pure logic ----
it('toChatMessages strips local-only fields to the {role,content} wire shape', () => {
  const log = [{ role: 'user', content: 'hi', _extra: 1 }, { role: 'assistant', content: 'yo' }];
  expect(toChatMessages(log)).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
});

it('needsKey: a cloud provider without a stored key needs setup; ollama and admin never do', () => {
  expect(needsKey({ mode: 'byo-key', provider: 'anthropic', hasKey: false })).toBe(true);
  expect(needsKey({ mode: 'byo-key', provider: 'anthropic', hasKey: true })).toBe(false);
  expect(needsKey({ mode: 'byo-key', provider: 'ollama', hasKey: false })).toBe(false);
  expect(needsKey({ mode: 'admin', provider: 'anthropic', hasKey: false })).toBe(false);
  expect(needsKey(null)).toBe(false);
});

it('adminCloudLimited: only admin + a cloud provider (apiKey lives server-side → would 401)', () => {
  expect(adminCloudLimited({ mode: 'admin', provider: 'anthropic' })).toBe(true);
  expect(adminCloudLimited({ mode: 'admin', provider: 'ollama' })).toBe(false);
  expect(adminCloudLimited({ mode: 'byo-key', provider: 'anthropic' })).toBe(false);
});

it('resolveSurface picks the right surface per mode/key/adminError', () => {
  expect(resolveSurface(null)).toBe('loading');
  expect(resolveSurface({ mode: 'byo-key', provider: 'ollama', hasKey: true })).toBe('chat');
  expect(resolveSurface({ mode: 'byo-key', provider: 'anthropic', hasKey: false })).toBe('setup');
  expect(resolveSurface({ mode: 'admin', provider: 'ollama' })).toBe('admin');
  // admin NEVER falls back to byo-key on failure — it has its own state
  expect(resolveSurface({ mode: 'admin', provider: 'ollama' }, true)).toBe('admin-unavailable');
});

it('assistantText appends the truncation note only when the loop hit the step limit', () => {
  expect(assistantText({ text: 'ans', truncated: false }, '(stop)')).toBe('ans');
  expect(assistantText({ text: 'ans', truncated: true }, '(stop)')).toBe('ans (stop)');
});

// ---- 3. custom provider (byo-key, keyless-optional, endpoint-mandatory) ----
it('needsBaseUrl only for a custom provider with no baseUrl (byo-key)', () => {
  expect(needsBaseUrl({ mode: 'byo-key', provider: 'custom', baseUrl: null })).toBe(true);
  expect(needsBaseUrl({ mode: 'byo-key', provider: 'custom', baseUrl: 'http://x/v1/chat/completions' })).toBe(false);
  expect(needsBaseUrl({ mode: 'byo-key', provider: 'ollama', baseUrl: null })).toBe(false);
  expect(needsBaseUrl({ mode: 'admin', provider: 'custom', baseUrl: null })).toBe(false);
});

it('resolveSurface sends custom-without-baseUrl to setup, custom-with-baseUrl (keyless) to chat', () => {
  expect(resolveSurface({ mode: 'byo-key', provider: 'custom', baseUrl: null, hasKey: false })).toBe('setup');
  expect(resolveSurface({ mode: 'byo-key', provider: 'custom', baseUrl: 'http://x/v1', hasKey: false })).toBe('chat');
  expect(resolveSurface({ mode: 'byo-key', provider: 'ollama', hasKey: true })).toBe('chat');
  expect(resolveSurface({ mode: 'byo-key', provider: 'anthropic', hasKey: false })).toBe('setup');
});

it('canSaveSetup: custom needs a baseUrl draft, a cloud provider needs a key draft', () => {
  expect(canSaveSetup({ provider: 'custom' }, { keyDraft: '', baseUrlDraft: 'http://x/v1' })).toBe(true);
  expect(canSaveSetup({ provider: 'custom' }, { keyDraft: '', baseUrlDraft: '  ' })).toBe(false);
  expect(canSaveSetup({ provider: 'anthropic' }, { keyDraft: 'sk-x', baseUrlDraft: '' })).toBe(true);
  expect(canSaveSetup({ provider: 'anthropic' }, { keyDraft: '  ', baseUrlDraft: '' })).toBe(false);
});
