# Homebridge-Magic-Home-Pro

A local-first Homebridge dynamic platform for MagicHome/LEDnet-compatible Wi-Fi lights and controllers. It communicates only over your LAN: there is no MagicHome login, cloud token, fixed regional hostname, region allowlist, telemetry, or runtime controller-definition download.

> This is an early beta scaffold. Test with your controller before relying on it, and report the sanitized diagnostic result for unknown hardware.

## Requirements

- Homebridge 2
- A Node.js release supported by Homebridge 2 (`22`, `24`, or `26` at the time of this beta)
- A controller that exposes the MagicHome LAN protocol on UDP `48899` and/or TCP `5577`

Provision the device onto Wi-Fi in its vendor app first. The plugin does not require an account or a particular cloud region afterward. “Region independent” means the plugin imposes no cloud-region dependency; some firmware may nevertheless disable or alter its LAN interface based on provisioning. Such cloud-only firmware cannot be controlled locally.

### MagicHome app settings

For remote-control use, configure the device in the MagicHome app as follows:

- set **2.4G Remote Control Settings** to **Open all remote control**; and
- enable **Remote Settings**.

The selected **Cloud Server** location is not relevant to this plugin. Global, European, and other server locations do not need to be changed for discovery or local control. The plugin never signs in to, contacts, or depends on the selected MagicHome cloud server.

## Apple Home and remote control

Accessories discovered by this plugin are exposed to Apple Home through the normal HomeKit bridge. They can be controlled in the Home app both on the home network and remotely while the user is away.

Remote access is provided by Apple Home, not by MagicHome or this plugin. The user needs:

- the Homebridge host and this plugin's child bridge running at home;
- the child bridge paired with the user's Apple Home;
- a supported HomePod or Apple TV configured as the Apple Home hub; and
- Home enabled in iCloud with the same Apple Account used by the home hub.

No inbound port forwarding, VPN, MagicHome cloud login, or plugin-specific cloud relay is required. Commands sent from outside the home reach the Apple Home hub, which forwards them to Homebridge; Homebridge then controls the MagicHome device locally over TCP `5577`.

## Installation and configuration

Install through Homebridge UI, then add the platform. Defaults work on a flat LAN:

```json
{
  "platform": "MagicHomePro",
  "name": "Magic Home Pro",
  "discovery": {
    "enabled": true,
    "timeoutMs": 3000,
    "retries": 3,
    "limitedBroadcast": true,
    "targets": ["192.168.1.255", "192.168.20.45"],
    "subnetProbe": { "enabled": false, "cidrs": [], "concurrency": 10 }
  },
  "devices": [{ "name": "Kitchen LEDs", "host": "192.168.20.45" }],
  "logLevel": "info"
}
```

Manual IPs and configured targets are attempted even if broadcast discovery fails. A MAC address in a manual entry is recommended because HomeKit accessory UUIDs use normalized MAC addresses whenever available; the last IP is cached but is never the identity of a discovered device. Accessories are retained while offline and never automatically pruned.

### Discovery and offline recovery

New-device discovery runs only when Homebridge or the plugin child bridge starts. The plugin does not perform perpetual background discovery.

- Cached devices are checked during startup. If any are missing, the plugin makes up to five startup scans, 10 seconds apart.
- A cached device still missing after the fifth scan is disabled and reported as unavailable. Its cached accessory and HomeKit identity are preserved; it is not deleted.
- If an active device later goes offline during state or control communication, the plugin performs up to five device-specific recovery scans, 10 seconds apart, stopping as soon as that device is found again.
- Recovery scans never register unrelated new devices. Restart Homebridge or the child bridge to discover newly added controllers.

## Networks, Docker, and VLANs

Automatic broadcast discovery normally requires Homebridge and the controller on the same LAN/VLAN. Docker normally needs host networking. On routed VLANs, permit UDP `48899` and TCP `5577`, then configure a directed broadcast address or individual device IP. Static DHCP reservations are helpful but not required.

Optional subnet probing is disabled by default. It scans only explicitly configured CIDRs, is concurrency/rate limited, and rejects public ranges unless `allowPublic` is deliberately enabled. Prefer direct IP targets.

## Diagnostics

The custom configuration UI exposes a diagnostic scan that does not register or delete accessories. Logs distinguish interface/bind/send failures, silence after discovery, unreachable TCP endpoints, unsupported responses, unknown capabilities, and previously known offline devices. Set `logLevel` to `trace` for sanitized raw protocol hex (LAN addresses and controller packets only; no credentials or unrelated traffic).

If a controller is silent, verify:

1. Homebridge has an eligible IPv4 interface.
2. UDP `48899` broadcast/replies and TCP `5577` are allowed.
3. A direct device IP works across VLANs.
4. The device firmware actually exposes a LAN endpoint. The configured MagicHome cloud-server location is not relevant and does not need to be changed.

## Supported protocol families

The transport attempts current `81 8A 8B` and legacy `EF 01 77` state queries and detects capability from replies. RGB, RGBW, RGB+CCT, CCT, dimmer, and switch capability classes are represented. Unknown response types remain registered diagnostically rather than crashing Homebridge.

## Development

```sh
pnpm install
pnpm run check
```

Tests use simulated UDP/TCP controllers; real-hardware and multi-region provisioning validation remains necessary before specific models are declared compatible.
