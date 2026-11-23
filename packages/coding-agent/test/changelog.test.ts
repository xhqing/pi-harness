import { describe, expect, test } from "vitest";
import { type ChangelogEntry, getNewEntries, normalizeChangelogLinks } from "../src/utils/changelog.ts";

const entry: ChangelogEntry = {
	major: 0,
	minor: 79,
	patch: 0,
	content: "",
};

describe("getNewEntries", () => {
	const v = (version: string): ChangelogEntry => {
		const [major, minor, patch] = version.split(".").map(Number);
		return { major, minor, patch, content: `## [${version}]` };
	};
	const versions = (entries: ChangelogEntry[]): string[] =>
		entries.map((e) => `${e.major}.${e.minor}.${e.patch}`);

	// 回归：本 fork 的 CHANGELOG 保留了继承自上游的历史（0.86.0 … 0.10.0），版本号远高于
	// fork 自己的 0.0.x 系列。这些条目永远不该被当成「新条目」重放（Issue #75）。
	test("entries above the running version are never new", () => {
		const entries = [v("0.86.0"), v("0.11.2"), v("0.10.0"), v("0.0.10"), v("0.0.9")];
		expect(versions(getNewEntries(entries, "0.0.10", "0.0.10"))).toEqual([]);
	});

	test("only entries between the last seen version and the running version are new", () => {
		const entries = [v("0.86.0"), v("0.0.11"), v("0.0.10"), v("0.0.9")];
		expect(versions(getNewEntries(entries, "0.0.9", "0.0.11"))).toEqual(["0.0.11", "0.0.10"]);
	});

	test("a last seen version above the running version yields nothing", () => {
		const entries = [v("0.86.0"), v("0.10.0"), v("0.0.10")];
		expect(versions(getNewEntries(entries, "0.86.0", "0.0.10"))).toEqual([]);
	});
});

describe("normalizeChangelogLinks", () => {
	test("rewrites package-relative changelog links to tag-pinned GitHub source links", () => {
		const markdown = [
			"[Project Trust](README.md#project-trust)",
			"[Extensions](docs/extensions.md#project_trust)",
			"[Examples](examples/extensions/)",
			"[Root README](../../README.md#supply-chain-hardening)",
		].join("\n");

		expect(normalizeChangelogLinks(markdown, entry)).toBe(
			[
				"[Project Trust](https://github.com/earendil-works/pi/blob/v0.79.0/packages/coding-agent/README.md#project-trust)",
				"[Extensions](https://github.com/earendil-works/pi/blob/v0.79.0/packages/coding-agent/docs/extensions.md#project_trust)",
				"[Examples](https://github.com/earendil-works/pi/tree/v0.79.0/packages/coding-agent/examples/extensions/)",
				"[Root README](https://github.com/earendil-works/pi/blob/v0.79.0/README.md#supply-chain-hardening)",
			].join("\n"),
		);
	});

	test("canonicalizes old repository URLs without changing external links", () => {
		const markdown = [
			"[#5167](https://github.com/earendil-works/pi-mono/pull/5167)",
			"[#4163](https://github.com/badlogic/pi-mono/issues/4163)",
			"[Agent README](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)",
			"[External](https://example.com/docs)",
			"[Local anchor](#settings)",
		].join("\n");

		expect(normalizeChangelogLinks(markdown, "0.79.0")).toBe(
			[
				"[#5167](https://github.com/earendil-works/pi/pull/5167)",
				"[#4163](https://github.com/earendil-works/pi/issues/4163)",
				"[Agent README](https://github.com/earendil-works/pi/blob/v0.79.0/packages/agent/README.md)",
				"[External](https://example.com/docs)",
				"[Local anchor](#settings)",
			].join("\n"),
		);
	});
});
