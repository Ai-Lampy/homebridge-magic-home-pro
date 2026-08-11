# Homebridge Magic Home Pro

A local-first Homebridge dynamic platform for MagicHome/LEDnet-compatible Wi-Fi lights and controllers. It communicates only over your LAN: there is no MagicHome login, cloud token, fixed regional hostname, region allowlist, telemetry, or runtime controller-definition download.

## Requirements

- Homebridge 2
- Node.js `22.10.0` or later in the Node 22 line, Node.js 24, or Node.js 26
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

Manual IPs and configured targets are attempted even if broadcast discovery fails. A MAC address in a manual entry is recommended because HomeKit accessory UUIDs use normalized MAC addresses whenever available; the last IP is cached but is never the identity of a discovered device. Accessories are retained while offline and are not automatically pruned. Devices explicitly removed through the plugin UI are removed from the accessory cache after Homebridge or the plugin child bridge restarts.

### Plugin configuration UI

The custom Homebridge UI has two tabs and does not expose raw JSON:

- **Scan for Devices** discovers controllers and shows their IP address, MAC address, model, detected control type, and TCP availability. A device is added only after the user reviews and confirms its settings.
- **Devices** lists saved controllers and allows their settings to be edited or removed. Device removal uses a second confirmation step to prevent accidental deletion.

Each saved device supports a friendly name, a location/room label, LED Strip or Lightbulb presentation, forced CCT control, a colour-control override (`RGB`, `RGBW`, `RGBWW`, `RGBCCT`, `RGBWCCT`, or `RGBWWCW`), and physical colour-output order. For example, use `GRB` if commands intended for red and green operate the opposite outputs. Colour-order letters identify the logical colour connected to each controller channel: `R`, `G`, `B`, `W` (warm/white), and `C` (cool white).

The Location field is plugin metadata. HomeKit does not allow a bridge plugin to assign Apple Home rooms; select the actual room for the accessory in the Apple Home app after it is added.

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

The custom configuration UI has **Scan for Devices** and **Devices** tabs. Each scan result has an explicit **Add Device** action; this saves the chosen device settings to the manual `devices` list. The Devices tab lets you edit or remove configured controllers. Select **Remove Device**, then **Confirm Remove**; **Cancel** leaves it unchanged. Removing a device also records it as excluded, so after Homebridge or the plugin child bridge restarts its cached accessory is unregistered and automatic discovery does not immediately add it again. Adding the controller again clears that exclusion.

Restart Homebridge or the plugin child bridge after adding or removing a device so the accessory cache is updated.

Logs distinguish interface/bind/send failures, silence after discovery, unreachable TCP endpoints, unsupported responses, unknown capabilities, and previously known offline devices. Set `logLevel` to `trace` for sanitized raw protocol hex (LAN addresses and controller packets only; no credentials or unrelated traffic).

If a controller is silent, verify:

1. Homebridge has an eligible IPv4 interface.
2. UDP `48899` broadcast/replies and TCP `5577` are allowed.
3. A direct device IP works across VLANs.
4. The device firmware actually exposes a LAN endpoint. The configured MagicHome cloud-server location is not relevant and does not need to be changed.

## Supported protocol families

The transport attempts current `81 8A 8B` and legacy `EF 01 77` state queries and detects capability from replies. RGB, RGBW, RGB+CCT, CCT, dimmer, and switch capability classes are represented. Unknown response types remain registered diagnostically rather than crashing Homebridge.

## Support

For problems or controller compatibility reports, open an issue on the [GitHub repository](https://github.com/Ai-Lampy/homebridge-magic-home-pro/issues). Include the Homebridge and Node.js versions, the controller model, and relevant plugin logs. Remove unrelated personal information before sharing logs publicly.
