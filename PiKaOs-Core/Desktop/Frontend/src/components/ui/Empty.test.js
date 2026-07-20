import { it, expect } from 'vitest';
import Empty from './Empty.jsx';

const flat = (n, out = []) => {
  if (n == null || typeof n === 'boolean') return out;
  out.push(n);
  if (typeof n === 'object') {
    const k = n.props?.children;
    (Array.isArray(k) ? k : [k]).forEach((c) => flat(c, out));
  }
  return out;
};

it('defaults the icon to "folder"', () => {
  // renderIcon('folder') yields an element carrying name="folder"; assert it actually reached the tree
  const el = Empty({ title: 'Nothing here' });
  expect(flat(el).some((n) => n.props?.name === 'folder')).toBe(true);
});

it('honours an explicit icon name over the default', () => {
  const el = Empty({ icon: 'search', title: 'No results' });
  expect(flat(el).some((n) => n.props?.name === 'search')).toBe(true);
  expect(flat(el).some((n) => n.props?.name === 'folder')).toBe(false);
});
