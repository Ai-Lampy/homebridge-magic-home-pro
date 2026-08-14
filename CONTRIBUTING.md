# Contributing

Contributions, controller compatibility reports, tests, and documentation improvements are welcome.

## Development setup

Use Node.js 22 or 24 and install pnpm. From a clean checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` compiles the TypeScript project, runs the complete Vitest suite, and applies the zero-warning ESLint policy.

## Changes and tests

Add or update tests whenever behaviour changes. Keep existing platform names, configuration property names, cached accessory identity, and default behaviour backward-compatible unless a breaking change has been explicitly agreed.

Real-hardware testing is particularly useful because Magic Home-compatible firmware varies. Reports should describe the controller model, detected capability, relevant sanitized response bytes, and observed channel behaviour. Never commit credentials, tokens, public IP addresses, private network layouts, or unrelated Homebridge logs.

## Pull requests and release notes

Keep each pull request focused and explain the user-visible effect. Update `CHANGELOG.md` for behaviour, compatibility, UI, or documentation changes. Release notes should use clear `Fixed`, `Improved`, or `Changed` descriptions and explain the outcome rather than listing only commits or links.
