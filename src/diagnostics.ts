import { discoverDevices, type DiscoveryLogger } from './discovery.js';
import { MagicHomeTransport } from './transport.js';
import type { DiagnosticAttempt, DiscoveryConfig, DiscoveredDevice } from './types.js';

export async function diagnosticScan(
  config: DiscoveryConfig,
  known: DiscoveredDevice[],
  logger: DiscoveryLogger,
): Promise<DiagnosticAttempt[]> {
  const discovered = config.enabled ? await discoverDevices(config, logger) : [];
  const candidates = new Map<string, DiscoveredDevice>();
  for (const device of [...known, ...discovered]) candidates.set(device.mac ?? device.host, device);
  return Promise.all([...candidates.values()].map(async device => {
    const base: DiagnosticAttempt = {
      host: device.host,
      source: device.sources.join(', '),
      tcpReachable: false,
      protocols: ['818a8b', 'ef0177'],
      ...(device.model ? { model: device.model } : {}),
      ...(device.mac ? { mac: device.mac } : {}),
    };
    try {
      const state = await new MagicHomeTransport(device.host, { timeoutMs: config.timeoutMs }).queryState();
      return { ...base, tcpReachable: true, firmwareBytes: state.firmwareBytes, capability: state.capability };
    } catch (error) {
      return { ...base, error: (error as Error).message };
    }
  }));
}
