# New Era v3.1 Step 37 - Smoke 与旧 Assistant fallback

> 本文只记录 v3.1 Step 37 的工程收口：默认 smoke 如何稳定通过，以及旧 `/api/assistant` 在模型不可用时如何回退。Step 38 后，`/api/assistant` 已是 legacy JSON 兼容层，`/assistant` 页面主链路是 `/api/agent/run`。

## Smoke 检查意图

`scripts/smoke.mjs` 中的 `assistant legacy local fallback` 不是验证 DeepSeek 是否在线、是否足够快，也不是验证 `/assistant` 页面主链路。它验证旧 `/api/assistant` 兼容接口在本地 SQLite 上下文可读时，能返回一个结构合法的本地回答：

- `ok: true`
- `answer` 非空
- `citations` / `actions` / `warnings` 为数组
- `provider: "local_fallback"`
- `fallbackUsed: true`
- `fallbackReason: "smoke_forced_local_fallback"`

因此默认 `npm run smoke` 会在该检查上发送 `x-new-era-force-local-fallback: 1`，显式跳过模型调用，避免把外部模型延迟误判成核心 API 回归失败。

## 默认超时策略

`scripts/smoke-support.mjs` 的默认请求超时仍是 `SMOKE_REQUEST_TIMEOUT_MS=10000`。旧 `/api/assistant` 的默认模型超时已收敛到 `ASSISTANT_MODEL_TIMEOUT_MS=8000`，并且 smoke 的 legacy Assistant 检查显式命中本地 fallback。

结果是：

- 默认 `npm run smoke` 不需要手工设置 `SMOKE_REQUEST_TIMEOUT_MS=30000`。
- 如果旧 `/api/assistant` 正常走模型增强，模型慢于 8 秒会触发本地 fallback。
- 如果需要临时调整旧 Assistant 模型等待时间，可在服务启动前设置 `ASSISTANT_MODEL_TIMEOUT_MS`。

## `/api/assistant` fallback 行为

旧 `/api/assistant` 会读取本地上下文，并通过 legacy JSON 兼容层复用 Agent loop 的模型 fallback；诊断强制 fallback 时直接返回本地规则摘要。以下情况会返回旧 JSON fallback：

| 触发条件 | provider | fallbackUsed | fallbackCode | fallbackReason |
|---|---|---:|---|---|
| 无 API key，或 `NEW_ERA_DEEPSEEK_DISABLED=1` | `local_fallback` | `true` | `missing_api_key` | `deepseek_unavailable` |
| 模型服务 HTTP 错误 | `local_fallback` | `true` | `http_error` | `deepseek_unavailable` |
| 模型网络连接失败 | `local_fallback` | `true` | `network_error` | `deepseek_unavailable` |
| 模型响应超时 | `local_fallback` | `true` | `timeout` | `deepseek_unavailable` |
| 模型返回 JSON 不符合 `AssistantResponse` | `local_fallback` | `true` | `invalid_response` | `assistant_response_validation_failed` |
| Smoke 诊断头强制本地 fallback | `local_fallback` | `true` | `forced_local_fallback` | `smoke_forced_local_fallback` |

模型成功并通过 schema 校验时，接口返回：

```json
{
  "provider": "deepseek_enhanced",
  "fallbackUsed": false,
  "fallbackCode": null,
  "fallbackReason": null,
  "fallbackMessage": null
}
```

## 单独验证命令

默认回归：

```powershell
npm run smoke
```

旧 Assistant fallback 定向验证：

```powershell
npm run smoke:assistant-fallback
```

`smoke:assistant-fallback` 会启动隔离的 Next server 和 smoke SQLite 数据库，分别验证：

- 无 key / 禁用 DeepSeek -> `missing_api_key`
- 模型 HTTP 不可用 -> `http_error`
- 模型慢 -> `timeout`

该脚本不加入默认 `npm run smoke`，避免增加默认回归噪音。
