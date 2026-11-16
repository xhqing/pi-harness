import { describe, expect, it } from "vitest";
import { MODELS } from "../src/models.generated.ts";
import type { Model } from "../src/types.ts";

// Regression guard for issues #42 and #44. `packages/ai/src/providers/data/` is
// regenerated from the models.dev catalog during the package build, so model ids drift:
// upstream renamed `deepseek-v4-flash` to `deepseek-v4.1-flash`, and the generator's
// `opencode:deepseek-v4-flash` entry in
// OPENCODE_OPENAI_COMPLETIONS_LONG_CACHE_RETENTION_UNSUPPORTED_MODELS stopped matching
// anything. Nothing failed — OpenCode simply started advertising long cache retention for
// a route that rejects it. Asserting the rule (every OpenCode DeepSeek route opts out)
// instead of naming ids keeps the check meaningful across renames and turns red as soon
// as a rule entry stops matching a real model.

const opencodeDeepSeekModels = (Object.values(MODELS.opencode) as Model[]).filter(
	(model) => model.api === "openai-completions" && model.id.toLowerCase().includes("deepseek"),
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
