# TODO

> 个人隐私类待办分流至 `TODO.local.md`（不入公开仓库），格式与本文件一致。

## 🟠 橙色（防护缺口，可能演化为实际影响）

### 发布与版本检查

- [ ] **T7** `scripts/release.mjs` 第 10 步会直推 `main`，在 `main` 已锁保护后必然被拒——若将来启用该脚本，必须先改成「bump 分支 + PR」（记录：2026-11-02 17:45）
  **背景**：该脚本是从上游 `earendil-works/pi` 继承来的发布脚本（`npm run release:patch|minor|major`），第 10 步是 `git push origin main` 加 `git push origin v<version>`。本 fork 目前**没有在用**它——main 最近的发布都是「bump PR + tag」（如 `chore: bump version to 0.0.7 (#40)`），不是脚本产生的 `Release vX` 直接提交，所以现在没有实际冲突。但 2026-11-02 起 `main` 已开分支保护（PR 必过 + `strict` + 禁 force push + 线性历史 + 只允许 squash），脚本那一步的 `git push origin main` 会被 GitHub 直接拒（`GH006: Protected branch update failed`），而且脚本第 7、9 步会在 main 上直接产生两个提交（`Release vX` 与「Add [Unreleased] section」），与「一切经 PR」冲突。
  **要做什么（真要用它时）**：把第 7–10 步改成——在 `release/v<version>` 分支上做那两个提交并打版本 tag → 推该分支 → 开 PR（目标 main）→ 用 gh 的 auto-merge 启用 squash 自动合并 → 等合并后再推版本 tag（指向合并后的提交）；或者干脆走本机的 `/bump` → `/release` 链、不再维护这个脚本。**在改之前不要用它发版**。
  **关联**：`main` 分支保护配置见 GitHub 仓库设置；`CHANGELOG.md` 的 Known risks 条；同样的直推面还有 `.github/workflows/prerelease.yml`（只推 tag，安全）。

- [ ] **T5** 更新链路的剩余缺口（T4 已更新的部分之外的）：① 预发布 Release 带 `--prerelease` 标记，按 GitHub 规则不进 `releases/latest` 指针，而 update check 只读该端点 → `pi update --self` 永远取不到 rc 构建（rc 只能手动下载 Release asset 安装）；② 同版本重发不触发更新：update 用 semver 比较 `releases/latest` 与当前版本，版本号相同时（如 0.0.3 重发新构建）判定「已是最新」，刷新须 `pi update --force` 或手动 `npm install -g <tarball URL>`。候选处理：update check 改读含 prerelease 的 releases 列表端点并按语义化版本挑最新（需走 dev-workflow）／或接受现状（rc 手动下载 + `--force` 刷新）。背景：v0.0.3 正式发版后 `latest` 指针不再被上游遗留的 v0.86.0 污染；自动预发布流水线（原 auto-rc）已按用户要求改为仅手动触发（`gh workflow run prerelease.yml`）。（记录：2026-09-29 19:38）

### 测试稳定性

- [ ] **T6** 全量测试套件存在负载敏感的偶发失败（本机 `./test.sh` 两轮各红 1 例、红点不同；单跑均通过）：① `packages/coding-agent/test/tools.test.ts` → "executeBash should persist full output when truncation happens by line count only"（后台写全量输出的文件已创建但内容未落盘，20×10ms 轮询窗口内读到空串：`expected '' to contain '1\n2\n3'`）；② `packages/coding-agent/test/agent-session-concurrent.test.ts` → "should throw when prompt() called while streaming"（并发守卫时序）。建议：轮询改等「内容出现」而非仅「文件存在」/ 放宽等待，并复核并发用例的时序假设；CI 亦有偶发风险。**2026-11-02 补充**：CI 上又见同类第 3 例——PR #41 的 `build-check-test` 在 `packages/coding-agent/test/experimental-remote-runtime.test.ts` → 「streams prompt events through the worker-owned service provider」红了一次（`expected ['run_start','message_start',…(9)] to deeply equal ArrayContaining`，实际多出一轮 message 事件、缺 `run_end`、多出 `usage`，像是同一次运行的事件被打印两遍或并发交错）；同一条 PR 重跑一次即绿（4m52s），本机单跑 26/26 绿。说明这条同样是**负载/时序敏感**，不是分支问题。背景：2026-10-15 验证 #28 时两轮全量各红 1、单跑均绿。（记录：2026-11-02 17:45）

