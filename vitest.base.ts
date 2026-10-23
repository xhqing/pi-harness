import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export const workspaceSourcePaths = {
	chordIndex: fileURLToPath(new URL("./packages/chord/src/index.ts", import.meta.url)),
	chordContext: fileURLToPath(new URL("./packages/chord/src/context/index.ts", import.meta.url)),
	chordDelta: fileURLToPath(new URL("./packages/chord/src/delta/index.ts", import.meta.url)),
	chordBundler: fileURLToPath(new URL("./packages/chord/src/bundler.ts", import.meta.url)),
	chordNode: fileURLToPath(new URL("./packages/chord/src/node.ts", import.meta.url)),
	telemetryIndex: fileURLToPath(new URL("./packages/telemetry/src/index.ts", import.meta.url)),
	telemetryTesting: fileURLToPath(new URL("./packages/telemetry/src/testing/index.ts", import.meta.url)),
	aiIndex: fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
	aiCompat: fileURLToPath(new URL("./packages/ai/src/compat.ts", import.meta.url)),
	aiOAuth: fileURLToPath(new URL("./packages/ai/src/oauth.ts", import.meta.url)),
	aiProviders: fileURLToPath(new URL("./packages/ai/src/providers", import.meta.url)),
	aiUtils: fileURLToPath(new URL("./packages/ai/src/utils", import.meta.url)),
	agentIndex: fileURLToPath(new URL("./packages/agent/src/index.ts", import.meta.url)),
	agentNode: fileURLToPath(new URL("./packages/agent/src/node.ts", import.meta.url)),
	protocolIndex: fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url)),
	clientIndex: fileURLToPath(new URL("./packages/client/src/index.ts", import.meta.url)),
	clientUnix: fileURLToPath(new URL("./packages/client/src/unix.ts", import.meta.url)),
	serverIndex: fileURLToPath(new URL("./packages/server/src/index.ts", import.meta.url)),
	serverUnix: fileURLToPath(new URL("./packages/server/src/transports/unix/index.ts", import.meta.url)),
	codingAgentIndex: fileURLToPath(new URL("./packages/coding-agent/src/index.ts", import.meta.url)),
	tuiIndex: fileURLToPath(new URL("./packages/tui/src/index.ts", import.meta.url)),
} as const;

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^chord$/, replacement: workspaceSourcePaths.chordIndex },
			{ find: /^chord\/context$/, replacement: workspaceSourcePaths.chordContext },
			{ find: /^chord\/delta$/, replacement: workspaceSourcePaths.chordDelta },
			{ find: /^chord\/bundler$/, replacement: workspaceSourcePaths.chordBundler },
			{ find: /^chord\/node$/, replacement: workspaceSourcePaths.chordNode },
			{ find: /^pi-telemetry$/, replacement: workspaceSourcePaths.telemetryIndex },
			{ find: /^pi-telemetry\/testing$/, replacement: workspaceSourcePaths.telemetryTesting },
			{ find: /^pi-ai$/, replacement: workspaceSourcePaths.aiIndex },
			{ find: /^pi-ai\/compat$/, replacement: workspaceSourcePaths.aiCompat },
			{ find: /^pi-ai\/oauth$/, replacement: workspaceSourcePaths.aiOAuth },
			{
				find: /^pi-ai\/utils\/(.+)$/,
				replacement: `${workspaceSourcePaths.aiUtils}/$1.ts`,
			},
			{
				find: /^pi-ai\/providers\/(.+)$/,
				replacement: `${workspaceSourcePaths.aiProviders}/$1.ts`,
			},
			{ find: /^pi-agent-core$/, replacement: workspaceSourcePaths.agentIndex },
			{ find: /^pi-agent-core\/node$/, replacement: workspaceSourcePaths.agentNode },
			{ find: /^pi-protocol$/, replacement: workspaceSourcePaths.protocolIndex },
			{ find: /^pi-client$/, replacement: workspaceSourcePaths.clientIndex },
			{ find: /^pi-client\/unix$/, replacement: workspaceSourcePaths.clientUnix },
			{ find: /^pi-server$/, replacement: workspaceSourcePaths.serverIndex },
			{ find: /^pi-server\/unix$/, replacement: workspaceSourcePaths.serverUnix },
			{ find: /^pi-tui$/, replacement: workspaceSourcePaths.tuiIndex },
		],
	},
});
