# MEMO

> 超低频备忘（周期性 / 条件触发，无排期压力）。条目格式与 TODO 一致：`[ ]` + **M 编号**（全局递增、永不复用）+ 记录时间戳。处理完移入 `MEMO-archive.md`。

## 上游动态监控

- [ ] **M1** 检查上游 earendil-works/pi 是否实现编辑器「全选（Cmd+A）+ Delete 清空」功能。背景：本 fork 需求追踪于 [Issue #10](https://github.com/xhqing/pi-harness/issues/10)；上游提案为 [earendil-works/pi#9949](https://github.com/earendil-works/pi/issues/9949)（2026-09-23 提交，作者自动订阅），同类旧需求 [earendil-works/pi#7038](https://github.com/earendil-works/pi/issues/7038) 已被维护者 badlogic 拒绝（建议 Ctrl+G 外部编辑器）。注意：订阅只能覆盖「issue 有动态」的情况，上游默默实现不会通知，需定期检查。若上游实现或社区推进，评估移植到本 fork。检查锚点：上游发版时顺手翻 CHANGELOG 是否出现 selection / select-all 条目，或每 1~2 个月用 `gh search issues --repo earendil-works/pi "select-all OR selection"` 扫一遍。（记录：2026-09-23 17:34）
