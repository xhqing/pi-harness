/**
 * Regression tests for #49: one broken extension must not take down the whole CLI.
 *
 * Incident (2026-11-04): a stray unescaped backtick inside a template literal in a
 * single local extension made every `pi` invocation exit 1 before the TUI/print run
 * started ("Error: Failed to load extension ... ParserError ..."). Only `pi -ne`
 * and `pi --help` still worked.
 *
 * Required behavior (#49):
 * - a broken extension is skipped with a loud warning; `pi` starts and works normally;
 * - `pi -p "..."` in an automated/cron context does not die because some unrelated
 *   extension broke;
 * - `--strict-extensions` restores exit-on-error.
 *
 * The assertions below only observe the CLI from the outside: the child process exit
 * code, its stderr diagnostics, its stdout answer, and whether the healthy extensions
 * actually ran (each one appends its name to a marker file when it loads).
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";

const cliPath = resolve(__dirname, "../src/cli.ts");
const sourceResolverPath = resolve(__dirname, "../src/experimental/source-resolver.ts");

const PROVIDER_ID = "extension-load-fixture";
const MODEL_ID = "fixture-model";
const REPLY_TEXT = "echo-ok";

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise<void>((resolveClose) => {
					server.close(() => resolveClose());
					server.closeAllConnections();
				}),
		),
	);
});

interface FixtureRunResult {
	code: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	/** Names of the healthy extensions whose load-time marker was written. */
	loaded: string[];
}

interface FixtureOptions {
	/** Extension file names expected to load; each writes its name to the marker file. */
	healthy?: string[];
	/** Extension file names containing a syntax error; they must not load. */
	broken?: string[];
	args: string[];
}

async function startFixtureServer(): Promise<string> {
	const server = createServer((request, response) => {
		request.resume();
		request.on("end", () => {
			if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
				response.writeHead(404).end();
				return;
			}
			response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
			response.write(
				`data: ${JSON.stringify({
					id: "chatcmpl-ext-load",
					object: "chat.completion.chunk",
					created: 0,
					model: MODEL_ID,
					choices: [{ index: 0, delta: { role: "assistant", content: REPLY_TEXT }, finish_reason: null }],
				})}\n\n`,
			);
			response.write(
				`data: ${JSON.stringify({
					id: "chatcmpl-ext-load",
					object: "chat.completion.chunk",
					created: 0,
					model: MODEL_ID,
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: { prompt_tokens: 3, completion_tokens: 2 },
				})}\n\n`,
			);
			response.end("data: [DONE]\n\n");
		});
	});
	servers.push(server);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address() as AddressInfo;
	return `http://127.0.0.1:${port}`;
}

function healthyExtensionSource(name: string, markerPath: string): string {
	return `import { appendFileSync } from "node:fs";
export default function (pi) {
	appendFileSync(${JSON.stringify(markerPath)}, ${JSON.stringify(`${name}\n`)});
	pi.registerCommand(${JSON.stringify(name)}, { handler: async () => {} });
}
`;
}

// Same class of failure as the #49 incident: a syntax error in the extension file.
const BROKEN_EXTENSION_SOURCE = `export default function (pi) {
	pi.registerCommand("broken-ext-command", { handler: async () => {} });
`;

async function runPi(options: FixtureOptions): Promise<FixtureRunResult> {
	// realpath: on macOS tmpdir() is a symlink (/var -> /private/var); extension load
	// diagnostics print the path the loader sees, so the fixture must use physical paths.
	const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "pi-ext-load-")));
	tempDirs.push(tempRoot);
	const agentDir = join(tempRoot, "agent");
	const projectDir = join(tempRoot, "project");
	const extensionsDir = join(agentDir, "extensions");
	const markerPath = join(tempRoot, "loaded.marker");
	mkdirSync(extensionsDir, { recursive: true });
	mkdirSync(projectDir, { recursive: true });

	const baseUrl = await startFixtureServer();
	writeFileSync(
		join(agentDir, "models.json"),
		JSON.stringify({
			providers: {
				[PROVIDER_ID]: {
					baseUrl: `${baseUrl}/v1`,
					api: "openai-completions",
					apiKey: "fixture-key",
					compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
					models: [
						{
							id: MODEL_ID,
							name: "Fixture Model",
							contextWindow: 8192,
							maxTokens: 512,
							input: ["text"],
						},
					],
				},
			},
		}),
	);

	for (const name of options.healthy ?? []) {
		writeFileSync(join(extensionsDir, `${name}.ts`), healthyExtensionSource(name, markerPath));
	}
	for (const name of options.broken ?? []) {
		writeFileSync(join(extensionsDir, `${name}.ts`), BROKEN_EXTENSION_SOURCE);
	}

	let stdout = "";
	let stderr = "";
	const child = spawn(
		process.execPath,
		["--import", sourceResolverPath, cliPath, ...options.args, "--model", `${PROVIDER_ID}/${MODEL_ID}`],
		{
			cwd: projectDir,
			env: {
				...process.env,
				[ENV_AGENT_DIR]: agentDir,
				PI_OFFLINE: "1",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	const { code, signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolveRun, rejectRun) => {
			const timeout = setTimeout(() => {
				child.kill("SIGKILL");
			}, 60_000);
			child.on("error", (error) => {
				clearTimeout(timeout);
				rejectRun(error);
			});
			child.on("close", (exitCode, exitSignal) => {
				clearTimeout(timeout);
				resolveRun({ code: exitCode, signal: exitSignal });
			});
		},
	);

	const loaded = existsSync(markerPath)
		? readFileSync(markerPath, "utf8")
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
		: [];

	return { code, signal, stdout, stderr, loaded };
}

function brokenPathPattern(name: string): RegExp {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`Failed to load extension "[^"]*${escaped}\\.ts"`);
}

describe("extension load failures (#49)", () => {
	it("skips a broken extension, keeps running, and still loads the healthy one", async () => {
		const result = await runPi({
			healthy: ["alpha"],
			broken: ["broken"],
			args: ["-p", "say ok"],
		});

		// The CLI must not die because of one broken optional plug-in.
		expect(result.signal).toBeNull();
		expect(result.code).toBe(0);
		// The automated run completes normally.
		expect(result.stdout).toContain(REPLY_TEXT);
		// The failure is reported loudly, naming the offending file.
		expect(result.stderr).toMatch(brokenPathPattern("broken"));
		// The healthy extension still loaded.
		expect(result.loaded).toEqual(["alpha"]);
	}, 90_000);

	it("does not take down other extensions when one is broken", async () => {
		const result = await runPi({
			healthy: ["alpha", "beta"],
			broken: ["broken"],
			args: ["-p", "say ok"],
		});

		expect(result.signal).toBeNull();
		expect(result.code).toBe(0);
		expect(result.stdout).toContain(REPLY_TEXT);
		expect(result.stderr).toMatch(brokenPathPattern("broken"));
		// Both healthy extensions loaded — the failure stayed local to the broken file.
		expect(result.loaded.sort()).toEqual(["alpha", "beta"]);
	}, 90_000);

	it("fails fast with --strict-extensions", async () => {
		const result = await runPi({
			healthy: ["alpha"],
			broken: ["broken"],
			args: ["-p", "say ok", "--strict-extensions"],
		});

		expect(result.signal).toBeNull();
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Failed to load extension");
		expect(result.stderr).toMatch(brokenPathPattern("broken"));
		expect(result.stderr).toContain("pi -ne");
		// The flag must be a real option, not an unrecognized one that happens to exit 1.
		expect(result.stderr).not.toContain("Unknown option");
	}, 90_000);

	it("runs normally with --strict-extensions when every extension loads", async () => {
		const result = await runPi({
			healthy: ["alpha"],
			args: ["-p", "say ok", "--strict-extensions"],
		});

		expect(result.signal).toBeNull();
		expect(result.code).toBe(0);
		expect(result.stdout).toContain(REPLY_TEXT);
		expect(result.loaded).toEqual(["alpha"]);
		expect(result.stderr).not.toContain("Unknown option");
		expect(result.stderr).not.toMatch(/Failed to load extension/i);
	}, 90_000);

	it("reports nothing about extension loading when every extension loads", async () => {
		const result = await runPi({
			healthy: ["alpha", "beta"],
			args: ["-p", "say ok"],
		});

		expect(result.signal).toBeNull();
		expect(result.code).toBe(0);
		expect(result.stdout).toContain(REPLY_TEXT);
		expect(result.loaded.sort()).toEqual(["alpha", "beta"]);
		// No false positives: healthy extensions must not produce load warnings/errors.
		expect(result.stderr).not.toMatch(/Failed to load extension/i);
		expect(result.stderr).not.toMatch(/(warning|error):[^\n]*extension/i);
	}, 90_000);
});
