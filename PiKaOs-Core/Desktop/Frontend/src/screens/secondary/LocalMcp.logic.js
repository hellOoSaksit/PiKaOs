/* Pure logic for the Local MCP screens — NO React, NO window. The desktop test suite
   imports this file cross-package (preset validity vs the real serverDefSchema), so it
   must stay dependency-free. */

// A tool's inputSchema -> flat form fields, or null when a form can't represent it
// honestly (nested object/array/$ref/combinators/no schema) — the UI then locks to JSON mode.
export function toolFormFields(inputSchema) {
  if (!inputSchema || inputSchema.type !== 'object' || typeof inputSchema.properties !== 'object' || inputSchema.properties === null) return null;
  const required = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
  const fields = [];
  for (const [name, prop] of Object.entries(inputSchema.properties)) {
    if (!prop || typeof prop !== 'object' || prop.$ref || prop.oneOf || prop.anyOf || prop.allOf) return null;
    if (Array.isArray(prop.enum)) {
      fields.push({ name, type: 'enum', enumValues: prop.enum.map(String), required: required.has(name), description: prop.description || '' });
    } else if (prop.type === 'string' || prop.type === 'number' || prop.type === 'integer' || prop.type === 'boolean') {
      fields.push({ name, type: prop.type === 'integer' ? 'number' : prop.type, required: required.has(name), description: prop.description || '' });
    } else {
      return null;
    }
  }
  return fields;
}

export const needsJsonMode = (inputSchema) => toolFormFields(inputSchema) === null;

// Form values -> the args object actually sent. Empty optionals are OMITTED (never ""),
// numbers are real numbers, an empty form is {} (the manager expects an object, not null).
export function buildArgs(fields, values) {
  const out = {};
  for (const f of fields) {
    const raw = values[f.name];
    if (raw === undefined || raw === null || raw === '') continue;
    if (f.type === 'number') {
      const n = Number(raw);
      if (!Number.isNaN(n)) out[f.name] = n;
    } else if (f.type === 'boolean') {
      out[f.name] = !!raw;
    } else {
      out[f.name] = String(raw);
    }
  }
  return out;
}

export const canCall = (fields, values) =>
  fields.every((f) => !f.required || (values[f.name] !== undefined && values[f.name] !== null && String(values[f.name]).trim() !== ''));

export function filterTools(tools, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return tools;
  return tools.filter((t) => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
}

// Preset + user-filled params -> a server def. Must pass the main process's
// parseServerDef unchanged — presets get no validation bypass (asserted in the
// desktop suite's mcp-presets.test.ts).
export function presetToDef(preset, paramValues, label) {
  const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(paramValues[k] ?? '').trim());
  const def = {
    id: preset.id,
    label,
    command: preset.command,
    args: preset.argsTemplate.map(fill).filter((a) => a.length > 0),
  };
  if (preset.secret) def.secretKeys = [preset.secret.key];
  return def;
}

// All-text results read like an answer, not a payload; anything richer falls back to raw JSON.
export function resultText(result) {
  const content = result && result.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  if (!content.every((c) => c && c.type === 'text' && typeof c.text === 'string')) return null;
  return content.map((c) => c.text).join('\n');
}

const KNOWN_ERROR_TOKENS = new Set(['node-missing', 'spawn-failed', 'handshake-timeout', 'handshake-failed', 'exited-early']);
export const errorKey = (token) => (KNOWN_ERROR_TOKENS.has(token) ? `mcp.err.${token}` : 'mcp.err.generic');
