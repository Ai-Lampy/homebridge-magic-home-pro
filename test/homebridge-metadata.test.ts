import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Homebridge plugin metadata', () => {
  it('declares the package fields used by Homebridge', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg).toMatchObject({
      name: 'homebridge-magic-home-pro',
      displayName: 'Magic Home Pro',
      version: '0.4.3',
      main: 'dist/index.js',
      engines: { homebridge: '^2.0.0', node: '^22.10.0 || ^24.0.0 || ^26.0.0' },
    });
    expect(pkg.keywords).toEqual(expect.arrayContaining(['homebridge-plugin', 'supports-hap']));
    expect(pkg.keywords).not.toContain('supports-matter');
    expect(pkg.devDependencies.homebridge).toBe('^2.3.0');
    for (const field of ['dependencies', 'optionalDependencies', 'bundledDependencies', 'peerDependencies']) {
      const declaration = pkg[field];
      if (Array.isArray(declaration)) expect(declaration).not.toContain('homebridge');
      else expect(declaration ?? {}).not.toHaveProperty('homebridge');
    }
  });

  it('uses a strict object schema with the expected platform identity', () => {
    const configSchema = JSON.parse(fs.readFileSync('config.schema.json', 'utf8'));
    expect(configSchema).toMatchObject({
      pluginAlias: 'MagicHomePro',
      pluginType: 'platform',
      singular: true,
      customUi: true,
      schema: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
      },
    });
    expect(configSchema.schema.properties.devices.items.properties.colorOrder).not.toHaveProperty('default');
    expect(configSchema.schema.properties.devices.items.properties.detectedCapability.enum).toContain('dimmer');
  });

  it('publishes a Homebridge UI fragment rather than a complete HTML document', () => {
    const ui = fs.readFileSync('homebridge-ui/public/index.html', 'utf8');
    expect(ui).not.toMatch(/<(?:html|head|body)\b/i);
    expect(ui).not.toContain('<textarea');
    expect(ui).toContain('homebridge.getPluginConfig()');
    expect(ui).toContain('Scan for Devices');
    expect(ui).toContain('Add Device');
    expect(ui).toContain('Devices');
    expect(ui).toContain('Remove Device');
    expect(ui).toContain('Confirm Remove');
    expect(ui).not.toContain('window.confirm');
    expect(ui).toContain('Off (use controller/app setting)');
    expect(ui).toContain('Detected control:');
    expect(ui).toContain('homebridge.getCachedAccessories()');
    expect(ui).toContain('background: #fff');
    for (const field of ['Device Name', 'Location / Room label', 'Device Type', 'CCT Control', 'Colour Control', 'Colour Order']) {
      expect(ui).toContain(field);
    }
    for (const profile of ['RGB', 'RGBW', 'RGBWW', 'RGBCCT', 'RGBWCCT', 'RGBWWCW']) {
      expect(ui).toContain(profile);
    }
    expect(ui).toContain('homebridge.savePluginConfig()');
  });

  it('provides release notes for the package version', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const notes = execFileSync(process.execPath, ['scripts/extract-release-notes.mjs', pkg.version], {
      encoding: 'utf8',
    });
    expect(notes.trim().length).toBeGreaterThan(0);
    const workflow = fs.readFileSync('.github/workflows/publish-npm.yml', 'utf8');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('--notes-file release-notes.md');
  });

  it('tests every supported Node.js version on each GitHub update', () => {
    const workflow = fs.readFileSync('.github/workflows/test-node.yml', 'utf8');
    expect(workflow).toMatch(/\bpush:/);
    expect(workflow).toMatch(/\bpull_request:/);
    for (const version of ['22', '24', '26']) expect(workflow).toContain(`- ${version}`);
    const publishWorkflow = fs.readFileSync('.github/workflows/publish-npm.yml', 'utf8');
    expect(publishWorkflow).toContain('needs: test-node-support');
  });
});
