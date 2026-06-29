/* PiKaOs — shared i18n helper for the SECONDARY screens/drawers.
   Each top-level component binds the active `t` via setSt(t) on render; every
   secondary/* module imports the live `st` binding. These screens never render
   with conflicting languages (one active app language), so a module-level
   binding is safe and avoids drilling `t` through every helper. */
let _st = (k) => k;
export const st = (k, v) => _st(k, v);
export const setSt = (fn) => { _st = (typeof fn === "function") ? fn : ((k) => k); };
