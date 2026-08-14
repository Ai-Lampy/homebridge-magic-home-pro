import type { PluginInitializer } from 'homebridge';
import { MagicHomePlatform } from './platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

const initializer: PluginInitializer = (api): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, MagicHomePlatform);
};

export default initializer;

export { MagicHomePlatform } from './platform.js';
export { discoverAllCandidates, discoverDevices, parseDiscoveryReply } from './discovery.js';
export { MagicHomeTransport } from './transport.js';
