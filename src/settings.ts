export const PLATFORM_NAME = 'MagicHomePro';
export const PLUGIN_NAME = 'homebridge-magic-home-pro';
export const UDP_DISCOVERY_PORT = 48899;
export const TCP_CONTROL_PORT = 5577;
export const DEVICE_SCAN_ATTEMPTS = 5;
export const DEVICE_RESCAN_DELAY_MS = 10_000;
// Keep HomeKit reads below HAP-NodeJS's three-second slow-handler warning.
// A state query may try both current and legacy protocols, so each attempt is
// capped at one second while discovery retains its configurable timeout.
export const CHARACTERISTIC_TIMEOUT_MS = 1_000;
