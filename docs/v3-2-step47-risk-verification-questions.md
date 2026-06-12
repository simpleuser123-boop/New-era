# New Era v3.2 Step 47 - 风险驱动的 HR 核实问题

## 范围

Step 47 将风险扫描结果转成用户可复制的 HR / 面试官核实问题，入口位于：

- `/risks` 单岗扫描结果。
- `/risks` 真假对决每侧结果。
- `/evaluate/report` 风险扫描解释区域。

本步骤不自动发送消息、不读取通讯录、不保存 HR 联系方式、不创建 Agent Action Proposal，也不把问题写入 reports、applications、settings、sessions 等长期业务表。

## API

`POST /api/risk-verification-questions`

请求：

```json
{
  "jdText": "完整 JD 文本",
  "company": "可选公司名",
  "role": "可选岗位名"
}
```

服务端会重新执行 `scanRisks`，再通过本地确定性规则生成问题。客户端不能直接提交“已判定风险”作为唯一依据。

返回：

```json
{
  "ok": true,
  "decisionLabel": "高风险 AI 岗，需要核实岗位真实性和职责边界",
  "riskLevel": "high",
  "ruleVersion": "2026-06-09.risk-rules.v3-1-step42+risk-verification-questions.v1",
  "questions": [
    {
      "id": "traditional-ai-work-ratio",
      "category": "传统岗位包装 AI / AI 占比",
      "question": "这个岗位日常工作中，模型、RAG、Agent、算法实验或模型工程相关任务大约占比多少？传统业务开发、维护或外包交付占比多少？",
      "reason": "JD 命中了传统开发包装 AI 或 AI 技术栈缺失信号，需要确认真实工作是否围绕模型、RAG、Agent 或算法闭环。",
      "relatedEvidence": "JD 原文片段",
      "priority": "high"
    }
  ],
  "disclaimer": "这些问题只用于辅助你向 HR 或面试官核实岗位真实性、职责边界和用工安排，不代表招聘方一定存在违规，也不会自动发送给任何外部对象。"
}
```

所有输入和输出都经过 Zod 校验。非法 JSON、非法字段、过短 JD、过长 JD 分别返回明确错误码。

## 生成规则

规则版本：`risk-verification-questions.v1`

生成器是本地纯函数，不调用 DeepSeek 或任何模型。相同 JD、相同风险规则版本和相同问题规则版本会得到稳定结果。

重点覆盖：

- 培训贷 / 收费：生成收费、协议、劳动关系、安置承诺问题。
- 招转培：核实正式招聘还是培训筛选、劳动合同主体和社保时间。
- 传统岗位包装 AI：生成 AI 工作占比、前三个月交付物、生产环境、真实用户、评测指标和技术闭环问题。
- 数据标注边界：核实岗位核心是标注执行还是模型/算法/评测方案设计。
- 过度承诺：核实薪资、offer、入职时间和限制条件是否进入正式文件。
- 没有明显高风险：仍生成 AI 技术含金量、团队边界、前三个月交付物问题。

问题按 `high -> medium -> low` 排序，并尽量带上原文证据。

## UI 行为

`RiskVerificationQuestions` 组件提供：

- 生成核实问题。
- 单条复制。
- 复制全部。
- 复制成功和失败反馈。

组件只把结果保存在当前页面状态中，不写入数据库、本地设置、报告历史、Tracker 或 Agent 动作。

## 验证

新增脚本：

```powershell
npm run smoke:risk-verification-questions
```

覆盖：

- 培训贷 / 招转培样本生成收费、协议、劳动关系问题。
- 传统岗位包装 AI 样本生成 AI 占比、交付物、生产环境、真实用户、评测指标和技术闭环问题。
- 边界岗和低风险样本仍生成技术含金量、团队边界、前三个月交付物问题。
- 非法输入、过短输入、过长输入返回明确错误。
- reports、applications、settings、sessions、agent_action_proposals 等业务表无写入副作用。
