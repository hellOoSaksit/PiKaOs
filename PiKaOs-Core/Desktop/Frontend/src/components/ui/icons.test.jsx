import { it, expect } from 'vitest';
import { Fragment } from 'react';
import { ICON_NAMES, renderIcon, Icon } from './icons.jsx';
import { NAV } from '../../data/data.jsx';

const walk = (items) => items.flatMap(n => [n, ...walk(n.children || [])]);
const navIcons = NAV.flatMap(g => walk(g.items)).map(n => n.icon);

it('every kernel nav item names an icon the set actually ships', () => {
  expect(navIcons.length).toBeGreaterThan(0);
  expect(navIcons.filter(name => !ICON_NAMES.includes(name))).toEqual([]);
});

it('ships the toolbar chevrons', () => {
  for (const n of ['chevron-left', 'chevron-right']) expect(ICON_NAMES).toContain(n);
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

// No @testing-library/react + jsdom in this project (see Table.test.js's pattern) — call the
// component as a plain function and walk the returned element tree instead of a real DOM.
it('renders the ai icon as an svg with two path children (spark + plus)', () => {
  const el = Icon({ name: 'ai' });
  expect(el.type).toBe('svg');
  const group = el.props.children;
  expect(group.type).toBe(Fragment);
  expect(group.props.children.length).toBe(2);
  expect(group.props.children.every(p => p.type === 'path')).toBe(true);
});
