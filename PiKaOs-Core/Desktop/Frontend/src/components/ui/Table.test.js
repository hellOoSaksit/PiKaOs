import { it, expect } from 'vitest';
import Table from './Table.jsx';
// collects objects AND string/number leaves (a rendered cell value is a bare string child).
// Recurses into array nodes too — React nests a `.map()` result (the rows) as an array child.
const flat = (n, o = []) => { if (n == null || typeof n === 'boolean') return o; o.push(n); if (Array.isArray(n)) { n.forEach(c => flat(c, o)); } else if (typeof n === 'object') { const k = n.props?.children; (Array.isArray(k) ? k : [k]).forEach(c => flat(c, o)); } return o; };

it('renders a header cell per column and a row per datum', () => {
  const el = Table({
    columns: [{ key: 'name', header: 'Name' }, { key: 'role', header: 'Role' }],
    rows: [{ name: 'A', role: 'admin' }, { name: 'B', role: 'member' }],
  });
  const nodes = flat(el);
  expect(nodes.filter(n => n.props?.className === 'utable-tr').length).toBe(2);
  expect(nodes.some(n => n.props?.className === 'utable-th')).toBe(true);
});

it('uses a column render() over the raw value when given', () => {
  const el = Table({
    columns: [{ key: 'pct', header: 'Use', render: (r) => `${r.pct}%` }],
    rows: [{ pct: 42 }],
  });
  expect(flat(el).some(n => n === '42%')).toBe(true);
});
