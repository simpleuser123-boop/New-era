# New Era v3.1 Step 43 - 临时脚本与工程噪音清理

> 本文只记录 Step 43 的工程噪音收口：默认 lint 边界、`tmp/` 临时脚本定位，以及 Step 42 benchmark 的可复跑链路。不做 v3.1 发布清单，不重写 benchmark 体系。

## 原始问题

2026-06-09 本轮先运行 `npm run lint`，原始输出为 0 errors / 3 warnings，全部来自：

```text
tmp/collect-risk-benchmark-candidates.mjs
   31:7   warning  'stripTags' is assigned a value but never used
  180:21  warning  'company' is defined but never used
  396:10  warning  'extractBetween' is defined but never used
```

这三个 warning 都是一次性采集脚本里的遗留代码，不是 TypeScript、Node ESM 或 Next lint 配置误伤。

## 处理结果

- `tmp/collect-risk-benchmark-candidates.mjs` 已删除未使用的 `stripTags` / `htmlDecode` helper、`extractBetween` helper，并移除 `annotate()` 的未使用 `company` 参数。
- `eslint.config.mjs` 已把 `tmp/**` 从默认 `npm run lint` 范围中排除。

这不是把 warning 静默隐藏：已知的采集脚本 warning 先在脚本自身被清理，再调整默认质量门禁边界。

## `tmp/` 边界

`tmp/` 现在定义为临时产物和一次性工具目录：

- 可以保存 smoke/browser 过程产物、日志、pid、临时 SQLite、截图、benchmark 机器输出等文件。
- 可以保存一次性采集或排查脚本，但这些脚本不参与默认 `npm run lint`、`npm run build`、`npm run smoke` 的主工程质量判断。
- 如果某个临时脚本需要长期维护、被 package script 调用，或成为回归链路的一部分，必须迁移到 `scripts/`，并同步更新文档和引用路径。

`scripts/` 是正式可维护脚本目录：

- package script 只能引用 `scripts/` 下的正式脚本。
- benchmark、smoke、lint 相关回归命令应继续放在 `scripts/` 并参与默认 lint。

## Step 42 benchmark 链路

Step 42 的正式可复跑链路保持不变：

- 数据集：`demo-data/risk-benchmark-jds.jsonl`
- 正式脚本：`scripts/smoke-risk-benchmark.mjs`
- package script：`npm run smoke:risk-benchmark`
- 机器输出：`tmp/risk-benchmark-result.json`

`tmp/collect-risk-benchmark-candidates.mjs` 只是候选样本采集辅助脚本，不是默认回归链路；排除 `tmp/**` 不会破坏真假 AI 岗识别 benchmark 的复跑能力。

## 边界

- 没有删除、重置或重建 `data/new-era.db`。
- 没有改产品页面 UI。
- 没有改 API route。
- 没有改 Agent 架构、工具注册、Action proposal 或写入确认边界。
- 没有接招聘网站爬取、平台授权、自动投递、自动联系 HR、支付、订阅、多用户 SaaS 或公开分享链接。
