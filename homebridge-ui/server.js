import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { normalizeConfig } from '../dist/config.js';
import { diagnosticScan } from '../dist/diagnostics.js';

class MagicHomeUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/diagnostic-scan', async payload => {
      const config = normalizeConfig(payload?.config ?? {});
      const logger = {
        debug: message => this.pushEvent('scan-log', { level: 'debug', message }),
        warn: message => this.pushEvent('scan-log', { level: 'warn', message }),
        error: message => this.pushEvent('scan-log', { level: 'error', message }),
      };
      const known = config.devices.map(device => ({
        host: device.host, name: device.name, mac: device.mac,
        source: 'configuration', sources: ['configuration'],
      }));
      return diagnosticScan(config.discovery, known, logger);
    });
    this.ready();
  }
}

new MagicHomeUiServer();
