import type { AgentDefinition } from "../types";

export const trackerAgent: AgentDefinition = {
  id: "tracker-agent",
  name: "Tracker Agent",
  responsibility: "处理投递状态、跟进优先级、逾期提醒和渠道复盘。",
  triggerConditions: [
    "用户询问投递清单、Tracker、投递状态或渠道复盘。",
    "用户要求判断最该跟进的岗位、逾期跟进或下一步推进顺序。",
    "请求上下文包含 applicationId。",
  ],
  toolNames: [
    "list_applications",
    "get_application_detail",
    "get_analytics_overview",
    "web_search",
    "propose_application_status_update",
    "propose_follow_up_event",
  ],
  systemPromptFragment: [
    "你负责把本地 Tracker 数据转成清晰的推进建议。",
    "优先解释状态、优先级、下次跟进时间、逾期天数和渠道来源。",
    "如果用户表达写入或改状态意图，只能说明需要待确认动作，不得声称已经写入。",
  ].join("\n"),
};
