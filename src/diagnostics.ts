import {
  discoverAllCandidates, type CandidateDiscoveryOptions, type DiscoveryLogger,
} from './discovery.js';
import { MagicHomeTransport } from './transport.js';
import type { DeviceState, DiagnosticAttempt, DiscoveryConfig, DiscoveredDevice } from './types.js';

export interface DiagnosticScanOptions {
  discovery?: CandidateDiscoveryOptions;
  queryState?: (device: DiscoveredDevice, timeoutMs: number) => Promise<DeviceState>;
}

export async function diagnosticScan(
  config: DiscoveryConfig,
  known: DiscoveredDevice[],
  logger: DiscoveryLogger,
  options: DiagnosticScanOptions = {},
): Promise<DiagnosticAttempt[]> {
  const candidates = await discoverAllCandidates(config, logger, {
    ...options.discovery,
    known,
  });
  const queryState = options.queryState ?? (async (device: DiscoveredDevice, timeoutMs: number) =>
    new MagicHomeTransport(device.host, { timeoutMs }).queryState());
  return Promise.all(candidates.map(async device => {
    const base: DiagnosticAttempt = {
      host: device.host,
      source: device.sources.join(', '),
      tcpReachable: false,
      protocols: ['818a8b', 'ef0177'],
      ...(device.model ? { model: device.model } : {}),
      ...(device.mac ? { mac: device.mac } : {}),
    };
    try {
      const state = await queryState(device, config.timeoutMs);
      return { ...base, tcpReachable: true, firmwareBytes: state.firmwareBytes, capability: state.capability };
    } catch (error) {
      return { ...base, error: (error as Error).message };
    }
  }));
}
