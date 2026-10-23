import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(packageDirectory, "src");
const IMPORT_SPECIFIER = /(?:import|export)\s+(?:type\s+)?(?:[^;]*?\sfrom\s*)?["']([^"']+)["']/gu;

/** Workspace packages Chord must stay independent of; Chord itself is allowed. */
const INTERNAL_PACKAGES = new Set([
	"chord",
	"pi-agent-core",
	"pi-ai",
	"pi-client",
	"pi-coding-agent",
	"pi-coding-agent-install",
	"pi-durable",
	"pi-evals",
	"pi-example-plugin",
	"pi-protocol",
	"pi-server",
	"pi-session-backend-sqlite-node",
	"pi-telemetry",
	"pi-tui",
	"pi-agent-old",
]);

/** The internal package a specifier belongs to, unless that package is Chord itself. */
function internalPackageOf(specifier: string): string | undefined {
	const segments = specifier.split("/");
	const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0]!;
	return name !== "chord" && INTERNAL_PACKAGES.has(name) ? name : undefined;
}

describe("package boundary", () => {
	test("does not depend on Pi packages or files outside Chord", async () => {
		const manifest = JSON.parse(await readFile(resolve(packageDirectory, "package.json"), "utf8")) as {
			dependencies?: Record<string, string>;
		};
		expect(Object.keys(manifest.dependencies ?? {}).filter((name) => internalPackageOf(name) !== undefined)).toEqual(
			[],
		);

		const paths = (await readdir(sourceDirectory, { recursive: true })).filter((path) => path.endsWith(".ts")).sort();
		const violations: string[] = [];
		for (const path of paths) {
			const file = resolve(sourceDirectory, path);
			const source = await readFile(file, "utf8");
			for (const match of source.matchAll(IMPORT_SPECIFIER)) {
				const specifier = match[1]!;
				if (internalPackageOf(specifier)) violations.push(`${path}: ${specifier}`);
				if (specifier.startsWith(".") && !resolve(dirname(file), specifier).startsWith(`${sourceDirectory}/`)) {
					violations.push(`${path}: ${specifier}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});
});
