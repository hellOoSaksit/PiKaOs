import { it, expect, vi } from 'vitest';
import Button from './Button.jsx';

// Collects EVERY node in the returned tree — objects AND string/number leaves (a button's
// label and the loading text are bare string children, so an objects-only walk would miss them).
const flat = (n, out = []) => {
  if (n == null || typeof n === 'boolean') return out;
  out.push(n);
  if (typeof n === 'object') {
    const kids = n.props?.children;
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => flat(c, out));
  }
  return out;
};

it('defaults type to "button" so it never submits a form by accident', () => {
  const el = Button({ children: 'Go' });
  // the <button> is the root or wraps it; find it
  const btn = flat(el).find(n => n.type === 'button');
  expect(btn.props.type).toBe('button');
});

it('renders a design-system icon by name', () => {
  const el = Button({ icon: 'add', children: 'Add' });
  const icon = flat(el).find(n => n.props?.name === 'add');
  expect(icon).toBeTruthy();
});

it('icon-only (no children) gets an aria-label from label', () => {
  const el = Button({ icon: 'search', label: 'Search' });
  const btn = flat(el).find(n => n.type === 'button');
  expect(btn.props['aria-label']).toBe('Search');
  expect(btn.props.className).toContain('btn-icon');
});

it('warns in dev when icon is a string the set does not ship (emoji guard)', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  Button({ icon: '➕', label: 'x' });   // an emoji, not an icon name
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

it('loading disables and shows the caller-provided busy label, not a literal', () => {
  const el = Button({ loading: true, loadingLabel: 'กำลังบันทึก', children: 'Save' });
  const btn = flat(el).find(n => n.type === 'button');
  expect(btn.props.disabled).toBe(true);
  expect(flat(el).some(n => n === 'กำลังบันทึก' || n.props?.children === 'กำลังบันทึก')).toBe(true);
});
