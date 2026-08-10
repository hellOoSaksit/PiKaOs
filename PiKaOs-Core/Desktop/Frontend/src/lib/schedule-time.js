/* Scheduled updates are stored UTC (server-core-update spec §6.1); the operator types a local
   `datetime-local` value, which carries no zone at all. These are the two conversions that seam
   needs, kept as pure functions so they are testable without a DOM.

   `new Date("2030-01-02T03:04")` is parsed as LOCAL time by spec (a date-time form without a zone
   designator), while the same string with a `Z` is UTC — that asymmetry is the whole reason this
   file exists rather than the components doing it inline in two places. */

export function localInputToUtcIso(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function utcIsoToLocalLabel(iso) {
  const d = new Date(iso);
  // Unparseable falls back to the raw string: a schedule row that shows an odd timestamp is far
  // better than one that renders "Invalid Date" over a real, pending version switch.
  return Number.isNaN(d.getTime()) ? String(iso ?? '') : d.toLocaleString();
}

/* `min` for the datetime-local input — the local NOW, in the exact `YYYY-MM-DDTHH:mm` shape the
   control requires. Only a hint (the browser still lets a determined user type an earlier time,
   and the store refuses a past time anyway), but it stops the ordinary mistake at the source. */
export function localNowInputValue(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
       + `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
