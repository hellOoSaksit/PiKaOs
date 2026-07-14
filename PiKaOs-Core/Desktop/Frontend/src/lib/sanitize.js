// HTML sanitizer for the raw-HTML sinks that render user-authored doc content (F3).
// TipTap parses content through its ProseMirror schema, but the exec-command *fallback* editor and the
// html→markdown helpers assign innerHTML directly from localStorage-stored HTML — so route that content
// through DOMPurify first. Vendored (npm), not a CDN, so it works offline and under the desktop CSP.
import DOMPurify from "dompurify";

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || "", { USE_PROFILES: { html: true } });
}
