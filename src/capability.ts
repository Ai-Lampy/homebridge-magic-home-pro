import type { Capability, ColorControlProfile } from './types.js';

const profiles: Readonly<Record<Exclude<ColorControlProfile, 'auto'>, Capability>> = {
  rgb: 'rgb',
  rgbw: 'rgbw',
  rgbww: 'rgbw',
  rgbcct: 'rgbcct',
  rgbwcct: 'rgbcct',
  rgbwwcw: 'rgbcct',
};

export function normalizeColorOrder(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const order = value.toUpperCase().replace(/[^RGBWC]/g, '');
  if (order.length < 1 || order.length > 5 || new Set(order).size !== order.length) return undefined;
  return order;
}

export function effectiveCapability(
  detected: Capability,
  colorControl: ColorControlProfile = 'auto',
  forceCct = false,
): Capability {
  let capability = colorControl === 'auto' ? detected : profiles[colorControl];
  if (forceCct) {
    capability = ['rgb', 'rgbw', 'rgbcct'].includes(capability) ? 'rgbcct' : 'cct';
  }
  return capability;
}

export function remapFromDeviceOrder(values: readonly number[], colorOrder?: string): [number, number, number, number, number] {
  const order = normalizeColorOrder(colorOrder) ?? 'RGBWC';
  const logical: Record<string, number> = { R: 0, G: 0, B: 0, W: 0, C: 0 };
  for (let index = 0; index < Math.min(values.length, order.length); index++) {
    logical[order[index]!] = values[index] ?? 0;
  }
  return [logical.R!, logical.G!, logical.B!, logical.W!, logical.C!];
}

export function remapToDeviceOrder(values: readonly number[], colorOrder?: string): [number, number, number, number, number] {
  const order = normalizeColorOrder(colorOrder) ?? 'RGBWC';
  const logical: Readonly<Record<string, number>> = {
    R: values[0] ?? 0,
    G: values[1] ?? 0,
    B: values[2] ?? 0,
    W: values[3] ?? 0,
    C: values[4] ?? 0,
  };
  const physical = [0, 0, 0, 0, 0];
  for (let index = 0; index < order.length; index++) physical[index] = logical[order[index]!] ?? 0;
  return physical as [number, number, number, number, number];
}
