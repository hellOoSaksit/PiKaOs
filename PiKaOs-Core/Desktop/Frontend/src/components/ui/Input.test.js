import { it, expect } from 'vitest';
import Field from './Input.jsx';

const flat = (n, out = []) => { if (n && typeof n === 'object') { out.push(n); const k = n.props?.children; (Array.isArray(k) ? k : [k]).forEach(c => flat(c, out)); } return out; };

it('renders its own input when given no children', () => {
  const el = Field({ label: 'Name' });
  expect(flat(el).some(n => n.type === 'input')).toBe(true);
});

it('renders children instead of an input when given them (wrapper mode)', () => {
  const child = { type: 'select', props: {} };
  const el = Field({ label: 'Role', children: child });
  const nodes = flat(el);
  expect(nodes.some(n => n.type === 'input')).toBe(false);
  expect(nodes).toContain(child);
});

it('shows a hint beside the label', () => {
  const el = Field({ label: 'Quota', hint: 'per period', children: { type: 'input', props: {} } });
  expect(flat(el).some(n => n.props?.className === 'bf-hint')).toBe(true);
});
