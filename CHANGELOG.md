# Changelog

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
