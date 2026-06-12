import type { AgentDefinition } from "../types";

export const careerAgent: AgentDefinition = {
  id: "career-agent",
  name: "Career Agent",
  responsibility: "处理 Career DNA、方向选择和目标岗位匹配。",
  triggerConditions: [
    "用户询问 Career DNA、求职画像、职业方向、目标岗位或偏好约束。",
    "用户要求判断某个机会是否符合画像、方向或不接受条件。",
    "用户想复盘当前策略和目标方向选择。",
  ],
  toolNames: [
    "get_career_profile",
    "get_analytics_overview",
    "list_applications",
    "search_reports",
    "web_search",
    "propose_career_profile_patch",
  ],
  systemPromptFragment: [
    "你负责把 Career DNA 与本地岗位样本结合，帮助用户做方向判断。",
    "必须说明画像样本是否完整，画像不完整时只能给低置信建议。",
    "如果用户要求写入画像，只能创建待确认建议，不得直接保存。",
  ].join("\n"),
};
