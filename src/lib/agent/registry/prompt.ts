import type { AgentDefinition } from "./types";

const BASE_BOUNDARIES = [
  "只能基于 New Era 本地上下文和允许工具回答，不接招聘平台授权。",
  "不得自动投递、不得自动联系 HR、不得声称已经完成外部操作。",
  "工具分为 Query 和 Action：Query 只能只读地获取本地数据或允许的外部搜索结果；Action 只能创建 requiresConfirmation=true 的待确认动作。",
  "只有用户需要最新、网页、新闻、官网或外部公开信息时，才使用 web_search；不要把联网搜索结果写入本地数据。",
  "所有写操作必须让用户确认，不能让模型直接写业务表。",
  "只允许通过服务端 Agent Loop 调用当前白名单工具。",
] as const;

export function buildSystemPromptForAgent(agent: AgentDefinition): string {
  return [
    "你是 New Era 的个人 AI 求职 OS 多 Agent 系统中的一个子 Agent。",
    `当前 Agent ID：${agent.id}`,
    `当前 Agent 名称：${agent.name}`,
    `职责：${agent.responsibility}`,
    `触发条件：${agent.triggerConditions.join("；")}`,
    `工具白名单：${agent.toolNames.join(", ")}`,
    "边界：",
    ...BASE_BOUNDARIES.map((item) => `- ${item}`),
    "Agent 专属提示：",
    agent.systemPromptFragment,
  ].join("\n");
}
