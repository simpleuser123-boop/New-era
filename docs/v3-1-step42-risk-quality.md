# New Era v3.1 Step 42 - 真假 AI 岗识别质量收口

> 本文只记录 Step 42 的质量收口：风险 benchmark、用户反馈回看、规则版本追溯和报告解释增强。样本和指标用于本地规则回归，不代表真实招聘市场统计。

## 当前识别链路

1. 本地规则扫描
   - `src/lib/risk-rules.ts` 定义培训贷、招转培、传统开发包装、非 AI 岗定位、过度承诺、标注/评测边界等规则。
   - `src/lib/risk-engine.ts` 通过 `scanRisks()` 命中规则、合并信号、计算 `totalWeight` 和 `level`。
   - `critical/high` 在报告页解释为“假 AI 岗风险”，`medium` 解释为“边界岗”，`low` 解释为“真 AI 岗倾向”。
2. 评估报告生成
   - `src/lib/evaluate-engine.ts` 在岗位评估时调用 `scanRisks()`，再用风险等级和 `scoreCap` 影响综合评分。
   - 新报告的 `report.risks` 会保存 `ruleVersion` 和 `ruleVersionNotes`，旧报告没有版本时显示“规则版本未知”。
3. 报告页解释
   - `/evaluate/report` 的风险卡片优先展示“为什么判成假 AI 岗/边界岗/真 AI 岗倾向”。
   - 解释包含主要风险信号、原文证据、命中关键词和规则版本，不只展示分数。
4. 用户反馈
   - `/api/risk-feedback` 只在用户提交反馈时写入本地 SQLite。
   - 反馈可归类为误报、漏报、确认风险、严重度不准、缺少风险信号或其他反馈。
   - 反馈记录会保存报告 ID、benchmark JD ID、用户标记、原风险等级、关联信号、备注和提交时的风险规则版本。

## Benchmark 基线

数据集：

- `demo-data/risk-benchmark-jds.jsonl`
- 当前 100 条样本：`real_ai` 40 条、`fake_ai` 35 条、`borderline` 25 条。
- 样本是演示/基准样本，用来复跑规则变化，不包装成行业统计。

复跑命令：

```powershell
npm run smoke:risk-benchmark
```

当前基线，2026-06-09 本地复跑：

| 指标 | 结果 |
|---|---:|
| risk level accuracy | 87.0% |
| decision accuracy | 94.0% |
| fake_ai recall | 100.0% |
| fake_ai precision | 89.7% |
| real_ai false positive rate | 0.0% |
| borderline precision | 91.3% |
| borderline reasonable-hit rate | 100.0% |
| expectedRiskSignals 平均命中率 | 97.4% |

质量问题分布：

| 分类 | 数量 |
|---|---:|
| 判断准确 | 84 |
| 严重度不准 | 9 |
| 误报：边界岗被判成假 AI 岗 | 4 |
| 缺少预期风险信号 | 3 |

机器可读输出：

- `tmp/risk-benchmark-result.json`

## 反馈回看

- 报告页会按 `reportId` 读取最近 6 条本地反馈。
- 列表展示反馈分类、用户标记、原风险等级、规则版本、关联风险信号和用户备注。
- benchmark 脚本会读取本地 `risk_feedback` 的聚合摘要；没有本地库、没有表或旧库缺少规则版本列时不阻塞 benchmark。

## 规则版本

当前版本：

- `2026-06-09.risk-rules.v3-1-step42`

追溯原则：

- 新风险扫描结果写入规则版本。
- 新用户反馈写入提交时的规则版本。
- 旧报告和旧反馈不被静默改写，缺失版本时显示“规则版本未知”。
- 后续规则迭代必须复跑 benchmark，用指标变化解释调整效果。

## 边界

- 没有接真实招聘平台数据管道。
- 没有招聘网站自动爬取。
- 没有自动训练或黑盒自学习。
- 没有让反馈自动改变规则、评分、报告或投递状态。
- 没有改变 Agent 写入边界；Query 工具仍只读，Action 工具仍只能创建待确认 proposal。
- 没有做 Step 43 的 tmp warning 或临时脚本边界清理。
