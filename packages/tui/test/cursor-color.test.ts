import assert from "node:assert";
import { describe, it } from "node:test";
import { Editor } from "../src/components/editor.ts";
import { cursorColorSequence, RESET_CURSOR_COLOR_SEQUENCE } from "../src/terminal.ts";
import { normalizeCursorColor } from "../src/terminal-colors.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { defaultEditorTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

function createTui(): { terminal: VirtualTerminal; tui: TuiMainScreen; writes: string[] } {
	const terminal = new VirtualTerminal();
	const writes: string[] = [];
	const originalWrite = terminal.write.bind(terminal);
	terminal.write = (data: string) => {
		writes.push(data);
		originalWrite(data);
	};
	return { terminal, tui: new TuiMainScreen(terminal), writes };
}

describe("normalizeCursorColor", () => {
	it("accepts #rrggbb and lowercases it", () => {
		assert.strictEqual(normalizeCursorColor("#3B82F6"), "#3b82f6");
	});

	it("expands #rgb shorthand", () => {
		assert.strictEqual(normalizeCursorColor("#0f8"), "#00ff88");
	});

	it("trims surrounding whitespace", () => {
		assert.strictEqual(normalizeCursorColor("  #112233 "), "#112233");
	});

	it("rejects names, theme variables, and malformed hex", () => {
		assert.strictEqual(normalizeCursorColor("blue"), undefined);
		assert.strictEqual(normalizeCursorColor("accent"), undefined);
		assert.strictEqual(normalizeCursorColor("#12345"), undefined);
		assert.strictEqual(normalizeCursorColor("#gggggg"), undefined);
		assert.strictEqual(normalizeCursorColor(""), undefined);
		assert.strictEqual(normalizeCursorColor(undefined), undefined);
	});
});

describe("TuiMainScreen cursor color", () => {
	it("applies the configured color when the TUI starts and resets it on stop", () => {
		const { tui, writes } = createTui();
		tui.setCursorColor("#3B82F6");
		assert.strictEqual(tui.getCursorColor(), "#3b82f6");

		tui.start();
		assert.ok(writes.some((chunk) => chunk.includes(cursorColorSequence("#3b82f6"))));

		tui.stop();
		assert.ok(writes.some((chunk) => chunk.includes(RESET_CURSOR_COLOR_SEQUENCE)));
	});

	it("updates the running terminal when the color changes or is cleared", () => {
		const { tui, writes } = createTui();
		tui.start();

		tui.setCursorColor("#aabbcc");
		assert.ok(writes.some((chunk) => chunk.includes(cursorColorSequence("#aabbcc"))));

		tui.setCursorColor(undefined);
		assert.strictEqual(tui.getCursorColor(), undefined);
		assert.ok(writes.some((chunk) => chunk.includes(RESET_CURSOR_COLOR_SEQUENCE)));

		tui.stop();
	});

	it("ignores values that are not plain hex colors", () => {
		const { tui, writes } = createTui();
		tui.start();
		writes.length = 0;

		tui.setCursorColor("accent");
		assert.strictEqual(tui.getCursorColor(), undefined);
		assert.ok(!writes.some((chunk) => chunk.includes("\x1b]12;")));

		tui.stop();
	});

	it("reapplies the color whenever the hardware cursor is positioned", () => {
		const { tui, writes } = createTui();
		tui.setCursorStyle("hardware");
		tui.setCursorColor("#3b82f6");
		const editor = new Editor(tui, defaultEditorTheme);
		tui.addChild(editor);
		tui.setFocus(editor);
		tui.start();
		writes.length = 0;

		tui.renderNow(true);

		assert.ok(
			writes.some((chunk) => chunk.includes(cursorColorSequence("#3b82f6"))),
			"rendering with a focused editor should re-emit the cursor color",
		);
		tui.stop();
	});
});
