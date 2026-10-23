import { describe, expect, it } from "vitest";
import { deepseekProvider } from "../src/providers/deepseek.ts";
import { kimiCodingProvider } from "../src/providers/kimi-coding.ts";

describe("API key subscription marking", () => {
	it("marks the builtin kimi-coding API key auth as subscription-backed", () => {
		expect(kimiCodingProvider().auth.apiKey?.isSubscription).toBe(true);
	});

	it("leaves a plain API-key provider unmarked", () => {
		expect(deepseekProvider().auth.apiKey?.isSubscription).toBeUndefined();
	});
});
