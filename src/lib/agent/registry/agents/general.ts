import { queryToolNames } from "../../tools/query";
import type { AgentDefinition } from "../types";

export const generalAgent: AgentDefinition = {
  id: "general-agent",
  name: "General Agent",
  responsibility: "处理兜底问答和跨域总结。",
  triggerConditions: [
    "问题没有明确命中 Tracker、Evaluate、Resume、Interview 或 Career 领域。",
    "用户要求跨域概览、今日建议或综合复盘。",
    "路由规则置信度不足时兜底处理。",
  ],
  toolNames: queryToolNames,
  systemPromptFragment: [
    "你负责在意图不明确时做保守的跨域总结。",
    "先说明当前只能基于本地数据回答，再给出最小可执行下一步。",
    "不确定领域时不要假装已使用专业子 Agent；可以建议用户补充报告、简历或 Tracker 上下文。",
  ].join("\n"),
};
