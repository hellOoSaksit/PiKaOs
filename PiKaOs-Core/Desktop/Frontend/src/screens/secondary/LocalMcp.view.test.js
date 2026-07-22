import { describe, it, expect } from 'vitest';
import { PresetCard, ServerRow, explainerCollapsed } from './LocalMcp.jsx';

const flat = (n, out = []) => {   // same walker as components/ui tests
  if (n == null || typeof n === 'boolean') return out;
  out.push(n);
  if (typeof n === 'object') {
    const k = n.props?.children;
    (Array.isArray(k) ? k : [k]).forEach((c) => flat(c, out));
  }
  return out;
};
const t = (k) => k;   // keys-as-text: assertions match keys

describe('PresetCard', () => {
  const preset = { id: 'memory', icon: '🧠', command: 'npx', argsTemplate: [], params: [], secret: null };
  it('shows the localized name/desc keys and an install button when not installed', () => {
    const el = PresetCard({ t, preset, installed: false, onPick: () => {} });
    const texts = flat(el).filter((n) => typeof n === 'string');
    expect(texts).toContain('mcp.preset.memory.name');
    expect(texts).toContain('mcp.preset.memory.desc');
    expect(texts).toContain('mcp.preset.install');
  });
  it('shows installed state (no install button) when already registered', () => {
    const el = PresetCard({ t, preset, installed: true, onPick: () => {} });
    const texts = flat(el).filter((n) => typeof n === 'string');
    expect(texts).toContain('mcp.preset.installed');
    expect(texts).not.toContain('mcp.preset.install');
  });
});

describe('ServerRow', () => {
  const d = { id: 'fs', label: 'Files', command: 'npx', args: [] };
  const row = (over = {}) => ServerRow({
    t, d, status: 'ready', lastError: null, toolCount: 3, busy: false,
    onOpen: () => {}, onStart: () => {}, onStop: () => {}, ...over,
  });
  const rowNode = (el) => flat(el).find((n) => n.props?.role === 'button' && n.props?.tabIndex === 0);
  // the Start/Stop control's click-swallowing wrapper
  const actionWrap = (el) => flat(el).find((n) => n.type === 'span' && typeof n.props?.onClick === 'function');

  it('renders label, status badge key, and is keyboard-openable (role=button)', () => {
    const el = row();
    expect(rowNode(el)).toBeTruthy();
    const texts = flat(el).filter((n) => typeof n === 'string');
    expect(texts).toContain('Files');
    expect(texts).toContain('mcp.status.ready');
  });
  it('Enter on the row itself opens it', () => {
    let opened = 0;
    const node = rowNode(row({ onOpen: () => { opened += 1; } }));
    const self = {};
    node.props.onKeyDown({ key: 'Enter', target: self, currentTarget: self, preventDefault() {} });
    expect(opened).toBe(1);
  });
  it('Enter on a child control does NOT open the row (target !== currentTarget guard)', () => {
    let opened = 0;
    const node = rowNode(row({ onOpen: () => { opened += 1; } }));
    node.props.onKeyDown({ key: 'Enter', target: {}, currentTarget: {}, preventDefault() {} });
    expect(opened).toBe(0);
  });
  it('clicking Start/Stop stops propagation so the row does not also open', () => {
    let opened = 0;
    const el = row({ onOpen: () => { opened += 1; } });
    let stopped = 0;
    actionWrap(el).props.onClick({ stopPropagation: () => { stopped += 1; } });
    expect(stopped).toBe(1);
    expect(opened).toBe(0);
  });
  it('error status surfaces the mapped reason key', () => {
    const el = ServerRow({ t, d, status: 'error', lastError: 'node-missing', toolCount: 0, busy: false, onOpen: () => {}, onStart: () => {}, onStop: () => {} });
    expect(flat(el).filter((n) => typeof n === 'string')).toContain('mcp.err.node-missing');
  });
});

describe('explainerCollapsed', () => {
  it('reads/writes the flag through the injected storage', () => {
    const store = {};
    const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
    expect(explainerCollapsed(storage)).toBe(false);
    storage.setItem('mcp.explainer.collapsed', '1');
    expect(explainerCollapsed(storage)).toBe(true);
  });
});
