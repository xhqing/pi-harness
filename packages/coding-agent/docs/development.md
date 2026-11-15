# Development

See [AGENTS.md](https://github.com/earendil-works/pi/blob/main/AGENTS.md) for additional guidelines.

## Setup

```bash
git clone https://github.com/earendil-works/pi
cd pi
npm install
npm run build
```

Run from source:

```bash
/path/to/pi/pi-test.sh
```

The script can be run from any directory. Pi keeps the caller's current working directory.

### Experimental remote harness

The remote harness server/client integration is development-only. Run it from the repository with:

```bash
PI_EXPERIMENTAL=1 ./pi-test.sh server
PI_EXPERIMENTAL=1 ./pi-test.sh client
```

`PI_SERVER_DIR` overrides the server profile and socket directory (default: `~/.pi/server`). `PI_SERVER_ID` selects the logical server ID when `--server-id` is omitted.

The `client` and `experimental/plugin` package subpaths resolve only under the `source` condition in a checkout. Their implementations and the server/client commands are excluded from npm packages and standalone binaries. `pi-client`, `pi-protocol`, and `pi-server` are development dependencies of coding-agent, not runtime dependencies. The local SDK and stdio RPC API are unchanged.

## Forking / Rebranding

Configure via `package.json`:

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

Change `name`, `configDir`, and `bin` field for your fork. Affects CLI banner, config paths, and environment variable names.

### A second identity in the same package

This repository ships two identities, `pi` and `pi-alt`, out of one installed package and one shared `dist/bundle/cli.js`. Only the package manifest each process resolves differs:

| | `pi` | `pi-alt` |
|---|---|---|
| Entry point | `dist/bundle/cli.js` | `bin/pi-alt.js` |
| `piConfig.name` | unset (defaults to `pi`) | `pi-alt` |
| Global config | `~/.pi/agent/` | `~/.pi-alt/agent/` |
| Project-level config | `<repo>/.pi/` | `<repo>/.pi-alt/` |
| Config dir env var | `PI_CODING_AGENT_DIR` | `PI_ALT_CODING_AGENT_DIR` |
| Session dir env var | `PI_CODING_AGENT_SESSION_DIR` | `PI_ALT_CODING_AGENT_SESSION_DIR` |

`bin/pi-alt.js` is shipped source, not a build artifact. On every start it resolves the package root from `import.meta.url` (never from the working directory) and:

1. idempotently provisions `<package root>/brands/pi-alt/` — a real `package.json` (`name` and `version` copied from the main package, `piConfig: { "name": "pi-alt", "configDir": ".pi-alt" }`) plus relative symlinks to `dist`, `docs`, `examples`, `README.md`, and `CHANGELOG.md`;
2. sets `PI_PACKAGE_DIR` to that directory so the runtime reads its `piConfig`;
3. imports the shared bundle in the same process, so arguments, signals, and exit codes are inherited without a child process.

`brands/` is runtime state: it is git-ignored and never packed into release tarballs. Replacing the package (for example `pi update --self`) removes it, and the next `pi-alt` start recreates it — both identities always run the same build. Symlinks are relative, so the layout survives any install prefix, and creating them requires symlink support (Developer Mode on Windows, or WSL).

Environment variable names are derived from `piConfig.name` with every character outside `[A-Za-z0-9]` replaced by `_` before upper-casing. A raw `APP_NAME.toUpperCase()` would turn `pi-alt` into the shell-unusable `PI-ALT_CODING_AGENT_DIR`, so the sanitizing step is part of the rebranding mechanism rather than a per-brand special case.

## Path Resolution

Three execution modes: npm install, standalone binary, tsx from source.

**Always use `src/config.ts`** for package assets:

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

Never use `__dirname` directly for package assets.

## Debug Command

`/debug` (hidden) writes to `~/.pi/agent/pi-debug.log`:
- Rendered TUI lines with ANSI codes
- Last messages sent to the LLM

## Testing

```bash
./test.sh                         # Run non-LLM tests (no API keys needed)
npm test                          # Run all tests
npm test -- test/specific.test.ts # Run specific test
```

### Published package smoke test

After building, run `npm run check:package-install`. It packs the public packages and installs only coding-agent as a direct dependency in a temporary directory outside the repository. Local tarball overrides select declared transitive dependencies without installing development-only packages. The check verifies SDK imports and CLI startup without credentials or model requests.

`npm run check` also checks runtime dependency declarations and rejects excluded development sources pulled into a package's build through imports.

## Project Structure

```
packages/
  ai/           # LLM provider abstraction
  agent/        # Agent loop and message types  
  tui/          # Terminal UI components
  coding-agent/ # CLI and interactive mode
```
