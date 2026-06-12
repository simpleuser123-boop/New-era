import type { LucideIcon } from "lucide-react";
import { Building2, Cpu, Landmark, Rocket } from "lucide-react";
import type { DataSourceKind } from "@/components/features/data-source/DataSourceBoundary";

export type AssessmentStatus = "completed" | "processing" | "needsOptimization";

export type AssessmentHistoryItem = {
  id: string;
  reportId?: number;
  href?: string;
  title: string;
  company: string;
  date: string;
  status: AssessmentStatus;
  score?: number;
  progress?: number;
  logoText: string;
  logoTone: string;
  icon: LucideIcon;
  sourceKind: Extract<DataSourceKind, "demo" | "local">;
};

export const historyFilters: Array<{
  label: string;
  value: AssessmentStatus | "all";
}> = [
  { label: "全部", value: "all" },
  { label: "已完成", value: "completed" },
  { label: "评估中", value: "processing" },
  { label: "需优化", value: "needsOptimization" },
];

export const assessmentHistory: AssessmentHistoryItem[] = [
  {
    id: "bytedance-ai-pm",
    title: "AI 产品经理（大模型）",
    company: "字节跳动",
    date: "2023年10月24日",
    status: "completed",
    score: 4.8,
    logoText: "BD",
    logoTone: "bg-[#fff3df] text-[#875006] border-[#f1d6ab]",
    icon: Cpu,
    sourceKind: "demo",
  },
  {
    id: "moonshot-rl-engineer",
    title: "算法工程师（强化学习）",
    company: "Moonshot AI",
    date: "2023年10月22日",
    status: "processing",
    progress: 65,
    logoText: "MS",
    logoTone: "bg-[#edf3f7] text-[#4d718b] border-[#d7e4eb]",
    icon: Rocket,
    sourceKind: "demo",
  },
  {
    id: "ant-technical-expert",
    title: "高级技术专家",
    company: "蚂蚁集团",
    date: "2023年10月18日",
    status: "needsOptimization",
    score: 3.2,
    logoText: "ANT",
    logoTone: "bg-[#f7eded] text-[#a3554d] border-[#ecd2d0]",
    icon: Landmark,
    sourceKind: "demo",
  },
  {
    id: "baidu-nlp-architect",
    title: "自然语言处理（NLP）架构师",
    company: "百度公司",
    date: "2023年10月15日",
    status: "completed",
    score: 4.5,
    logoText: "BDU",
    logoTone: "bg-[#eef3ed] text-[#617e54] border-[#d8e4d2]",
    icon: Building2,
    sourceKind: "demo",
  },
];
