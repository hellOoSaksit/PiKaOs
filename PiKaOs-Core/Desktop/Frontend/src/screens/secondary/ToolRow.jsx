/* One tool of a ready MCP server: an accordion header (name + description) and, when open, a form
   that lets the user try the tool WITHOUT writing JSON. The form is generated from the tool's
   inputSchema (LocalMcp.logic); the JSON textarea stays as the escape hatch for technical users and
   is FORCED when the schema is too complex for a flat form to represent honestly. A result that is
   all text reads as an answer, with the full payload folded away behind a collapse.

   Props (fixed by LocalMcpDetail): { t, tool, open, onToggle, onCall } where onCall(args) already
   has the tool name bound and its rejection is NOT caught upstream — makeCall below is the only
   place that can turn it into a message.

   Primitives are imported per-file, never from the `components/ui` barrel: the barrel reaches
   lib/i18n, which touches `window` at module scope and breaks the node-environment tests. */
import React from 'react';
const { useEffect, useState } = React;
import Button from '../../components/ui/Button.jsx';
import Switch from '../../components/ui/Switch.jsx';
import Select from '../../components/ui/Dropdown.jsx';
import HelpNote from '../../components/ui/HelpNote.jsx';
import { toolFormFields, buildArgs, canCall, resultText } from './LocalMcp.logic.js';

const LABEL = { display: 'block', fontSize: 12.5, marginBottom: 4 };
const PRE = { margin: 0, fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

/* One generated argument input. Hook-free so the tests can call it directly.
   Every control is name-associated: a placeholder is not a label, and the required marker is a
   word rather than a colour so it survives both a screen reader and a colour-blind reader. */
export function FieldInput({ t, field, value, onChange }) {
  // The parent keeps exactly one tool open, so a field name is unique across the rendered page.
  const id = `mcp-arg-${field.name}`;
  const labelId = `${id}-label`;
  const helpId = field.description ? `${id}-help` : undefined;
  const mark = field.required
    ? <span className="req" style={{ marginLeft: 4, fontSize: 11 }}>{t('mcp.toolform.required')}</span>
    : null;
  const help = field.description
    ? <div id={helpId} className="faint" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.5 }}>{field.description}</div>
    : null;

  if (field.type === 'boolean') {
    // Switch renders its own <label> around the checkbox, so the name is associated for free.
    return (
      <div className="tool-arg" style={{ marginBottom: 10 }}>
        <Switch checked={!!value} onChange={onChange} aria-describedby={helpId}
          label={<span style={{ fontSize: 12.5, marginLeft: 8 }}>{field.name}{mark}</span>} />
        {help}
      </div>
    );
  }

  if (field.type === 'enum') {
    // Select's trigger is a <button>, which htmlFor cannot address — a labelled group is the
    // association that actually reaches it. (A raw select element is banned in screens by CI.)
    return (
      <div className="tool-arg" role="group" aria-labelledby={labelId} style={{ marginBottom: 10 }}>
        <div id={labelId} style={LABEL}>{field.name}{mark}</div>
        <Select options={field.enumValues} value={value ?? ''} onChange={onChange}
          block placeholder={t('mcp.toolform.choose')} />
        {help}
      </div>
    );
  }

  return (
    <div className="tool-arg" style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={LABEL}>{field.name}{mark}</label>
      <input id={id} className="bf-input" style={{ width: '100%' }} aria-describedby={helpId}
        type={field.type === 'number' ? 'number' : 'text'}
        value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      {help}
    </div>
  );
}

/* What came back. An all-text result is the answer the user asked for, so it is shown as text and
   the payload is folded away; anything richer has no readable form, so the raw JSON IS the view and
   a second copy behind a collapse would be noise. A failure says so in words, not only in colour. */
export function ResultPanel({ t, result }) {
  const text = resultText(result);
  const raw = JSON.stringify(result, null, 2);
  const failed = !!result.isError;
  return (
    <div style={{ marginTop: 10 }}>
      {/* `badge warn` is the kit's error treatment (styles.css `.badge.warn`); a bare `warn` class
          matches no rule at all, so the failure would render in the ordinary ink colour. */}
      <div style={{ marginBottom: 4 }}>
        {failed
          ? <span className="badge warn">{t('mcp.toolform.resultError')}</span>
          : <span className="faint" style={{ fontSize: 11.5 }}>{t('mcp.toolform.result')}</span>}
      </div>
      <pre className="mono" style={PRE}>{text === null ? raw : text}</pre>
      {text !== null && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11.5 }}>{t('mcp.toolform.resultRaw')}</summary>
          <pre className="mono" style={{ ...PRE, marginTop: 6 }}>{raw}</pre>
        </details>
      )}
    </div>
  );
}

/* The JSON escape hatch's parse rule. Kept out of the component so the two behaviours the previous
   screen proved matter are testable: bad JSON must issue NO call, and an empty box means "no
   arguments" -> {} (the manager expects an object, never null). A valid JSON scalar or array is
   rejected too — MCP arguments are an object. */
export function parseJsonArgs(text) {
  const raw = (text || '').trim();
  if (raw === '') return { args: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { errorKey: 'mcp.tool.badjson' };
    return { args: parsed };
  } catch {
    return { errorKey: 'mcp.tool.badjson' };
  }
}

/* The call, as a factory so its failure rule is testable without a renderer. onCall's rejection is
   not caught by the parent, so swallowing it here — into a message, never into silence — is the
   difference between an error the user can act on and an unhandled promise rejection. */
export const makeCall = ({ onCall, t, setBusy, setResult, setError }) => async (args) => {
  setBusy(true);
  setError(null);
  setResult(null);          // the previous answer must not sit there as if it were this run's
  try {
    setResult(await onCall(args));
  } catch {
    setError(t('mcp.toolform.callFailed'));
  } finally {
    setBusy(false);
  }
};

/* Whether the Call button is inert, out of the component so the gate is provable. JSON mode is NOT
   field-gated: a half-typed object can only be judged by parseJsonArgs, at press time. */
export const callBlocked = ({ busy, useJson, fields, values }) =>
  busy || (!useJson && !canCall(fields, values));

export function ToolRow({ t, tool, open, onToggle, onCall }) {
  // toolFormFields returns null exactly when the schema is too complex for a flat form, which is
  // the same condition as "JSON is forced" — one call, so the two can never disagree.
  const fields = toolFormFields(tool.inputSchema);
  const forcedJson = fields === null;
  const [jsonMode, setJsonMode] = useState(false);
  const [values, setValues] = useState({});
  const [argsText, setArgsText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const useJson = forcedJson || jsonMode;

  // Re-opening a row starts a fresh attempt: a stale answer or error read as this run's.
  useEffect(() => {
    if (!open) return;
    setValues({}); setArgsText(''); setResult(null); setError(null); setBusy(false);
  }, [open]);

  const run = makeCall({ onCall, t, setBusy, setResult, setError });
  const call = async () => {
    if (!useJson) return run(buildArgs(fields, values));
    const parsed = parseJsonArgs(argsText);
    if (parsed.errorKey) { setResult(null); setError(t(parsed.errorKey)); return; }
    return run(parsed.args);
  };

  const blocked = callBlocked({ busy, useJson, fields, values });

  return (
    <div className="tool-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      {/* A real <button> so the accordion is keyboard-operable and announced as expandable. */}
      <button type="button" aria-expanded={open} onClick={onToggle}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%', padding: 0,
          background: 'none', border: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        <span className="tool-ic">🔧</span>
        <span className="tool-bd" style={{ minWidth: 0, flex: 1 }}>
          <span className="tool-name mono" style={{ display: 'block' }}>{tool.name}</span>
          {tool.description && (
            <span className="faint" style={{ display: 'block', fontSize: 11.5, marginTop: 3, lineHeight: 1.5 }}>{tool.description}</span>
          )}
        </span>
        <span className="faint" style={{ fontSize: 11.5 }} aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
          {forcedJson
            ? <div className="faint" style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }}>{t('mcp.toolform.jsonForced')}</div>
            : <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
                <Button kind="ghost" size="sm" onClick={() => setJsonMode(v => !v)}>
                  {t(jsonMode ? 'mcp.toolform.formMode' : 'mcp.toolform.jsonMode')}
                </Button>
              </div>}

          {useJson && (
            <textarea className="bf-input mono" rows={3} style={{ width: '100%', fontSize: 12.5 }}
              value={argsText} placeholder={t('mcp.tool.args.ph')} aria-label={t('mcp.tool.args.ph')}
              onChange={e => setArgsText(e.target.value)} />
          )}
          {!useJson && fields.length === 0 && (
            <div className="faint" style={{ fontSize: 12.5 }}>{t('mcp.toolform.noargs')}</div>
          )}
          {!useJson && fields.map(f => (
            <FieldInput key={f.name} t={t} field={f} value={values[f.name]}
              onChange={(v) => setValues(prev => ({ ...prev, [f.name]: v }))} />
          ))}

          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            {/* Button owns the in-flight state: swapping the label for an ellipsis would leave the
                button unnamed to a screen reader while the call runs. */}
            <Button kind="gold" size="sm" disabled={blocked} onClick={call}
              loading={busy} loadingLabel={t('mcp.tool.calling')}>{t('mcp.tool.call')}</Button>
          </div>

          {error && <HelpNote>{error}</HelpNote>}
          {result && <ResultPanel t={t} result={result} />}
        </div>
      )}
    </div>
  );
}
