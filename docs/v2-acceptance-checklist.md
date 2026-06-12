# New Era v2 自动化验收与发布清单

> 本清单用于 v2 发布前人工验收。它不替代 `npm run lint`、`npm run build` 和 `npm run smoke`，也不要求接入招聘平台、自动投递或自动联系 HR。

## 1. 发布前命令

| 命令 | 期望结果 | 记录 |
|---|---|---|
| `npm run lint` | ESLint 通过，无新增错误 | 2026-06-09 本轮运行通过，0 errors / 3 warnings；warning 均来自 `tmp/collect-risk-benchmark-candidates.mjs`，属于 v3.1 Step 43 已知工程噪音，本轮未修复。 |
| `npm run build` | Next.js production build 通过 | 2026-06-09 本轮运行通过；Next.js 16.2.6 production build、TypeScript 检查和 19 个静态页生成均通过。 |
| `npm run smoke` | 主要 API 健康和基础响应检查全部通过 | 2026-06-09 本轮运行通过；`smoke:auth` 9/9，v2 API smoke 18/18，Assistant 主检查走 `POST /api/agent/run` SSE，legacy `POST /api/assistant` 只验证输入校验和本地 fallback。 |

> v3.1 Step 43 后续处理：`tmp/collect-risk-benchmark-candidates.mjs` 的 warning 已清理，`tmp/**` 已从默认 lint 门禁排除；上表保留 Step 39 当轮历史记录。当前边界见 `docs/v3-1-step43-engineering-noise.md`。

`npm run smoke` 默认在已有 `.next` 构建上临时启动 `next start`。如果要验收已有服务，使用：

```powershell
$env:SMOKE_BASE_URL="http://127.0.0.1:3000"; npm run smoke
```

## 2. 截图记录

截图统一放在 `output/v2-acceptance/`。桌面建议 `1440x900`，窄屏建议 `390x844`。

2026-06-09 本轮检查 `output/v2-acceptance/` 仅发现 `.gitkeep`，未发现可回填的 v2 截图资产；也未重新执行 v2 页面浏览器验收。因此下表截图项均保持待验收，不写成本轮通过。

| 页面 | 桌面截图路径 | 窄屏截图路径 | 结果 |
|---|---|---|---|
| `/evaluate` | `output/v2-acceptance/evaluate-desktop.png` | `output/v2-acceptance/evaluate-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/evaluate/report?reportId=<id>` | `output/v2-acceptance/report-desktop.png` | `output/v2-acceptance/report-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/applications` | `output/v2-acceptance/tracker-desktop.png` | `output/v2-acceptance/tracker-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/career` | `output/v2-acceptance/career-desktop.png` | `output/v2-acceptance/career-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/analytics` | `output/v2-acceptance/analytics-desktop.png` | `output/v2-acceptance/analytics-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/assistant` | `output/v2-acceptance/assistant-desktop.png` | `output/v2-acceptance/assistant-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/interview` | `output/v2-acceptance/interview-desktop.png` | `output/v2-acceptance/interview-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/resume` | `output/v2-acceptance/resume-judge-desktop.png` | `output/v2-acceptance/resume-judge-narrow.png` | 待验收（本轮未验证；未发现截图资产） |
| `/settings` | `output/v2-acceptance/settings-desktop.png` | `output/v2-acceptance/settings-narrow.png` | 待验收（本轮未验证；未发现截图资产） |

## 3. 功能路径验收

2026-06-09 本轮未逐项打开 v2 页面做人工验收；下表仍为待人工执行的发布验收标准。`npm run smoke` 的通过结果只回填到命令和 API smoke 覆盖，不等同于页面截图、空状态、窄屏或人工交互全部通过。

| 场景 | 操作步骤 | 期望结果 | API 检查 | 空状态 | 错误状态 | 桌面/窄屏 | 误导文案 |
|---|---|---|---|---|---|---|---|
| JD URL 或文本评估 | 打开 `/evaluate`，分别验证 URL 输入失败兜底和粘贴 JD 文本评估 | 用户能编辑 JD，评估展示六维结果、评分、风险和建议；DeepSeek 不可用时明确使用本地 fallback | `/api/jd/fetch`、`/api/evaluate`、`/api/evaluate/stream` | 无输入或无历史时有可操作提示 | URL 失败、文本过短、SSE 失败都有明确错误和重试/手动粘贴入口 | 表单、进度和结果卡片不溢出 | 不宣称已访问招聘平台授权数据 |
| 报告生成与保存 | 完成一次评估，进入 `/evaluate/report?reportId=<id>`，再打开 `/reports` | 报告可读取、可回看，保存失败时保留临时结果并提示重试 | `/api/reports`、`/api/reports/[id]` | 无报告时说明先去评估 | 无效 reportId 显示未找到或返回受控错误 | 报告标题、评分、风险、操作按钮不重叠 | 不把 demo 结果说成真实投递结论 |
| 报告加入 Tracker | 在报告页点击加入投递清单，再打开 `/applications` | 用户确认后生成本地投递记录，重复加入有明确提示 | `/api/applications`、`/api/applications/[id]` | 无投递时展示空清单和创建入口 | 重复 reportId、非法状态、缺少公司/岗位有受控错误 | 列表/看板在窄屏可滚动或折行 | 不出现“已自动投递”“已投递到平台” |
| Tracker 状态与事件 | 在 `/applications` 修改状态、优先级、渠道、跟进日期，并新增事件 | 变更可查看，事件进入时间线；终态记录仍可回看 | `/api/applications/[id]`、`/api/applications/[id]/events`、`/api/applications/stats` | 无事件时显示新增事件入口 | 无效状态、找不到记录、终态限制有明确错误 | 看板、筛选、详情抽屉在窄屏不遮挡主要操作 | 不暗示系统会自动联系 HR 或自动跟进 |
| Career DNA 保存和建议 | 打开 `/career`，编辑目标、优势、偏好；生成建议后选择采纳/忽略 | 保存需要用户显式动作；系统建议在采纳前不写入长期画像 | `/api/career-profile`、`/api/career-profile/suggestions` | 未配置时展示空画像和引导 | 非法字段或保存失败提示当前更改未保存 | 表单分组和建议列表在窄屏可读 | 不把建议说成已经自动改写画像 |
| Analytics 本地聚合 | 打开 `/analytics`，检查漏斗、方向、风险、缺口和 Tracker 复盘 | 数据来自本地 SQLite，样本量不足时有 caveat | `/api/analytics` | 无数据或样本不足时显示限制说明 | API 失败时显示可恢复错误 | 图表和表格在窄屏不压缩到不可读 | 不把个人样本包装成市场统计 |
| Assistant 问答与引用 | 打开 `/assistant`，询问一个基于报告/Tracker/Career DNA 的问题 | 回答展示引用来源；建议动作必须等待用户确认 | `/api/agent/run`；`/api/assistant` 仅 legacy JSON 兼容 | 无本地数据时说明上下文不足 | 空问题、上下文读取失败、模型不可用有 fallback 或错误 | 消息列表、引用和待确认动作在窄屏不重叠 | 不声称已执行写入、已投递、已联系 HR |
| Interview 生成问题与回答 | 打开 `/interview`，基于报告创建面试准备，生成问题并保存一条回答 | 会话、问题和回答可回看；回答保存是显式操作 | `/api/interview/sessions`、`/api/interview/sessions/[id]/questions`、`/api/interview/sessions/[id]/answers` | 无会话时提示先选择报告 | 无报告、无简历、回答过短有受控错误 | 问题列表和回答编辑区在窄屏可操作 | 不承诺真实面试结果或外部联系 |
| Resume Judge 建议与反馈 | 打开 `/resume`，选择未归档简历和目标报告/JD，生成优化建议并采纳或拒绝一条 | 建议、ATS 检查和反馈记录可查看；已归档简历不可用 | `/api/resume/judge`、`/api/resume/judge/runs`、`/api/resume/judge/feedback` | 无可用简历时提示先解析/保存简历 | 缺少 resumeId、缺少目标、已归档简历有受控错误 | 建议卡片、反馈按钮、ATS 区块在窄屏不溢出 | 不自动改写简历，不把建议说成已应用 |
| Settings 导出 JSON | 打开 `/settings`，点击导出 JSON；检查下载文件结构 | 导出包含 reports、resumes、applications、settings、Career DNA、Interview、Resume Judge 等本地数据快照 | `/api/export`、`/api/settings` | 空数据也能导出合法 JSON | 导出失败时显示错误，不清除数据 | 导出、清除、隐私说明在窄屏不遮挡 | 不声称云备份、云同步或外部平台同步 |

## 4. Smoke API 覆盖

`scripts/smoke.mjs` 覆盖以下基础检查：

2026-06-09 本轮 `npm run smoke` 已实际验证本节基础检查：`smoke:auth` 9/9 通过，v2 smoke 18/18 通过；使用隔离 smoke 数据库 `data/smoke-auth/new-era-smoke.db`，未重置、删除或重建 `data/new-era.db`。

| 类别 | 接口 | 检查 |
|---|---|---|
| Health | `GET /api/health` | `ok: true`，数据库状态为 `ok` |
| JD | `POST /api/jd/fetch` | 非法 URL 返回 `INVALID_JD_URL` |
| Evaluate | `POST /api/evaluate` | 过短 JD 返回 `JD_TEXT_TOO_SHORT` |
| Reports | `GET /api/reports?limit=1` | 返回报告数组、count、limit |
| Tracker | `GET /api/applications?limit=1`、`GET /api/applications/stats` | 返回投递列表和统计字段 |
| Career DNA | `GET /api/career-profile`、`POST /api/career-profile/suggestions` | 返回画像、默认值和建议数组 |
| Analytics | `GET /api/analytics` | 返回 sampleSize、funnel、tracker、caveats |
| Assistant | `POST /api/agent/run`；legacy `POST /api/assistant` | 默认 smoke 主验证走 Agent SSE；legacy 空问题返回 `INVALID_ASSISTANT_INPUT`，本地回答 smoke 显式验证 `local_fallback` 可用 |
| Interview | `GET /api/interview/sessions?limit=1`、`POST /api/interview/sessions` | 返回会话列表；非法 reportId 返回受控错误 |
| Resume Judge | `GET /api/resume/judge/runs?limit=1`、`POST /api/resume/judge` | 返回历史列表；非法输入返回受控错误 |
| Settings / Export | `GET /api/settings`、`GET /api/export` | 返回设置结构和可下载导出快照 |

## 5. 横向检查

- 桌面和窄屏都检查：无横向溢出、按钮文字不截断、操作区不遮挡内容、长公司名/岗位名/JD 片段能换行。
- 空状态都检查：无报告、无投递、无 Career DNA、无 Analytics 样本、无面试会话、无 Resume Judge 历史时，页面给出下一步操作。
- 错误状态都检查：非法输入、找不到记录、接口失败、模型不可用时，错误文案具体且不会丢失用户已输入内容。
- 写操作都检查：保存、清除、采纳建议、加入清单、状态变更、反馈保存必须由用户显式触发。
- 隐私边界都检查：只描述本地 SQLite、demo-data 和可选模型请求边界，不出现云同步、招聘平台授权、自动投递、自动联系 HR、自动改写长期数据等误导文案。

## 6. 发布记录模板

| 日期 | 验收人 | Commit / 版本 | 环境 | 结果 | 备注 |
|---|---|---|---|---|---|
| 2026-06-09 | Codex | 本地工作区（未检测到 `.git`，无 commit 号） | Windows 本地 Next.js 16.2.6 + SQLite；smoke 临时 `next start` 到 `http://127.0.0.1:3110`；使用 `data/smoke-auth/new-era-smoke.db` | 自动化基线通过：`npm run lint` 0 errors / 3 warnings，`npm run build` 通过，`npm run smoke` 中 auth 9/9 和 v2 API 18/18 通过 | v2 浏览器截图和功能路径未在本轮验证；`output/v2-acceptance/` 仅有 `.gitkeep`；`tmp/collect-risk-benchmark-candidates.mjs` warning 留给 Step 43 |
