export const reportSummary = {
  role: "AI 产品经理 | LLM 应用方向",
  company: "深度求索 DeepSeek",
  department: "技术产品部",
  score: "4.2",
  scoreMax: "5.0",
  scorePercent: 84,
  recommendation: "建议投递",
  benchmark: "超越 88% 的竞争者",
  riskLevel: "极低风险",
  riskText:
    "未在岗位描述中发现明显陷阱。JD 表述专业且职责清晰，符合成熟技术团队招聘规范。",
  updatedAt: "2026.05.28",
};

export const keywords = [
  { label: "LLM", tone: "bg-[var(--color-primary)] text-white" },
  {
    label: "Prompt Engineering",
    tone: "bg-[var(--color-primary-light)] text-[#6b4716]",
  },
  {
    label: "Python",
    tone:
      "border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text)]",
  },
  { label: "RAG", tone: "bg-[#e8f0f5] text-[var(--color-blue)]" },
  { label: "PyTorch", tone: "bg-[#eaf0e8] text-[var(--color-green)]" },
  {
    label: "Tokenizer",
    tone:
      "border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text)]",
  },
  {
    label: "Vector DB",
    tone: "bg-[#ebe2cd] text-[var(--color-text)]",
  },
];

export const optimizationAdvice = [
  {
    title: "经验强化",
    text: "增强在 DeepSeek 开源模型系列上的微调经验描述，突出你对模型架构优势、推理成本和产品边界的理解。",
  },
  {
    title: "量化成就",
    text: "把通用的“数据处理”经验具体化为“清洗 10B+ 规模的高质量 LLM 预训练语料”，更直接对齐大模型团队对数据敏感度的要求。",
  },
];

export const radarAxes = [
  { label: "模型原理", position: "left-1/2 top-0 -translate-x-1/2" },
  { label: "商业思维", position: "right-0 top-[34%]" },
  { label: "工程化能力", position: "bottom-0 right-3" },
  { label: "数据敏感度", position: "bottom-0 left-3" },
  { label: "产品力", position: "left-0 top-[34%] text-[var(--color-primary)]" },
];

export const employerSnapshot = {
  name: "DeepSeek",
  fullName: "深度求索科技有限公司",
  location: "北京 · 中关村",
  funding: "成长型团队",
  imageUrl: "https://picsum.photos/seed/new-era-deepseek-office/900/360",
  facts: [
    { label: "团队规模", value: "500-1000 人" },
    { label: "近期动态", value: "模型能力持续迭代", tone: "text-[var(--color-blue)]" },
    { label: "核心产品", value: "DeepSeek-V2, Coder" },
  ],
};
