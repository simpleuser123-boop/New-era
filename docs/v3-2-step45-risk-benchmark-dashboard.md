# New Era v3.2 Step 45 - Benchmark 只读服务与质量看板

## 范围

Step 45 把 `demo-data/risk-benchmark-jds.jsonl` 中的本地标注 benchmark 转成产品内只读质量看板，位置为 `/risks` 页面内部的“识别质量”区块。

不包含：

- Step 46 真假 AI 岗对决体验。
- Step 47 HR 核实问题。
- Step 48 集成验收。
- 招聘平台 API、网页抓取、模型调用、自动训练或规则优化。
- SQLite 写入或 `data/new-era.db` 修改。
- 新增左侧导航或顶层 `/benchmark` 入口。

## API

`GET /api/risk-benchmark`

返回 `ok: true` 加稳定 benchmark 契约：

- `dataset`: 样本总量、真 AI / 假 AI / 边界岗数量、`source: "local_benchmark"`。
- `ruleVersion` / `ruleVersions`: 本次扫描命中的风险规则版本。
- `generatedAt`: 本次只读计算时间。
- `metrics`: decision accuracy、fake AI recall、fake AI precision、real AI false positive rate、risk level accuracy、borderline precision、borderline reasonable hit rate、expected risk signal hit rate。
- `issues`: 判断准确、漏报、误报、严重度不准、边界岗误判假 AI、缺少预期信号。
- `distributions`: 预期风险等级、实际风险等级、decision confusion matrix。
- `topIssues`: 漏报假 AI、误报真 AI、边界异常样本。
- `disclaimer`: 明确本地 benchmark 限制。

响应由 `riskBenchmarkOverviewSchema` 校验。API 直接读取 JSONL 并调用本地确定性 `scanRisks`，不依赖 `tmp/risk-benchmark-result.json`。

## 共享计算

核心计算在 `src/lib/risk-benchmark.ts`：

- JSONL 读取与字段校验。
- 单样本风险扫描与 expected signal 命中计算。
- decision / risk level 指标计算。
- 误差分类与 Top 异常样本。
- API overview 映射与 Zod 校验。

`scripts/smoke-risk-benchmark.mjs` 通过临时编译该模块复用同一套公式，避免 CLI 和 API 维护两套指标。

## 页面

`src/components/features/risks/RiskBenchmarkPanel.tsx` 挂载在 `RiskScanWorkspace` 内，不新增导航。看板独立加载 `/api/risk-benchmark`：

- 成功时展示样本构成、指标、误差分布、规则版本和限制说明。
- 失败时只显示小型错误卡片，单岗风险扫描仍然可用。
- 桌面使用紧凑网格，窄屏单列排布，不使用多标签饼图，也不只靠颜色表达好坏。

## 验证

推荐顺序：

```powershell
npm run smoke:risk-benchmark
npm run lint
npm run build
npm run smoke:risk-benchmark-api
```

浏览器验收 `/risks` 桌面和 `390x844` 窄屏：

- 单岗扫描主功能仍在首屏主位置。
- “识别质量”看板可见并显示本地 benchmark 限制说明。
- 页面无横向溢出，指标文本不截断。
- 左侧导航没有新增 Benchmark、真假对决或 HR 核实问题。
