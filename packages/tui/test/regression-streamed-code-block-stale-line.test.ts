import assert from "node:assert";
import { describe, it } from "node:test";
import { Markdown, type MarkdownTheme } from "../src/components/markdown.ts";
import { Spacer } from "../src/components/spacer.ts";
import { Text } from "../src/components/text.ts";
import type { TUI } from "../src/tui.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { defaultMarkdownTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

// Regression guard for issue #61: a streamed reply must end up on screen exactly like the
// same text rendered in one pass. The bug report shows a fenced code block that keeps a
// stale partial line ("Your branch is") directly above the complete line once the rest of
// it streams in, so the whole block ends up one row too tall.

const stripAnsi = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+$/, "");

const trimTrailingBlank = (lines: string[]): string[] => {
	const copy = [...lines];
	while (copy.length > 0 && copy[copy.length - 1] === "") {
		copy.pop();
	}
	return copy;
};

const GIT_STATUS_BODY = [
	">> git status",
	"On branch main",
	"Your branch is up to date with 'origin/main'.",
	"",
	"nothing to commit, working tree clean",
].join("\n");

const fenced = (partial: string, lang = ""): string => `\`\`\`${lang}\n${partial}\n\`\`\``;

/**
 * Builds the same shape the interactive UI uses: history text, a spacer, the streaming
 * assistant Markdown block, and a fixed footer that must stay put while the block grows.
 */
function createSurface(width: number, height: number, historyLines: number, initialText: string) {
	const terminal = new VirtualTerminal(width, height);
	const tui: TUI = new TuiMainScreen(terminal);
	const history = new Text(
		Array.from({ length: historyLines }, (_, index) => `history line ${index}`).join("\n"),
		0,
		0,
	);
	const message = new Markdown(initialText.trim(), 2, 0, defaultMarkdownTheme);
	const footer = new Text("> editor\n-----", 0, 0);
	tui.addChild(history);
	tui.addChild(new Spacer(1));
	tui.addChild(message);
	tui.addChild(footer);

	return {
		async stream(frames: readonly string[]): Promise<string[]> {
			tui.start();
			await terminal.waitForRender();
			// `AssistantMessage.updateContent()` rebuilds its Markdown child on every frame
			// instead of mutating one component, which is why the text is re-set per frame.
			for (const frame of frames.slice(1)) {
				message.setText(frame.trim());
				tui.requestRender();
				await terminal.waitForRender();
			}
			const viewport = trimTrailingBlank(terminal.getViewport().map(stripAnsi));
			tui.stop();
			return viewport;
		},
	};
}

/** Frames that grow the block in token-sized chunks, as streaming does. */
function streamingFrames(source: string, chunk: number): string[] {
	const frames: string[] = [];
	for (let end = 1; end <= source.length; end += chunk) {
		frames.push(fenced(source.slice(0, end)));
	}
	if (frames[frames.length - 1] !== fenced(source)) {
		frames.push(fenced(source));
	}
	return frames;
}

const CASES: ReadonlyArray<{ width: number; height: number; history: number; chunk: number; lang: string }> = [
	{ width: 80, height: 24, history: 0, chunk: 8, lang: "" },
	{ width: 80, height: 24, history: 20, chunk: 8, lang: "" },
	{ width: 40, height: 24, history: 20, chunk: 8, lang: "" },
	{ width: 33, height: 20, history: 6, chunk: 8, lang: "" },
	{ width: 24, height: 20, history: 6, chunk: 8, lang: "" },
	{ width: 40, height: 12, history: 20, chunk: 8, lang: "bash" },
];

async function renderDirect(width: number, height: number, history: number, text: string): Promise<string[]> {
	const surface = createSurface(width, height, history, text);
	const view = await surface.stream([text]);
	return view;
}

describe("streaming a fenced code block (issue #61)", () => {
	for (const testCase of CASES) {
		it(`renders ${testCase.width}x${testCase.height} history=${testCase.history} lang=${testCase.lang || "none"} like a single pass`, async () => {
			const final = fenced(GIT_STATUS_BODY, testCase.lang);
			const frames = streamingFrames(GIT_STATUS_BODY, testCase.chunk).map((frame) =>
				testCase.lang ? frame.replace(/^```/, `\`\`\`${testCase.lang}`) : frame,
			);

			const streamed = createSurface(testCase.width, testCase.height, testCase.history, frames[0] as string);
			const streamedView = await streamed.stream(frames);
			const directView = await renderDirect(testCase.width, testCase.height, testCase.history, final);

			assert.deepStrictEqual(streamedView, directView, "streamed render must match a single-pass render");
		});
	}

	it("clears the previous shorter content when a transform rewrites the block and shrinks it", async () => {
		// Markdown transformers may rewrite a partially streamed block (an extension can
		// reformat what already arrived), so the stream can shrink between frames.
		const frames = streamingFrames(GIT_STATUS_BODY, 8);
		const rewritten = [...frames];
		for (let index = 4; index < rewritten.length; index += 3) {
			const cut = Math.floor((GIT_STATUS_BODY.length * index) / rewritten.length);
			rewritten[index] = fenced(
				GIT_STATUS_BODY.slice(0, Math.max(1, cut)).replace(
					"Your branch is up to date with 'origin/main'.",
					"Your branch is",
				),
			);
		}
		rewritten.push(fenced(GIT_STATUS_BODY));

		const surface = createSurface(40, 20, 6, rewritten[0] as string);
		const streamedView = await surface.stream(rewritten);
		const directView = await renderDirect(40, 20, 6, fenced(GIT_STATUS_BODY));

		assert.deepStrictEqual(streamedView, directView, "shrink-then-grow frames must not leave stale rows behind");
	});

	it("keeps the code block at a stable height while the closing fence streams in", async () => {
		// A partially arrived closing fence must not add or drop rows, otherwise the block
		// flickers in height on every token.
		const theme: MarkdownTheme = defaultMarkdownTheme;
		const markdown = new Markdown(fenced("a\nb"), 2, 0, theme);
		const heights = new Set<number>();
		for (const fence of ["`", "``", "```"]) {
			markdown.setText(`\`\`\`\na\nb\n${fence}`.trim());
			heights.add(markdown.render(80).length);
		}
		markdown.setText(fenced("a\nb"));
		heights.add(markdown.render(80).length);
		assert.strictEqual(heights.size, 1, "the code block height must not change while the closing fence arrives");
	});
});
