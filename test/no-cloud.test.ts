import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('privacy boundary', () => {
  it('contains no cloud endpoints, login, token collection, or region filters', () => {
    const source = fs.readdirSync(path.resolve('src')).filter(file => file.endsWith('.ts'))
      .map(file => fs.readFileSync(path.resolve('src', file), 'utf8')).join('\n');
    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toMatch(/cloud.*(host|api)|account.*login|region.*allowlist|cloudToken/i);
  });
});
