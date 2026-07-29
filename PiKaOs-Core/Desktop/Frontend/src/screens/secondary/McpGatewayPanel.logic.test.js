import { describe, it, expect } from 'vitest';
import { confirmText, toggleIntent } from './McpGatewayPanel.logic.js';
import en from '../../data/i18n/en-formal.json';

describe('confirmText', () => {
  it('has no confirmation to show when nothing is pending', () => {
    expect(confirmText(null)).toBeNull();
    expect(confirmText(undefined)).toBeNull();
  });

  it('names the client in a revoke, so the operator cannot confirm the wrong row', () => {
    expect(confirmText({ kind: 'revoke', name: 'Claude' }))
      .toEqual({ key: 'mcpgw.confirm.revoke', params: { name: 'Claude' } });
  });

  it('distinguishes opening the gateway from closing it', () => {
    expect(confirmText({ kind: 'enable' }).key).toBe('mcpgw.confirm.enable');
    expect(confirmText({ kind: 'disable' }).key).toBe('mcpgw.confirm.disable');
  });

  it('every key it can return exists in the pack — a typo here would render a raw key', () => {
    const table = en.translations ?? en;
    for (const p of [{ kind: 'enable' }, { kind: 'disable' }, { kind: 'revoke', name: 'x' }]) {
      expect(table[confirmText(p).key], confirmText(p).key).toBeTruthy();
    }
  });

  it('an unknown kind shows nothing rather than an empty bar', () => {
    expect(confirmText({ kind: 'something-else' })).toBeNull();
  });
});

describe('toggleIntent', () => {
  // Derived from the real state, never from the checkbox event: that is what lets the switch keep
  // rendering reality while a confirmation is open, so cancelling needs no rollback.
  it('asks to disable when the gateway is on, and to enable when it is off', () => {
    expect(toggleIntent(true)).toEqual({ kind: 'disable' });
    expect(toggleIntent(false)).toEqual({ kind: 'enable' });
  });
});
