import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

// The fork's own workspace packages. The retired scope prefix is assembled at
// runtime so this file does not match its own leftover scan.
const LEGACY_PREFIX = "@earendil-works";
const OWN_PACKAGES = [
	"pi-coding-agent-install",
	"pi-session-backend-sqlite-node",
	"pi-coding-agent",
	"pi-agent-core",
	"pi-example-plugin",
	"pi-agent-old",
	"pi-telemetry",
	"pi-protocol",
	"pi-durable",
	"pi-client",
	"pi-server",
	"pi-evals",
	"pi-ai",
	"pi-tui",
	"chord",
];
// Allow one or more separators so escaped forms such as `@earendil-works\/pi-ai`
// inside regex literals are caught as well.
const LEGACY_NAME_PATTERN = new RegExp(`${LEGACY_PREFIX}[\\\\/]+(?:${OWN_PACKAGES.join("|")})(?![\\w-])`);

// The extension loader deliberately keeps scoped aliases so extensions written
// before the 2026-10-23 unscoped rename keep resolving to the same bundled
// modules (see the "Legacy scoped names" block in that file).
const LEGACY_SCOPE_ALLOWLIST = new Set(["packages/coding-agent/src/core/extensions/loader.ts"]);

const BINARY_EXTENSION = /\.(?:png|jpe?g|gif|webp|ico|pdf|wasm|node|tgz|zip|woff2?|ttf)$/i;

function trackedFiles() {
	return execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8" })
		.split("\0")
		.filter(Boolean);
}

function readTrackedText(path) {
	const absolute = join(repositoryRoot, path);
	let stats;
	try {
		stats = lstatSync(absolute);
	} catch {
		return undefined;
	}
	if (!stats.isFile() || stats.isSymbolicLink()) return undefined;
	try {
		return readFileSync(absolute, "utf8");
	} catch {
		return undefined;
	}
}

test("workspace packages use unscoped names", () => {
	const manifests = trackedFiles().filter((path) => {
		const segments = path.split("/");
		return path.endsWith("package.json") && !segments.includes("node_modules") && !segments.includes("dist");
	});
	assert.ok(manifests.length > 0, "expected to find workspace package.json files");

	for (const path of manifests) {
		const manifest = JSON.parse(readFileSync(join(repositoryRoot, path), "utf8"));
		assert.equal(typeof manifest.name, "string", `${path} must declare a name`);
		assert.ok(!manifest.name.includes("/"), `${path} still uses a scoped name: ${manifest.name}`);
	}

	const codingAgent = JSON.parse(readFileSync(join(repositoryRoot, "packages/coding-agent/package.json"), "utf8"));
	assert.equal(codingAgent.name, "pi-coding-agent");
});

test("no scoped own package names remain in tracked files", () => {
	const leftovers = [];
	for (const path of trackedFiles()) {
		if (path.endsWith("CHANGELOG.md")) continue;
		if (BINARY_EXTENSION.test(path)) continue;
		if (LEGACY_SCOPE_ALLOWLIST.has(path)) continue;
		const text = readTrackedText(path);
		if (text !== undefined && LEGACY_NAME_PATTERN.test(text)) leftovers.push(path);
	}
	assert.deepEqual(leftovers, []);
});
