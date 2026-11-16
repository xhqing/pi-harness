import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Regression guard for issue #52: the release workflow builds `RELEASE_NOTES.md` with
// `scripts/release-notes.mjs extract`. That command used to read only
// `packages/coding-agent/CHANGELOG.md`, so a release whose changes were recorded in the
// root `CHANGELOG.md` (the fork's version authority) shipped notes covering a single
// package. Extraction must fall back to the root changelog, and relative links must be
// resolved against whichever changelog the section came from.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "release-notes.mjs");

const ROOT_CHANGELOG = `# Changelog

## [Unreleased]

### Fixed

- not released yet

## [1.2.3] - 2026-11-15

### Fixed

- Root entry with a [linked file](packages/ai/src/foo.ts).

## [1.2.2] - 2026-11-01

### Fixed

- Older root entry.
`;

const PACKAGE_CHANGELOG = `# Changelog

## [1.2.3] - 2026-11-15

### Added

- Package entry with a [linked file](src/bar.ts).

## [1.2.1] - 2026-10-01

### Added

- Package-only historical entry with a [linked file](src/bar.ts).
`;

function createRepo() {
	const root = mkdtempSync(join(tmpdir(), "pi-release-notes-"));
	mkdirSync(join(root, "packages", "coding-agent"), { recursive: true });
	writeFileSync(join(root, "CHANGELOG.md"), ROOT_CHANGELOG);
	writeFileSync(join(root, "packages", "coding-agent", "CHANGELOG.md"), PACKAGE_CHANGELOG);
	return root;
}

function extract(root, args) {
	const result = spawnSync(process.execPath, [SCRIPT, "extract", "--repo", "xhqing/pi-harness", ...args], {
		cwd: root,
		encoding: "utf8",
	});
	return result;
}

function extractStdout(root, args) {
	const result = extract(root, args);
	assert.equal(result.status, 0, `extract failed: ${result.stderr}`);
	return result.stdout;
}

test("prefers the root changelog section for a released version", () => {
	const root = createRepo();
	try {
		const notes = extractStdout(root, ["--version", "1.2.3", "--tag", "v1.2.3"]);
		assert.match(notes, /Root entry with a \[linked file\]/);
		assert.doesNotMatch(notes, /Package entry/);
		assert.match(notes, /https:\/\/github\.com\/xhqing\/pi-harness\/blob\/v1\.2\.3\/packages\/ai\/src\/foo\.ts/);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("falls back to the package changelog and resolves links against the package directory", () => {
	const root = createRepo();
	try {
		const notes = extractStdout(root, ["--version", "1.2.1", "--tag", "v1.2.1"]);
		assert.match(notes, /Package-only historical entry/);
		assert.match(
			notes,
			/https:\/\/github\.com\/xhqing\/pi-harness\/blob\/v1\.2\.1\/packages\/coding-agent\/src\/bar\.ts/,
		);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("keeps working when only one of the two changelogs exists", () => {
	const root = createRepo();
	try {
		rmSync(join(root, "CHANGELOG.md"));
		const notes = extractStdout(root, ["--version", "1.2.3", "--tag", "v1.2.3"]);
		assert.match(notes, /Package entry with a \[linked file\]/);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("emits a placeholder instead of failing when no changelog has the version", () => {
	const root = createRepo();
	try {
		const notes = extractStdout(root, ["--version", "9.9.9", "--tag", "v9.9.9"]);
		assert.equal(notes.trim(), "Release 9.9.9");
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("writes the notes to --out and reports a useful error for an explicit missing changelog", () => {
	const root = createRepo();
	try {
		const out = join(root, "notes.md");
		const result = extract(root, ["--version", "1.2.3", "--tag", "v1.2.3", "--out", out]);
		assert.equal(result.status, 0, `extract failed: ${result.stderr}`);
		assert.match(readFileSync(out, "utf8"), /Root entry/);

		const missing = extract(root, ["--version", "1.2.3", "--changelog", "nope.md"]);
		assert.notEqual(missing.status, 0);
		assert.match(missing.stderr, /nope\.md/);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});
