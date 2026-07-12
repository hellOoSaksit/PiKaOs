import { it, expect } from 'vitest';
import { maximizeIconName } from './TitleBar.jsx';

it('shows the restore glyph while maximized, the maximize glyph while floating', () => {
  expect(maximizeIconName(true)).toBe('win-restore');
  expect(maximizeIconName(false)).toBe('win-maximize');
});
