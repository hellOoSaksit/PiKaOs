import { it, expect } from 'vitest';
import { nextTrapTarget } from './focus-trap.js';

it('wraps forward from the last focusable to the first', () => {
  const list = ['a', 'b', 'c'];
  expect(nextTrapTarget(list, 'c', false)).toBe('a');
});
it('wraps backward from the first to the last on shift+tab', () => {
  const list = ['a', 'b', 'c'];
  expect(nextTrapTarget(list, 'a', true)).toBe('c');
});
it('is a no-op-safe on an empty container', () => {
  expect(nextTrapTarget([], null, false)).toBe(null);
});
