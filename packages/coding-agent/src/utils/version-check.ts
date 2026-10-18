import { compare, valid } from "semver";
import { fetchWithRetry } from "./management-http.ts";
import { getPiUserAgent } from "./pi-user-agent.ts";

// This repo is an independent fork, detached from earendil-works/pi on
// 2026-09-19. Update checks therefore read this fork's own GitHub Releases
// (xhqing/pi-harness), never the upstream pi.dev endpoints, so update notices only
// appear for fork releases and can never suggest installing upstream builds.
const LATEST_VERSION_URL = "https://api.github.com/repos/xhqing/pi-harness/releases/latest";
export const FORK_RELEASES_URL = "https://github.com/xhqing/pi-harness";
const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 10000;

export interface LatestPiRelease {
	version: string;
}

/**
 * Tarball asset URL for a fork release. `pi update --self` installs this
 * tarball instead of an npm registry spec, because the fork is not published
 * to the registry and a registry spec would pull the upstream package over
 * the fork install. The asset name matches the release workflow
 * (pi-coding-agent-<version>.tgz, built by scripts/build-npm-tarball.mjs).
 */
export function getForkReleaseTarballUrl(version: string): string {
	return `${FORK_RELEASES_URL}/releases/download/v${version}/pi-coding-agent-${version}.tgz`;
}

/** Include useful errno details hidden behind Node's generic "fetch failed" error. */
export function formatVersionCheckError(error: unknown): string {
	const rootMessage = error instanceof Error && error.message ? error.message : String(error);
	const cause = error instanceof Error ? error.cause : undefined;
	const causes = cause instanceof AggregateError ? cause.errors : cause === undefined ? [] : [cause];
	const codes = causes
		.map((value) =>
			typeof value === "object" && value !== null && "code" in value && typeof value.code === "string"
				? value.code
				: undefined,
		)
		.filter((code): code is string => code !== undefined);

	if (codes.length > 0) return `${rootMessage} (${[...new Set(codes)].join(", ")})`;
	const causeMessage = causes.find(
		(value): value is Error => value instanceof Error && Boolean(value.message),
	)?.message;
	return causeMessage ? `${rootMessage} (cause: ${causeMessage})` : rootMessage;
}

export function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined {
	const left = valid(leftVersion.trim());
	const right = valid(rightVersion.trim());
	if (!left || !right) {
		return undefined;
	}
	return compare(left, right);
}

export function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean {
	const comparison = comparePackageVersions(candidateVersion, currentVersion);
	if (comparison !== undefined) {
		return comparison > 0;
	}
	return candidateVersion.trim() !== currentVersion.trim();
}

export async function getLatestPiRelease(
	currentVersion: string,
	options: { timeoutMs?: number; retry?: boolean } = {},
): Promise<LatestPiRelease | undefined> {
	if (process.env.PI_OFFLINE) return undefined;

	const response = await fetchWithRetry(
		LATEST_VERSION_URL,
		{
			headers: {
				"User-Agent": getPiUserAgent(currentVersion),
				accept: "application/json",
			},
		},
		{
			maxRetries: options.retry ? 2 : 0,
			timeoutMs: options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS,
		},
	);
	if (!response.ok) return undefined;

	// GitHub's release payload exposes the version as the `tag_name` field
	// (e.g. "v1.2.3"). Strip the leading "v" and require a valid semver string
	// so a malformed tag can never surface as an update notice.
	const data = (await response.json()) as {
		tag_name?: unknown;
	};
	if (typeof data.tag_name !== "string" || !data.tag_name.trim()) {
		return undefined;
	}
	const version = data.tag_name.trim().replace(/^v/, "");
	if (!valid(version)) return undefined;
	return { version };
}

export async function getLatestPiVersion(
	currentVersion: string,
	options: { timeoutMs?: number; retry?: boolean } = {},
): Promise<string | undefined> {
	return (await getLatestPiRelease(currentVersion, options))?.version;
}

export async function checkForNewPiVersion(currentVersion: string): Promise<LatestPiRelease | undefined> {
	if (process.env.PI_SKIP_VERSION_CHECK) return undefined;

	try {
		const latestRelease = await getLatestPiRelease(currentVersion);
		if (latestRelease && isNewerPackageVersion(latestRelease.version, currentVersion)) {
			return latestRelease;
		}
		return undefined;
	} catch {
		return undefined;
	}
}
