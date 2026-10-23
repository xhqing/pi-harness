#!/usr/bin/env node
// Builds a self-contained npm-layout tarball of the coding agent for GitHub
// Release distribution. The bundle inlines the workspace packages (chord,
// pi-agent-core, pi-ai, pi-tui) and ships the TUI native prebuilds beside it,
// so the packed package drops the workspace dependencies that are not (and
// will not be) published to the npm registry.
//
// Usage: node scripts/build-npm-tarball.mjs [--out <dir>]
//
// Requires `npm run build` to have completed (dist/bundle must exist).

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const codingAgentDir = join(repoRoot, "packages", "coding-agent");
const bundleDir = join(codingAgentDir, "dist", "bundle");

const nativePrebuilds = [
	["darwin", "darwin-arm64", "darwin-platform.node"],
	["darwin", "darwin-x64", "darwin-platform.node"],
	["linux", "linux-arm64", "linux-platform-x11.node"],
	["linux", "linux-x64", "linux-platform-x11.node"],
	["win32", "win32-arm64", "win32-platform.node"],
	["win32", "win32-x64", "win32-platform.node"],
];

// Workspace packages inlined into the bundle; not published to npm under this
// fork's version line, so they must not appear as installable dependencies.
const inlinedWorkspacePackages = [
	"chord",
	"pi-agent-core",
	"pi-ai",
	"pi-tui",
];

function parseArgs() {
	const args = process.argv.slice(2);
	const options = { outDir: join(repoRoot, "tmp") };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--out") {
			const value = args[++i];
			if (!value) throw new Error("--out requires a directory");
			options.outDir = resolve(value);
		} else {
			throw new Error(`Unknown argument: ${args[i]}`);
		}
	}
	return options;
}

function run(command, args, options) {
	const result = spawnSync(command, args, { encoding: "utf8", ...options });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
	}
	return result.stdout;
}

function pack(cwd, destination) {
	const output = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], { cwd }));
	const files = output.flatMap((entry) => entry.files ?? []);
	if (!files.some((file) => file.path === "package.json")) {
		throw new Error(`npm pack in ${cwd} produced no package.json`);
	}
	const filename = output[0]?.filename;
	if (!filename) throw new Error(`npm pack in ${cwd} reported no filename`);
	return join(destination, filename);
}

function rewritePackageJson(path) {
	const manifest = JSON.parse(readFileSync(path, "utf8"));
	for (const name of inlinedWorkspacePackages) {
		delete manifest.dependencies?.[name];
	}
	delete manifest.devDependencies;
	delete manifest.overrides;
	manifest.main = "./dist/bundle/index.js";
	manifest.exports = {
		".": "./dist/bundle/index.js",
		"./rpc-entry": "./dist/bundle/rpc-entry.js",
	};
	writeFileSync(path, JSON.stringify(manifest, null, "\t") + "\n");
}

function verifyTarball(tarballPath) {
	// bsdtar lists member paths without a leading "./".
	const listing = execSync(`tar tzf ${JSON.stringify(tarballPath)}`, { encoding: "utf8" });
	for (const [platform, archDir, fileName] of nativePrebuilds) {
		const member = `package/dist/bundle/native/${platform}/prebuilds/${archDir}/${fileName}`;
		if (!listing.split("\n").some((line) => line === member)) {
			throw new Error(`Tarball is missing native prebuild: ${member}`);
		}
	}
	if (!listing.split("\n").some((line) => line === "package/dist/bundle/cli.js")) {
		throw new Error("Tarball is missing dist/bundle/cli.js");
	}
}

const options = parseArgs();

if (!existsSync(join(bundleDir, "cli.js"))) {
	throw new Error("dist/bundle is missing. Run `npm run build` first.");
}
for (const [platform, archDir, fileName] of nativePrebuilds) {
	const source = join(bundleDir, "native", platform, "prebuilds", archDir, fileName);
	if (!existsSync(source)) {
		throw new Error(`Native prebuild is missing from the bundle: ${source}`);
	}
}

mkdirSync(options.outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "pi-npm-tarball-"));
try {
	const packed = pack(codingAgentDir, work);
	const extractDir = join(work, "extracted");
	mkdirSync(extractDir, { recursive: true });
	execSync(`tar xzf ${JSON.stringify(packed)} -C ${JSON.stringify(extractDir)}`);
	rewritePackageJson(join(extractDir, "package", "package.json"));
	const finalTarball = pack(join(extractDir, "package"), options.outDir);
	verifyTarball(finalTarball);
	console.log(`Built ${finalTarball}`);
} finally {
	rmSync(work, { force: true, recursive: true });
}
