import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkForNewPiVersion,
	comparePackageVersions,
	formatVersionCheckError,
	getLatestPiRelease,
	getLatestPiVersion,
	isNewerPackageVersion,
} from "../src/utils/version-check.ts";
import { allowNetwork } from "./test-network-env.ts";

const originalSkipVersionCheck = process.env.PI_SKIP_VERSION_CHECK;

beforeEach(() => {
	allowNetwork();
});

afterEach(() => {
	vi.unstubAllGlobals();
	if (originalSkipVersionCheck === undefined) {
		delete process.env.PI_SKIP_VERSION_CHECK;
	} else {
		process.env.PI_SKIP_VERSION_CHECK = originalSkipVersionCheck;
	}
});

describe("version checks", () => {
	it("compares package versions", () => {
		expect(comparePackageVersions("0.70.6", "0.70.5")).toBeGreaterThan(0);
		expect(comparePackageVersions("0.70.5", "0.70.5")).toBe(0);
		expect(comparePackageVersions("0.70.4", "0.70.5")).toBeLessThan(0);
		expect(comparePackageVersions("5.0.0-beta.20", "5.0.0-beta.9")).toBeGreaterThan(0);
		expect(isNewerPackageVersion("0.70.5", "0.70.5")).toBe(false);
		expect(isNewerPackageVersion("0.70.6", "0.70.5")).toBe(true);
	});

	it("returns only newer fork releases", async () => {
		const fetchMock = vi.fn(async () => Response.json({ tag_name: "v1.2.3" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		const release = await checkForNewPiVersion("1.2.2");
		expect(release?.version).toMatch(/^v?1\.2\.3$/);
	});

	it("checks this fork's GitHub releases instead of upstream pi.dev", async () => {
		const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
			Response.json({ tag_name: "v1.2.4" }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const release = await getLatestPiRelease("1.2.3");
		expect(release?.version).toMatch(/^v?1\.2\.4$/);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [requestedUrl, requestInit] = fetchMock.mock.calls[0];
		expect(String(requestedUrl)).toContain("xhqing/pi-harness");
		expect(String(requestedUrl)).not.toContain("pi.dev");
		expect(requestInit).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					"User-Agent": expect.stringMatching(/^pi\/1\.2\.3 /),
				}),
			}),
		);
	});

	it("retries a transient version request when explicitly requested", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockResolvedValueOnce(Response.json({ tag_name: "v1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		const release = await getLatestPiRelease("1.2.3", { retry: true });
		expect(release?.version).toMatch(/^v?1\.2\.4$/);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("keeps automatic version checks to one request", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("formats nested network error details", () => {
		const error = new Error("fetch failed", {
			cause: new AggregateError([
				Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" }),
				Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" }),
			]),
		});

		expect(formatVersionCheckError(error)).toBe("fetch failed (ETIMEDOUT, ENETUNREACH)");
	});

	// Issue #4: the version check now reads this fork's GitHub Releases, whose
	// payloads have no packageName/note fields, so those passthrough cases were
	// removed. If the fork later surfaces GitHub release bodies as notes, add
	// coverage for that mapping here.

	it("skips automatic api calls when version checks are disabled", async () => {
		process.env.PI_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("allows direct api calls when automatic version checks are disabled", async () => {
		process.env.PI_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn(async () => Response.json({ tag_name: "v1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		const latest = await getLatestPiVersion("1.2.3");
		expect(latest).toMatch(/^v?1\.2\.4$/);
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
