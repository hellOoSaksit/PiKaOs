import { describe, it, expect } from 'vitest';
import { popoutClass } from './BottomPopout.jsx';

describe('popoutClass', () => {
  it('carries the show class only when open', () => {
    expect(popoutClass(true)).toBe('pk-popout show');
    expect(popoutClass(false)).toBe('pk-popout');
  });
  it('appends the caller class so a tenant can style its own contents', () => {
    expect(popoutClass(true, 'pk-savebar')).toBe('pk-popout show pk-savebar');
    expect(popoutClass(false, 'pk-savebar')).toBe('pk-popout pk-savebar');
  });
});
