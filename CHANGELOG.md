# Changelog

## 0.6.1

### Added

- Add PayPal funding metadata so the Homebridge UI can display the Donate button for the verified plugin.
- Add the official Verified by Homebridge badge to the README.

## 0.6.0

### Fixed

- Accumulate fragmented Magic Home TCP status responses before parsing, preserving trailing RGB+CCT and cool-white state fields.
- Make the custom UI device scan include configured bounded subnet probing, matching normal Homebridge discovery.
- Restore a mutually compatible TypeScript, ESLint, typescript-eslint, and Vitest validation toolchain for Node.js 22, 24, and 26.

### Improved

- Merge duplicate devices found through configuration, cache, UDP discovery, and subnet probing using normalized MAC or IP identity.
- Add regression coverage for fragmented, complete, malformed, timeout, and legacy controller responses.
- Add diagnostic discovery, subnet safety, package metadata, Config UI, and Homebridge startup coverage.
- Add public security, contribution, dependency-update, installation-search, and network troubleshooting guidance.
- Prevent Dependabot from proposing TypeScript 7 or ESLint 10 until the lint toolchain supports those APIs.

### Compatibility

Existing configurations, platform identity, cached accessory UUIDs, Apple Home room assignments, scenes, and automations remain compatible. No cache reset or re-pairing is required.

## 0.6.0-beta.2

### Fixed

- Restored a mutually compatible TypeScript, ESLint, typescript-eslint, and Vitest toolchain so Node.js 22, 24, and 26 CI checks can complete successfully.
- Pinned the validated development-tool versions to prevent incompatible TypeScript 7 and ESLint 10 upgrades from breaking release validation.

### Beta notice

This release contains the controller response handling and unified discovery improvements introduced in `0.6.0-beta.1`, together with corrected release-validation dependencies. Existing configurations and cached accessory identities remain compatible.

## 0.6.0-beta.1

### Fixed

- Fixed controller status responses potentially being processed before every TCP response fragment had arrived.
- Improved RGB+CCT and cool-white state reliability.
- Updated the custom UI device scan to include configured bounded subnet probing, matching normal Homebridge discovery.

### Improved

- Added regression tests for fragmented, complete and legacy controller responses.
- Added diagnostic discovery and duplicate-device handling tests.
- Clarified that users may need to search using the complete `homebridge-magic-home-pro` npm package name.
- Added troubleshooting guidance for Homebridge and npm search issues.
- Added dependency-update, security, and contribution metadata.

### Beta notice

This release contains changes to controller response handling and device discovery. Existing configurations and cached accessory identities remain compatible, but testing across different Magic Home and LEDnet controller types is requested.

## 0.5.4

- Coalesce simultaneous HomeKit characteristic reads into one controller state request.
- Bound characteristic state requests below Homebridge's slow-handler warning threshold while retaining configurable discovery timeouts.
- Return the standard HomeKit service-communication status for offline controllers instead of leaking transport errors from characteristic handlers.
- Prevent characteristic failures during startup from launching a second recovery loop alongside startup recovery.

## 0.5.3

- Clear saved and cached Colour Control and Colour Order overrides when their enable checkboxes are switched off, restoring automatically detected/default controller behaviour after restart.
- Show enabled CCT, Colour Control and Colour Order options in each configured-device summary, including the selected physical colour order, and move the compact room note below the device list.

## 0.5.2

- Hide the Colour Control and Colour Order selections until their corresponding override checkboxes are enabled.
- Correct RGBW colour/white separation and preserve CCT white output when brightness or colour temperature changes.
- Replace obsolete Switch or Lightbulb services when a controller's effective capability changes, preventing duplicate services and characteristic warnings.
- Treat unknown controllers conservatively without exposing unconfirmed colour controls.
- Apply subnet probe limits globally across concurrent workers and reject invalid IPv4 addresses in the Config UI.
- Give each MAC-less controller a collision-resistant persisted identity instead of deriving identity from a shared name or model.
- Complete the MIT licence text, document the plugin's distinguishing behaviour, and expand Config UI, accessory, package and Homebridge startup tests.

## 0.5.1

- Add explicit enable checkboxes for Colour Control and Colour Order overrides, and make discovered MAC addresses read-only.

## 0.5.0

- Refresh the Plugin Config UI with a clearer header, accessible tabs, panel layout, scan status, device counts, capability badges, responsive forms, and improved empty states.
- Keep configured device editors collapsed until Edit Details is selected, reducing clutter without removing any controls.
- Replace large save popups with compact inline configuration status and error messages.

## 0.4.4

- Avoid adding the unsupported Configured Name characteristic to Lightbulb services, preventing the corresponding Homebridge warning.

## 0.4.3

- Keep the detected controller type visible for devices already saved in the plugin configuration.
- Make colour-order remapping an optional selection that defaults to the controller/app setting.
- Prevent automatically detected colour profiles from becoming forced overrides, including migration of values saved by earlier UI versions.
- Apply user-defined device names to the cached accessory and HomeKit name characteristics.

## 0.4.2

- Fix the Devices tab removal action by replacing the iframe-dependent browser prompt with visible Confirm Remove and Cancel buttons.
- Restore the device in the UI if saving its removal fails.

## 0.4.1

- Give the Scan for Devices and Devices tabs white backgrounds for clearer navigation.
- Add a Remove Device action that removes the configuration and unregisters its cached Homebridge accessory on restart.

## 0.4.0

- Replace the raw JSON configuration editor with Scan for Devices and Devices tabs, editable device details, capability/CCT overrides, and physical colour-order remapping.

## 0.3.1

- Correct MagicHome model capability detection, including identifying `0x41` controllers as single-channel LED dimmers and removing inappropriate colour controls.

## 0.3.0

- Let users add or update controllers found by the diagnostic scan directly from the Homebridge UI.
- Keep `homebridge` exclusively in development dependencies and declare HAP as the supported transport.
- Test every GitHub update on Node.js 22, 24, and 26, and require all three checks before npm publication.

## 0.2.1

- Let users add or update controllers found by the diagnostic scan directly from the Homebridge UI.

## 0.2.0

- Add local UDP discovery and TCP control for MagicHome/LEDnet controllers.
- Support RGB, RGBW, RGB+CCT, CCT, dimmer, and switch capability classes.
- Preserve HomeKit identity with stable MAC-based accessory UUIDs.
- Add startup-only discovery and bounded five-attempt offline recovery.
- Add a Homebridge custom settings UI with a read-only diagnostic scan.
- Document Apple Home remote access and the required MagicHome app settings.
