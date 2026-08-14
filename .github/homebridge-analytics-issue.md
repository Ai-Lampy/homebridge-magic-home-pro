# Valid plugins are omitted after the 5,000 npm search-result limit

## Description

The Homebridge Analytics extraction process currently limits npm discovery to 5,000 packages:

```js
const TESTING_LIMIT = 5000;
```

npm currently reports more than 5,000 packages matching `keywords:homebridge-plugin`.

Valid public plugins outside npm's first 5,000 ranked results are consequently omitted from:

- `allPluginNames.json`
- `homebridge_plugins.json`
- `developers.homebridge.io/analytics`

## Example

Package: `homebridge-magic-home-pro`

The package:

- is publicly available from npm;
- contains the `homebridge-plugin` keyword;
- declares `supports-hap`;
- is not deprecated;
- has valid Homebridge and Node.js engine declarations;
- can be retrieved directly from the npm registry; and
- is absent from the generated Homebridge Analytics plugin list.

Latest stable version checked: `0.5.4`.

## Suggested change

Please allow the extraction process to paginate through the complete npm result count instead of stopping at 5,000 results.

Alternatively, packages discovered since the previous extraction could be merged into the existing catalogue before applying any reporting limit.
