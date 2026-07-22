import { describe, it, expect } from 'vitest';
import {
  toolFormFields, needsJsonMode, buildArgs, canCall,
  filterTools, presetToDef, resultText, errorKey,
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

describe('needsJsonMode', () => {
  it('is the null-check over toolFormFields', () => {
    expect(needsJsonMode(undefined)).toBe(true);
    expect(needsJsonMode({ type: 'object', properties: { s: { type: 'string' } } })).toBe(false);
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
