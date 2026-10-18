# pi 项目指南

## 负责工程师：Atlas

本项目由 **Atlas**（FullStackEngineerAgent，用户的全栈开发工程师）负责维护。Atlas 负责本项目的全部开发工作——功能分叉开发、个人定制、构建发布流水线等（2026-09-19 起本仓库已在 GitHub 断开与原上游 earendil-works/pi 的 fork 关系，此后独立演进、不再做上游同步）。在本项目内的开发 / 维护需求，由 Atlas 统一处理（Atlas 的角色定义与工作原则见 FullStackEngineerAgent 项目的根 `CLAUDE.md`）。

pi-harness 是 Pi agent harness 的独立分叉仓库（origin 为 xhqing/pi-harness；2026-09-19 起在 GitHub 断开与原上游 earendil-works/pi 的 fork 关系，此后自主演进、不再同步上游），TypeScript monorepo：`packages/coding-agent`（交互式 coding agent CLI，TUI）、`packages/agent`（agent 运行时：工具调用与状态管理）、`packages/ai`（统一多供应商 LLM API）、`packages/tui`（TUI 组件库）等。本文件下方的「Development Rules」一节源自上游 earendil-works/pi 的根 `AGENTS.md`：先于 2026-09-19 本地删减（剔除与全局 `~/.claude/CLAUDE.md` 冲突的条目：简短回复风格、`git add` 显式路径、宽 commit 授权、临时脚本位置、非 main 分支不记 CHANGELOG），再于 2026-09-19 迁移并入本文件并删除原 `AGENTS.md`；迁移时未收录 Releasing 一节——其指向的 `.pi/skills/release.md` 已在本 fork 删除（悬空引用），且本项目发布走全局 `/release` skill，按用户指示剔除。pi 的上下文文件按 `AGENTS.override.md` > `AGENTS.md` > `CLAUDE.md` 顺序每目录只加载第一个命中的文件，删除 `AGENTS.md` 后本文件即接续生效。仓库已不再同步上游，「Development Rules」一节此后仅由本仓库自主维护；该节中标注「本地增补」的小节同样自主维护。


## Development Rules（源自上游 earendil-works/pi 的 AGENTS.md，2026-09-19 迁移并入）

### Workflow（本地增补，非上游内容）

Core development in this repo (new features, bug fixes, anything changing the runtime behavior of `packages/*/src`) follows the global dev-workflow skill: local feature branch + test-case gate + full test suite + user acceptance before merging to main. A project not yet having a `test-cases/` acceptance suite is not a reason to skip it — the workflow's gate step blocks and bootstraps the suite. The rules below describe commit discipline and coding conventions for this repo; they do not exempt core development from that workflow. Docs-only, config-only, and version-bump changes go directly on main as usual.

### Conversational Style

- No emojis in commits, issues, PR comments, or code
- Define unavoidable jargon before using it.
- Explain non-trivial designs and problems as: problem, concrete example or short trace, then solution. State why the solution is necessary and distinguish it from optional complexity.
- Prefer concrete behavior and small illustrations over abstract summaries, dense terminology, or unexplained lists of changes.
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

### Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site.
- Check node_modules for external API types; don't guess.
- **No inline imports** (`await import()`, `import("pkg").Type`, dynamic type imports). Top-level imports only.
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.
- Use only erasable TypeScript syntax (Node strip-only mode) in code checked by the root config (`packages/*/src`, `packages/*/test`, `packages/coding-agent/examples`): no parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other constructs needing JS emit. Use explicit fields with constructor assignments.
- Always ask before removing functionality or code that appears intentional.
- Do not preserve backward compatibility unless the user asks for it.
- Never hardcode key checks (e.g. `matchesKey(keyData, "ctrl+x")`). Add defaults to `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS` so they stay configurable.
- Never modify `packages/ai/src/models.generated.ts` directly; update `packages/ai/scripts/generate-models.ts` instead, then regenerate. Including the resulting `models.generated.ts` diff is always OK, even if regeneration includes unrelated upstream model metadata changes.

### Commands

- After code changes (not docs): `npm run check` (full output, no tail). Fix all errors, warnings, and infos before committing. Does not run tests.
- Never run `npm run build` or `npm test` unless requested by the user.
- Never run the full vitest suite directly: it includes e2e tests that activate when endpoint/auth env vars are present. For all non-e2e tests, run `./test.sh` from the repo root. Otherwise run specific tests from the package root:
  - Vitest: `node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/specific.test.ts`
  - `packages/tui` (`node:test`): `node --test test/specific.test.ts`
- If you create or modify a test file, run it and iterate on test or implementation until it passes.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` + the faux provider. No real provider APIs, keys, or paid tokens.
- When regressions tests for fixing a github issue, add a comment with the github issue number next to the test.

### Dependency and Install Security

- Treat npm dep and lockfile changes as reviewed code. Direct external deps stay pinned to exact versions.
- When updating `undici`, you MUST read its changelog/release notes for the target version and evaluate whether any changes may affect functionality before applying the update.
- Hydrate/update locally with `npm install --ignore-scripts`; clean/CI-style with `npm ci --ignore-scripts`. Don't run lifecycle scripts unless the user asks.
- If dep metadata changes, refresh `package-lock.json` with `npm install --package-lock-only --ignore-scripts`.
- If `packages/coding-agent/npm-shrinkwrap.json` needs regen, run `node scripts/generate-coding-agent-shrinkwrap.mjs` (verify with `--check` or `npm run check`). New deps with lifecycle scripts require review and an explicit allowlist entry in that script; never add one silently.
- Pre-commit blocks lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1`. Don't bypass unless the user wants the lockfile change committed.

### Git

Multiple pi sessions may be running in this cwd at the same time, each modifying different files. Git operations that touch unstaged, staged, or untracked files outside your own changes will stomp on other sessions' work. Follow these rules:

Committing:

- Only commit files YOU changed in THIS session.
- Before committing, run `git status` and verify the staged files are yours.
- `packages/ai/src/models.generated.ts` may always be included alongside your files.
- Message format: `{feat,fix,docs}[(ai,tui,agent,coding-agent)]: <commit message> (optionally multiple lines)`. Message is informative and concise.

Never run (destroys other agents' work or bypasses checks):

- `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git add .`, `git commit --no-verify`.

If rebase conflicts occur:

- Resolve conflicts only in files you modified.
- If a conflict is in a file you did not modify, abort and ask the user.
- Never force push.

### Issues and PRs

See `CONTRIBUTING.md` for the contributor gate (auto-close workflows, `lgtm`/`lgtmi`, quality bar).

When reviewing PRs:

- Do not run `gh pr checkout`, `git switch`, or otherwise move the worktree to the PR branch unless the user explicitly asks.
- Use `gh pr view`, `gh pr diff`, `gh api`, and local `git show`/`git diff` against fetched refs to inspect PR metadata, commits, and patches without changing branches.
- If you need PR file contents, fetch/read them into temporary files or use `git show <ref>:<path>` without switching branches.

When creating issues:

- Add `pkg:*` labels for affected packages (`pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`); use all that apply.

When posting issue/PR comments:

- Write the comment to a temp file and post with `gh issue/pr comment --body-file` (never multi-line markdown via `--body`).
- Keep comments concise, technical, in the user's tone.
- End every AI-posted comment with the AI-generated disclaimer line specified by the originating prompt (e.g. `This comment is AI-generated by `/wr``).

When closing issues via commit:

- Include `fixes #<number>` or `closes #<number>` in the message so merging auto-closes the issue. For multiple issues, repeat the keyword per issue (`closes #1, closes #2`); a shared keyword (`closes #1, #2`) only closes the first.

### Testing pi Interactive Mode with tmux

For testing pi's interactive mode, load and follow [.pi/skills/interactive-testing.md](.pi/skills/interactive-testing.md).

### Changelog

Location: `packages/*/CHANGELOG.md` (one per package).

Sections under `## [Unreleased]`: `### Breaking Changes` (API changes requiring migration), `### Added`, `### Changed`, `### Fixed`, `### Removed`.

Rules:

- All new entries go under `## [Unreleased]`. Read the full section first and append to existing subsections; never duplicate them.
- Released version sections (e.g. `## [0.12.2]`) are immutable; never modify them.

Attribution:

- Internal (from issues): `Fixed foo bar ([#123](https://github.com/earendil-works/pi/issues/123))`
- External contributions: `Added feature X ([#456](https://github.com/earendil-works/pi/pull/456) by [@username](https://github.com/username))`

### User Override

If the user's instructions conflict with any rule in this document, ask for explicit confirmation before overriding. Only then execute their instructions.

## 附：pi 开发辅助文档（原 .pi/skills，2026-10-12 迁入）

### add-llm-provider.md

---
name: add-llm-provider
description: Checklist for adding a new LLM provider to packages/ai. Covers core types, provider implementation, lazy registration, model generation, the full test matrix, coding-agent wiring, and docs.
---

# Adding a New LLM Provider (packages/ai)

A new provider touches multiple files. Work through these steps in order.

## 1. Core Types (`packages/ai/src/types.ts`)

- Add API identifier to `Api` type union (e.g. `"bedrock-converse-stream"`).
- Create options interface extending `StreamOptions`.
- Add mapping to `ApiOptionsMap`.
- Add provider name to `KnownProvider` type union.

## 2. Provider Implementation (`packages/ai/src/providers/`)

Create a provider file exporting:

- `stream<Provider>()` returning `AssistantMessageEventStream`.
- `streamSimple<Provider>()` for `SimpleStreamOptions` mapping.
- Provider-specific options interface.
- Message/tool conversion functions.
- Response parsing that emits standardized events (`text`, `tool_call`, `thinking`, `usage`, `stop`).

## 3. Provider Exports and Lazy Registration

- Add a package subpath export in `packages/ai/package.json` pointing at `./dist/providers/<provider>.js`.
- Add `export type` re-exports in `packages/ai/src/index.ts` for provider option types that should remain available from the root entry.
- Register the provider in `packages/ai/src/providers/register-builtins.ts` via lazy loader wrappers; do not statically import provider implementation modules there.
- Add credential detection in `packages/ai/src/env-api-keys.ts`.

## 4. Model Generation (`packages/ai/scripts/generate-models.ts`)

- Add logic to fetch/parse models from the provider source.
- Map to the standardized `Model` interface.

## 5. Tests (`packages/ai/test/`)

- Always add the provider to `stream.test.ts` with at least one representative model, even if it reuses an existing API impl such as `openai-completions`.
- Add the provider to the broader matrix where applicable: `tokens.test.ts`, `abort.test.ts`, `empty.test.ts`, `context-overflow.test.ts`, `unicode-surrogate.test.ts`, `tool-call-without-result.test.ts`, `image-tool-result.test.ts`, `total-tokens.test.ts`, `cross-provider-handoff.test.ts`.
- For `cross-provider-handoff.test.ts`, add at least one provider/model pair. If the provider exposes multiple model families (e.g. GPT and Claude), add at least one pair per family.
- For non-standard auth, create a utility (e.g. `bedrock-utils.ts`) with credential detection.

## 6. Coding Agent (`packages/coding-agent/`)

- `src/core/model-resolver.ts`: add default model ID to `defaultModelPerProvider`.
- `src/core/provider-display-names.ts`: add API-key login display name so `/login` and related UI show the provider for built-in API-key auth.
- `src/cli/args.ts`: add env var documentation.
- `README.md`: add provider setup instructions.
- `docs/providers.md`: add setup instructions, env var, and `auth.json` key.

## 7. Documentation

- `packages/ai/README.md`: add to providers table, document options/auth, add env vars.
- `packages/ai/CHANGELOG.md`: add entry under `## [Unreleased]`.

### interactive-testing.md

---
name: interactive-testing
description: Test and debug pi's interactive mode in a controlled tmux terminal. Use for TUI behavior checks and interactive release smoke tests.
---

# Testing pi Interactive Mode with tmux

Run the TUI in a controlled terminal (from the repo root, two directories above this skill):

```bash
tmux new-session -d -s pi-test -x 80 -y 24
tmux send-keys -t pi-test "./pi-test.sh" Enter
sleep 3 && tmux capture-pane -t pi-test -p     # capture after startup
tmux send-keys -t pi-test "your prompt here" Enter
tmux send-keys -t pi-test Escape               # special keys (also C-o for ctrl+o, etc.)
tmux kill-session -t pi-test
```

For release smoke tests, start the tmux session with `-c /tmp` and replace `./pi-test.sh` with the absolute path to the release binary. Test both Node and Bun binaries separately, submit a prompt, and wait for the model reply; startup alone is not a passing smoke test.

（本文件 2026-10-12 由原 CLAUDE.md 的项目指南与上游开发规则迁入；按新规，非 Agent 项目不再保留 CLAUDE.md / .pi 等智能体专属文件。原 .pi/ 开发辅助扩展与 prompts 已删除，可在 git 历史中找回。）
