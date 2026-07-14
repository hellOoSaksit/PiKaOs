/* PiKaOs — renderer-owned halves of the recovery inventory (recovery spec 2026-07-13 §6).
   Web storage belongs to the renderer, so the boot-cache and ui-state items are counted and
   cleared HERE — main's recovery:clear rejects these ids by design. Storage objects come in as
   parameters so the logic stays a pure node-testable function (repo convention: no jsdom). */
export const BOOT_PREFIX = 'pikaos.boot.v1:';   // per-server build hash — AppBoot.jsx bootKey()

const keys = (storage) => Array.from({ length: storage.length }, (_, i) => storage.key(i));

export function countLocalItems(storage) {
  const all = keys(storage);
  const boot = all.filter((k) => k.startsWith(BOOT_PREFIX)).length;
  return { boot, ui: all.length - boot };
}

export function clearBootCache(storage) {
  for (const k of keys(storage).filter((k) => k.startsWith(BOOT_PREFIX))) storage.removeItem(k);
}

// "UI back to defaults": every non-boot key goes (theme, lexicon, nav cache, drafts, plugin
// state) — enumerate-and-remove, no fragile key registry. sessionStorage is flags only; clear it.
export function clearUiState(local, session) {
  for (const k of keys(local).filter((k) => !k.startsWith(BOOT_PREFIX))) local.removeItem(k);
  try { session.clear(); } catch (e) { /* ignore */ }
}
