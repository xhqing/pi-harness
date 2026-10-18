<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://github.com/xhqing/pi-harness/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/xhqing/pi-harness?style=flat-square" /></a>
  <a href="./LICENSE.md"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
</p>

[中文] | [English](README.md)

# pi-harness

**pi-harness** 是 [Pi agent harness](https://github.com/earendil-works/pi) 项目的独立分叉：2026-09-19 起在 GitHub 断开与原上游的 fork 关系，此后自主演进、不再与上游同步，与原作者及上游社区无关联。包名沿用历史的 `@earendil-works/*` scope，未做改名。

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**：交互式 coding agent CLI
* **[@earendil-works/pi-agent-core](packages/agent)**：agent 运行时（工具调用与状态管理）
* **[@earendil-works/pi-ai](packages/ai)**：统一多供应商 LLM API（OpenAI、Anthropic、Google 等）

想进一步了解 Pi：

* [访问 pi.dev](https://pi.dev)（项目官网，含演示）
* [阅读文档](https://pi.dev/docs/latest)，也可以直接让 agent 解释它自己

## 全部包

| 包 | 说明 |
|----|------|
| **[@earendil-works/chord](packages/chord)** | 独立的应用组合运行时：服务、复制状态、RPC 与插件 |
| **[@earendil-works/pi-telemetry](packages/telemetry)** | 供应商中立的遥测契约、参考适配器、一致性测试与类型化 schema |
| **[@earendil-works/pi-ai](packages/ai)** | 统一多供应商 LLM API（OpenAI、Anthropic、Google 等） |
| **[@earendil-works/pi-durable](packages/durable)** | 持久化会话、任务与文档运行时 |
| **[@earendil-works/pi-agent-core](packages/agent)** | agent 运行时（工具调用与状态管理） |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | 交互式 coding agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | 差分渲染的终端 UI 库 |

## 权限与容器化

Pi 不内置限制文件系统、进程、网络或凭证访问的权限系统，默认以启动它的用户与进程的权限运行。

需要更强的边界时，请对 Pi 做容器化或沙箱隔离。三种模式见 [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md)：

- **Gondolin 扩展**：`pi` 与供应商凭证留在宿主机，内置工具和 `!` 命令路由进本地 Linux 微虚拟机。
- **纯 Docker**：整个 `pi` 进程跑在本地容器里，实现简单隔离。
- **OpenShell**：整个 `pi` 进程跑在策略控制的沙箱里。

## 开发

```bash
npm install --ignore-scripts  # 安装全部依赖，不执行生命周期脚本
npm run build         # 刷新模型数据后构建全部包
npm run build:offline # 用现有模型数据离线重建（不联网）
npm run check         # Lint、格式化与类型检查
./test.sh            # 跑测试（无 API key 时自动跳过依赖 LLM 的测试）
./pi-test.sh         # 从源码运行 pi（可在任意目录执行）
```

## 构建发布产物

发布产物在本地构建，附到 GitHub Release 上，共两种：

- **独立二进制**：`./scripts/build-binaries.sh` 产出自包含可执行文件及运行时资源（含 native prebuilds），整体放在 `pi/` 目录内。安装时二进制与 `native/` 目录必须保持相对位置一起放置。
- **自包含 npm 布局 tarball**：`node scripts/build-npm-tarball.mjs` 打出内联 native prebuilds 的 bundle 包，并去掉未发布到 npm 的 workspace 依赖，`npm install -g <tarball>` 即可干净安装。

## 供应链加固

我们把 npm 依赖变更当作需要评审的代码变更对待。

- 直接外部依赖一律精确锁定版本；内部 workspace 包保持版本范围。
- `.npmrc` 设置 `save-exact=true` 与 `min-release-age=2`，避免 npm 解析时引入当天发布的依赖。
- `package-lock.json` 是依赖的唯一事实来源；pre-commit 默认拦截锁文件提交，需设 `PI_ALLOW_LOCKFILE_CHANGE=1` 才放行。
- `npm run check` 校验直接依赖锁定、原生 TypeScript import 兼容性、生成的 coding-agent shrinkwrap。
- 打包出的 CLI 包内含 `packages/coding-agent/npm-shrinkwrap.json`（从根锁文件生成），为 npm 安装锁定传递依赖。
- 发布冒烟用 `npm run release:local`：打 tag 前在仓库外的隔离目录构建、pack 并创建 npm 与 Bun 隔离安装。
- 本地发布安装、文档中的 npm 安装、`pi update --self` 在支持处一律使用 `--ignore-scripts`。
- CI 用 `npm ci --ignore-scripts` 安装。
- Shrinkwrap 生成对依赖的生命周期脚本有显式白名单；新引入带生命周期脚本的依赖会让检查失败，直到评审通过。

## 版权与署名

MIT 许可证——见 [LICENSE.md](LICENSE.md)。

Copyright (c) 2025 Mario Zechner（原 Pi 项目）。Copyright (c) 2026 All Contributors（本分叉）。

本仓库部分内容源自 [earendil-works/pi](https://github.com/earendil-works/pi)，于 2026-09-19 断开分叉；该部分内容保留原作者版权与 MIT 声明。

### 署名方式

引用本项目时请署名到项目而非个人：注明仓库地址（`https://github.com/xhqing/pi-harness`），并保留 [LICENSE.md](LICENSE.md) 中的版权声明。

### 项目地址引用

仓库地址：`https://github.com/xhqing/pi-harness`
