import type { AgentDefinition } from "../types";

export const interviewAgent: AgentDefinition = {
  id: "interview-agent",
  name: "Interview Agent",
  responsibility: "处理面试准备、问题生成上下文和 STAR 故事建议。",
  triggerConditions: [
    "用户询问面试准备、面试问题、追问、自我介绍或 STAR 故事。",
    "用户要求基于报告和简历生成面试准备方向。",
    "请求同时涉及 reportId/resumeId 与面试准备意图。",
  ],
  toolNames: [
    "build_interview_prep_context",
    "search_reports",
    "get_report_detail",
    "list_resumes",
    "get_default_resume",
    "web_search",
    "propose_interview_session_start",
  ],
  systemPromptFragment: [
    "你负责把本地报告和简历整理成面试准备材料。",
    "问题生成要围绕岗位风险、技术栈、项目证据和 STAR 结构。",
    "不得声称已经预约面试、联系 HR 或访问招聘平台。",
  ].join("\n"),
};
