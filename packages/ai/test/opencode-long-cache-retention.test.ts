import { describe, expect, it } from "vitest";
import { MODELS } from "../src/models.generated.ts";
import type { Api, Model } from "../src/types.ts";

// Regression guard for issues #42 and #44. `packages/ai/src/providers/data/` is
// regenerated from the models.dev catalog during the package build, so model ids drift:
// upstream renamed `deepseek-v4-flash` to `deepseek-v4.1-flash`, and the generator's
// `opencode:deepseek-v4-flash` entry in
// OPENCODE_OPENAI_COMPLETIONS_LONG_CACHE_RETENTION_UNSUPPORTED_MODELS stopped matching
// anything. Nothing failed — OpenCode simply started advertising long cache retention for
// a route that rejects it. Asserting the rule (every OpenCode DeepSeek route opts out)
// instead of naming ids keeps the check meaningful across renames and turns red as soon
// as a rule entry stops matching a real model.

// The generator list behind this rule is a record of routes measured to reject
// `prompt_cache_retention` (upstream commit 21a904f4b, closes #5702), not "everything on the
// same endpoint": it has only ever covered the paid DeepSeek routes. The `-free` aliases are
// deliberately excluded — there is no measurement showing they reject long retention, and
// disabling it for them would remove a capability they may support. Covering them is a
// separate decision that needs a live request, not an inference from the shared base URL.
const opencodeDeepSeekModels = (Object.values(MODELS.opencode) as Model<Api>[]).filter(
	(model): model is Model<"openai-completions"> =>
		model.api === "openai-completions" &&
		model.id.toLowerCase().includes("deepseek") &&
		!model.id.toLowerCase().endsWith("-free"),
);

describe("opencode DeepSeek long cache retention", () => {
	it("exposes at least one DeepSeek route to check", () => {
		// A renamed or retired provider group would otherwise make the loop below vacuous.
		expect(opencodeDeepSeekModels.length).toBeGreaterThan(0);
	});

	it("opts every DeepSeek route out of long cache retention", () => {
		for (const model of opencodeDeepSeekModels) {
			expect(model.compat?.supportsLongCacheRetention, `${model.provider}/${model.id}`).toBe(false);
		}
	});
});
