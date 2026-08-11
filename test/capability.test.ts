import { describe, expect, it } from 'vitest';
import { effectiveCapability, normalizeColorOrder } from '../src/capability.js';

describe('capability overrides', () => {
  it('maps UI colour profiles to runtime capabilities', () => {
    expect(effectiveCapability('dimmer', 'rgb')).toBe('rgb');
    expect(effectiveCapability('rgb', 'rgbww')).toBe('rgbw');
    expect(effectiveCapability('dimmer', 'rgbwwcw')).toBe('rgbcct');
  });

  it('can force CCT control on a controller that does not report it', () => {
    expect(effectiveCapability('dimmer', 'auto', true)).toBe('cct');
    expect(effectiveCapability('rgb', 'auto', true)).toBe('rgbcct');
  });

  it('accepts only unique physical channel identifiers', () => {
    expect(normalizeColorOrder('g-r-b-w-c')).toBe('GRBWC');
    expect(normalizeColorOrder('RRG')).toBeUndefined();
  });
});
