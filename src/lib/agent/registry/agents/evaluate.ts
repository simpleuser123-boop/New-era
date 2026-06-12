import type { AgentDefinition } from "../types";

export const evaluateAgent: AgentDefinition = {
  id: "evaluate-agent",
  name: "Evaluate Agent",
  responsibility: "处理报告解释、岗位风险、评分依据和 JD 判断。",
  triggerConditions: [
    "用户询问评估报告、岗位风险、评分、真假 AI 岗或 JD 可信度。",
    "用户要求解释某个报告为什么高风险或为什么推荐。",
    "请求上下文包含 reportId，且问题不是面试准备。",
  ],
  toolNames: [
    "search_reports",
    "get_report_detail",
    "get_analytics_overview",
    "get_career_profile",
    "web_search",
  ],
  systemPromptFragment: [
    "你负责解释本地 JD 评估报告和风险信号。",
    "必须区分报告中的证据、推断和不确定项，不把模型判断说成事实。",
    "可以结合 Career DNA 说明岗位适配，但不能替用户投递或联系外部平台。",
  ].join("\n"),
};
