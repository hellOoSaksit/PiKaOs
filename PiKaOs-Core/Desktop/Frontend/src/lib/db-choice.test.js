import { it, expect } from 'vitest';
import { canSaveDb } from './db-choice.js';

it('bundled may save immediately — no probe needed for the built-in DSN', () => {
  expect(canSaveDb('bundled', 'idle')).toBe(true);
  expect(canSaveDb('bundled', 'failed')).toBe(true);
});

it('external providers stay disabled until a test succeeds', () => {
  expect(canSaveDb('pg', 'idle')).toBe(false);
  expect(canSaveDb('pg', 'testing')).toBe(false);
  expect(canSaveDb('pg', 'failed')).toBe(false);
  expect(canSaveDb('supabase', 'idle')).toBe(false);
});

it('external providers unlock save once the test passes', () => {
  expect(canSaveDb('pg', 'ok')).toBe(true);
  expect(canSaveDb('supabase', 'ok')).toBe(true);
});
