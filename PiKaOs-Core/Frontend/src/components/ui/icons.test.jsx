import { it, expect } from 'vitest';
import { ICON_NAMES, renderIcon } from './icons.jsx';
import { NAV } from '../../data/data.jsx';

const walk = (items) => items.flatMap(n => [n, ...walk(n.children || [])]);
const navIcons = NAV.flatMap(g => walk(g.items)).map(n => n.icon);

it('every kernel nav item names an icon the set actually ships', () => {
  expect(navIcons.length).toBeGreaterThan(0);
  expect(navIcons.filter(name => !ICON_NAMES.includes(name))).toEqual([]);
});

it('resolves a known name to an element', () => {
  expect(renderIcon('home')).toMatchObject({ props: { name: 'home' } });
});

// Plugins declare icons as data and may ship before they migrate; the shell must not
// swallow what it doesn't recognise — an emoji descriptor still renders its glyph.
it('passes an unknown icon value through untouched', () => {
  expect(renderIcon('🏠')).toBe('🏠');
  expect(renderIcon(undefined)).toBe(undefined);
});
