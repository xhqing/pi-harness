import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Regression guard for issue #52. `Build Binaries` dispatches on a tag to produce a
// published GitHub Release with the full asset set. The job graph used to require the
// upstream npm publish chain, which this fork can never satisfy (it does not own the
// unscoped package names and has no pi.dev credentials), so every dispatch failed after
// staging the assets and the failure handler then deleted the draft.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = readFileSync(join(REPO_ROOT, ".github", "workflows", "build-binaries.yml"), "utf8");

function jobNames(workflow) {
	return [...workflow.matchAll(/^ {2}([a-z0-9-]+):$/gm)].map((match) => match[1]);
}

/** Reads the `needs:` list of a job, returning an empty array when the job has none. */
function needsOf(workflow, job) {
	const start = workflow.indexOf(`\n  ${job}:\n`);
	assert.notEqual(start, -1, `job ${job} not found in the workflow`);
	const rest = workflow.slice(start + 1);
	const nextJob = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/);
	const block = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
	const inline = /needs: \[([^\]]*)\]/.exec(block);
	if (inline) {
		return inline[1]
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	const list = /needs:\n((?: {6}- .*\n)+)/.exec(block);
	if (list) {
		return list[1]
			.split("\n")
			.map((line) => line.replace(/^ {6}- /, "").trim())
			.filter(Boolean);
	}
	return [];
}

test("publishes the GitHub Release without the upstream npm and pi.dev publish chain", () => {
	const jobs = jobNames(WORKFLOW);
	assert.ok(!jobs.includes("publish-npm"), "the npm publish job must not be part of the fork workflow");
	assert.ok(
		!jobs.includes("announce-pi-dev-release"),
		"the pi.dev announcement job has no credentials in this fork and must not gate the release",
	);

	const publishNeeds = needsOf(WORKFLOW, "publish-github-release");
	assert.deepEqual(
		publishNeeds,
		["stage-github-release"],
		"the release must only wait for the staged assets, not for an unavailable publish step",
	);
});

test("keeps the draft cleanup for real failures only", () => {
	const start = WORKFLOW.indexOf("\n  cleanup-draft-github-release:\n");
	assert.notEqual(start, -1, "the failure cleanup job must stay in the workflow");
	const cleanup = WORKFLOW.slice(start);

	assert.doesNotMatch(cleanup, /publish-npm/, "an unavailable npm step must not trigger the cleanup");
	assert.doesNotMatch(cleanup, /announce-pi-dev-release/, "an unavailable announcement step must not trigger cleanup");
	for (const job of ["build", "smoke-test-binaries", "stage-github-release", "publish-github-release"]) {
		assert.match(cleanup, new RegExp(`needs\\.${job}\\.result`), `cleanup must react to ${job} failing`);
	}
});

test("still publishes the staged draft after the assets are verified", () => {
	const publish = WORKFLOW.slice(WORKFLOW.indexOf("\n  publish-github-release:\n"));
	assert.match(publish, /gh release edit "\$\{RELEASE_TAG\}" --draft=false/);
});
