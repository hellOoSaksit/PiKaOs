/* PiKaOs — branding seam (connect-server spec 2026-07-06, white-label เขียนเผื่อ).
   A per-company white-label system is planned (rename brand, custom logo, custom colors).
   Screens read identity from HERE — never a hardcoded literal — so that system changes one
   module (plus CSS token values) and every consumer follows. Static defaults only for now:
   the admin UI / config plumbing is the future system's job. */
export function getBrand() {
  return {
    name: 'PiKaOs',
    wordmarkLetters: ['P', 'I', 'K', 'A'],  // rendered when logoUrl is null
    logoUrl: null,                          // white-label: an image replaces the letter row
  };
}
