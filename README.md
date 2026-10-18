<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://github.com/xhqing/pi-harness/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/xhqing/pi-harness?style=flat-square" /></a>
  <a href="./LICENSE.md"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
</p>

**English** | [简体中文](README_cn.md)

# pi-harness

**pi-harness** is an independent fork of the [Pi agent harness](https://github.com/earendil-works/pi) project. The fork was detached from the upstream repository on 2026-09-19 and evolves on its own; it is not affiliated with or synchronized with upstream anymore. Package names keep the historical `@earendil-works/*` scope.

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@earendil-works/pi-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@earendil-works/pi-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

To learn more about Pi:

* [Visit pi.dev](https://pi.dev), the project website with demos
* [Read the documentation](https://pi.dev/docs/latest), but you can also ask the agent to explain itself

## All Packages

| Package | Description |
|---------|-------------|
| **[@earendil-works/chord](packages/chord)** | Standalone application-composition runtime for services, replicated state, RPC, and plugins |
| **[@earendil-works/pi-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-durable](packages/durable)** | Durable conversation, task, and document runtime |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |

## Permissions & Containerization

Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.

If you need stronger boundaries, containerize or sandbox Pi. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns:

- **Gondolin extension**: keep `pi` and provider auth on the host while routing built-in tools and `!` commands into a local Linux micro-VM.
- **Plain Docker**: run the whole `pi` process in a local container for simple isolation.
- **OpenShell**: run the whole `pi` process in a policy-controlled sandbox.

## Development

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run build         # Refresh model data, then build all packages
npm run build:offline # Rebuild using existing model data without network access
npm run check         # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

## Building release artifacts

Two artifact kinds are built locally and attached to GitHub Releases:

- **Standalone binary**: `./scripts/build-binaries.sh` produces a self-contained executable with its runtime assets (including native prebuilds) in a `pi/` directory. Keep the binary and the `native/` directory together when installing.
- **Self-contained npm-layout tarball**: `node scripts/build-npm-tarball.mjs` packs the bundle with the native prebuilds inlined and drops workspace dependencies that are not published to npm, so it installs cleanly with `npm install -g <tarball>`.

## Supply-chain hardening

We treat npm dependency changes as reviewed code changes.

- Direct external dependencies are pinned to exact versions. Internal workspace packages remain version-ranged.
- `.npmrc` sets `save-exact=true` and `min-release-age=2` to avoid same-day dependency releases during npm resolution.
- `package-lock.json` is the dependency ground truth. Pre-commit blocks accidental lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1` is set.
- `npm run check` verifies pinned direct deps, native TypeScript import compatibility, and the generated coding-agent shrinkwrap.
- The packed CLI package includes `packages/coding-agent/npm-shrinkwrap.json`, generated from the root lockfile, to pin transitive deps for npm installs.
- Release smoke tests use `npm run release:local` to build, pack, and create isolated npm and Bun installs outside the repo before tagging a release.
- Local release installs, documented npm installs, and `pi update --self` use `--ignore-scripts` where supported.
- CI installs with `npm ci --ignore-scripts`.
- Shrinkwrap generation has an explicit allowlist for dependency lifecycle scripts; new lifecycle-script deps fail checks until reviewed.

## License & Attribution

MIT License — see [LICENSE.md](LICENSE.md).

Copyright (c) 2025 Mario Zechner (original Pi project). Copyright (c) 2026 All Contributors (this fork).

Portions of this repository originate from [earendil-works/pi](https://github.com/earendil-works/pi), detached on 2026-09-19; those portions retain their original copyright and MIT notice.

### Attribution

When referencing this project, please attribute it to the project rather than to any individual: include the repository URL (`https://github.com/xhqing/pi-harness`) and preserve the copyright notices contained in [LICENSE.md](LICENSE.md).

### Referencing This Project

Repository URL: `https://github.com/xhqing/pi-harness`
