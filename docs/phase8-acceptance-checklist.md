# Phase 8 测试与验收清单

> Phase 8.1 仅整理验收项和当前状态。本文不新增功能、不重做 UI、不修改演示数据或数据库。

## 1. 验收范围

- 依据：`开发步骤文档.md` 的 Phase 8。
- 已查看范围：`demo-data/`、`src/app/`、`src/app/api/`、Phase 1-7 已完成代码路径。
- 状态口径：
  - 已具备：代码或 demo 数据中已存在对应能力。
  - 待人工验收：需要启动应用，在浏览器或接口层实际走一遍。
  - 注意项：不阻塞 Phase 8.1，但演示前需要确认。

## 2. 当前基线

- Demo JD：`demo-data/preset-jds.json` 当前 7 条，包含 3 条真 AI 岗、2 条假 AI 岗、2 条边界岗。
- Demo 简历：`demo-data/sample-resumes.json` 当前 2 份示例简历，并提供推荐匹配组合。
- 行业洞察：`demo-data/insights.json` 当前包含 4 个概览指标、6 个技术趋势、12 个趋势标签、5 个方向分布、6 个推荐公司和 4 条周报重点。
- SQLite：`data/new-era.db` 当前可读到 reports 21 条、resumes 8 条、settings 9 条。
- 注意项：`sample-resumes.json` 当前未观察到 `defaultForEvaluate = true` 的简历记录；JD 评估页有“默认简历上下文”文案，但当前评估请求主要传 JD、公司、角色和来源 URL，演示时不要把该文案讲成已自动带入真实简历匹配。

## 3. 功能检查清单

| 场景 | 当前状态 | 验收项 | 建议样例 / 路径 |
|------|----------|--------|-----------------|
| JD URL 抓取 | 已具备，待人工验收 | 输入 `http/https` URL 后能识别为链接；点击或自动触发 `/api/jd/fetch`；成功时正文回填且可编辑；失败、超时、非 HTML、正文过短时展示“手动粘贴 JD 文本”兜底提示，原 URL 不丢失 | `/evaluate`；`src/app/api/jd/fetch/route.ts`；`JdAssessmentForm.tsx` |
| JD 文本评估 | 已具备，待人工验收 | 粘贴完整 JD 或选择 Demo JD 后可生成 A-F 六维报告；输出岗位提取、综合评分、风险摘要、建议；DeepSeek 不可用时仍返回本地规则报告 | `/api/evaluate`；`src/lib/evaluate-engine.ts`；高分样例 `real-llm-rag-agent-engineer` |
| SSE 流式输出 | 已具备，待人工验收 | `/api/evaluate/stream` 返回 `text/event-stream`；事件顺序包含 `phase`、`risks`、6 个 `section(A-F)`、`score`、`done`；页面逐步点亮六维卡片；完成态进度为 100%；SSE 失败后重试并切同步评估 | `/evaluate`；`EvaluationProgress.tsx`；`JdAssessmentWorkspace.tsx` |
| 风险扫描 | 已具备，待人工验收 | 假 AI 岗命中 3-5 个风险信号；展示风险等级、风险总分、摘要和建议；接口失败时选择 Demo 的场景可使用预置风险结果 | `/api/scan-risks`；`/risks`；`fake-training-loan-ai-engineer` 命中 5 个 critical 演示信号 |
| 报告持久化 | 已具备，待人工验收 | 评估完成后写入 SQLite；`/api/reports` 可列出报告；`/api/reports/[id]` 可读取详情；报告页能从 `reportId` 打开；保存失败时保留临时报告并允许重试保存 | `data/new-era.db`；`/reports`；`/evaluate/report?reportId=<id>` |
| 简历解析 | 已具备，待人工验收 | 粘贴或加载示例简历后调用 `/api/resume/parse`；返回结构化简历、技能、AI 技术栈、生态位画像；保存失败时保留解析结果并允许重试 | `/resume`；`sample-resume-llm-rag-agent`；`sample-resume-ai-infra-serving-mlops` |
| 简历匹配 | 已具备，待人工验收 | 完成简历解析后选择历史报告或 Demo JD；调用 `/api/resume/match`；输出综合匹配度、方向匹配度、技能覆盖率、已匹配技能、快速缺口、长期缺口和优化建议 | `/resume`；推荐组合来自 `sample-resumes.json` 的 `demoNotes.recommendedJdPairings` |
| 行业洞察 | 已具备，待人工验收 | `/api/insights/trends` 能读取预置趋势；页面展示概览指标、技术趋势、薪资基准、方向分布、推荐公司、周报和数据来源声明；周报刷新在 DeepSeek 不可用时回退 `insights.json` | `/insights`；`/api/insights/trends`；`/api/insights/brief` |

## 4. 演示检查清单

| 场景 | 当前状态 | 验收项 | 建议脚本 |
|------|----------|--------|----------|
| 3-5 分钟完整路径 | 待人工彩排 | 计时从首页或评估页开始，3-5 分钟内走完“选高分 JD -> 流式评估 -> 报告页 -> 风险扫描 -> 简历解析/匹配 -> 行业洞察/历史报告” | 建议至少彩排 3 次，记录每次用时和卡顿点 |
| 高分真 AI 岗 | 已具备，待演示确认 | 选择后应展示 4.5+ 分、低风险、AI 生态位清晰、技术栈和成长建议完整 | `real-llm-rag-agent-engineer` 预期 4.7 / low；备选 `real-ai-infra-serving-engineer` 预期 4.6 / low |
| 假 AI 岗 | 已具备，待演示确认 | 风险扫描应清楚展示培训贷、传统开发包装或过度承诺等风险；评估结论应明显不推荐或建议放弃 | `fake-training-loan-ai-engineer` 预期 1.2 / critical / 5 个信号；备选 `fake-traditional-dev-disguised-ai` 预期 1.8 / high / 5 个信号 |
| 边界岗 | 已具备，待演示确认 | 展示中风险/谨慎推进，而不是简单判定为好或坏；能解释真实 AI 元素与风险信号并存 | `borderline-data-evaluation-algorithm` 预期 3.4 / medium / 3 个信号；备选 `borderline-ai-safety-ops-redteam` 预期 3.3 / medium / 3 个信号 |
| 网络不可用 fallback | 已具备兜底路径，待断网或接口失败演练 | 不依赖真实招聘网站；JD URL 抓取失败后手动粘贴或选择 Demo JD；SSE 失败后同步评估；同步接口失败且选中 Demo 时使用 `preset-jds.json` 临时报告；风险、简历、洞察页面可用预置数据兜底 | 演示前准备一份离线脚本：直接使用 Demo JD、示例简历、`insights.json` 和 SQLite 历史报告 |
| 历史报告预置 | 已具备数量，待演示挑选 | 浏览器打开 `/reports` 可看到历史报告；报告详情能进入；演示前挑定 2-3 条要讲的报告，避免列表过多影响节奏 | 当前 SQLite reports 为 21 条，满足“至少 2-3 条”数量要求 |

## 5. Phase 8 人工验收记录模板

| 日期 | 验收人 | 环境 | 结果 | 备注 |
|------|--------|------|------|------|
| 待填写 | 待填写 | 本地 Next.js + SQLite | 待验收 | Phase 8.1 尚未执行完整彩排 |

## 6. 最小验收顺序建议

1. 运行 `npm run lint`。
2. 启动本地应用，打开 `/evaluate`。
3. 用高分真 AI 岗完成一次流式评估，确认进度到 100% 并跳转报告页。
4. 打开 `/reports`，确认刚生成报告进入历史列表并可打开详情。
5. 打开 `/risks`，用假 AI 岗确认命中 3-5 个风险信号。
6. 打开 `/resume`，加载示例简历，解析并匹配一个 Demo JD 或历史报告。
7. 打开 `/insights`，确认预置行业洞察、周报和数据来源声明展示正常。
8. 断网或模拟接口失败，按 Demo JD / 示例简历 / 预置洞察走 fallback 路径。
