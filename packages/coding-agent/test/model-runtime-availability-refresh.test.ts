import type { Model, Provider } from "pi-ai";
import { describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";

interface Deferred {
	promise: Promise<void>;
	resolve(): void;
}

function createDeferred(): Deferred {
	let resolvePromise = () => {};
	const promise = new Promise<void>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: resolvePromise };
}

/** Hold the first `count` credential listings until the test releases them. */
function stallCredentialLists(credentials: AuthStorage, count: number) {
	const originalList = credentials.list.bind(credentials);
	const entered = Array.from({ length: count }, createDeferred);
	const gates = Array.from({ length: count }, createDeferred);
	let call = 0;
	credentials.list = async (options) => {
		if (call < count) {
			const index = call;
			call += 1;
			entered[index].resolve();
			await gates[index].promise;
		}
		return originalList(options);
	};
	return {
		waitForEnter: (index: number) => entered[index].promise,
		release: (index: number) => gates[index].resolve(),
	};
}

function model(providerId: string): Model<"openai-completions"> {
	return {
		id: "dynamic",
		name: "Dynamic",
		api: "openai-completions",
		provider: providerId,
		baseUrl: "https://example.test/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000,
		maxTokens: 100,
	};
}

function provider(id: string, checkSource: () => string): Provider<"openai-completions"> {
	return {
		id,
		name: id,
		auth: {
			apiKey: {
				name: "API key",
				login: async () => ({ type: "api_key", key: `${id}-key` }),
				check: async () => ({ type: "api_key", source: checkSource() }),
				resolve: async () => ({ auth: { apiKey: `${id}-key` }, source: "test" }),
			},
		},
		getModels: () => [model(id)],
		stream: () => {
			throw new Error("unused");
		},
		streamSimple: () => {
			throw new Error("unused");
		},
	};
}

describe("ModelRuntime availability refresh ordering", () => {
	it("resolves refresh() with a snapshot at least as new as the pass it started", async () => {
		const credentials = AuthStorage.inMemory();
		const runtime = await ModelRuntime.create({ credentials, modelsPath: null, allowModelNetwork: false });
		let checkSource = "first";
		runtime.registerNativeProvider(provider("dynamic", () => checkSource));
		// Registration starts a background availability pass; wait for it so the runtime is quiet.
		await vi.waitFor(() =>
			expect(runtime.getProviderAuthStatus("dynamic")).toEqual({
				configured: true,
				source: "environment",
				label: "first",
			}),
		);

		// The provider auth state changes afterwards, so the published snapshot is now stale.
		checkSource = "second";

		const stalled = stallCredentialLists(credentials, 2);
		const refresh = runtime.refresh({ allowNetwork: false });
		await stalled.waitForEnter(0);

		// A concurrent pass starts while refresh()'s own pass is still in flight.
		const competing = runtime.getAvailable();
		await stalled.waitForEnter(1);

		stalled.release(0);
		await refresh;
		expect(runtime.getProviderAuthStatus("dynamic")).toEqual({
			configured: true,
			source: "environment",
			label: "second",
		});

		stalled.release(1);
		await competing;
	});
});
