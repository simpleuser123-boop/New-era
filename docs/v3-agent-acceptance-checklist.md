# New Era v3 Agent 验收与回归清单

> 适用于 v3 Step 36。本文只验收可控多 Agent 系统，不新增 v3.1 功能，不接招聘平台授权，不自动投递，不自动联系 HR，也不让 LLM 直接写业务表。v3.1 Step 38 后，`/assistant` 页面主链路固定为 `POST /api/agent/run`；`POST /api/assistant` 仅作为 legacy JSON 兼容层。

## 1. 自动化命令

| 命令 | 期望结果 | 记录 |
|---|---|---|
| `npm run lint` | ESLint 通过，无新增错误 | 2026-06-09 本轮运行通过，0 errors / 3 warnings；warning 均来自 `tmp/collect-risk-benchmark-candidates.mjs`，属于 v3.1 Step 43 已知工程噪音，本轮未修复。 |
| `npm run build` | Next.js production build 通过 | 2026-06-09 本轮运行通过；Next.js 16.2.6 production build、TypeScript 检查和 19 个静态页生成均通过。 |
| `npm run smoke:agent` | v3 Agent 聚合 smoke 全部通过 | 2026-06-09 本轮运行通过；脚本使用 `data/smoke-agent/new-era-smoke.db`，临时启动 `next start` 到 `http://127.0.0.1:3110`，完成 Agent 聚合 smoke。 |

> v3.1 Step 43 后续处理：`tmp/collect-risk-benchmark-candidates.mjs` 的 warning 已清理，`tmp/**` 已从默认 lint 门禁排除；上表保留 Step 39 当轮历史记录。当前边界见 `docs/v3-1-step43-engineering-noise.md`。

`npm run smoke:agent` 默认在已有 `.next` 构建上临时启动 `next start`，并使用独立 Agent smoke 数据库：

```text
data/smoke-agent/new-era-smoke.db
```

如果要验收已启动服务，使用：

```powershell
$env:SMOKE_BASE_URL="http://127.0.0.1:3000"; npm run smoke:agent
```

如果要显式验收真实本地库，使用：

```powershell
$env:SMOKE_USE_REAL_DB="1"; npm run smoke:agent
```

如果目标服务已有 owner 且默认 smoke 账号不能登录，需要提供现有 owner 凭据：

```powershell
$env:SMOKE_AUTH_IDENTIFIER="你的 owner 邮箱或手机号"
$env:SMOKE_AUTH_PASSWORD="你的 owner 密码"
npm run smoke:agent
```

## 2. Agent Smoke 覆盖

| 类别 | 脚本 / 接口 | 检查 |
|---|---|---|
| 子 Agent 注册和路由 | `scripts/smoke-agent-routing.mjs` | Tracker / Evaluate / Resume / Interview / Career / General 六个 Agent 均注册；意图路由命中预期 Agent；系统 prompt 包含工具白名单、Query/Action 边界和不自动投递边界 |
| Query 工具 | `scripts/smoke-agent-tools.mjs` | 10 个 Query 工具只读返回本地报告、Tracker、Analytics、Career DNA、简历、面试准备上下文和联网搜索结果；缺失数据返回空结果而不是写库 |
| Action Proposal | `scripts/smoke-agent-actions.mjs` | 创建 proposal 不改业务表；确认后才通过业务方法写入；忽略不写入；非法 payload 被 Zod 拒绝 |
| Agent Run SSE | `scripts/smoke-agent-run.mjs` | `/api/agent/run` 普通回答、Query 工具调用、联网搜索工具调用、工具失败、Action proposal 创建和未确认不写库 |
| 会话和记忆 | `scripts/smoke-agent-session-memory.mjs` | 创建会话、追加消息、摘要注入、记忆列表、删除后不再注入、导出包含 Agent 数据 |
| 未登录 401 | `scripts/smoke-agent.mjs` | `/api/agent/run`、`/api/agent/sessions`、`/api/agent/actions`、`/api/agent/memory` 未登录返回 401 |
| API 错误态 | `scripts/smoke-agent.mjs` | Agent run 空输入返回 `INVALID_AGENT_RUN_INPUT`，不存在 session 返回 `AGENT_SESSION_NOT_FOUND`，session/actions/memory 非法查询返回受控错误 |
| 文案边界 | `scripts/smoke-agent.mjs` | 扫描 `src/` 和 `docs/`，不允许出现正向宣称已自动投递、已联系 HR、已接入招聘平台授权等文案 |
| Legacy Assistant 兼容 | `scripts/smoke.mjs`、`scripts/smoke-assistant-fallback.mjs` | 默认 smoke 的 Assistant 主验证走 `/api/agent/run`；旧 `/api/assistant` 只验证 JSON 兼容、输入校验和可测 fallback |

## 3. 浏览器截图

截图统一放在 `output/v3-agent-acceptance/`。桌面建议 `1440x900`，窄屏建议 `390x844`。

| 页面 | 桌面截图路径 | 窄屏截图路径 | 结果 |
|---|---|---|---|
| `/assistant` | `output/v3-agent-acceptance/assistant-desktop.png` | `output/v3-agent-acceptance/assistant-narrow.png` | 2026-06-09 本轮确认历史截图资产存在并已打开查看；文件时间分别为 2026-06-04 21:24:52 / 21:24:54。本轮未重新登录浏览器执行 `/assistant` 桌面和窄屏验收，因此不记录为本轮浏览器验收通过。 |

浏览器验收时需要登录 owner。若使用独立 smoke 数据库，默认账号为：

```text
owner.smoke@new-era.local
NewEraSmoke!2026
```

## 4. 人工路径验收

2026-06-09 本轮只回填自动化命令和历史截图资产存在性，未逐项登录 `/assistant` 执行下表人工路径；下表仍作为后续人工验收标准保留。自动化 smoke 可证明 API 和安全边界基线，但不替代桌面/窄屏人工交互验收。

| 场景 | 操作步骤 | 期望结果 | API 检查 | 空状态 | 错误状态 | 桌面/窄屏 | 安全边界 |
|---|---|---|---|---|---|---|---|
| 普通 Agent 问答 | 打开 `/assistant`，新建会话，输入一个不需要读取本地数据的问题 | 流式展示阶段、子 Agent、回答和完成态；请求失败保留输入并可重试 | `POST /api/agent/run` | 无会话时能新建会话 | 空问题、SSE 失败、模型不可用有明确错误 | 消息区和输入区不重叠 | 不声称已写入业务表 |
| 子 Agent 路由 | 分别输入 Tracker、报告评估、简历、面试、Career DNA、通用规划问题 | UI 展示匹配的子 Agent 和工具轨迹 | `agent_selected` SSE event | 无本地数据时说明上下文不足 | 工具无结果时给可恢复说明 | Agent 标签和轨迹在窄屏可读 | 不越权调用未白名单工具 |
| Query 工具 | 询问报告风险、投递跟进、Career DNA 或默认简历 | Query 工具只读返回引用和摘要，不创建业务记录 | `tool_call` / `tool_result` event，`category=query` | 本地无报告/无投递/无简历时返回空结果说明 | 工具参数非法或记录不存在有受控结果 | 引用来源可换行 | Query 不写数据 |
| Action proposal 创建 | 让 Agent 建议更新 Tracker 状态或新增跟进事件 | 只生成待确认动作卡片，业务数据保持不变 | `POST /api/agent/actions`、`GET /api/agent/actions` | 无可操作记录时说明无法创建 | 非法 payload 返回 `INVALID_AGENT_ACTION_PROPOSAL_INPUT` | proposal 卡片、payload 和按钮不溢出 | 用户确认前不写库 |
| Action proposal 确认 | 点击 proposal 的确认按钮 | 确认后状态变为 confirmed，并只执行该 proposal 描述的本地写入 | `POST /api/agent/actions/[id]/confirm` | 无 pending proposal 时不显示确认入口 | 已处理 proposal 返回 `AGENT_ACTION_PROPOSAL_NOT_PENDING` | 确认后状态反馈清晰 | 不自动投递、不外部联系 |
| Action proposal 忽略 | 点击 proposal 的忽略按钮并填写原因 | proposal 变为 dismissed，业务表不变 | `POST /api/agent/actions/[id]/dismiss` | 无 pending proposal 时不显示忽略入口 | 已处理 proposal 返回 `AGENT_ACTION_PROPOSAL_NOT_PENDING` | 忽略原因和状态不遮挡内容 | 忽略不写业务表 |
| 会话继续 | 选中历史会话后继续提问 | 历史消息保留，新消息追加，同一 session 继续工作 | `/api/agent/sessions`、`/api/agent/sessions/[id]` | 无会话时显示新建入口 | 不存在 session 返回 `AGENT_SESSION_NOT_FOUND` | 会话侧栏在窄屏可操作 | 会话只保存用户可见消息 |
| 记忆查看/编辑/删除 | 在 `/assistant` 打开记忆区域，编辑 working digest，再删除 | 记忆可查看、可编辑、可删除；删除后不再注入后续请求 | `/api/agent/memory`、`/api/agent/memory/[id]` | 无记忆时显示空状态 | 非法 id、非法内容、找不到记忆有受控错误 | 编辑框和确认删除按钮不溢出 | 不做无限长期记忆 |
| 导出 Agent 数据 | 打开 `/settings` 导出 JSON，或调用 `/api/export` | 导出包含 `agent_sessions`、`agent_memory_items`、`agent_action_proposals` | `GET /api/export` | 空 Agent 数据也能导出合法数组 | 导出失败时不清除数据 | 下载入口不遮挡 | 不声称云同步 |
| 未登录 API | 清空 cookie 后调用 Agent API | 返回 401 和 `UNAUTHENTICATED` 或 `SESSION_EXPIRED` | `/api/agent/run`、sessions、actions、memory | 不适用 | 不返回业务数据 | 不适用 | 未登录不可读写 Agent 数据 |

## 5. 安全边界检查

- Query 工具只能读取本地 SQLite、页面上下文、允许的本地聚合数据，以及用户明确需要时的公开网页搜索结果。
- Action 工具只能创建待确认 proposal；确认前不得改 `applications`、`application_events`、`settings`、`interview_sessions`、`resume_judge_feedback` 等业务表。
- 所有 Agent API 入参和出参必须经过 Zod 或等价 schema 校验。
- Agent 回答、UI 文案和文档不得声称已经自动投递、已经联系 HR、已经接入招聘平台授权、已经访问外部招聘平台或已经同步平台状态。
- DeepSeek 或模型不可用时，错误态必须可恢复，并明确本次没有写入业务表。
- 会话记忆必须可查看、可编辑、可删除、可导出；删除后的记忆不得注入后续 Agent 请求。

## 6. 联网搜索配置

`web_search` 是只读 Query 工具，只返回公开网页标题、摘要、URL 和来源，不写入本地 SQLite，也不创建 Tracker、报告、简历或记忆。

生产或本地真实联网搜索优先使用 Tavily Search API；如果已有 Brave Search API key，也可以继续使用 Brave。两者都是只读公开网页搜索，不写入本地业务表。

推荐配置 Tavily：

```powershell
$env:WEB_SEARCH_PROVIDER="tavily"
$env:TAVILY_API_KEY="你的 Tavily API Key"
# 可选：默认已指向 https://api.tavily.com/search
$env:TAVILY_SEARCH_ENDPOINT="https://api.tavily.com/search"
$env:WEB_SEARCH_TIMEOUT_MS="12000"
```

兼容 Brave：

```powershell
$env:WEB_SEARCH_PROVIDER="brave"
$env:BRAVE_SEARCH_API_KEY="你的 Brave Search API Key"
# 可选：默认已指向 https://api.search.brave.com/res/v1/web/search
$env:BRAVE_SEARCH_ENDPOINT="https://api.search.brave.com/res/v1/web/search"
$env:WEB_SEARCH_TIMEOUT_MS="12000"
```

smoke 脚本会临时设置 `NEW_ERA_WEB_SEARCH_MOCK_JSON`，因此不需要真实 API Key，也不会请求外网。

## 7. 回归记录模板

| 日期 | 验收人 | 环境 | owner 策略 | 命令结果 | 浏览器截图 | 结论 |
|---|---|---|---|---|---|---|
| 2026-06-09 | Codex | Windows 本地 Next.js 16.2.6 + SQLite；smoke 临时 `next start` 到 `http://127.0.0.1:3110` | 默认 smoke owner；Agent smoke 使用 `data/smoke-agent/new-era-smoke.db`，未使用真实本地库 | `npm run lint` 通过但有 3 个 `tmp/` warning；`npm run build` 通过；`npm run smoke:agent` 通过，覆盖 6 个 Agent、10 个 Query 工具、Action proposal、`/api/agent/run` SSE、session/memory/export、未登录和错误态 | 历史截图资产已确认存在：`output/v3-agent-acceptance/assistant-desktop.png`、`output/v3-agent-acceptance/assistant-narrow.png`；本轮未重新浏览器验收 | v3 Agent 自动化回归通过；人工路径和本轮浏览器验收仍待执行；`tmp/collect-risk-benchmark-candidates.mjs` lint warning 留给 Step 43 |

## 8. 本轮未验收 / 后续处理

- `/assistant` 桌面和窄屏浏览器路径未在 2026-06-09 本轮重新执行；当前只确认 2026-06-04 历史截图资产存在。
- 第 4 节人工路径仍待人工验收，尤其是真实页面中的会话继续、记忆编辑/删除、proposal 确认/忽略和窄屏可操作性。
- `tmp/collect-risk-benchmark-candidates.mjs` 的 3 个 lint warning 已在 v3.1 Step 43 清理；Step 36 / Step 39 的历史记录保留当轮结果。
- 本步未处理 Step 40-44 的 demo/real 数据边界、高风险确认交互、真假 AI 岗识别质量、临时脚本清理或 v3.1 发布总清单。
