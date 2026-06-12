import {
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  Cpu,
  DatabaseZap,
  FileSearch,
  Gauge,
  Layers3,
  LineChart,
  Rocket,
  SearchCode,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type InsightMetric = {
  label: string;
  value: string;
  description: string;
  badge?: string;
  icon: LucideIcon;
  tone: "primary" | "green" | "blue" | "neutral";
  progress?: number;
};

export type TechTrend = {
  name: string;
  growth: number;
  share: string;
  note: string;
};

export type SalaryBenchmark = {
  role: string;
  range: string;
  description: string;
  icon: LucideIcon;
};

export type DomainSlice = {
  label: string;
  percent: number;
  color: string;
  detail: string;
};

export type HiringCompany = {
  name: string;
  initials: string;
  colorClass: string;
  hiring: string;
  jobs: number;
  focus: string;
};

export const insightMetrics: InsightMetric[] = [
  {
    label: "AI 岗位需求增长",
    value: "+24.5%",
    description: "同比去年，应用层与 Infra 岗位同步扩张",
    badge: "同比去年",
    icon: TrendingUp,
    tone: "primary",
  },
  {
    label: "平均起薪（月）",
    value: "¥35,800",
    description: "一线城市 3 年内经验段均值",
    icon: BriefcaseBusiness,
    tone: "neutral",
  },
  {
    label: "热门技术栈覆盖率",
    value: "78.4%",
    description: "RAG、微调、向量数据库仍是核心关键词",
    icon: Gauge,
    tone: "blue",
    progress: 78.4,
  },
  {
    label: "人才竞争比",
    value: "42:1",
    description: "优质初级岗位竞争仍高于中高级岗位",
    icon: Building2,
    tone: "green",
  },
];

export const techTrends: TechTrend[] = [
  {
    name: "大模型与微调",
    growth: 92,
    share: "28%",
    note: "LoRA、SFT 与评测链路需求集中",
  },
  {
    name: "RAG 架构与向量数据库",
    growth: 85,
    share: "24%",
    note: "企业知识库落地进入密集招聘期",
  },
  {
    name: "CUDA 与内核级性能优化",
    growth: 64,
    share: "16%",
    note: "推理成本压力带动性能岗位溢价",
  },
  {
    name: "PyTorch 分布式训练优化",
    growth: 58,
    share: "14%",
    note: "多卡训练、容错和集群调度需求稳定",
  },
];

export const salaryBenchmarks: SalaryBenchmark[] = [
  {
    role: "资深算法工程师",
    range: "60k - 100k",
    description: "模型训练、推理优化、算法架构",
    icon: Terminal,
  },
  {
    role: "LLM 应用开发",
    range: "35k - 55k",
    description: "Agent、工具调用、企业工作流集成",
    icon: Sparkles,
  },
  {
    role: "AI 产品运营",
    range: "18k - 30k",
    description: "产品增长、标注协同、数据反馈闭环",
    icon: Rocket,
  },
  {
    role: "Prompt 工程师",
    range: "25k - 40k",
    description: "评测集构建、提示词体系和质量治理",
    icon: FileSearch,
  },
];

export const domainDistribution: DomainSlice[] = [
  {
    label: "自然语言处理",
    percent: 45,
    color: "#c4873a",
    detail: "文本理解、问答和 Agent 岗位占比最高",
  },
  {
    label: "多模态与音频",
    percent: 30,
    color: "#5b7f9e",
    detail: "视频生成、语音交互和内容理解持续增温",
  },
  {
    label: "计算机视觉",
    percent: 25,
    color: "#cec6b2",
    detail: "工业质检与机器人方向保持稳定需求",
  },
];

export const hiringCompanies: HiringCompany[] = [
  {
    name: "Moonshot AI（月之暗面）",
    initials: "M",
    colorClass: "bg-[#2d2a26]",
    hiring: "长文本模型架构师、推理性能优化",
    jobs: 5,
    focus: "长上下文模型",
  },
  {
    name: "Zhipu AI（智谱 AI）",
    initials: "Z",
    colorClass: "bg-[var(--color-primary)]",
    hiring: "多模态算法、ChatGLM 模型训练",
    jobs: 3,
    focus: "通用大模型",
  },
  {
    name: "Baichuan（百川智能）",
    initials: "B",
    colorClass: "bg-[var(--color-blue)]",
    hiring: "搜索增强 RAG、强化学习 RLHF",
    jobs: 8,
    focus: "企业应用",
  },
];

export const trendTags = [
  "Agent",
  "RAG",
  "LangChain",
  "PyTorch",
  "向量数据库",
  "Prompt Engineering",
  "LoRA",
  "MCP",
  "多模态",
  "Function Calling",
  "AI SDK",
  "RLHF",
];

export const weeklyBrief = [
  "Agent 开发岗位需求继续抬升，招聘方更关注端到端业务交付经验。",
  "具身智能与多模态团队扩招明显，但对算法、硬件和数据闭环能力要求更高。",
  "企业 RAG 项目从验证转向落地，向量检索、评测和权限治理成为高频面试点。",
];

export const marketSignals = [
  { label: "招聘强度", value: "高", icon: LineChart },
  { label: "求职门槛", value: "上升", icon: Layers3 },
  { label: "核心方向", value: "LLM 应用", icon: BrainCircuit },
  { label: "风险提示", value: "包装岗增多", icon: ShieldCheck },
];

export const focusAreas = [
  { label: "LLM 应用层", value: 42, icon: Bot },
  { label: "AI Infra", value: 28, icon: Cpu },
  { label: "算法研究", value: 18, icon: ChartNoAxesCombined },
  { label: "数据与检索", value: 12, icon: DatabaseZap },
  { label: "工程化工具", value: 10, icon: SearchCode },
];
