# New Era v2.1 Auth 验收与回归清单

> 适用于 v2.1 Step 28。本文只验收本地单用户 / owner 鉴权闭环，不新增短信、OAuth、邮箱找回、云同步、多用户 SaaS、招聘平台授权、自动投递或自动联系 HR。

## 1. 自动化命令

| 命令 | 期望结果 | 记录 |
|---|---|---|
| `npm run lint` | ESLint 通过，无新增错误 | 待填写 |
| `npm run build` | Next.js production build 通过 | 待填写 |
| `npm run smoke:auth` | Auth API smoke 全部通过 | 待填写 |
| `npm run smoke` | Auth smoke + 核心业务 API 回归全部通过 | 待填写 |

默认 smoke 会在已有 `.next` 构建上临时启动 `next start`。如果要验收已启动服务：

```powershell
$env:SMOKE_BASE_URL="http://127.0.0.1:3000"; npm run smoke:auth
```

## 2. 单 owner 数据库策略

`scripts/smoke-auth.mjs` 不会清空、删除或重建 `data/new-era.db`。默认情况下，未设置 `SMOKE_BASE_URL` 时，smoke 会把服务临时指向独立测试库：

```text
data/smoke-auth/new-era-smoke.db
```

生产和日常开发默认仍使用 `data/new-era.db`；只有设置 `NEW_ERA_DB_PATH` 时才会覆盖 SQLite 文件路径。

- 如果 smoke 测试库还没有 owner，脚本会注册 `owner.smoke@new-era.local`，然后用该账号继续登录和回归。
- 如果目标数据库已有 owner，重复注册应返回 `OWNER_ALREADY_EXISTS`，脚本会改走登录路径。
- 如果要验收真实 `data/new-era.db`，可以显式启用真实库：

```powershell
$env:SMOKE_USE_REAL_DB="1"; npm run smoke:auth
```

- 如果真实库里的 owner 不是默认 smoke 账号，或默认密码已被修改，需显式提供现有 owner 凭据：

```powershell
$env:SMOKE_AUTH_IDENTIFIER="你的 owner 邮箱或手机号"
$env:SMOKE_AUTH_PASSWORD="你的 owner 密码"
npm run smoke:auth
```

如果使用 `SMOKE_BASE_URL` 验收已启动服务，脚本无法替该服务切换数据库；需要启动服务前设置 `NEW_ERA_DB_PATH`，或提供该服务对应的 owner 凭据。不要通过清库来让 smoke 通过。

## 3. Auth API Smoke 覆盖

| 场景 | 接口 | 期望 |
|---|---|---|
| 首次注册 owner 或识别已有 owner | `POST /api/auth/register` | 空库返回 `201 ok:true`；已有 owner 返回 `409 OWNER_ALREADY_EXISTS` |
| 重复注册 | `POST /api/auth/register` | 返回 `409 OWNER_ALREADY_EXISTS` |
| 错误密码登录 | `POST /api/auth/login` | 返回 `401 INVALID_CREDENTIALS` |
| 正确密码登录 | `POST /api/auth/login` | 返回 `200 ok:true`，设置 `new_era_session` cookie |
| 当前用户 | `GET /api/auth/me` | 登录后返回 safe user 字段：`id/displayName/email/phone/role/createdAt/lastLoginAt`，不暴露密码或 token |
| 未登录业务 API | `GET /api/applications?limit=1` | 返回 `401 UNAUTHENTICATED` 或过期态 |
| 已登录业务 API | `GET /api/applications?limit=1` | 返回 `200 ok:true` 和投递列表结构 |
| 退出登录 | `POST /api/auth/logout` | 返回 `200 ok:true`，撤销当前 session |
| 登出后当前用户 | `GET /api/auth/me` | 返回 `401 UNAUTHENTICATED` 或 `SESSION_EXPIRED` |

## 4. 浏览器验收

| 场景 | 操作步骤 | 期望结果 | 记录 |
|---|---|---|---|
| 未登录访问投递清单 | 清空浏览器登录态，打开 `/applications` | 跳转 `/auth?next=/applications` | 待填写 |
| 未登录访问简历 | 清空浏览器登录态，打开 `/resume` | 跳转 `/auth?next=/resume` | 待填写 |
| 未登录访问设置页 | 清空浏览器登录态，打开 `/settings` | 跳转 `/auth?next=/settings` | 待填写 |
| next 登录回跳 | 从 `/auth?next=/applications` 登录 | 登录成功后回到 `/applications` | 待填写 |
| 已登录访问 auth | 登录后打开 `/auth` | 跳转首页或默认工作台，不停留在登录页 | 待填写 |
| 退出登录 | 在 `/settings` 使用退出登录 | 回到 `/auth`，再次访问受保护页会跳转登录 | 待填写 |
| 移动端 auth 表单 | 使用约 `390x844` 视口打开 `/auth` | 表单、按钮、提示文案不横向溢出，不遮挡 | 待填写 |
| 核心页面回归 | 登录后打开 `/evaluate`、`/resume`、`/applications`、`/settings` | 页面可进入，关键数据请求不被 401 误伤 | 待填写 |

## 5. 文案验收

| 检查项 | 期望 | 记录 |
|---|---|---|
| Demo 登录 | `/auth` 不再声称“只是 Demo 登录”“不会请求后端鉴权接口” | 待填写 |
| 短信 | 不暗示已发送短信验证码或已接入短信登录 | 待填写 |
| OAuth | 不暗示已接入微信、GitHub 或其他第三方 OAuth；占位入口必须标明暂未接入 | 待填写 |
| 云同步 / SaaS | 不暗示云同步、多端同步或多用户 SaaS 已接入 | 待填写 |
| 招聘平台 | 不暗示招聘平台授权、平台状态同步、自动投递或自动联系 HR 已接入 | 待填写 |
| 本地边界 | 本地 SQLite、demo-data 和可选模型请求边界仍清晰 | 待填写 |

## 6. 回归记录模板

| 日期 | 验收人 | 环境 | owner 策略 | 命令结果 | 浏览器结果 | 备注 |
|---|---|---|---|---|---|---|
| 待填写 | 待填写 | 本地 Next.js + SQLite | 默认 smoke owner / 现有 owner 凭据 / 测试库 | 待填写 | 待填写 | 待填写 |

## 7. 2026-06-04 本轮验收记录

| 项目 | 结果 |
|---|---|
| `npm run lint` | 通过 |
| `npm run build` | 通过；本轮先清理了旧 `.next/dev/types` 生成产物，未改业务源码 |
| `npm run smoke:auth` | 通过，`9/9` auth 场景通过 |
| `npm run smoke` | 通过，auth smoke `9/9`，核心业务 API 回归 `16/16` |
| 文案复核 | `/auth` 未发现旧 Demo 登录、短信验证码、已接入 OAuth 等误导文案；微信/GitHub 显示“暂未接入” |
| 浏览器验收证据 | 已有截图位于 `.codex-artifacts/step28-browser/`，覆盖注册进入首页、退出登录回 auth、错误密码、next 回跳、`/evaluate`、`/resume`、`/applications` 和 `390x844` 移动端 auth |
