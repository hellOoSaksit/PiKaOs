import { it, expect } from 'vitest';
import Meter from './Meter.jsx';

it('defaults to the quota kind — no game-term "mana"', () => {
  const el = Meter({ val: 50 });
  expect(el.props.className).toBe('meter quota');
});

it('clamps the bar width to the val percent', () => {
  const el = Meter({ val: 42 });
  const bar = el.props.children;
  expect(bar.props.style.width).toBe('42%');
});
