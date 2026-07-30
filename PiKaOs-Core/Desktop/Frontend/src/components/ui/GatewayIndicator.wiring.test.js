import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import en from '../../data/i18n/en-formal.json';
import th from '../../data/i18n/th-formal.json';
import ja from '../../data/i18n/ja-formal.json';

/* GatewayIndicator.logic.test.js only proves indicatorState's math; nothing binds it to the shell.
   Both checks below close that gap the same way the desktop side does for gateway.setEnabled
   (299fd67): read the real source/data a human can't see from a unit test, and pin the exact thing
   that must stay true for the light to exist at all. Neither proves the light is ever SEEN on screen
   — that is still a job for the Electron UAT, same caveat 299fd67 recorded for its own scans. */

describe('gateway light wiring', () => {
  it('App.jsx renders GatewayIndicator inside withChrome, behind its desktop-only guard', () => {
    const src = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
    // withChrome is the ONLY wrapper that reaches every shell mode, pre-login ones included — the
    // whole point of the move out of BottomUtilityBar, which the five early returns skip. So the pin
    // is the guard and the render TOGETHER, inside that function: `<GatewayIndicator` on its own
    // would stay green if someone put the light back in a signed-in-only branch, and
    // `if (!isDesktop) return body;` on its own says nothing about the light. Scoped this tightly on
    // purpose (the 299fd67 lesson): it can only mean this feature's wiring, so an unrelated edit
    // never has to delete it.
    expect(src).toMatch(
      /const withChrome = \(body\) => \{[\s\S]*?if \(!isDesktop\) return body;[\s\S]*?<GatewayIndicator\b/,
    );
  });

  it('the gateway light\'s aria-label and tooltip keys exist where the light ships (en, th, ja)', () => {
    // All three packs now, not the en/th pair this pinned before the light moved: the keys live in
    // the `titlebar.*` namespace with the control, and ja carries that namespace in full (see
    // i18n-window.test.js) — the parity gap that justified skipping ja was a `utilitybar.*` one.
    for (const pack of [en, th, ja]) {
      const table = pack.translations ?? pack;
      expect(table['titlebar.gateway'], 'titlebar.gateway missing').toBeTruthy();
      expect(table['titlebar.gateway.tip'], 'titlebar.gateway.tip missing').toBeTruthy();
    }
  });
});
