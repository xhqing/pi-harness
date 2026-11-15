#!/usr/bin/env node
// Second runtime identity for this package: `pi-alt` shares dist/bundle/cli.js
// with `pi` but resolves its own piConfig (`.pi-alt` config directory, no
// global `~/.pi`). Everything this entry point needs is generated on demand, so
// a fresh `npm i -g` works without any deployment step.
//
// The brand directory holds a real package.json whose piConfig drives
// APP_NAME / CONFIG_DIR_NAME at runtime, plus relative symlinks to the shared
// assets. Links are rewritten from their resolved targets so the layout also
// works when a package manager or a test harness exposes assets through
// symlinks instead of real files.

import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BRAND_NAME = "pi-alt";
const BRAND_CONFIG_DIR = ".pi-alt";
const BRAND_ENTRIES = ["dist", "docs", "examples", "README.md", "CHANGELOG.md"];

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message, error) {
	const detail = error instanceof Error ? (error.stack ?? error.message) : error === undefined ? "" : String(error);
	console.error(`pi-alt: ${message}${detail ? `\n${detail}` : ""}`);
	process.exit(1);
}

function readMainManifest() {
	const manifestPath = join(packageRoot, "package.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
		throw new Error(`${manifestPath} is missing "name" or "version"`);
	}
	return manifest;
}

function ensureSymlink(linkPath, targetPath) {
	const relativeTarget = relative(dirname(linkPath), targetPath);
	let existing;
	try {
		existing = lstatSync(linkPath);
	} catch {
		existing = undefined;
	}
	if (existing) {
		if (!existing.isSymbolicLink()) {
			throw new Error(`refusing to replace non-symlink ${linkPath}`);
		}
		if (readlinkSync(linkPath) === relativeTarget) return;
		rmSync(linkPath, { force: true });
	}
	try {
		symlinkSync(relativeTarget, linkPath, statSync(targetPath).isDirectory() ? "dir" : "file");
	} catch (error) {
		// A concurrent pi-alt start may have created the same link after the check.
		if (error?.code !== "EEXIST") throw error;
	}
}

function ensureBrandDir() {
	const brandDir = join(packageRoot, "brands", BRAND_NAME);
	mkdirSync(brandDir, { recursive: true });

	const mainManifest = readMainManifest();
	const brandManifest = {
		name: mainManifest.name,
		version: mainManifest.version,
		piConfig: { name: BRAND_NAME, configDir: BRAND_CONFIG_DIR },
	};
	const brandManifestPath = join(brandDir, "package.json");
	const serialized = `${JSON.stringify(brandManifest, null, "\t")}\n`;
	let existing;
	try {
		existing = readFileSync(brandManifestPath, "utf8");
	} catch {
		existing = undefined;
	}
	if (existing !== serialized) {
		writeFileSync(brandManifestPath, serialized);
	}

	for (const entry of BRAND_ENTRIES) {
		const source = join(packageRoot, entry);
		if (!existsSync(source)) throw new Error(`package entry is missing: ${source}`);
		ensureSymlink(join(brandDir, entry), realpathSync(source));
	}

	return brandDir;
}

const runtimePath = join(packageRoot, "dist", "bundle", "cli.js");
if (!existsSync(runtimePath)) {
	fail(`shared runtime not found at ${runtimePath} (run "npm run build" or reinstall the package)`);
}

let brandDir;
try {
	brandDir = ensureBrandDir();
} catch (error) {
	fail(`could not prepare ${join(packageRoot, "brands", BRAND_NAME)}`, error);
}

// The runtime reads piConfig from <PI_PACKAGE_DIR>/package.json at startup.
process.env.PI_PACKAGE_DIR = brandDir;

try {
	await import(pathToFileURL(realpathSync(runtimePath)).href);
} catch (error) {
	fail("shared runtime failed to start", error);
}
