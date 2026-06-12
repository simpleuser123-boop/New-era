# 18 — Career DNA 求职画像页完整功能拆解

> 页面: `src/app/career/page.tsx` | 组件: `CareerProfilePage / CareerProfileWorkspace` | API: `/api/career-profile/*` | 数据: SQLite `settings.career_profile`

---

## 当前实现补充（2026-06-11）

Career DNA 是本地求职画像设置，不是自动生成后直接写入的黑盒画像。页面会读取本地报告、默认简历和 Tracker 生成建议，但建议必须由用户接受或忽略，并在点击保存后才写入 `settings.career_profile`。

---

## 功能清单

| # | 功能 | 实现 | 数据源 |
|---|------|------|--------|
| 1 | 画像加载 | 读取本地 Career DNA | SQLite settings |
| 2 | 目标方向 | 固定 AI 方向多选 | 前端表单 |
| 3 | 目标岗位 / 城市 | 列表输入 | 前端草稿 |
| 4 | 工作模式 / 薪资 | 偏好编辑 | 前端草稿 |
| 5 | 不接受条件 | deal breakers | 前端草稿 |
| 6 | 优势与短板 | 证据化 strengths / weaknesses | 前端草稿 |
| 7 | 当前策略 | 求职打法文本 | 前端草稿 |
| 8 | 本地建议 | 从报告、简历、Tracker 生成待确认建议 | API |

---

## 功能拆解

### 1. 页面定位

Career DNA 是 New Era 的个人求职判断基准，用于：
- Analytics 判断当前推进岗位是否符合目标。
- Assistant 读取个人目标与边界。
- 后续报告和 Tracker 给出更贴合个人方向的建议。

### 2. 目标与偏好

画像字段包括：

| 字段 | 说明 |
|------|------|
| targetDirections | LLM 应用层、AI Infra、算法研究等固定方向 |
| targetRoles | 目标岗位，如 AI 产品经理、Agent 产品负责人 |
| targetCities | 目标城市 |
| preferredWorkModes | 远程、混合、办公室等 |
| salaryExpectation | 最低 / 目标薪资 |
| dealBreakers | 不接受条件 |
| preferredCompanyStages | 偏好公司阶段 |

### 3. 优势与短板

优势和短板必须尽量证据化：
- 优势记录 evidence。
- 短板记录 mitigation。
- 避免只写无法验证的主观描述。

### 4. 当前策略

`currentStrategy` 用于记录阶段性打法，例如：
- 优先推进 LLM 应用层岗位。
- 每周复盘 Tracker。
- 补齐 RAG 评测和商业化案例。

### 5. 本地建议生成

调用：

```text
POST /api/career-profile/suggestions
```

建议来源：
- 默认简历。
- 历史评估报告。
- Tracker 投递记录。

建议包括：
- 推荐目标方向。
- 推荐目标岗位 / 城市。
- 识别优势和短板。
- 补充当前策略。

### 6. 建议确认机制

建议不会自动写入长期画像：
1. 用户点击“从本地数据生成建议”。
2. 页面展示建议和来源。
3. 用户逐条接受或忽略。
4. 接受/忽略只修改页面草稿。
5. 用户点击保存后才写入 `settings.career_profile`。

### 7. 保存与重置

- 未保存更改时显示底部保存条。
- 保存调用 `PUT /api/career-profile`。
- 取消 / 重置恢复到上次保存状态。
- 保存失败时保留当前草稿。

---

## 页面状态

| 状态 | 展示 |
|------|------|
| 加载中 | 画像骨架屏 |
| 空画像 | 引导手动填写或生成建议 |
| 有草稿 | 表单可编辑，底部保存条 |
| 建议生成中 | 建议按钮 loading |
| 建议为空 | 说明本地数据不足 |
| 保存失败 | 错误提示，草稿保留 |

---

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/career-profile` | GET | 读取 Career DNA |
| `/api/career-profile` | PUT | 保存 Career DNA |
| `/api/career-profile/suggestions` | POST | 从本地数据生成建议 |

---

## 验收标准

- `/career` 可从侧边栏进入，导航高亮正确。
- 新建或编辑画像后，刷新页面仍能读取保存内容。
- 建议接受 / 忽略后，不点击保存不会写入长期画像。
- 建议来源在页面可见，用户能判断建议来自哪些本地数据。
- 空数据、API 错误和保存失败状态均有明确反馈。
