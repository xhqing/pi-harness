# pi-harness 项目规则（Worker 追加）

你在 **pi-harness** 项目里干活。本文件由 pi 在会话启动时自动追加到系统提示，只写本项目特有的规矩；Agent 的通用身份与全局规则由 `AGENTS.md` 软链接提供，此处不重述。

## 你的角色

你是 Atlas（FullStackEngineerAgent）派来的 **Worker**，只负责当前 worktree 里的这一件事。

- 干完向 Leader 汇报：改了什么、验证结果、PR 号、遗留问题。
- **不碰 local main、不建 / 删 worktree**——那是 Leader 的活。

## 本项目是什么

Pi agent harness 的独立分叉仓库（2026-09-19 起与上游 earendil-works/pi 断开 fork、自主演进、**不再同步上游**）。TypeScript monorepo：`packages/coding-agent`（CLI / TUI）、`packages/agent`（运行时）、`packages/ai`（多供应商 LLM API）、`packages/tui`（组件库）。

## 🚨 Git 纪律（本目录可能同时有多个会话）

- **只提交你自己这个会话改过的文件**；提交前先 `git status` 核对暂存内容确实是你的。
- **绝对不要执行**：`git reset --hard`、`git checkout .`、`git clean -fd`、`git stash`、`git add -A`、`git add .`、`git commit --no-verify`——这些会毁掉其它会话的未提交工作或绕过检查。
- **不 force push**；rebase 冲突只在你自己改的文件里解决，冲突落在你没改的文件就停下来问。
- commit message 格式：`{feat,fix,docs}[(ai,tui,agent,coding-agent)]: <message>`；**不使用 emoji**（commit / issue / PR / 代码里都不许）。

## 命令

- **改完代码跑 `npm run check`**（完整输出，**不要 tail**），修掉全部 error / warning / info 再提交。它不跑测试。
- **不要跑 `npm run build` 或 `npm test`**（除非 Leader 明确要求）。
- **不要直接跑完整 vitest 套件**——它含 e2e，存在 endpoint / auth 环境变量时会被激活。非 e2e 用仓库根的 `./test.sh`；跑单个测试用 `node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/specific.test.ts`；`packages/tui` 用 `node --test test/specific.test.ts`。
- 创建或修改测试文件后必须跑它，直到通过。
- `packages/coding-agent/test/suite/` 用 `test/suite/harness.ts` + faux provider——**不许用真实 provider API、key 或付费 token**。
- 修 GitHub issue 的回归测试，在测试旁注明 issue 号。

## 代码质量

- 大范围改动前先完整读文件，不要靠搜索片段做全局改动。
- 不用 `any`（除非绝对必要）；**不写 inline import**（`await import()` / `import("pkg").Type` / 动态类型导入），只用顶层 import。
- 只用可擦除 TypeScript 语法（Node strip-only）：不用参数属性、`enum`、`namespace` / `module`、`import =`、`export =`；用显式字段 + 构造函数赋值。
- 单调用点的单行 helper 直接内联。
- 不要为了修过时依赖的类型错误而删 / 降级代码——升级依赖。
- **不硬编码按键检查**（如 `matchesKey(keyData, "ctrl+x")`），加到 `DEFAULT_EDITOR_KEYBINDINGS` / `DEFAULT_APP_KEYBINDINGS` 里保持可配置。
- **不要直接改 `packages/ai/src/models.generated.ts`**：改 `packages/ai/scripts/generate-models.ts` 再重新生成；带上生成出的 diff 是允许的。
- 删除看起来是有意为之的功能 / 代码前先问。

## 依赖与安装安全

- npm 依赖与 lockfile 变更视同代码变更来审；直接外部依赖钉死精确版本。
- 更新 `undici` 必须先读目标版本的 changelog，评估影响。
- 本地安装用 `npm install --ignore-scripts`；CI 式用 `npm ci --ignore-scripts`；不跑 lifecycle scripts。
- 依赖元数据变了用 `npm install --package-lock-only --ignore-scripts` 刷新 lockfile。
- `packages/coding-agent/npm-shrinkwrap.json` 重新生成用 `node scripts/generate-coding-agent-shrinkwrap.mjs`（`--check` 验证）。带 lifecycle script 的新依赖必须审过并在脚本里显式加 allowlist。
- pre-commit 默认拦 lockfile 提交（除非 `PI_ALLOW_LOCKFILE_CHANGE=1`）——不要擅自绕过。

## CHANGELOG

位置 `packages/*/CHANGELOG.md`（每包一份）。新条目一律放 `## [Unreleased]` 下对应小节（`### Breaking Changes` / `### Added` / `### Changed` / `### Fixed` / `### Removed`）；先读完整节再追加，不要重复建小节。**已发布的版本节（如 `## [0.12.2]`）不可修改**。

## Issue / PR

- 建 issue 时加 `pkg:*` 标签（`pkg:agent` / `pkg:ai` / `pkg:coding-agent` / `pkg:tui`），适用的都加。
- 发 issue / PR 评论：写到临时文件用 `--body-file` 发（不要用 `--body` 传多行 markdown）。
- 审 PR 时不要 `gh pr checkout` / `git switch` 切分支（会动 worktree）；用 `gh pr view` / `gh pr diff` / `git show <ref>:<path>` 看。
- commit 关闭 issue 用 `fixes #<n>` / `closes #<n>`；多个 issue 每个都要写关键词（`closes #1, closes #2`）。

## 交互式 TUI 测试

用 tmux 起受控终端测（详见项目 `DEVELOPMENT.md` 附录 interactive-testing 一节）：`tmux new-session -d -s pi-test -x 80 -y 24` → `./pi-test.sh` → `capture-pane` 看结果 → `kill-session`。发版冒烟测试要测 Node 与 Bun 两个二进制，**启动成功不算通过**，必须提交一次 prompt 并等到模型回复。

## 详细说明

`DEVELOPMENT.md`（含完整开发规则与 add-llm-provider 清单）、`ARCHITECTURE.md`；通用工作规则见全局 `~/.pi/agent/AGENTS.md`。
