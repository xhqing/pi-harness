import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(packageRoot, "dist", "bundle", "cli.js");
const configModulePath = join(packageRoot, "src", "config.ts");
const trustModulePath = join(packageRoot, "src", "core", "trust-manager.ts");

interface MainPackageJson {
	name: string;
	version: string;
	bin: Record<string, string>;
	files: string[];
}

const mainPackageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as MainPackageJson;

/** Brand-owned entries that must resolve to the main package layout. */
const BRAND_ENTRIES = ["dist", "docs", "examples", "README.md", "CHANGELOG.md"];

const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_ESCAPE, "");
}

let tempRoot: string;
let baseEnv: NodeJS.ProcessEnv;

beforeEach(() => {
	tempRoot = mkdtempSync(join(tmpdir(), "pi-alt-brand-"));
	const home = join(tempRoot, "home");
	mkdirSync(home, { recursive: true });
	mkdirSync(join(tempRoot, "work"), { recursive: true });
	mkdirSync(join(tempRoot, "tmp"), { recursive: true });
	baseEnv = {
		PATH: process.env.PATH,
		HOME: home,
		USERPROFILE: home,
		TMPDIR: join(tempRoot, "tmp"),
		LANG: "C",
		LC_ALL: "C",
		NO_COLOR: "1",
		PI_OFFLINE: "1",
		PI_SKIP_VERSION_CHECK: "1",
	};
});

afterEach(() => {
	rmSync(tempRoot, { force: true, recursive: true });
});

type NodeResult = { status: number | null; stdout: string; stderr: string };

function runNode(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): NodeResult {
	const result = spawnSync(process.execPath, args, {
		cwd: options.cwd ?? join(tempRoot, "work"),
		encoding: "utf8",
		env: { ...baseEnv, ...options.env },
	});
	return {
		status: result.status,
		stdout: stripAnsi(result.stdout ?? ""),
		stderr: stripAnsi(result.stderr ?? ""),
	};
}

/**
 * Builds a throwaway npm-style install of the coding agent package whose assets
 * point at the real build. Using a fake prefix keeps the real checkout free of
 * generated brand state and proves the wrapper resolves paths from its own
 * location instead of the install prefix.
 */
function createIsolatedInstall(): {
	root: string;
	wrapper: string;
	brandDir: string;
} {
	const root = join(tempRoot, "install");
	mkdirSync(join(root, "bin"), { recursive: true });
	copyFileSync(join(packageRoot, "package.json"), join(root, "package.json"));
	const wrapper = join(root, "bin", "pi-alt.js");
	copyFileSync(join(packageRoot, "bin", "pi-alt.js"), wrapper);
	chmodSync(wrapper, 0o755);
	for (const entry of BRAND_ENTRIES) {
		symlinkSync(join(packageRoot, entry), join(root, entry));
	}
	return { root, wrapper, brandDir: join(root, "brands", "pi-alt") };
}

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function createExtensionPackage(): string {
	const extDir = join(tempRoot, "ext-pkg");
	mkdirSync(extDir, { recursive: true });
	writeFileSync(
		join(extDir, "package.json"),
		`${JSON.stringify({ name: "brand-test-ext", version: "1.0.0", pi: { extensions: ["./ext.js"] } }, null, "\t")}\n`,
	);
	writeFileSync(join(extDir, "ext.js"), "export default function () {}\n");
	return extDir;
}

/** Runs a snippet against real source modules in a child process (config is resolved at import time). */
function runSourceProbe(modulePath: string, body: string, env: NodeJS.ProcessEnv = {}): NodeResult {
	const probePath = join(tempRoot, `probe-${Math.random().toString(16).slice(2)}.mjs`);
	writeFileSync(probePath, `const moduleUrl = ${JSON.stringify(new URL(`file://${modulePath}`).href)};\n${body}\n`);
	return runNode(["--experimental-strip-types", probePath], { env });
}

function brandPackagePath(brandDir: string): string {
	return join(brandDir, "package.json");
}

describe("pi-alt brand identity", () => {
	describe("wrapper bootstrap", () => {
		it("fails loudly when the shared runtime is missing", () => {
			const root = join(tempRoot, "broken-install");
			mkdirSync(join(root, "bin"), { recursive: true });
			copyFileSync(join(packageRoot, "package.json"), join(root, "package.json"));
			const wrapper = join(root, "bin", "pi-alt.js");
			copyFileSync(join(packageRoot, "bin", "pi-alt.js"), wrapper);
			chmodSync(wrapper, 0o755);

			const result = runNode([wrapper, "--version"]);

			expect(result.status).not.toBe(0);
			expect(result.stderr.length).toBeGreaterThan(0);
		});

		it("creates brands/pi-alt with relative symlinks and a synced package.json", () => {
			expect(existsSync(distEntry), "dist/bundle/cli.js is missing; run `npm run build` first").toBe(true);
			const { brandDir, wrapper } = createIsolatedInstall();

			const result = runNode([wrapper, "--version"]);

			expect(result.stderr).toBe("");
			expect(result.stdout.trim()).toBe(mainPackageJson.version);
			expect(existsSync(brandPackagePath(brandDir))).toBe(true);

			const brandPackage = readJson(brandPackagePath(brandDir)) as {
				name?: string;
				version?: string;
				piConfig?: { name?: string; configDir?: string };
			};
			expect(brandPackage.name).toBe(mainPackageJson.name);
			expect(brandPackage.version).toBe(mainPackageJson.version);
			expect(brandPackage.piConfig).toEqual({
				name: "pi-alt",
				configDir: ".pi-alt",
			});

			for (const entry of BRAND_ENTRIES) {
				const linkPath = join(brandDir, entry);
				const target = readlinkSync(linkPath);
				expect(isAbsolute(target), `${entry} must be a relative symlink`).toBe(false);
				expect(resolve(brandDir, target)).toBe(resolve(packageRoot, entry));
			}
		});

		it("is idempotent across repeated runs", () => {
			const { brandDir, wrapper } = createIsolatedInstall();

			expect(runNode([wrapper, "--version"]).status).toBe(0);
			const firstPackage = readFileSync(brandPackagePath(brandDir), "utf8");
			const firstEntries = readdirSync(brandDir).sort();
			const firstLinks = BRAND_ENTRIES.map((entry) => readlinkSync(join(brandDir, entry)));

			const second = runNode([wrapper, "--version"]);

			expect(second.status).toBe(0);
			expect(second.stdout.trim()).toBe(mainPackageJson.version);
			expect(readFileSync(brandPackagePath(brandDir), "utf8")).toBe(firstPackage);
			expect(readdirSync(brandDir).sort()).toEqual(firstEntries);
			expect(BRAND_ENTRIES.map((entry) => readlinkSync(join(brandDir, entry)))).toEqual(firstLinks);
		});

		it("runs from any working directory", () => {
			const { wrapper } = createIsolatedInstall();
			const otherCwd = join(tempRoot, "elsewhere");
			mkdirSync(otherCwd, { recursive: true });

			const result = runNode([wrapper, "--version"], { cwd: otherCwd });

			expect(result.status).toBe(0);
			expect(result.stdout.trim()).toBe(mainPackageJson.version);
		});

		it("presents pi-alt in the help banner and usage lines", () => {
			const { wrapper } = createIsolatedInstall();

			const result = runNode([wrapper, "--help"]);

			expect(result.status).toBe(0);
			expect(result.stdout).toContain("pi-alt - AI coding assistant");
			expect(result.stdout).toContain("Usage:\n  pi-alt [options]");
			expect(result.stdout).toMatch(/\n {2}pi-alt install <source>/);
		});

		it("documents shell-safe environment variable names", () => {
			const { wrapper } = createIsolatedInstall();

			const result = runNode([wrapper, "--help"]);

			expect(result.stdout).toContain("PI_ALT_CODING_AGENT_DIR");
			expect(result.stdout).toContain("PI_ALT_CODING_AGENT_SESSION_DIR");
			expect(result.stdout).not.toContain("PI-ALT_");
		});
	});

	describe("config isolation", () => {
		it("derives the pi-alt identity from the generated brand package", () => {
			const { brandDir, wrapper } = createIsolatedInstall();
			expect(runNode([wrapper, "--version"]).status).toBe(0);

			const result = runSourceProbe(
				configModulePath,
				`const config = await import(moduleUrl);
console.log(JSON.stringify({
  appName: config.APP_NAME,
  configDirName: config.CONFIG_DIR_NAME,
  envAgentDir: config.ENV_AGENT_DIR,
  envSessionDir: config.ENV_SESSION_DIR,
  version: config.VERSION,
  agentDir: config.getAgentDir(),
  packageJsonPath: config.getPackageJsonPath(),
}));`,
				{ PI_PACKAGE_DIR: brandDir },
			);

			expect(result.status).toBe(0);
			const observed = JSON.parse(result.stdout.trim()) as Record<string, string>;
			expect(observed.appName).toBe("pi-alt");
			expect(observed.configDirName).toBe(".pi-alt");
			expect(observed.envAgentDir).toBe("PI_ALT_CODING_AGENT_DIR");
			expect(observed.envSessionDir).toBe("PI_ALT_CODING_AGENT_SESSION_DIR");
			expect(observed.version).toBe(mainPackageJson.version);
			expect(observed.agentDir).toBe(join(tempRoot, "home", ".pi-alt", "agent"));
			expect(observed.packageJsonPath).toBe(brandPackagePath(brandDir));
		});

		it("keeps the default pi identity unchanged", () => {
			const result = runSourceProbe(
				configModulePath,
				`const config = await import(moduleUrl);
console.log(JSON.stringify({
  appName: config.APP_NAME,
  configDirName: config.CONFIG_DIR_NAME,
  envAgentDir: config.ENV_AGENT_DIR,
  envSessionDir: config.ENV_SESSION_DIR,
  agentDir: config.getAgentDir(),
}));`,
			);

			expect(result.status).toBe(0);
			const observed = JSON.parse(result.stdout.trim()) as Record<string, string>;
			expect(observed.appName).toBe("pi");
			expect(observed.configDirName).toBe(".pi");
			expect(observed.envAgentDir).toBe("PI_CODING_AGENT_DIR");
			expect(observed.envSessionDir).toBe("PI_CODING_AGENT_SESSION_DIR");
			expect(observed.agentDir).toBe(join(tempRoot, "home", ".pi", "agent"));
		});

		it("writes global settings to ~/.pi-alt and never to ~/.pi", () => {
			const { wrapper } = createIsolatedInstall();
			const extDir = createExtensionPackage();

			const result = runNode([wrapper, "install", extDir]);

			expect(result.status).toBe(0);
			const settingsPath = join(tempRoot, "home", ".pi-alt", "agent", "settings.json");
			expect(existsSync(settingsPath)).toBe(true);
			const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
				packages?: string[];
			};
			expect(settings.packages).toHaveLength(1);
			expect(realpathSync(join(dirname(settingsPath), settings.packages?.[0] ?? ""))).toBe(realpathSync(extDir));
			expect(existsSync(join(tempRoot, "home", ".pi"))).toBe(false);
		});
	});

	describe("project-level isolation", () => {
		it("reads .pi-alt project resources and ignores .pi", () => {
			const { brandDir, wrapper } = createIsolatedInstall();
			expect(runNode([wrapper, "--version"]).status).toBe(0);

			const piOnly = join(tempRoot, "pi-only");
			const altOnly = join(tempRoot, "alt-only");
			const both = join(tempRoot, "both");
			const neither = join(tempRoot, "neither");
			mkdirSync(join(piOnly, ".pi"), { recursive: true });
			writeFileSync(join(piOnly, ".pi", "settings.json"), "{}\n");
			mkdirSync(join(altOnly, ".pi-alt"), { recursive: true });
			writeFileSync(join(altOnly, ".pi-alt", "settings.json"), "{}\n");
			mkdirSync(join(both, ".pi"), { recursive: true });
			mkdirSync(join(both, ".pi-alt"), { recursive: true });
			writeFileSync(join(both, ".pi", "settings.json"), "{}\n");
			writeFileSync(join(both, ".pi-alt", "settings.json"), "{}\n");
			mkdirSync(neither, { recursive: true });

			const result = runSourceProbe(
				trustModulePath,
				`const trust = await import(moduleUrl);
const dirs = ${JSON.stringify([piOnly, altOnly, both, neither])};
console.log(JSON.stringify(dirs.map((dir) => trust.hasTrustRequiringProjectResources(dir))));`,
				{ PI_PACKAGE_DIR: brandDir },
			);

			expect(result.status).toBe(0);
			expect(JSON.parse(result.stdout.trim())).toEqual([false, true, true, false]);
		});
	});

	describe("package manifest", () => {
		it("ships a pi-alt bin entry backed by a published wrapper file", () => {
			expect(mainPackageJson.bin.pi).toBe("dist/bundle/cli.js");
			expect(mainPackageJson.bin["pi-alt"]).toBe("bin/pi-alt.js");
			expect(mainPackageJson.files).toContain("bin");
			expect(existsSync(join(packageRoot, "bin", "pi-alt.js"))).toBe(true);
		});
	});
});
