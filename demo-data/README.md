# Demo Data Contract

> 所有文件均为 **竞赛 Demo 仿真数据**。这些数据只用于无外部 API 的竞赛演示，不代表真实招聘页面抓取结果、真实市场统计、真实公司招聘信息或真实个人简历。

## 文件范围

| 文件 | 用途 |
| --- | --- |
| `preset-jds.json` | JD 评估页、风险扫描页、报告页、离线 SSE 演示脚本 |
| `insights.json` | 行业洞察页、首页指标、技术栈趋势、薪资基准、推荐公司、周报 |
| `sample-resumes.json` | 简历页、简历解析结果、AI 生态位画像、JD 匹配结果 |

## 通用约定

- 每个文件顶部都有 `dataset.dataNotice = "竞赛 Demo 仿真数据"`。
- 每条主要数据记录也保留 `dataNotice` 与 `isCompetitionDemoSimulation`，便于页面/API 明确展示数据性质。
- `sourcePolicy` 必须说明数据不是抓取结果，后续新增 Demo 数据也要保留该声明。
- 字段命名优先对齐 `src/lib/types.ts` 与 `src/lib/schemas.ts`；页面展示专用字段放在 `display`、`riskPresentation`、`quickCompare` 等独立对象中。

## `preset-jds.json`

核心字段：

| 字段 | 说明 |
| --- | --- |
| `items[].id` | 稳定 ID，供页面、API 和简历匹配引用 |
| `items[].demoType` | `true_ai`、`fake_ai`、`boundary` |
| `items[].input` | 对齐 `JdInput`，包含 `company`、`role`、`jdText` |
| `items[].job` | 对齐 `JobExtract`，包含公司、岗位、薪资、技术栈、关键词、AI 生态位 |
| `items[].riskScan` | 对齐 `RiskScanResult`，可直接用于风险扫描结果 |
| `items[].evaluationReport` | 对齐 `EvaluationReport`，可直接用于报告页和离线评估 |
| `items[].streamScript` | 离线 SSE 演示脚本，只描述事件顺序，不包含业务逻辑 |
| `riskKnowledgeBase` | 风险页底部知识库展示数据 |

当前覆盖 6 条 JD：3 条真 AI 岗、2 条假 AI/包装岗、1 条边界岗位。

## `insights.json`

核心字段：

| 字段 | 说明 |
| --- | --- |
| `overviewMetrics` | 顶部 4 个市场指标卡片 |
| `techTrends` | 技术栈趋势排行，含热度、需求占比、趋势标签和关联技能 |
| `trendTags` | 技能标签云 |
| `domainDistribution` | 对齐 `AiEcosystemDomain` 的细分方向分布 |
| `salaryBenchmarks` | 按方向与经验段展示的仿真薪资区间 |
| `weeklyBrief` | 预置周报，供 DeepSeek 不可用时降级展示 |
| `recommendedCompanies` | 推荐关注公司卡片，全部为仿真展示对象 |
| `homeDashboard` | 首页仪表盘指标、快讯和漏斗 |

薪资、占比、热度、岗位数均为演示口径，不应写成真实来源统计。

## `sample-resumes.json`

核心字段：

| 字段 | 说明 |
| --- | --- |
| `items[].display` | 简历列表展示字段 |
| `items[].content` | 对齐 `ResumeContent`，包含结构化简历和 `rawText` |
| `items[].skills` | 对齐 `ResumeSkill[]`，方便后续写入 `skills_json` |
| `items[].ecosystem` | 对齐 `AiEcosystemVector`，方便后续写入 `ecosystem_json` |
| `items[].ecosystemProfile` | 对齐 `AiEcosystemProfile`，用于生态位解释 |
| `items[].matchScenarios` | 对齐 `ResumeMatchResult` 的核心字段，并引用 `targetJdId` |
| `items[].optimizationTips` | 简历优化建议展示数据 |
| `resumePageSummary` | 简历页指标、活动和最近动作 |

`defaultForEvaluate = true` 的简历可作为 JD 评估页默认简历上下文。

## 后续接入建议

- Phase 4 引擎可读取这些文件作为 fixture，对照输出结构，不需要修改字段名。
- Phase 5 API 可以先按 `id` 读取本地 JSON，外部模型不可用时直接返回 `evaluationReport`、`riskScan` 或 `matchScenarios`。
- Phase 6 页面应展示 `dataDisclaimer.displayText`，避免用户误以为数据来自真实招聘网站。
