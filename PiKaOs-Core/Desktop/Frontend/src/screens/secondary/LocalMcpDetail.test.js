import { describe, it, expect } from 'vitest';
import { ActionErrorNote, StatusLine, TechnicalDetails, makeSaveEdit } from './LocalMcpDetail.jsx';

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

/* The single rendering point for every action error on BOTH mcp screens, so its contract is worth
   pinning here: localized sentence for the user, raw technical text only as a secondary line. */
describe('ActionErrorNote', () => {
  // the secondary line carrying the raw, untranslated message
  const detailNode = (el) => flat(el).find((n) => typeof n?.props?.className === 'string' && n.props.className.includes('mono'));

  it('renders the localized key, with the raw detail underneath', () => {
    const el = ActionErrorNote({ t, err: { key: 'mcp.err.action.save', detail: 'EACCES' } });
    expect(strings(el)).toContain('mcp.err.action.save');
    expect(detailNode(el)).toBeTruthy();
    expect(strings(el)).toContain('EACCES');
  });
  it('omits the technical line entirely when there is no raw detail', () => {
    const el = ActionErrorNote({ t, err: { key: 'mcp.err.action.stop', detail: null } });
    expect(strings(el)).toEqual(['mcp.err.action.stop']);
    expect(detailNode(el)).toBeUndefined();     // no empty box, not just no text
  });
  it('renders nothing when there is no error', () => {
    expect(ActionErrorNote({ t, err: null })).toBe(null);
  });
});

describe('StatusLine', () => {
  it('shows the badge key + per-status hint', () => {
    const texts = strings(StatusLine({ t, status: 'ready', lastError: null }));
    expect(texts).toContain('mcp.status.ready');
    expect(texts).toContain('mcp.status.ready.hint');
  });
  it('error shows the mapped reason instead of the generic hint', () => {
    const texts = strings(StatusLine({ t, status: 'error', lastError: 'handshake-timeout' }));
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
    // The def carries a value here on purpose: the assertion below has to be able to fail if the
    // panel ever starts rendering whatever it is handed.
    const d = { id: 'x', label: 'X', command: 'npx', args: ['-y', 'pkg'],
      secretKeys: ['API_TOKEN'], secretValue: 'sk-live-must-never-render' };
    const out = strings(TechnicalDetails({ t, d })).join(' ');
    expect(out).toContain('npx');
    expect(out).toContain('-y pkg');
    expect(out).toContain('API_TOKEN');   // the NAME is fine; values never exist client-side
    expect(out).not.toContain('sk-live-must-never-render');
  });

  // --- beyond the brief ---
  it('is a collapsed native <details> (keyboard-operable, closed by default)', () => {
    const el = TechnicalDetails({ t, d: { id: 'x', command: 'npx', args: [] } });
    const details = flat(el).find((n) => n.type === 'details');
    expect(details).toBeTruthy();
    expect(details.props.open).toBe(false);
    expect(flat(details).some((n) => n.type === 'summary')).toBe(true);
  });
  it('omits the secret section when the def declares no secret keys', () => {
    const texts = strings(TechnicalDetails({ t, d: { id: 'x', command: 'npx', args: [] } }));
    expect(texts).toContain('x');
    expect(texts).not.toContain('mcp.detail.secrets');
  });
});

/* The edit form's close decision, lifted out of the component so it is testable without a renderer.
   It matters because the parent swallows its own errors into a banner and always resolves. */
describe('makeSaveEdit', () => {
  const typed = { id: 'x', command: 'npx', args: ['-y', 'pkg'], secretKey: 'K', secretValue: 'v' };

  it('closes the form once the save succeeded', async () => {
    const editing = [];
    await makeSaveEdit(async () => true, (v) => editing.push(v))(typed);
    expect(editing).toEqual([false]);          // setEditing(false) === form closed
  });
  it('a failed save keeps the form open, so the typed command is not lost', async () => {
    const editing = [];
    await makeSaveEdit(async () => false, (v) => editing.push(v))(typed);
    expect(editing).toEqual([]);
  });
  it('hands the parent a def without the secret fields, and the secret separately', async () => {
    let got = null;
    await makeSaveEdit(async (...args) => { got = args; return true; }, () => {})(typed);
    expect(got).toEqual([{ id: 'x', command: 'npx', args: ['-y', 'pkg'] }, 'K', 'v']);
  });
});
