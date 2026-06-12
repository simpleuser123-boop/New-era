import {
  FileText,
  History,
  LucideIcon,
  Network,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

export type ResumeRecord = {
  id: string;
  name: string;
  type: "pdf" | "docx";
  updatedAt: string;
  size: string;
  focus: string;
  matchScore: number;
};

export type SkillGap = {
  label: string;
  status: string;
  value: number;
};

export type ResumeMetric = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: "primary" | "blue" | "green";
};

export type ResumeOptimization = {
  title: string;
  detail: string;
};

export const resumes: ResumeRecord[] = [
  {
    id: "algo-2024",
    name: "中级算法岗_2024.pdf",
    type: "pdf",
    updatedAt: "2024-03-15",
    size: "1.2MB",
    focus: "AIGC 架构师",
    matchScore: 88,
  },
  {
    id: "pm-tencent",
    name: "PM 简历_腾讯版.docx",
    type: "docx",
    updatedAt: "2024-02-28",
    size: "856KB",
    focus: "AI 产品经理",
    matchScore: 76,
  },
  {
    id: "infra-global",
    name: "核心开发_外企专用.pdf",
    type: "pdf",
    updatedAt: "2024-01-20",
    size: "1.5MB",
    focus: "AI Infra",
    matchScore: 82,
  },
  {
    id: "rag-lead",
    name: "RAG 负责人_精简版.pdf",
    type: "pdf",
    updatedAt: "2023-12-08",
    size: "980KB",
    focus: "RAG 工程负责人",
    matchScore: 84,
  },
];

export const skillGaps: SkillGap[] = [
  {
    label: "RAG 向量数据库",
    status: "缺少实操项目",
    value: 35,
  },
  {
    label: "多模态对齐经验",
    status: "广度不足",
    value: 60,
  },
  {
    label: "Agent 工程化",
    status: "案例偏少",
    value: 48,
  },
];

export const weeklyActivity = [
  { day: "Mon", value: 40 },
  { day: "Tue", value: 65 },
  { day: "Wed", value: 50 },
  { day: "Thu", value: 90 },
  { day: "Fri", value: 75 },
  { day: "Sat", value: 85 },
  { day: "Today", value: 100 },
];

export const resumeMetrics: ResumeMetric[] = [
  {
    label: "生态位匹配",
    value: "88",
    description: "AIGC 架构师 / 模型部署专家",
    icon: Network,
    tone: "primary",
  },
  {
    label: "简历资产",
    value: "4",
    description: "覆盖算法、产品和外企投递场景",
    icon: FileText,
    tone: "blue",
  },
  {
    label: "可优化项",
    value: "7",
    description: "其中 3 项可在一周内补强",
    icon: UploadCloud,
    tone: "green",
  },
  {
    label: "风险项",
    value: "2",
    description: "量化成果不足与关键词缺口",
    icon: ShieldCheck,
    tone: "primary",
  },
];

export const optimizationTips: ResumeOptimization[] = [
  {
    title: "补足向量数据库项目细节",
    detail: "在 RAG 项目中加入 Milvus、Pinecone 或 FAISS 的索引策略、召回指标和延迟表现。",
  },
  {
    title: "把训练经验转写为业务结果",
    detail: "将“负责模型优化”改成可验证的吞吐、成本、推理延迟或准确率变化。",
  },
  {
    title: "为目标岗位准备一份轻量版",
    detail: "面向 AI 产品和架构岗分别保留 2 页版本，避免技术深度和业务表达互相稀释。",
  },
];

export const recentActions = [
  {
    label: "算法岗版本完成关键词对齐",
    time: "今天 16:20",
    icon: History,
  },
  {
    label: "RAG 技能缺口新增 2 条建议",
    time: "昨天 21:10",
    icon: Network,
  },
];
