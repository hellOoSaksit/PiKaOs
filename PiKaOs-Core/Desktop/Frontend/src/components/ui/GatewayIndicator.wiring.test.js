import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import en from '../../data/i18n/en-formal.json';
import th from '../../data/i18n/th-formal.json';

/* GatewayIndicator.logic.test.js only proves indicatorState's math; nothing binds it to the bar. Both
   checks below close that gap the same way the desktop side does for gateway.setEnabled (299fd67):
   read the real source/data a human can't see from a unit test, and pin the exact thing that must
   stay true for the light to exist at all. Neither proves the light is ever SEEN on screen — that is
   still a job for the Electron UAT, same caveat 299fd67 recorded for its own scans. */

describe('utility bar gateway wiring', () => {
  it('BottomUtilityBar still renders GatewayIndicator behind the desktop-only guard', () => {
    const src = readFileSync(new URL('./BottomUtilityBar.jsx', import.meta.url), 'utf8');
    // Scoped to the guard + component together, not a bare `GatewayIndicator` — the same lesson
    // 299fd67 paid for on `setEnabled`: pin the thing that can only mean THIS feature's wiring, so an
    // unrelated edit (e.g. GatewayIndicator gaining a second call site) doesn't force this pin's death.
    expect(src).toMatch(/window\.pikaosDesktop\?\.isDesktop\s*&&\s*<GatewayIndicator\b/);
  });

  it('the gateway light\'s aria-label key exists where the light actually ships (en, th)', () => {
    // ja is intentionally excluded: this pack does not carry full utilitybar.* parity today (only
    // utilitybar.nav exists) and falls back to en at render time — matching that existing convention
    // rather than inventing a stricter rule this fix wasn't asked to add.
    for (const pack of [en, th]) {
      const table = pack.translations ?? pack;
      expect(table['utilitybar.gateway'], 'utilitybar.gateway missing').toBeTruthy();
    }
  });
});
