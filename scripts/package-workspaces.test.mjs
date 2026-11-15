import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findPackageDirectories } from "./package-workspaces.mjs";

function createTree(entries) {
	const root = mkdtempSync(join(tmpdir(), "pi-package-workspaces-"));
	for (const entry of entries) {
		const directory = join(root, entry);
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, "package.json"), `${JSON.stringify({ name: entry.replaceAll("/", "-") })}\n`);
	}
	return root;
}

function relativeDirectories(root) {
	return findPackageDirectories(root)
		.map((directory) => directory.slice(root.length + 1))
		.sort();
}

test("finds workspace packages at any depth", () => {
	const root = createTree(["agent", "session-backends/sqlite-node"]);
	try {
		assert.deepEqual(relativeDirectories(root), ["agent", "session-backends/sqlite-node"]);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("ignores generated runtime directories", () => {
	const root = createTree([
		"agent",
		"coding-agent/node_modules/installed-package",
		"coding-agent/dist",
		"coding-agent/brands/pi-alt",
	]);
	try {
		assert.deepEqual(relativeDirectories(root), ["agent"]);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});

test("still reports packages nested inside a workspace package", () => {
	const root = createTree(["coding-agent", "coding-agent/examples/extensions/sandbox"]);
	try {
		assert.deepEqual(relativeDirectories(root), ["coding-agent", "coding-agent/examples/extensions/sandbox"]);
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
});
