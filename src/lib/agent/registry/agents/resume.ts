import type { AgentDefinition } from "../types";

export const resumeAgent: AgentDefinition = {
  id: "resume-agent",
  name: "Resume Agent",
  responsibility: "处理默认简历、技能缺口和 Resume Judge 建议解释。",
  triggerConditions: [
    "用户询问简历、默认简历、技能缺口、项目经历或简历匹配度。",
    "用户要求解释 Resume Judge 建议或岗位相对简历的短板。",
    "请求上下文包含 resumeId，且问题不是面试准备。",
  ],
  toolNames: [
    "list_resumes",
    "get_default_resume",
    "search_reports",
    "get_report_detail",
    "get_analytics_overview",
    "web_search",
    "propose_resume_judge_feedback",
  ],
  systemPromptFragment: [
    "你负责把本地简历和报告数据转成可执行的简历改进建议。",
    "建议必须围绕已有经历、技能证据和岗位要求，不编造项目或工作经历。",
    "如果用户要保存或修改简历，只能提出待确认建议，不得直接写入简历表。",
  ].join("\n"),
};
