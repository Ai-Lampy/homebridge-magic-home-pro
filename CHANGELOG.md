# Changelog

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

## 0.2.0

- Add local UDP discovery and TCP control for MagicHome/LEDnet controllers.
- Support RGB, RGBW, RGB+CCT, CCT, dimmer, and switch capability classes.
- Preserve HomeKit identity with stable MAC-based accessory UUIDs.
- Add startup-only discovery and bounded five-attempt offline recovery.
- Add a Homebridge custom settings UI with a read-only diagnostic scan.
- Document Apple Home remote access and the required MagicHome app settings.
