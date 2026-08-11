import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type Listener = () => void | Promise<void>;

class FakeClassList {
  private readonly values = new Set<string>();
  add(...values: string[]): void { values.forEach(value => this.values.add(value)); }
  remove(...values: string[]): void { values.forEach(value => this.values.delete(value)); }
  toggle(value: string, force?: boolean): void {
    if (force ?? !this.values.has(value)) this.values.add(value); else this.values.delete(value);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly listeners = new Map<string, Listener>();
  parent?: FakeElement;
  className = '';
  textContent = '';
  value = '';
  type = '';
  checked = false;
  hidden = false;
  disabled = false;
  required = false;
  readOnly = false;
  selected = false;

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
      if (this.tagName === 'select' && child.selected) this.value = child.value;
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0);
    this.append(...children);
  }

  addEventListener(name: string, listener: Listener): void { this.listeners.set(name, listener); }
  setAttribute(): void { /* Attribute values are not needed by these behavioural tests. */ }
  async dispatch(name: string): Promise<void> { await this.listeners.get(name)?.(); }
}

const flush = async (): Promise<void> => {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
};

function descendants(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(descendants)];
}

function uiHarness(config: Record<string, unknown>, report: Record<string, unknown>[] = []) {
  const ids = [
    'panel-scan', 'panel-devices', 'tab-scan', 'tab-devices', 'config-status', 'scan-status', 'scan',
    'scan-results', 'configured-devices',
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id === 'scan' || id.startsWith('tab-') ? 'button' : 'div')]));
  const updates: Record<string, unknown>[][] = [];
  let saves = 0;
  const homebridge = {
    getPluginConfig: async () => [structuredClone(config)],
    getCachedAccessories: async () => [],
    updatePluginConfig: async (blocks: Record<string, unknown>[]) => { updates.push(structuredClone(blocks)); },
    savePluginConfig: async () => { saves += 1; },
    request: async () => structuredClone(report),
    showSpinner: () => undefined,
    hideSpinner: () => undefined,
  };
  const document = {
    querySelector: (selector: string) => elements.get(selector.replace(/^#/, '')),
    createElement: (tagName: string) => new FakeElement(tagName),
    createTextNode: (text: string) => {
      const node = new FakeElement('#text');
      node.textContent = text;
      return node;
    },
  };
  const html = fs.readFileSync('homebridge-ui/public/index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error('Config UI script was not found');
  vm.runInNewContext(script, { document, homebridge, Set, Number, String, Boolean, Array, Object, Error });
  const all = (id: string): FakeElement[] => descendants(elements.get(id)!);
  const button = (id: string, text: string): FakeElement => {
    const match = all(id).find(element => element.tagName === 'button' && element.textContent === text);
    if (!match) throw new Error(`Button “${text}” was not rendered`);
    return match;
  };
  return { elements, updates, get saves() { return saves; }, all, button };
}

describe('custom Config UI behaviour', () => {
  it('scans and adds a reviewed device to the plugin configuration', async () => {
    const ui = uiHarness(
      { platform: 'MagicHomePro', name: 'Magic Home Pro', devices: [], excludedDevices: [] },
      [{ host: '192.168.1.20', mac: 'AA:BB:CC:DD:EE:FF', model: 'AK001', capability: 'dimmer', tcpReachable: true }],
    );
    await flush();
    await ui.elements.get('scan')!.dispatch('click');
    await ui.button('scan-results', 'Add Device').dispatch('click');

    expect(ui.saves).toBe(1);
    expect(ui.updates.at(-1)?.[0].devices).toEqual([expect.objectContaining({
      host: '192.168.1.20', mac: 'AABBCCDDEEFF', detectedCapability: 'dimmer',
    })]);
  });

  it('reveals override choices only when enabled, saves edits, and removes the device', async () => {
    const ui = uiHarness({
      platform: 'MagicHomePro',
      name: 'Magic Home Pro',
      excludedDevices: [],
      devices: [{ name: 'Kitchen', host: '192.168.1.20', mac: 'AABBCCDDEEFF', detectedCapability: 'rgbw' }],
    });
    await flush();
    await ui.elements.get('tab-devices')!.dispatch('click');
    await ui.button('configured-devices', 'Edit Details').dispatch('click');

    const checkboxes = ui.all('configured-devices').filter(element => element.type === 'checkbox');
    const selects = ui.all('configured-devices').filter(element => element.tagName === 'select');
    const textInputs = ui.all('configured-devices').filter(element => element.tagName === 'input' && element.type === 'text');
    expect(selects[1]?.parent?.parent?.hidden).toBe(true);
    expect(selects[2]?.parent?.parent?.hidden).toBe(true);

    textInputs[2]!.value = '999.1.1.1';
    await ui.button('configured-devices', 'Save Changes').dispatch('click');
    expect(ui.updates).toHaveLength(0);
    expect(ui.elements.get('config-status')!.textContent).toContain('valid IPv4 address');
    textInputs[2]!.value = '192.168.1.20';

    checkboxes[1]!.checked = true;
    await checkboxes[1]!.dispatch('change');
    checkboxes[2]!.checked = true;
    await checkboxes[2]!.dispatch('change');
    expect(selects[1]?.parent?.parent?.hidden).toBe(false);
    expect(selects[2]?.parent?.parent?.hidden).toBe(false);

    await ui.button('configured-devices', 'Save Changes').dispatch('click');
    expect(ui.updates.at(-1)?.[0].devices).toEqual([expect.objectContaining({
      colorControlOverride: true,
      colorControl: 'rgbw',
      colorOrder: 'RGBW',
    })]);

    await ui.button('configured-devices', 'Remove Device').dispatch('click');
    await ui.button('configured-devices', 'Confirm Remove Kitchen').dispatch('click');
    expect(ui.updates.at(-1)?.[0].devices).toEqual([]);
    expect(ui.updates.at(-1)?.[0].excludedDevices).toEqual([{ host: '192.168.1.20', mac: 'AABBCCDDEEFF' }]);
  });
});
