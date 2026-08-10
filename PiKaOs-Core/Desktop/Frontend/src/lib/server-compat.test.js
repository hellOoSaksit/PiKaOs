import { it, expect } from 'vitest';
import { serverTooOld, MIN_SERVER_VERSION } from './server-compat.js';

it('flags only older servers', () => {
  expect(serverTooOld('0.0.9', '0.1.0')).toBe(true);
  expect(serverTooOld('0.1.0', '0.1.0')).toBe(false);   // the minimum is inclusive
  expect(serverTooOld('1.0.0', '0.1.0')).toBe(false);
});

it('compares numbers, not strings', () => {
  // '0.10.0' sorts BEFORE '0.9.0' as text — a string compare would tell an up-to-date server it is
  // out of date, and the fix it names is running a host script on the wrong machine.
  expect(serverTooOld('0.10.0', '0.9.0')).toBe(false);
  expect(serverTooOld('0.9.0', '0.10.0')).toBe(true);
  expect(serverTooOld('2.0.0', '10.0.0')).toBe(true);
});

it('stays quiet on garbage', () => {
  expect(serverTooOld(undefined, '0.1.0')).toBe(false);
  expect(serverTooOld('weird', '0.1.0')).toBe(false);
  expect(serverTooOld('', '0.1.0')).toBe(false);
  expect(serverTooOld('1.2.3.4', '0.1.0')).toBe(false);
  // parseInt would read this as 1 and compare it as a version; a strict digit test cannot.
  expect(serverTooOld('0abc.0.0', '0.1.0')).toBe(false);
});

it('reads the shapes a real /version answer arrives in', () => {
  expect(serverTooOld('v0.0.9', '0.1.0')).toBe(true);       // leading v
  expect(serverTooOld('0.0', '0.1.0')).toBe(true);          // short form = 0.0.0
  expect(serverTooOld('0.1.0-rc1', '0.1.0')).toBe(false);   // prerelease of the minimum is not older
});

it('ships a minimum this build can actually state', () => {
  expect(MIN_SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(serverTooOld(MIN_SERVER_VERSION)).toBe(false);
});
