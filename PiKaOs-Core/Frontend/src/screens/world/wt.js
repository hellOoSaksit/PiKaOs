/* PiKaOs — shared i18n helper for the WORLD modules.
   The World screen receives `t` and calls setWt(t); every world/* module
   imports the live `wt` binding so a single translator is shared across the
   split files (mirrors the original module-private `_wt`/`wt` pair). */
let _wt = (k) => k;
export const wt = (k, v) => _wt(k, v);
export const setWt = (fn) => { _wt = (typeof fn === "function") ? fn : ((k) => k); };
