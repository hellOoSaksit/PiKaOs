import { describe, it, expect } from 'vitest';
import { StatusLine, TechnicalDetails } from './LocalMcpDetail.jsx';

const flat = (n, out = []) => {
  if (n == null || typeof n === 'boolean') return out;
  out.push(n);
  if (typeof n === 'object') {
    const k = n.props?.children;
    (Array.isArray(k) ? k : [k]).forEach((c) => flat(c, out));
  }
  return out;
};
const t = (k) => k;
const strings = (el) => flat(el).filter((n) => typeof n === 'string');

describe('StatusLine', () => {
  it('shows the badge key + per-status hint', () => {
    const texts = flat(StatusLine({ t, status: 'ready', lastError: null })).filter((n) => typeof n === 'string');
    expect(texts).toContain('mcp.status.ready');
    expect(texts).toContain('mcp.status.ready.hint');
  });
  it('error shows the mapped reason instead of the generic hint', () => {
    const texts = flat(StatusLine({ t, status: 'error', lastError: 'handshake-timeout' })).filter((n) => typeof n === 'string');
    expect(texts).toContain('mcp.err.handshake-timeout');
  });

  // --- beyond the brief: the states a user actually sits in ---
  it('stopped shows its own hint, not another status\'s', () => {
    const texts = strings(StatusLine({ t, status: 'stopped', lastError: null }));
    expect(texts).toContain('mcp.status.stopped');
    expect(texts).toContain('mcp.status.stopped.hint');
    expect(texts).not.toContain('mcp.status.ready.hint');
  });
  it('an unknown status still renders a text badge (never colour alone)', () => {
    const texts = strings(StatusLine({ t, status: undefined, lastError: null }));
    expect(texts).toContain('mcp.status.stopped');
  });
  it('an unmapped error token falls back to the generic reason', () => {
    const texts = strings(StatusLine({ t, status: 'error', lastError: null }));
    expect(texts).toContain('mcp.err.generic');
  });
  it('node-missing offers the download link', () => {
    const texts = strings(StatusLine({ t, status: 'error', lastError: 'node-missing' }));
    expect(texts).toContain('mcp.err.node-missing.link');
  });
});

describe('TechnicalDetails', () => {
  it('renders command + args + env-var names, never secret values', () => {
    const d = { id: 'x', label: 'X', command: 'npx', args: ['-y', 'pkg'], secretKeys: ['API_TOKEN'] };
    const texts = flat(TechnicalDetails({ t, d })).filter((n) => typeof n === 'string');
    expect(texts.join(' ')).toContain('npx');
    expect(texts.join(' ')).toContain('-y pkg');
    expect(texts.join(' ')).toContain('API_TOKEN');   // the NAME is fine; values never exist client-side
  });

  // --- beyond the brief ---
  it('is a collapsed native <details> (keyboard-operable, closed by default)', () => {
    const el = TechnicalDetails({ t, d: { id: 'x', command: 'npx', args: [] } });
    const details = flat(el).find((n) => n.type === 'details');
    expect(details).toBeTruthy();
    expect(details.props.open).toBeFalsy();
    expect(flat(details).some((n) => n.type === 'summary')).toBe(true);
  });
  it('omits the secret section when the def declares no secret keys', () => {
    const texts = strings(TechnicalDetails({ t, d: { id: 'x', command: 'npx', args: [] } }));
    expect(texts).toContain('x');
    expect(texts).not.toContain('mcp.detail.secrets');
  });
});
