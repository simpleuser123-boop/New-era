# New Era v3.1 Step 38 - Assistant 双栈收口

> 本文只记录 v3.1 Step 38 的 Assistant 双栈边界。它不回填 v2/v3 验收清单结果，不新增 Agent，不接招聘平台授权，不新增模型供应商。

## 当前真实调用链

`/assistant` 页面真实 route chain：

```text
src/app/assistant/page.tsx
  -> requireProductPageAccess("/assistant")
  -> AssistantPage
  -> AssistantWorkspace
```

页面初始化会读取本地上下文与 Agent 会话：

- `GET /api/analytics`
- `GET /api/reports?limit=5`
- `GET /api/applications?limit=8`
- `GET /api/career-profile`
- `GET /api/agent/sessions`
- `GET /api/agent/memory`

用户在页面发问时，主链路只调用：

```text
POST /api/agent/run
```

`/assistant` 页面不再调用 `POST /api/assistant`。

## 方案选择

本步采用“收缩方案”：

- `/assistant` 页面全面使用 v3 Agent 主链路。
- `POST /api/agent/run` 承担流式、多 Agent 路由、Query 工具、Action proposal、会话消息和可见记忆。
- `POST /api/assistant` 保留为 legacy JSON 兼容层，只服务旧 smoke、旧调用方和本地 fallback 诊断。

选择原因：

- 当前前端已经完成 v3 Agent 化，继续让页面维护旧 JSON 回答范式会造成双倍 UI 和 smoke 维护。
- v3 Agent 已经复用 `assistant-tools` 的只读读取函数，Query 工具覆盖报告、Tracker、Analytics、Career DNA、简历和面试准备上下文。
- 旧 `/api/assistant` 的价值主要是 JSON 兼容和 Step 37 fallback 可测性，不应继续作为页面主链路。

## API 职责边界

### `POST /api/agent/run`

主 Assistant API。

- 返回 `text/event-stream`。
- 负责 Agent 路由、工具调用、流式回答、fallback event、done event。
- 读取可见会话记忆。
- 如 `context.sessionId` 存在，会追加用户消息和 Assistant 消息。
- Query 工具只读。
- Action 工具只能创建待确认 proposal；用户确认前不得修改业务表。

### `POST /api/assistant`

Legacy JSON 兼容 API。

- 返回旧 `AssistantResponse` JSON。
- 不挂载 `/assistant` 页面主体验。
- 内部通过 Agent loop 收集事件后转成 JSON，但以 `toolMode: "query-only"` 运行，不创建 `agent_action_proposals`。
- 保留 `x-new-era-force-local-fallback: 1` 和 `fallbackMode=local` 诊断入口。
- 保留 `ASSISTANT_MODEL_TIMEOUT_MS`，用于 `smoke:assistant-fallback` 的 timeout 诊断。
- 可返回旧格式 `actions`，但这些只是 legacy JSON 建议，不是已写入 proposal 表。

## Smoke 主验证路径

默认 `npm run smoke` 的 Assistant 主检查现在是：

```text
POST /api/agent/run
```

该检查通过 `x-new-era-force-local-fallback: 1` 验证 Agent 主链路的 SSE、路由、fallback、text 和 done 事件，不依赖外部模型速度。

默认 smoke 仍保留两条 legacy 检查：

- `assistant legacy validation`：`POST /api/assistant` 空问题返回 `INVALID_ASSISTANT_INPUT`
- `assistant legacy local fallback`：`POST /api/assistant` 强制本地 fallback 返回旧 JSON 结构

旧 Assistant fallback 定向验证仍使用：

```powershell
npm run smoke:assistant-fallback
```

Agent 完整主链路验证仍使用：

```powershell
npm run smoke:agent
```

## 后续迁移策略

- 新页面、新 smoke、新文档默认引用 `/api/agent/run`。
- 旧 `/api/assistant` 不新增页面能力，不新增模型供应商，不新增业务写入。
- 如果未来删除旧接口，先迁移所有外部脚本和文档引用，再移除 `smoke:assistant-fallback`。
- v2 文档中涉及 `/assistant` 的主 API 应标记为 `/api/agent/run`；`/api/assistant` 只作为 legacy 兼容项出现。

## 安全边界

- 本步没有做 Step 39-44。
- 没有新增 Agent。
- 没有接招聘平台授权。
- 没有新增模型供应商。
- 没有自动投递、自动联系 HR、招聘网站爬取、支付、订阅、多用户 SaaS 或公开分享链接。
- Query 工具保持只读；Action 工具只能创建待确认 proposal，确认前不得写业务表。
