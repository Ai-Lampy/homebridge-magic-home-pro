import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../src/config.js';
import { DEVICE_RESCAN_DELAY_MS, DEVICE_SCAN_ATTEMPTS } from '../src/settings.js';

describe('discovery lifecycle policy', () => {
  it('has five attempts ten seconds apart and no perpetual interval setting', () => {
    expect(DEVICE_SCAN_ATTEMPTS).toBe(5);
    expect(DEVICE_RESCAN_DELAY_MS).toBe(10_000);
    expect(normalizeConfig({ discovery: { intervalSeconds: 1 } }).discovery).not.toHaveProperty('intervalSeconds');
    expect(fs.readFileSync('src/platform.ts', 'utf8')).not.toContain('setInterval(');
  });
});
