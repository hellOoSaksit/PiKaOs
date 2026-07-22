import { describe, it, expect } from 'vitest';
import {
  toolFormFields, buildArgs, canCall,
  filterTools, presetToDef, resultText, errorKey,
  statusMeta, isRunning, showToolSearch, replaceTargets, savePlan, saveErrorNote, isConsentDenied,
} from './LocalMcp.logic.js';

describe('toolFormFields', () => {
  it('maps string/number/integer/boolean and required flags', () => {
    const schema = {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'text to echo' },
        count: { type: 'integer' },
        ratio: { type: 'number' },
        loud: { type: 'boolean' },
      },
      required: ['message'],
    };
    expect(toolFormFields(schema)).toEqual([
      { name: 'message', type: 'string', required: true, description: 'text to echo' },
      { name: 'count', type: 'number', required: false, description: '' },
      { name: 'ratio', type: 'number', required: false, description: '' },
      { name: 'loud', type: 'boolean', required: false, description: '' },
    ]);
  });
  it('maps enum properties to enum fields with string values', () => {
    const schema = { type: 'object', properties: { mode: { enum: ['a', 'b'] } }, required: [] };
    expect(toolFormFields(schema)).toEqual([
      { name: 'mode', type: 'enum', enumValues: ['a', 'b'], required: false, description: '' },
    ]);
  });
  it('returns null (JSON mode) for nested objects, arrays, $ref, and missing/odd schemas', () => {
    expect(toolFormFields({ type: 'object', properties: { o: { type: 'object' } } })).toBe(null);
    expect(toolFormFields({ type: 'object', properties: { a: { type: 'array' } } })).toBe(null);
    expect(toolFormFields({ type: 'object', properties: { r: { $ref: '#/x' } } })).toBe(null);
    expect(toolFormFields(undefined)).toBe(null);
    expect(toolFormFields({ type: 'string' })).toBe(null);
  });
  it('empty properties object -> empty field list (a no-arg tool gets a bare Call button)', () => {
    expect(toolFormFields({ type: 'object', properties: {} })).toEqual([]);
  });
});

describe('replaceTargets', () => {
  const servers = [{ id: 'fs' }, { id: 'memory' }];
  it('a brand-new id replaces nothing', () => {
    expect(replaceTargets(servers, 'weather', undefined)).toEqual([]);
    expect(replaceTargets([], 'fs', undefined)).toEqual([]);
  });
  it('an ADD whose id collides with a stored def is a replace (registry.add upserts)', () => {
    expect(replaceTargets(servers, 'fs', undefined)).toEqual(['fs']);
  });
  it('an edit keeps its own target, even when it renames the id', () => {
    expect(replaceTargets(servers, 'files', 'fs')).toEqual(['fs']);
  });
  it('an edit that does not rename yields that id once, not twice', () => {
    expect(replaceTargets(servers, 'fs', 'fs')).toEqual(['fs']);
  });
  /* The bug: the id field stays editable while editing, so renaming `fs` onto the live `memory`
     both drops `fs` AND upserts over `memory` — reaping only `fs` leaves memory's child running
     the old command under a def that now describes fs. */
  it('renaming one server onto another live id displaces BOTH', () => {
    expect(replaceTargets(servers, 'memory', 'fs').sort()).toEqual(['fs', 'memory']);
  });
});

describe('savePlan', () => {
  const servers = [{ id: 'fs' }, { id: 'memory' }];
  const statuses = { fs: { status: 'stopped' }, memory: { status: 'ready' } };
  it('a new server reaps nothing and owes no restart', () => {
    expect(savePlan(servers, statuses, 'weather', undefined)).toEqual({ targets: [], wasRunning: false });
  });
  it('a restart is owed when ANY displaced server was live, not just the edited one', () => {
    const plan = savePlan(servers, statuses, 'memory', 'fs');
    expect(plan.targets.sort()).toEqual(['fs', 'memory']);
    expect(plan.wasRunning).toBe(true);          // `fs` was stopped; `memory` was ready
  });
  it('no restart when every displaced server was already stopped', () => {
    expect(savePlan(servers, statuses, 'fs', 'fs')).toEqual({ targets: ['fs'], wasRunning: false });
  });
  it('tolerates a missing status map (first render, before statuses load)', () => {
    expect(savePlan(servers, undefined, 'fs', undefined)).toEqual({ targets: ['fs'], wasRunning: false });
  });
});

describe('saveErrorNote', () => {
  it('a declined consent dialog raises no banner — the def is already stored', () => {
    expect(saveErrorNote(new Error("Error invoking remote method 'mcp:start': Error: consent denied"))).toBe(null);
  });
  it('any other failure becomes the localized save banner, raw text kept underneath', () => {
    expect(saveErrorNote(new Error('EACCES'))).toEqual({ key: 'mcp.err.action.save', detail: 'EACCES' });
    expect(saveErrorNote({})).toEqual({ key: 'mcp.err.action.save', detail: null });
  });
});

describe('isConsentDenied', () => {
  it('matches the marker inside the message Electron IPC wraps it in', () => {
    expect(isConsentDenied(new Error('consent denied'))).toBe(true);
    expect(isConsentDenied(new Error("Error invoking remote method 'mcp:start': Error: consent denied"))).toBe(true);
  });
  it('is false for any other failure, and for a message-less throw', () => {
    expect(isConsentDenied(new Error('spawn ENOENT'))).toBe(false);
    expect(isConsentDenied(undefined)).toBe(false);
    expect(isConsentDenied({})).toBe(false);
  });
});

describe('buildArgs / canCall', () => {
  const fields = [
    { name: 'message', type: 'string', required: true, description: '' },
    { name: 'count', type: 'number', required: false, description: '' },
    { name: 'loud', type: 'boolean', required: false, description: '' },
  ];
  it('parses numbers, keeps booleans real, omits empty optionals', () => {
    expect(buildArgs(fields, { message: 'hi', count: '3', loud: true }))
      .toEqual({ message: 'hi', count: 3, loud: true });
    expect(buildArgs(fields, { message: 'hi', count: '' })).toEqual({ message: 'hi' });
    expect(buildArgs([], {})).toEqual({});
  });
  it('drops an unparseable number rather than sending NaN', () => {
    expect(buildArgs(fields, { message: 'hi', count: 'abc' })).toEqual({ message: 'hi' });
  });
  it('canCall requires every required field non-empty', () => {
    expect(canCall(fields, {})).toBe(false);
    expect(canCall(fields, { message: '  ' })).toBe(false);
    expect(canCall(fields, { message: 'hi' })).toBe(true);
  });
});

describe('filterTools', () => {
  const tools = [
    { name: 'echo', description: 'Echoes back the input' },
    { name: 'get-sum', description: 'Adds two numbers' },
  ];
  it('matches name or description, case-insensitive; empty query returns all', () => {
    expect(filterTools(tools, '')).toEqual(tools);
    expect(filterTools(tools, 'ECHO')).toEqual([tools[0]]);
    expect(filterTools(tools, 'numbers')).toEqual([tools[1]]);
    expect(filterTools(tools, 'zzz')).toEqual([]);
  });
});

describe('presetToDef', () => {
  const preset = {
    id: 'filesystem', icon: '📁', command: 'npx',
    argsTemplate: ['-y', '@modelcontextprotocol/server-filesystem', '{{folder}}'],
    params: [{ name: 'folder', type: 'path' }], secret: null,
  };
  it('interpolates params and carries the localized label', () => {
    expect(presetToDef(preset, { folder: 'C:\\data' }, 'Filesystem')).toEqual({
      id: 'filesystem', label: 'Filesystem', command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\data'],
    });
  });
  it('adds secretKeys when the preset declares a secret', () => {
    const withSecret = { ...preset, secret: { key: 'API_TOKEN' } };
    expect(presetToDef(withSecret, { folder: 'x' }, 'FS').secretKeys).toEqual(['API_TOKEN']);
  });
  it('drops an arg that interpolates to empty (guarded upstream by canInstall anyway)', () => {
    expect(presetToDef(preset, { folder: '  ' }, 'FS').args)
      .toEqual(['-y', '@modelcontextprotocol/server-filesystem']);
  });
});

describe('resultText', () => {
  it('joins all-text content; null when mixed or absent', () => {
    expect(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a\nb');
    expect(resultText({ content: [{ type: 'image', data: 'x' }] })).toBe(null);
    expect(resultText({})).toBe(null);
  });
});

describe('errorKey', () => {
  it('maps known tokens and falls back to generic', () => {
    expect(errorKey('node-missing')).toBe('mcp.err.node-missing');
    expect(errorKey('handshake-timeout')).toBe('mcp.err.handshake-timeout');
    expect(errorKey('weird')).toBe('mcp.err.generic');
    expect(errorKey(null)).toBe('mcp.err.generic');
  });
});

describe('statusMeta / isRunning', () => {
  const ALL = ['ready', 'running', 'starting', 'stopped', 'error'];
  it('every FSM status maps to a badge class, a label key and a hint key', () => {
    for (const s of ALL) {
      const m = statusMeta(s);
      expect(m.cls).toBeTruthy();
      expect(m.key).toBe(`mcp.status.${s}`);
      expect(m.hint).toBe(`mcp.status.${s}.hint`);
    }
  });
  it('an unknown status falls back to stopped, so a badge is never blank', () => {
    expect(statusMeta(undefined)).toEqual(statusMeta('stopped'));
    expect(statusMeta('nonsense')).toEqual(statusMeta('stopped'));
  });
  it('isRunning is true for exactly the running-ish statuses', () => {
    expect(ALL.filter((s) => isRunning(s))).toEqual(['ready', 'running', 'starting']);
    expect(isRunning(undefined)).toBe(false);
  });
});

describe('showToolSearch', () => {
  it('appears only once the list stops being scannable by eye', () => {
    expect(showToolSearch(0)).toBe(false);
    expect(showToolSearch(6)).toBe(false);
    expect(showToolSearch(7)).toBe(true);
  });
});
