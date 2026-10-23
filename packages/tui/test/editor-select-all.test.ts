import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Editor } from "../src/components/editor.ts";
import { KeybindingsManager, setKeybindings, TUI_KEYBINDINGS } from "../src/keybindings.ts";
import type { TuiMouseEvent } from "../src/tui.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { defaultEditorTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

const SELECT_ALL = "\x1b[97;9u"; // Cmd+A (Kitty CSI u)
const BACKSPACE = "\x7f";
const FORWARD_DELETE = "\x1b[3~";
const LEFT = "\x1b[D";
const ESCAPE = "\x1b";
const UNDO = "\x1b[45;5u"; // Ctrl+-
const CTRL_A = "\x01";

function createEditor(): Editor {
	return new Editor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme);
}

function click(x: number, y: number): TuiMouseEvent {
	return {
		type: "click",
		button: "left",
		x,
		y,
		screenX: x,
		screenY: y,
		width: 40,
		height: 10,
		shift: false,
		alt: false,
		ctrl: false,
		clickCount: 1,
	};
}

afterEach(() => {
	setKeybindings(new KeybindingsManager(TUI_KEYBINDINGS));
});

describe("Editor select-all", () => {
	it("binds Cmd+A to tui.editor.selectAll by default", () => {
		const keybindings = new KeybindingsManager(TUI_KEYBINDINGS);

		assert.deepStrictEqual(keybindings.getKeys("tui.editor.selectAll"), ["super+a"]);
		assert.strictEqual(keybindings.matches(SELECT_ALL, "tui.editor.selectAll"), true);
	});

	it("clears the whole buffer on Backspace after select-all", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		editor.handleInput(BACKSPACE);

		assert.strictEqual(editor.getText(), "");
	});

	it("clears the whole buffer on Delete after select-all", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		editor.handleInput(FORWARD_DELETE);

		assert.strictEqual(editor.getText(), "");
	});

	it("replaces the whole buffer when typing after select-all", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		editor.handleInput("x");

		assert.strictEqual(editor.getText(), "x");
	});

	it("clears a multiline buffer on Backspace after select-all", () => {
		const editor = createEditor();
		editor.setText("hello\nworld");

		editor.handleInput(SELECT_ALL);
		editor.handleInput(BACKSPACE);

		assert.strictEqual(editor.getText(), "");
	});

	it("cancels the selection when moving the cursor, keeping later edits local", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		editor.handleInput(LEFT);
		editor.handleInput(BACKSPACE);

		assert.strictEqual(editor.getText(), "helo");
	});

	it("cancels the selection on Escape, keeping later edits local", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		editor.handleInput(ESCAPE);
		editor.handleInput(BACKSPACE);

		assert.strictEqual(editor.getText(), "hell");
	});

	it("cancels the selection on mouse click, inserting at the clicked position", () => {
		const editor = createEditor();
		editor.setText("hello");
		editor.render(40);

		editor.handleInput(SELECT_ALL);
		editor.handleMouse(click(2, 1));
		editor.handleInput("x");

		assert.strictEqual(editor.getText(), "hexllo");
	});

	it("renders the selection with reverse video without changing the text", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		const line = editor.render(40).find((entry) => stripVTControlCharacters(entry).trimEnd() === "hello");

		assert.ok(line, "expected a rendered line containing the editor text");
		assert.ok(
			line.includes("\x1b[7mhello\x1b[0m"),
			"expected the whole text wrapped in reverse video, not just the cursor",
		);
		assert.strictEqual(stripVTControlCharacters(line).trimEnd(), "hello");
	});

	it("clears the selection on programmatic setText", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		editor.setText("abc");
		editor.handleInput(BACKSPACE);

		assert.strictEqual(editor.getText(), "ab");
	});

	it("treats select-all on an empty editor as a no-op", () => {
		const editor = createEditor();

		editor.handleInput(SELECT_ALL);
		editor.handleInput("x");

		assert.strictEqual(editor.getText(), "x");
	});

	it("keeps Ctrl+A as move-to-line-start instead of select-all", () => {
		const editor = createEditor();
		editor.setText("hello");
		editor.handleInput("\x1b[F"); // End
		assert.deepStrictEqual(editor.getCursor(), { line: 0, col: 5 });

		editor.handleInput(CTRL_A);

		assert.deepStrictEqual(editor.getCursor(), { line: 0, col: 0 });
		assert.strictEqual(editor.getText(), "hello");
	});

	it("restores the full text on undo after select-all clear", () => {
		const editor = createEditor();
		editor.setText("hello");

		editor.handleInput(SELECT_ALL);
		editor.handleInput(BACKSPACE);
		assert.strictEqual(editor.getText(), "");

		editor.handleInput(UNDO);

		assert.strictEqual(editor.getText(), "hello");
	});
});
