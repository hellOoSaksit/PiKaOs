import { it, expect } from 'vitest';
import { localInputToUtcIso, utcIsoToLocalLabel, localNowInputValue } from './schedule-time.js';

it('converts a local datetime-local value to a UTC iso and back to a label', () => {
  const iso = localInputToUtcIso('2030-01-02T03:04');
  expect(iso).toMatch(/Z$/);
  expect(utcIsoToLocalLabel(iso)).toBeTruthy();
});

it('reads the input as LOCAL time, not as UTC', () => {
  // The bug this guards: treating "2030-01-02T03:04" as already-UTC schedules the switch at the
  // wrong hour by the machine's offset — silently correct wherever the offset happens to be zero.
  const iso = localInputToUtcIso('2030-01-02T03:04');
  expect(new Date(iso).getHours()).toBe(3);
  expect(new Date(iso).getMinutes()).toBe(4);
});

it('returns null for garbage input', () => {
  expect(localInputToUtcIso('not-a-date')).toBe(null);
  expect(localInputToUtcIso('')).toBe(null);
});

it('never renders Invalid Date over a real schedule row', () => {
  expect(utcIsoToLocalLabel('nonsense')).toBe('nonsense');
  expect(utcIsoToLocalLabel(undefined)).toBe('');
});

it('formats the min attribute in the shape datetime-local requires', () => {
  expect(localNowInputValue(new Date(2030, 0, 2, 3, 4))).toBe('2030-01-02T03:04');
  expect(localNowInputValue(new Date(2030, 10, 20, 13, 40))).toBe('2030-11-20T13:40');
});
