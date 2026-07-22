import { describe, it, expect } from 'vitest';
import { FieldInput, ResultPanel, parseJsonArgs, makeCall } from './ToolRow.jsx';

const flat = (n, out = []) => {
  if (n == null || typeof n === 'boolean') return out;
  out.push(n);
  if (typeof n === 'object') {
    const k = n.props?.children;
    (Array.isArray(k) ? k : [k]).forEach((c) => flat(c, out));
  }
  return out;
};
const t = (k) => k;
const strings = (el) => flat(el).filter((n) => typeof n === 'string');

describe('FieldInput', () => {
  it('string field -> text input with the field name as label; required mark present', () => {
    const el = FieldInput({ t, field: { name: 'message', type: 'string', required: true, description: 'd' }, value: '', onChange: () => {} });
    const nodes = flat(el);
    expect(nodes.some((n) => n.type === 'input' && n.props?.type === 'text')).toBe(true);
    expect(nodes.filter((n) => typeof n === 'string')).toContain('message');
    expect(nodes.filter((n) => typeof n === 'string')).toContain('mcp.toolform.required');
  });
  it('number -> input[type=number]; boolean -> a Switch-like control; enum -> select with options', () => {
    expect(flat(FieldInput({ t, field: { name: 'n', type: 'number', required: false, description: '' }, value: '', onChange: () => {} }))
      .some((n) => n.props?.type === 'number')).toBe(true);
    const enumEl = FieldInput({ t, field: { name: 'm', type: 'enum', enumValues: ['a', 'b'], required: false, description: '' }, value: 'a', onChange: () => {} });
    expect(flat(enumEl).some((n) => n.type === 'select' || n.props?.options)).toBe(true);
  });

  // --- beyond the brief: the accessibility rules the form has to keep while it is generated ---
  it('an optional field carries no required mark (the mark means something)', () => {
    const el = FieldInput({ t, field: { name: 'message', type: 'string', required: false, description: '' }, value: '', onChange: () => {} });
    expect(strings(el)).not.toContain('mcp.toolform.required');
  });
  it('the text label is tied to its input by htmlFor/id, not just placed next to it', () => {
    const nodes = flat(FieldInput({ t, field: { name: 'message', type: 'string', required: false, description: '' }, value: '', onChange: () => {} }));
    const label = nodes.find((n) => n.type === 'label');
    const input = nodes.find((n) => n.type === 'input');
    expect(label.props.htmlFor).toBe(input.props.id);
    expect(input.props.placeholder).toBeUndefined();   // a placeholder is not a label
  });
  it('the enum control is name-associated too (a Select renders a button, so htmlFor cannot reach it)', () => {
    const nodes = flat(FieldInput({ t, field: { name: 'mode', type: 'enum', enumValues: ['a'], required: false, description: '' }, value: 'a', onChange: () => {} }));
    const group = nodes.find((n) => n.props?.role === 'group');
    expect(group).toBeTruthy();
    expect(nodes.some((n) => n.props?.id === group.props['aria-labelledby'])).toBe(true);
  });
  it("a field's description is wired as help text, not dropped", () => {
    const nodes = flat(FieldInput({ t, field: { name: 'x', type: 'string', required: false, description: 'what it does' }, value: '', onChange: () => {} }));
    const input = nodes.find((n) => n.type === 'input');
    expect(nodes.some((n) => n.props?.id === input.props['aria-describedby'])).toBe(true);
    expect(nodes.filter((n) => typeof n === 'string')).toContain('what it does');
  });
  it('boolean hands the switch a real boolean, and edits report booleans back', () => {
    const seen = [];
    const nodes = flat(FieldInput({ t, field: { name: 'flag', type: 'boolean', required: false, description: '' }, value: undefined, onChange: (v) => seen.push(v) }));
    const sw = nodes.find((n) => n.props && 'checked' in n.props);
    expect(sw.props.checked).toBe(false);          // undefined would make the switch uncontrolled
    sw.props.onChange(true);
    expect(seen).toEqual([true]);
  });
  it('a text edit reports the typed string', () => {
    const seen = [];
    const input = flat(FieldInput({ t, field: { name: 'x', type: 'string', required: false, description: '' }, value: '', onChange: (v) => seen.push(v) }))
      .find((n) => n.type === 'input');
    input.props.onChange({ target: { value: 'hi' } });
    expect(seen).toEqual(['hi']);
  });
});

describe('ResultPanel', () => {
  it('all-text result renders the joined text (not raw JSON) plus the collapsed raw view', () => {
    const texts = flat(ResultPanel({ t, result: { content: [{ type: 'text', text: 'Echo: hi' }] } }))
      .filter((n) => typeof n === 'string');
    expect(texts).toContain('Echo: hi');
    expect(texts).toContain('mcp.toolform.resultRaw');
  });
  it('isError result carries warn styling', () => {
    const el = ResultPanel({ t, result: { isError: true, content: [{ type: 'text', text: 'boom' }] } });
    expect(flat(el).some((n) => typeof n.props?.className === 'string' && n.props.className.includes('warn'))).toBe(true);
  });

  // --- beyond the brief ---
  it('a plain result is NOT styled as a failure', () => {
    const el = ResultPanel({ t, result: { content: [{ type: 'text', text: 'ok' }] } });
    expect(flat(el).some((n) => typeof n.props?.className === 'string' && n.props.className.includes('warn'))).toBe(false);
  });
  it('an error result says so in words, so the failure is not colour alone', () => {
    const texts = strings(ResultPanel({ t, result: { isError: true, content: [{ type: 'text', text: 'boom' }] } }));
    expect(texts).toContain('mcp.toolform.resultError');
    expect(texts).not.toContain('mcp.toolform.result');
  });
  it('a non-text result falls back to raw JSON, with no second copy behind the collapse', () => {
    const el = ResultPanel({ t, result: { content: [{ type: 'image', data: 'AAA' }] } });
    const texts = strings(el);
    expect(texts.join(' ')).toContain('"image"');
    expect(texts).not.toContain('mcp.toolform.resultRaw');
  });
  it('the raw view is a collapsed native <details> (keyboard-operable)', () => {
    const details = flat(ResultPanel({ t, result: { content: [{ type: 'text', text: 'hi' }] } })).find((n) => n.type === 'details');
    expect(details).toBeTruthy();
    expect(flat(details).some((n) => n.type === 'summary')).toBe(true);
    expect(strings(details).join(' ')).toContain('"text"');   // the raw payload, not the rendered text
  });
});

/* The JSON escape hatch's parse rule, lifted out of the component so the two behaviours the old
   screen proved matter can be pinned without a renderer: bad JSON issues NO call, and an empty
   box sends {} (the manager expects an object, never null). */
describe('parseJsonArgs', () => {
  it('an empty box means "no arguments" -> {}, never null', () => {
    expect(parseJsonArgs('')).toEqual({ args: {} });
    expect(parseJsonArgs('   ')).toEqual({ args: {} });
  });
  it('valid JSON object passes through', () => {
    expect(parseJsonArgs('{"text":"hi"}')).toEqual({ args: { text: 'hi' } });
  });
  it('malformed JSON reports the localized error and yields no args to send', () => {
    const out = parseJsonArgs('{text:');
    expect(out.errorKey).toBe('mcp.tool.badjson');
    expect(out.args).toBeUndefined();
  });
  it('valid JSON that is not an object is rejected too (arguments must be an object)', () => {
    expect(parseJsonArgs('5').errorKey).toBe('mcp.tool.badjson');
    expect(parseJsonArgs('null').errorKey).toBe('mcp.tool.badjson');
    expect(parseJsonArgs('[1,2]').errorKey).toBe('mcp.tool.badjson');
  });
});

/* The call itself. The parent does NOT catch onCall's rejection, so this is the only place that can. */
describe('makeCall', () => {
  const spies = () => {
    const s = { result: [], error: [], busy: [] };
    return [s, { setResult: (v) => s.result.push(v), setError: (v) => s.error.push(v), setBusy: (v) => s.busy.push(v) }];
  };

  it('a resolved call stores the result and clears busy', async () => {
    const [s, set] = spies();
    await makeCall({ onCall: async () => ({ content: [] }), t, ...set })({ a: 1 });
    expect(s.result).toEqual([null, { content: [] }]);   // the previous answer is cleared before the new one lands
    expect(s.busy).toEqual([true, false]);
    expect(s.error).toEqual([null]);
  });
  it('a rejected call surfaces a localized error instead of throwing', async () => {
    const [s, set] = spies();
    await expect(makeCall({ onCall: async () => { throw new Error('boom'); }, t, ...set })({}))
      .resolves.toBeUndefined();
    expect(s.error).toEqual([null, 'mcp.toolform.callFailed']);
    expect(s.busy).toEqual([true, false]);               // the Call button is released even on failure
  });
  it('passes the args object through untouched', async () => {
    const [, set] = spies();
    let got = null;
    await makeCall({ onCall: async (a) => { got = a; return {}; }, t, ...set })({});
    expect(got).toEqual({});
  });
});
