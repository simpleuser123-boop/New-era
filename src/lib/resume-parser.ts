import { TRUE_AI_TECH_STACK_WHITELIST } from "./risk-rules";
import { resumeProfileSchema } from "./schemas";
import type {
  AiEcosystemDomain,
  AiEcosystemProfile,
  AiEcosystemVector,
  ResumeContact,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
  ResumeProfile,
  ResumeProject,
  ResumeSkill,
  ResumeSkillCategory,
  ResumeSkillLevel,
} from "./types";

export type AiEcosystemLabel =
  | "LLM应用层"
  | "AI Infra"
  | "算法研究"
  | "具身智能"
  | "AI安全";

export type ParsedWorkExperience = {
  company: string;
  role: string;
  period?: string;
  focus?: string;
};

export type ParsedResumeOverview = {
  name: string;
  currentRole: string;
  targetDirection: AiEcosystemLabel;
  yearsOfExperience?: number;
  location?: string;
  education: ResumeEducation[];
  workExperience: ParsedWorkExperience[];
  summary?: string;
  preferredRoles: string[];
};

export type ParsedAiTechStack = {
  languages: string[];
  frameworks: string[];
  tools: string[];
  domains: string[];
  infrastructure: string[];
  evaluation: string[];
  all: string[];
};

export type ParsedResumeProfile = ResumeProfile &
  ParsedResumeOverview & {
    projects: ResumeProject[];
    experiences: ResumeExperience[];
    parsedProfile: ParsedResumeOverview;
    aiTechStack: ParsedAiTechStack;
    ecosystemPosition: Record<AiEcosystemLabel, number>;
    ecosystemProfile: AiEcosystemProfile;
  };

type SkillTerm = {
  name: string;
  category: ResumeSkillCategory;
  aliases: string[];
  domains?: Partial<Record<AiEcosystemDomain, number>>;
};

type SkillMatch = {
  term: SkillTerm;
  firstIndex: number;
  occurrenceCount: number;
  evidence: string[];
};

type DraftExperience = {
  company: string;
  role: string;
  period?: string;
  lines: string[];
  highlights: string[];
};

type DraftProject = {
  name: string;
  role?: string;
  lines: string[];
};

type DomainAnalysis = {
  vector: AiEcosystemVector;
  primaryDomain: AiEcosystemDomain;
  matchedByDomain: Record<AiEcosystemDomain, string[]>;
};

const DOMAIN_LABELS: Record<AiEcosystemDomain, AiEcosystemLabel> = {
  llm_application: "LLM应用层",
  ai_infra: "AI Infra",
  algorithm_research: "算法研究",
  embodied_ai: "具身智能",
  ai_safety: "AI安全",
};

const DOMAIN_ORDER: AiEcosystemDomain[] = [
  "llm_application",
  "ai_infra",
  "algorithm_research",
  "embodied_ai",
  "ai_safety",
];

const SECTION_HEADINGS = [
  "个人简介",
  "个人概述",
  "自我评价",
  "核心技能",
  "专业技能",
  "技能清单",
  "工作经历",
  "工作经验",
  "实习经历",
  "项目经历",
  "项目经验",
  "教育背景",
  "教育经历",
  "教育",
];

const ROLE_TITLE_PATTERN =
  /(工程师|产品经理|研究员|架构师|开发|负责人|专家|科学家|平台|算法|安全|评测|后端|前端|全栈|实习)/i;

const PERIOD_PATTERN =
  /(?:19|20)\d{2}[./年-]\d{1,2}\s*(?:-|~|至|到)\s*(?:(?:19|20)\d{2}[./年-]\d{1,2}|至今|现在|Present|Now)/i;

const HEADING_PATTERN = new RegExp(
  `^\\s*(?:${SECTION_HEADINGS.map(escapeRegex).join("|")})\\s*$`,
  "i",
);

const DOMAIN_SIGNAL_TERMS: Record<AiEcosystemDomain, string[]> = {
  llm_application: [
    "大模型应用",
    "企业知识库",
    "知识库平台",
    "智能客服",
    "检索增强",
    "混合检索",
    "答案引用",
    "工具调用",
    "任务规划",
    "多轮对话",
    "提示词",
    "文档解析",
    "结构化输出",
    "低置信度转人工",
    "FAQ 检索",
  ],
  ai_infra: [
    "推理平台",
    "模型服务",
    "模型发布",
    "GPU 集群",
    "GPU 利用率",
    "多租户",
    "灰度",
    "回滚",
    "限流",
    "熔断",
    "路由",
    "成本看板",
    "服务治理",
    "资源调度",
    "压测",
    "吞吐",
    "P95",
    "P99",
    "首 token 延迟",
    "模型注册",
  ],
  algorithm_research: [
    "算法",
    "模型训练",
    "微调",
    "训练平台",
    "真实训练",
    "评测集",
    "数据清洗",
    "偏好数据",
    "论文",
    "消融实验",
    "NLP",
    "Transformer 推理",
    "推荐",
    "分类",
    "文本模型",
  ],
  embodied_ai: [
    "具身智能",
    "机器人",
    "机械臂",
    "仿真",
    "导航",
    "轨迹规划",
    "机器人感知",
    "Sim2Real",
    "VLA",
  ],
  ai_safety: [
    "AI 安全",
    "安全评测",
    "事实一致性",
    "引用准确性",
    "拒答",
    "敏感内容",
    "敏感信息",
    "幻觉率",
    "越狱",
    "红队",
    "对抗样本",
    "模型对齐",
    "风险样本",
    "内容安全",
    "审计日志",
    "权限隔离",
  ],
};

const DOMAIN_DEFAULT_ROLES: Record<AiEcosystemDomain, string[]> = {
  llm_application: ["大模型应用开发工程师", "RAG 工程师", "Agent 应用工程师"],
  ai_infra: ["AI Infra 工程师", "大模型推理平台工程师", "MLOps 平台工程师"],
  algorithm_research: ["算法研究工程师", "大模型微调工程师", "模型评测工程师"],
  embodied_ai: ["具身智能工程师", "机器人算法工程师", "机器人控制工程师"],
  ai_safety: ["AI 安全评测工程师", "大模型安全研究员", "红队评测工程师"],
};

const DEGREE_PATTERN = /(博士|硕士|研究生|本科|学士|大专|专科|高中)/;

const BASE_SKILL_TERMS: SkillTerm[] = [
  term("Python", "language", [], { algorithm_research: 0.3 }),
  term("TypeScript", "language", ["TS"]),
  term("JavaScript", "language", ["JS"]),
  term("Go", "language", ["Golang"]),
  term("Shell", "language", ["Bash"]),
  term("SQL", "language"),
  term("Java", "language"),
  term("C++", "language"),
  term("Rust", "language"),
  term("PyTorch", "framework", [], { algorithm_research: 1.25 }),
  term("TensorFlow", "framework", [], { algorithm_research: 1.1 }),
  term("JAX", "framework", [], { algorithm_research: 1.05 }),
  term("Transformers", "framework", ["HuggingFace Transformers"], {
    algorithm_research: 1.1,
  }),
  term("HuggingFace", "tool", ["Hugging Face"], {
    algorithm_research: 0.9,
  }),
  term("LangChain", "framework", [], { llm_application: 1.35 }),
  term("LlamaIndex", "framework", [], { llm_application: 1.25 }),
  term("Semantic Kernel", "framework", [], { llm_application: 1 }),
  term("CrewAI", "framework", [], { llm_application: 0.9 }),
  term("AutoGen", "framework", [], { llm_application: 0.9 }),
  term("FastAPI", "framework"),
  term("Next.js", "framework", ["NextJS"]),
  term("Node.js", "framework", ["NodeJS"]),
  term("React", "framework"),
  term("pandas", "tool", ["Pandas"], { algorithm_research: 0.25 }),
  term("NumPy", "tool", [], { algorithm_research: 0.25 }),
  term("RAG", "domain", ["检索增强"], { llm_application: 1.45 }),
  term("Agent", "domain", ["智能体"], { llm_application: 1.35 }),
  term("Function Calling", "domain", ["函数调用", "Tool Calling", "工具调用"], {
    llm_application: 1.2,
  }),
  term("Prompt Engineering", "domain", ["Prompt", "提示词"], {
    llm_application: 1.05,
  }),
  term("Embedding", "domain", ["向量化"], { llm_application: 0.75 }),
  term("rerank", "domain", ["Rerank", "重排"], { llm_application: 0.75 }),
  term("BM25", "domain", [], { llm_application: 0.55 }),
  term("OpenAI-compatible API", "tool", ["OpenAI API"], {
    llm_application: 0.7,
    ai_infra: 0.35,
  }),
  term("Milvus", "infrastructure", [], {
    llm_application: 0.75,
    ai_infra: 0.45,
  }),
  term("pgvector", "infrastructure", [], {
    llm_application: 0.65,
    ai_infra: 0.35,
  }),
  term("Pinecone", "infrastructure", [], {
    llm_application: 0.65,
    ai_infra: 0.35,
  }),
  term("Chroma", "infrastructure", [], {
    llm_application: 0.6,
    ai_infra: 0.3,
  }),
  term("Weaviate", "infrastructure", [], {
    llm_application: 0.6,
    ai_infra: 0.3,
  }),
  term("Qdrant", "infrastructure", [], {
    llm_application: 0.6,
    ai_infra: 0.3,
  }),
  term("Elasticsearch", "infrastructure", [], { llm_application: 0.35 }),
  term("Redis", "infrastructure"),
  term("PostgreSQL", "infrastructure", ["Postgres"]),
  term("MySQL", "infrastructure"),
  term("Kubernetes", "infrastructure", ["K8s"], { ai_infra: 1.25 }),
  term("Docker", "infrastructure", [], { ai_infra: 0.65 }),
  term("Helm", "infrastructure", [], { ai_infra: 0.55 }),
  term("Istio", "infrastructure", [], { ai_infra: 0.45 }),
  term("Linux", "infrastructure", [], { ai_infra: 0.35 }),
  term("NVIDIA GPU", "infrastructure", ["GPU", "NVIDIA"], {
    ai_infra: 1.1,
  }),
  term("NVIDIA GPU Operator", "infrastructure", [], { ai_infra: 1.05 }),
  term("CUDA", "infrastructure", [], { ai_infra: 0.9 }),
  term("vLLM", "infrastructure", [], { ai_infra: 1.35 }),
  term("TGI", "infrastructure", [], { ai_infra: 1 }),
  term("Triton Inference Server", "infrastructure", ["Triton"], {
    ai_infra: 1.25,
  }),
  term("TensorRT-LLM", "infrastructure", ["TensorRT"], { ai_infra: 1.2 }),
  term("ONNX Runtime", "infrastructure", ["ONNX"], { ai_infra: 0.95 }),
  term("Ray", "infrastructure", [], {
    ai_infra: 0.75,
    algorithm_research: 0.35,
  }),
  term("MLflow", "infrastructure", [], { ai_infra: 1 }),
  term("Kubeflow", "infrastructure", [], { ai_infra: 0.9 }),
  term("Prometheus", "evaluation", [], { ai_infra: 0.55 }),
  term("Grafana", "evaluation", [], { ai_infra: 0.55 }),
  term("OpenTelemetry", "evaluation", [], {
    llm_application: 0.25,
    ai_infra: 0.35,
  }),
  term("MLOps", "domain", [], { ai_infra: 1.15 }),
  term("KV Cache", "domain", [], { ai_infra: 1.05 }),
  term("continuous batching", "domain", ["Continuous Batching"], {
    ai_infra: 1.05,
  }),
  term("模型量化", "domain", ["量化"], {
    ai_infra: 0.8,
    algorithm_research: 0.25,
  }),
  term("SFT", "domain", [], { algorithm_research: 1 }),
  term("LoRA", "domain", [], { algorithm_research: 1.05 }),
  term("QLoRA", "domain", [], { algorithm_research: 1.05 }),
  term("RLHF", "domain", [], { algorithm_research: 1.05 }),
  term("DPO", "domain", [], { algorithm_research: 1.05 }),
  term("DeepSpeed", "infrastructure", [], { algorithm_research: 0.9 }),
  term("FSDP", "infrastructure", [], { algorithm_research: 0.85 }),
  term("tokenizer", "domain", [], { algorithm_research: 0.5 }),
  term("attention", "domain", [], { algorithm_research: 0.5 }),
  term("benchmark", "domain", [], { algorithm_research: 0.7 }),
  term("RAGAS", "evaluation", [], {
    llm_application: 0.75,
    ai_safety: 0.35,
  }),
  term("LangSmith", "evaluation", [], {
    llm_application: 0.65,
    ai_safety: 0.2,
  }),
  term("LangFuse", "evaluation", [], {
    llm_application: 0.65,
    ai_safety: 0.2,
  }),
  term("DeepEval", "evaluation", [], {
    llm_application: 0.55,
    ai_safety: 0.35,
  }),
  term("Phoenix", "evaluation", [], {
    llm_application: 0.45,
    ai_safety: 0.25,
  }),
  term("Evaluation Dataset", "evaluation", ["评测集"], {
    algorithm_research: 0.45,
    ai_safety: 0.55,
  }),
  term("ROS", "domain", [], { embodied_ai: 1.1 }),
  term("ROS2", "domain", [], { embodied_ai: 1.1 }),
  term("Isaac Sim", "tool", [], { embodied_ai: 1 }),
  term("Gazebo", "tool", [], { embodied_ai: 0.9 }),
  term("MuJoCo", "tool", [], { embodied_ai: 0.9 }),
  term("SLAM", "domain", [], { embodied_ai: 0.95 }),
  term("Motion Planning", "domain", ["Path Planning", "轨迹规划"], {
    embodied_ai: 0.95,
  }),
  term("Robot Control", "domain", ["机器人控制"], { embodied_ai: 0.95 }),
  term("Prompt Injection", "domain", [], { ai_safety: 1.1 }),
  term("Jailbreak", "domain", ["越狱攻击"], { ai_safety: 1.05 }),
  term("OWASP LLM Top 10", "domain", [], { ai_safety: 1.1 }),
  term("Red Teaming", "domain", ["红队评测"], { ai_safety: 1.05 }),
  term("Guardrails", "tool", [], { ai_safety: 0.85 }),
  term("对抗样本", "domain", [], { ai_safety: 0.9 }),
  term("模型对齐", "domain", [], { ai_safety: 0.9 }),
  term("内容安全", "domain", [], { ai_safety: 0.75 }),
  term("安全评测", "evaluation", [], { ai_safety: 1 }),
  term("Locust", "tool", [], { ai_infra: 0.45 }),
  term("NVIDIA DCGM", "tool", ["DCGM"], { ai_infra: 0.55 }),
];

const SKILL_TERMS = mergeSkillTerms([
  ...BASE_SKILL_TERMS,
  ...buildWhitelistSkillTerms(),
]);

export function parseResumeText(resumeText: string): ParsedResumeProfile {
  const normalizedText = normalizeLineEndings(resumeText).trim();

  if (normalizedText.length < 20) {
    throw new Error("Resume text must contain at least 20 characters.");
  }

  const lines = splitLines(normalizedText);
  const name = extractName(lines);
  const yearsOfExperience = extractYearsOfExperience(normalizedText);
  const summary = extractSummary(lines);
  const contact = extractContact(lines, normalizedText);
  const preferredRoles = extractPreferredRoles(lines);
  const education = extractEducation(lines);
  const experiences = extractExperiences(lines);
  const projects = extractProjects(lines);
  const skills = extractSkills(normalizedText, projects, experiences);
  const ecosystemAnalysis = analyzeEcosystem(
    normalizedText,
    skills,
    projects,
    experiences,
    preferredRoles,
  );
  const ecosystemProfile = buildEcosystemProfile(ecosystemAnalysis);
  const currentRole =
    extractCurrentRole(experiences, preferredRoles, lines) ??
    DOMAIN_DEFAULT_ROLES[ecosystemProfile.primaryDomain][0];
  const overview = buildOverview({
    name,
    currentRole,
    targetDirection: DOMAIN_LABELS[ecosystemProfile.primaryDomain],
    yearsOfExperience,
    location: contact.location,
    education,
    experiences,
    summary,
    preferredRoles:
      preferredRoles.length > 0
        ? preferredRoles
        : DOMAIN_DEFAULT_ROLES[ecosystemProfile.primaryDomain],
  });
  const content: ResumeContent = {
    name,
    ...(yearsOfExperience === undefined ? {} : { yearsOfExperience }),
    currentRole,
    ...(summary ? { summary } : {}),
    ...(hasContactValue(contact) ? { contact } : {}),
    skills,
    projects,
    experiences,
    education,
    rawText: normalizedText,
  };
  const profile = resumeProfileSchema.parse({
    content,
    skills,
    ecosystem: ecosystemProfile.vector,
    ecosystemProfile,
  });
  const finalEcosystemProfile = profile.ecosystemProfile ?? ecosystemProfile;

  return {
    ...profile,
    ...overview,
    projects: profile.content.projects,
    experiences: profile.content.experiences,
    parsedProfile: overview,
    aiTechStack: buildAiTechStack(profile.skills),
    ecosystemPosition: toLabelVector(profile.ecosystem),
    ecosystemProfile: finalEcosystemProfile,
  };
}

function extractName(lines: string[]): string {
  const labeledName = extractLabeledValue(lines, ["姓名", "Name"]);

  if (labeledName) {
    return labeledName;
  }

  const firstLine = lines.find((line) => {
    const cleanLineValue = cleanLine(line);

    return (
      cleanLineValue.length > 0 &&
      cleanLineValue.length <= 40 &&
      !/[:：]/.test(cleanLineValue) &&
      !HEADING_PATTERN.test(cleanLineValue) &&
      !/(简历|求职方向|工作年限|联系方式|邮箱|电话)/.test(cleanLineValue)
    );
  });

  return cleanShortValue(firstLine) ?? "未识别候选人";
}

function extractYearsOfExperience(text: string): number | undefined {
  const directMatch = text.match(
    /(?:工作年限|工作经验|从业年限|相关经验|经验)\s*[:：]?\s*(?:近|约|超过)?\s*(\d+(?:\.\d+)?)\s*年/i,
  );

  if (directMatch) {
    return Number(directMatch[1]);
  }

  const aiExperienceMatch = text.match(
    /(?:近|约)?\s*(\d+(?:\.\d+)?)\s*年(?:后端|平台|算法|AI|人工智能|大模型|工程|研发)/i,
  );

  return aiExperienceMatch ? Number(aiExperienceMatch[1]) : undefined;
}

function extractSummary(lines: string[]): string | undefined {
  const sectionLines = getSectionLines(lines, [
    "个人简介",
    "个人概述",
    "自我评价",
  ]);
  const summary =
    sectionLines.length > 0
      ? sectionLines.map(cleanLine).filter(Boolean).join(" ")
      : undefined;

  return cleanShortValue(summary, 1_500);
}

function extractContact(lines: string[], text: string): ResumeContact {
  const email = cleanShortValue(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]);
  const phone = cleanShortValue(
    text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}|(?:\+?\d{1,3}[-\s]?)?\d{3,4}[-\s]\d{6,8}/)?.[0],
  );
  const website = cleanShortValue(text.match(/https?:\/\/[^\s，,；;]+/i)?.[0]);
  const location = extractLabeledValue(lines, [
    "所在城市",
    "城市",
    "所在地",
    "工作地点",
    "地点",
    "Location",
  ]);

  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    ...(location ? { location } : {}),
  };
}

function extractPreferredRoles(lines: string[]): string[] {
  const roleLine = extractLabeledValue(lines, [
    "求职方向",
    "目标岗位",
    "期望岗位",
    "应聘岗位",
    "目标职位",
  ]);

  if (!roleLine) {
    return [];
  }

  return splitListValue(roleLine)
    .map((role) => cleanShortValue(role))
    .filter((role): role is string => Boolean(role))
    .filter((role) => ROLE_TITLE_PATTERN.test(role))
    .slice(0, 8);
}

function extractCurrentRole(
  experiences: ResumeExperience[],
  preferredRoles: string[],
  lines: string[],
): string | undefined {
  const explicitRole = extractLabeledValue(lines, [
    "当前岗位",
    "当前职位",
    "当前角色",
    "职位",
    "岗位",
  ]);

  if (explicitRole && ROLE_TITLE_PATTERN.test(explicitRole)) {
    return explicitRole;
  }

  return experiences[0]?.role ?? preferredRoles[0];
}

function extractExperiences(lines: string[]): ResumeExperience[] {
  const sectionLines = getSectionLines(lines, ["工作经历", "工作经验", "实习经历"]);
  const drafts: DraftExperience[] = [];
  let current: DraftExperience | null = null;

  for (const line of sectionLines) {
    const parsedHeader = parseExperienceHeader(line);

    if (parsedHeader) {
      if (current) {
        drafts.push(current);
      }

      current = parsedHeader;
      continue;
    }

    if (!current) {
      continue;
    }

    const cleanedLine = cleanLine(line);

    if (!cleanedLine) {
      continue;
    }

    current.lines.push(cleanedLine);

    if (isBulletLine(line)) {
      current.highlights.push(cleanedLine);
    }
  }

  if (current) {
    drafts.push(current);
  }

  return drafts.map(finalizeExperience).slice(0, 80);
}

function parseExperienceHeader(line: string): DraftExperience | null {
  const cleanedLine = cleanLine(line);

  if (!PERIOD_PATTERN.test(cleanedLine) || !ROLE_TITLE_PATTERN.test(cleanedLine)) {
    return null;
  }

  const parts = splitBarValue(cleanedLine);

  if (parts.length >= 3) {
    const [company, role, ...periodParts] = parts;
    const period = cleanShortValue(periodParts.join(" ")) ?? undefined;

    return {
      company: cleanShortValue(company) ?? "未识别公司",
      role: cleanShortValue(role) ?? "未识别岗位",
      ...(period ? { period } : {}),
      lines: [cleanedLine],
      highlights: [],
    };
  }

  const period = cleanedLine.match(PERIOD_PATTERN)?.[0];
  const beforePeriod = period ? cleanedLine.slice(0, cleanedLine.indexOf(period)) : cleanedLine;
  const fallbackParts = beforePeriod
    .split(/\s+(?:-|—|–|到|至)\s+|\s{2,}/)
    .map((part) => cleanShortValue(part))
    .filter((part): part is string => Boolean(part));

  if (fallbackParts.length < 2) {
    return null;
  }

  return {
    company: fallbackParts[0],
    role: fallbackParts[1],
    ...(period ? { period } : {}),
    lines: [cleanedLine],
    highlights: [],
  };
}

function finalizeExperience(draft: DraftExperience): ResumeExperience {
  const blockText = draft.lines.join("\n");
  const techStack = extractSkillNamesFromText(blockText).slice(0, 80);
  const domain = inferPrimaryDomainForText(blockText);

  return {
    company: draft.company,
    role: draft.role,
    ...(draft.period ? { period: draft.period } : {}),
    ...(domain ? { domain } : {}),
    techStack,
    highlights:
      sanitizeTextList(draft.highlights, "未提取到明确工作亮点", 30),
  };
}

function extractProjects(lines: string[]): ResumeProject[] {
  const sectionLines = getSectionLines(lines, ["项目经历", "项目经验"]);
  const drafts: DraftProject[] = [];
  let current: DraftProject | null = null;

  for (const line of sectionLines) {
    const parsedHeader = parseProjectHeader(line);

    if (parsedHeader) {
      if (current) {
        drafts.push(current);
      }

      current = parsedHeader;
      continue;
    }

    if (current) {
      current.lines.push(cleanLine(line));
    }
  }

  if (current) {
    drafts.push(current);
  }

  return drafts.map(finalizeProject).slice(0, 80);
}

function parseProjectHeader(line: string): DraftProject | null {
  const cleanedLine = cleanLine(line);
  const withoutPrefix = cleanedLine.replace(
    /^项目\s*(?:[一二三四五六七八九十\d]+)?\s*[:：]\s*/,
    "",
  );

  if (withoutPrefix === cleanedLine) {
    return null;
  }

  const [name, role] = splitBarValue(withoutPrefix);

  return {
    name: cleanShortValue(name) ?? "未命名项目",
    ...(cleanShortValue(role) ? { role: cleanShortValue(role) } : {}),
    lines: [withoutPrefix],
  };
}

function finalizeProject(draft: DraftProject): ResumeProject {
  const blockText = draft.lines.filter(Boolean).join("\n");
  const techStackLine = extractLabeledValue(draft.lines, [
    "技术栈",
    "技术",
    "工具",
  ]);
  const explicitTechStack = techStackLine ? splitListValue(techStackLine) : [];
  const detectedTechStack = extractSkillNamesFromText(blockText);
  const techStack = uniqueStrings([...explicitTechStack, ...detectedTechStack]).slice(
    0,
    80,
  );
  const summary = extractLabeledValue(draft.lines, [
    "项目描述",
    "项目简介",
    "描述",
  ]);
  const impact = extractLabeledValue(draft.lines, [
    "量化结果",
    "项目成果",
    "业务结果",
    "结果",
  ]);
  const domain = inferPrimaryDomainForText(blockText);

  return {
    name: draft.name,
    ...(draft.role ? { role: draft.role } : {}),
    ...(domain ? { domain } : {}),
    techStack,
    ...(summary ? { summary: cleanShortValue(summary, 1_800) } : {}),
    ...(impact ? { impact: cleanShortValue(impact, 1_800) } : {}),
  };
}

function extractEducation(lines: string[]): ResumeEducation[] {
  const sectionLines = getSectionLines(lines, ["教育背景", "教育经历", "教育"]);
  const education = sectionLines
    .map(parseEducationLine)
    .filter((item): item is ResumeEducation => Boolean(item));

  return education.slice(0, 20);
}

function parseEducationLine(line: string): ResumeEducation | null {
  const cleanedLine = cleanLine(line);

  if (!cleanedLine || HEADING_PATTERN.test(cleanedLine)) {
    return null;
  }

  const parts = splitBarValue(cleanedLine);

  if (parts.length >= 3) {
    const [school, majorOrDegree, degreeOrMajor, period] = parts;
    const degreeIndex = DEGREE_PATTERN.test(majorOrDegree) ? 1 : 2;
    const degree = degreeIndex === 1 ? majorOrDegree : degreeOrMajor;
    const major = degreeIndex === 1 ? degreeOrMajor : majorOrDegree;

    return {
      school: cleanShortValue(school) ?? "未识别学校",
      ...(cleanShortValue(major) ? { major: cleanShortValue(major) } : {}),
      ...(cleanShortValue(degree) ? { degree: cleanShortValue(degree) } : {}),
      ...(cleanShortValue(period) ? { period: cleanShortValue(period) } : {}),
    };
  }

  if (!/(大学|学院|高校|学校|University|College)/i.test(cleanedLine)) {
    return null;
  }

  const degree = cleanShortValue(cleanedLine.match(DEGREE_PATTERN)?.[0]);
  const period = cleanShortValue(cleanedLine.match(PERIOD_PATTERN)?.[0]);

  return {
    school: cleanShortValue(cleanedLine.replace(PERIOD_PATTERN, "")) ?? cleanedLine,
    ...(degree ? { degree } : {}),
    ...(period ? { period } : {}),
  };
}

function extractSkills(
  text: string,
  projects: ResumeProject[],
  experiences: ResumeExperience[],
): ResumeSkill[] {
  const matches = matchSkillTerms(text);
  const skills = new Map<string, ResumeSkill>();

  for (const match of matches) {
    const level = inferSkillLevel(match, text, projects, experiences);
    const skill: ResumeSkill = {
      name: match.term.name,
      category: match.term.category,
      level,
      evidence: sanitizeTextList(match.evidence, `简历中出现 ${match.term.name}`, 3),
    };

    skills.set(normalizeKey(skill.name), skill);
  }

  for (const candidate of extractExplicitTechCandidates(text)) {
    const key = normalizeKey(candidate.name);

    if (skills.has(key)) {
      continue;
    }

    skills.set(key, {
      name: candidate.name,
      category: inferSkillCategory(candidate.name),
      level: "proficient",
      evidence: [shorten(candidate.evidence, 230)],
    });
  }

  return removeSubsumedSkills([...skills.values()])
    .sort((left, right) => firstIndexOfSkill(text, left.name) - firstIndexOfSkill(text, right.name))
    .slice(0, 200);
}

function removeSubsumedSkills(skills: ResumeSkill[]): ResumeSkill[] {
  return skills.filter((skill) => {
    const skillKey = normalizeKey(skill.name);
    const skillIsKnown = isKnownSkillName(skill.name);

    if (
      ["go", "sql", "java", "rag", "kubernetes", "docker"].includes(skillKey)
    ) {
      return true;
    }

    if (
      !skillIsKnown &&
      skills.some((otherSkill) => {
        const otherKey = normalizeKey(otherSkill.name);

        return (
          otherSkill.category === skill.category &&
          isKnownSkillName(otherSkill.name) &&
          skillKey.includes(otherKey)
        );
      })
    ) {
      return false;
    }

    if (!["triton", "onnx", "tensorrt", "gpu", "nvidia"].includes(skillKey)) {
      return true;
    }

    return !skills.some((otherSkill) => {
      const otherKey = normalizeKey(otherSkill.name);

      return (
        otherSkill.category === skill.category &&
        isKnownSkillName(otherSkill.name) &&
        otherKey !== skillKey &&
        otherKey.length > skillKey.length &&
        otherKey.includes(skillKey)
      );
    });
  });
}

function isKnownSkillName(name: string): boolean {
  const key = normalizeKey(name);

  return SKILL_TERMS.some((skillTerm) => normalizeKey(skillTerm.name) === key);
}

function matchSkillTerms(text: string): SkillMatch[] {
  return SKILL_TERMS.map((skillTerm) => {
    const firstIndex = findFirstAliasIndex(text, skillTerm.aliases);

    if (firstIndex < 0) {
      return null;
    }

    return {
      term: skillTerm,
      firstIndex,
      occurrenceCount: countAliasOccurrences(text, skillTerm.aliases),
      evidence: extractEvidenceLines(text, skillTerm.aliases),
    };
  })
    .filter((match): match is SkillMatch => Boolean(match))
    .sort((left, right) => left.firstIndex - right.firstIndex);
}

function extractExplicitTechCandidates(
  text: string,
): Array<{ name: string; evidence: string }> {
  const candidates: Array<{ name: string; evidence: string }> = [];

  for (const rawLine of splitLines(text)) {
    const line = cleanLine(rawLine);
    const labeledValue = line.match(/^(.{1,24})[:：]\s*(.+)$/);

    if (!labeledValue) {
      continue;
    }

    const [, label, value] = labeledValue;

    if (!/(技术栈|编程语言|应用框架|模型服务|云原生|MLOps|推理优化|数据与检索|评测与观测|LLM 应用|核心技能)/i.test(label)) {
      continue;
    }

    for (const item of splitListValue(value)) {
      const candidate = cleanShortValue(item);

      if (!candidate || candidate.length > 60 || /^\d/.test(candidate)) {
        continue;
      }

      candidates.push({
        name: candidate,
        evidence: line,
      });
    }
  }

  return candidates;
}

function inferSkillLevel(
  match: SkillMatch,
  text: string,
  projects: ResumeProject[],
  experiences: ResumeExperience[],
): ResumeSkillLevel {
  const evidenceText = match.evidence.join(" ");
  const projectHitCount = projects.filter((project) =>
    project.techStack.some((skill) => normalizeKey(skill) === normalizeKey(match.term.name)),
  ).length;
  const experienceHitCount = experiences.filter((experience) =>
    experience.techStack.some((skill) => normalizeKey(skill) === normalizeKey(match.term.name)),
  ).length;
  const leadershipSignal = /(主导|负责|建设|设计|核心|技术负责人|负责人|精通|调优|维护)/.test(
    evidenceText,
  );

  if (
    (match.occurrenceCount >= 4 && leadershipSignal) ||
    (projectHitCount >= 2 && match.occurrenceCount >= 3)
  ) {
    return "expert";
  }

  if (
    match.occurrenceCount >= 2 ||
    projectHitCount > 0 ||
    experienceHitCount > 0 ||
    new RegExp(`熟悉.{0,60}${escapeRegex(match.term.aliases[0])}`, "i").test(text)
  ) {
    return "proficient";
  }

  return "beginner";
}

function analyzeEcosystem(
  text: string,
  skills: ResumeSkill[],
  projects: ResumeProject[],
  experiences: ResumeExperience[],
  preferredRoles: string[],
): DomainAnalysis {
  const rawScores = emptyDomainScores();
  const matchedByDomain = emptyDomainMatches();

  for (const skill of skills) {
    const weights = inferDomainWeightsForSkill(skill);
    const levelFactor = skill.level === "expert" ? 1.2 : skill.level === "beginner" ? 0.7 : 1;

    for (const [domain, weight] of domainWeightEntries(weights)) {
      rawScores[domain] += weight * levelFactor;
      matchedByDomain[domain].push(skill.name);
    }
  }

  for (const [domain, terms] of domainSignalEntries()) {
    const matches = findMatchedKeywords(text, terms);
    rawScores[domain] += matches.length * 0.65;
    matchedByDomain[domain].push(...matches);
  }

  for (const project of projects) {
    const domain = project.domain ?? inferPrimaryDomainForText(projectToText(project));

    if (domain) {
      rawScores[domain] += 2.2;
      matchedByDomain[domain].push(`项目：${project.name}`);
    }
  }

  for (const experience of experiences) {
    const domain = experience.domain ?? inferPrimaryDomainForText(experienceToText(experience));

    if (domain) {
      rawScores[domain] += 1.15;
      matchedByDomain[domain].push(`经历：${experience.role}`);
    }
  }

  for (const role of preferredRoles) {
    const domain = inferPrimaryDomainForText(role);

    if (domain) {
      rawScores[domain] += 1.2;
      matchedByDomain[domain].push(`目标岗位：${role}`);
    }
  }

  const vector = transformRawDomainScores(rawScores);
  const primaryDomain = pickPrimaryDomain(vector);

  return {
    vector,
    primaryDomain,
    matchedByDomain: Object.fromEntries(
      DOMAIN_ORDER.map((domain) => [
        domain,
        uniqueStrings(matchedByDomain[domain]).slice(0, 12),
      ]),
    ) as Record<AiEcosystemDomain, string[]>,
  };
}

function buildEcosystemProfile(analysis: DomainAnalysis): AiEcosystemProfile {
  const primaryEvidence = analysis.matchedByDomain[analysis.primaryDomain];
  const evidence = sanitizeTextList(
    [
      `${DOMAIN_LABELS[analysis.primaryDomain]}：${primaryEvidence
        .slice(0, 8)
        .join("、")}`,
      ...DOMAIN_ORDER.filter((domain) => domain !== analysis.primaryDomain)
        .filter((domain) => analysis.vector[domain] >= 0.15)
        .map(
          (domain) =>
            `${DOMAIN_LABELS[domain]}：${analysis.matchedByDomain[domain]
              .slice(0, 5)
              .join("、")}`,
        ),
    ],
    `${DOMAIN_LABELS[analysis.primaryDomain]}证据不足，按弱信号处理`,
    20,
  );

  return {
    primaryDomain: analysis.primaryDomain,
    vector: analysis.vector,
    evidence,
  };
}

function inferDomainWeightsForSkill(
  skill: ResumeSkill,
): Partial<Record<AiEcosystemDomain, number>> {
  const knownTerm = SKILL_TERMS.find(
    (skillTerm) => normalizeKey(skillTerm.name) === normalizeKey(skill.name),
  );

  if (knownTerm?.domains) {
    return knownTerm.domains;
  }

  const text = skill.name;
  const weights = emptyPartialDomainScores();

  for (const [domain, terms] of domainSignalEntries()) {
    if (findMatchedKeywords(text, terms).length > 0) {
      weights[domain] = Math.max(weights[domain] ?? 0, 0.55);
    }
  }

  if (Object.keys(weights).length > 0) {
    return weights;
  }

  if (skill.category === "evaluation") {
    return { ai_safety: 0.35, llm_application: 0.25 };
  }

  if (skill.category === "infrastructure") {
    return { ai_infra: 0.35 };
  }

  return {};
}

function inferPrimaryDomainForText(text: string): AiEcosystemDomain | undefined {
  const scores = emptyDomainScores();

  for (const skillTerm of SKILL_TERMS) {
    if (findFirstAliasIndex(text, skillTerm.aliases) < 0 || !skillTerm.domains) {
      continue;
    }

    for (const [domain, weight] of domainWeightEntries(skillTerm.domains)) {
      scores[domain] += weight;
    }
  }

  for (const [domain, terms] of domainSignalEntries()) {
    scores[domain] += findMatchedKeywords(text, terms).length * 0.7;
  }

  const primary = pickPrimaryDomain(scores);

  return scores[primary] > 0 ? primary : undefined;
}

function transformRawDomainScores(
  scores: Record<AiEcosystemDomain, number>,
): AiEcosystemVector {
  const vector = emptyDomainScores();

  for (const domain of DOMAIN_ORDER) {
    const rawScore = scores[domain];
    vector[domain] =
      rawScore <= 0 ? 0.02 : roundToTwo(0.02 + 0.96 * (1 - Math.exp(-rawScore / 12)));
  }

  return vector;
}

function buildOverview(input: {
  name: string;
  currentRole: string;
  targetDirection: AiEcosystemLabel;
  yearsOfExperience?: number;
  location?: string;
  education: ResumeEducation[];
  experiences: ResumeExperience[];
  summary?: string;
  preferredRoles: string[];
}): ParsedResumeOverview {
  return {
    name: input.name,
    currentRole: input.currentRole,
    targetDirection: input.targetDirection,
    ...(input.yearsOfExperience === undefined
      ? {}
      : { yearsOfExperience: input.yearsOfExperience }),
    ...(input.location ? { location: input.location } : {}),
    education: input.education,
    workExperience: input.experiences.map((experience) => ({
      company: experience.company,
      role: experience.role,
      ...(experience.period ? { period: experience.period } : {}),
      focus: buildExperienceFocus(experience),
    })),
    ...(input.summary ? { summary: input.summary } : {}),
    preferredRoles: input.preferredRoles,
  };
}

function buildExperienceFocus(experience: ResumeExperience): string {
  const signals = uniqueStrings([
    DOMAIN_LABELS[experience.domain ?? "llm_application"],
    ...experience.techStack.slice(0, 4),
    ...experience.highlights.flatMap((highlight) =>
      findMatchedKeywords(
        highlight,
        DOMAIN_ORDER.flatMap((domain) => DOMAIN_SIGNAL_TERMS[domain]),
      ).slice(0, 3),
    ),
  ]).slice(0, 6);

  return signals.length > 0 ? signals.join("、") : "工作职责与项目交付";
}

function buildAiTechStack(skills: ResumeSkill[]): ParsedAiTechStack {
  const languages: string[] = [];
  const frameworks: string[] = [];
  const tools: string[] = [];
  const domains: string[] = [];
  const infrastructure: string[] = [];
  const evaluation: string[] = [];

  for (const skill of skills) {
    switch (skill.category) {
      case "language":
        languages.push(skill.name);
        break;
      case "framework":
        frameworks.push(skill.name);
        break;
      case "domain":
        domains.push(skill.name);
        break;
      case "infrastructure":
        infrastructure.push(skill.name);
        break;
      case "evaluation":
        evaluation.push(skill.name);
        break;
      default:
        tools.push(skill.name);
    }
  }

  return {
    languages: uniqueStrings(languages),
    frameworks: uniqueStrings(frameworks),
    tools: uniqueStrings(tools),
    domains: uniqueStrings(domains),
    infrastructure: uniqueStrings(infrastructure),
    evaluation: uniqueStrings(evaluation),
    all: skills.map((skill) => skill.name),
  };
}

function getSectionLines(lines: string[], headings: string[]): string[] {
  const start = lines.findIndex((line) =>
    headings.some((heading) => cleanLine(line) === heading),
  );

  if (start < 0) {
    return [];
  }

  const end = lines.findIndex(
    (line, index) => index > start && HEADING_PATTERN.test(cleanLine(line)),
  );

  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function extractLabeledValue(
  lines: string[],
  labels: string[],
): string | undefined {
  const labelPattern = labels.map(escapeRegex).join("|");
  const pattern = new RegExp(`^\\s*(?:${labelPattern})\\s*[:：]\\s*(.+)$`, "i");

  for (const line of lines) {
    const value = cleanShortValue(line.match(pattern)?.[1]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function extractSkillNamesFromText(text: string): string[] {
  return matchSkillTerms(text)
    .map((match) => match.term.name)
    .slice(0, 80);
}

function extractEvidenceLines(text: string, aliases: string[]): string[] {
  const evidence: string[] = [];

  for (const line of splitLines(text)) {
    if (findFirstAliasIndex(line, aliases) < 0) {
      continue;
    }

    evidence.push(shorten(cleanLine(line), 230));

    if (evidence.length >= 3) {
      break;
    }
  }

  return uniqueStrings(evidence);
}

function findMatchedKeywords(text: string, keywords: readonly string[]): string[] {
  const matches = keywords
    .map((keyword) => ({
      keyword,
      index: findFirstAliasIndex(text, [keyword]),
    }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);

  return uniqueStrings(matches.map((match) => match.keyword));
}

function findFirstAliasIndex(text: string, aliases: string[]): number {
  const indexes = aliases
    .map((alias) => findAliasIndex(text, alias))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function findAliasIndex(text: string, alias: string): number {
  const pattern = buildAliasPattern(alias);
  const match = pattern.exec(text);

  if (!match) {
    return -1;
  }

  return match.index + (match[1]?.length ?? 0);
}

function countAliasOccurrences(text: string, aliases: string[]): number {
  const matchedRanges: Array<{ start: number; end: number }> = [];

  for (const alias of aliases) {
    const pattern = buildAliasPattern(alias, true);
    let match = pattern.exec(text);

    while (match) {
      const start = match.index + (match[1]?.length ?? 0);
      const end = start + alias.length;

      if (
        !matchedRanges.some(
          (range) => start < range.end && end > range.start,
        )
      ) {
        matchedRanges.push({ start, end });
      }

      match = pattern.exec(text);
    }
  }

  return matchedRanges.length;
}

function buildAliasPattern(alias: string, global = false): RegExp {
  const escapedAlias = escapeRegex(alias);
  const flags = global ? "gi" : "i";

  if (/^[A-Za-z0-9.+#-]+$/.test(alias)) {
    return new RegExp(`(^|[^A-Za-z0-9.+#-])(${escapedAlias})(?=$|[^A-Za-z0-9.+#-])`, flags);
  }

  return new RegExp(`()${escapedAlias}`, flags);
}

function firstIndexOfSkill(text: string, skillName: string): number {
  const index = findFirstAliasIndex(text, [skillName]);

  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function inferSkillCategory(name: string): ResumeSkillCategory {
  const knownTerm = SKILL_TERMS.find(
    (skillTerm) => normalizeKey(skillTerm.name) === normalizeKey(name),
  );

  if (knownTerm) {
    return knownTerm.category;
  }

  if (/(Python|TypeScript|JavaScript|Java|Go|Shell|SQL|C\+\+|Rust)/i.test(name)) {
    return "language";
  }

  if (/(LangChain|LlamaIndex|PyTorch|TensorFlow|FastAPI|Next\.js|Node\.js|React|Transformers)/i.test(name)) {
    return "framework";
  }

  if (/(Milvus|pgvector|Kubernetes|Docker|Helm|Redis|PostgreSQL|vLLM|Triton|TensorRT|ONNX|CUDA|GPU|Ray|MLflow|MLOps)/i.test(name)) {
    return "infrastructure";
  }

  if (/(RAGAS|LangSmith|LangFuse|DeepEval|Phoenix|Prometheus|Grafana|OpenTelemetry|评测|观测)/i.test(name)) {
    return "evaluation";
  }

  if (/(RAG|Agent|Prompt|Function Calling|Embedding|rerank|KV Cache|SFT|RLHF|DPO|LoRA|量化|安全|红队|越狱)/i.test(name)) {
    return "domain";
  }

  if (/(API|CRM|Locust|DCGM|Dataset)/i.test(name)) {
    return "tool";
  }

  return "other";
}

function term(
  name: string,
  category: ResumeSkillCategory,
  aliases: string[] = [],
  domains?: Partial<Record<AiEcosystemDomain, number>>,
): SkillTerm {
  return {
    name,
    category,
    aliases: uniqueStrings([name, ...aliases]),
    ...(domains ? { domains } : {}),
  };
}

function buildWhitelistSkillTerms(): SkillTerm[] {
  return (Object.entries(TRUE_AI_TECH_STACK_WHITELIST) as Array<
    [
      AiEcosystemDomain,
      {
        keywords: readonly string[];
      },
    ]
  >).flatMap(([domain, config]) =>
    config.keywords.map((keyword) =>
      term(keyword, inferWhitelistCategory(keyword, domain), [], {
        [domain]: 0.75,
      }),
    ),
  );
}

function inferWhitelistCategory(
  keyword: string,
  domain: AiEcosystemDomain,
): ResumeSkillCategory {
  if (domain === "ai_infra") {
    return "infrastructure";
  }

  if (domain === "ai_safety") {
    return /Evaluation|评测/i.test(keyword) ? "evaluation" : "domain";
  }

  if (domain === "algorithm_research") {
    return /(PyTorch|TensorFlow|JAX|Transformers|Diffusers)/i.test(keyword)
      ? "framework"
      : "domain";
  }

  if (domain === "llm_application") {
    return /(Milvus|Pinecone|Chroma|Weaviate|Qdrant|pgvector)/i.test(keyword)
      ? "infrastructure"
      : /(RAGAS|DeepEval|LangSmith|LangFuse|Phoenix)/i.test(keyword)
        ? "evaluation"
        : "domain";
  }

  return "domain";
}

function mergeSkillTerms(skillTerms: SkillTerm[]): SkillTerm[] {
  const mergedTerms = new Map<string, SkillTerm>();

  for (const skillTerm of skillTerms) {
    const key = normalizeKey(skillTerm.name);
    const existingTerm = mergedTerms.get(key);

    if (!existingTerm) {
      mergedTerms.set(key, skillTerm);
      continue;
    }

    mergedTerms.set(key, {
      ...existingTerm,
      aliases: uniqueStrings([...existingTerm.aliases, ...skillTerm.aliases]),
      domains: mergeDomainWeights(existingTerm.domains, skillTerm.domains),
    });
  }

  return [...mergedTerms.values()];
}

function mergeDomainWeights(
  left: Partial<Record<AiEcosystemDomain, number>> | undefined,
  right: Partial<Record<AiEcosystemDomain, number>> | undefined,
): Partial<Record<AiEcosystemDomain, number>> | undefined {
  if (!left && !right) {
    return undefined;
  }

  const merged = emptyPartialDomainScores();

  for (const domain of DOMAIN_ORDER) {
    const weight = Math.max(left?.[domain] ?? 0, right?.[domain] ?? 0);

    if (weight > 0) {
      merged[domain] = weight;
    }
  }

  return merged;
}

function splitLines(text: string): string[] {
  return normalizeLineEndings(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function cleanLine(line: string): string {
  return line
    .replace(/^[\s*-•·]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanShortValue(
  value: string | undefined,
  maxLength = 240,
): string | undefined {
  const normalized = value
    ?.replace(/^[\s:：,，。；;|-]+/, "")
    .replace(/[\s,，。；;]+$/, "")
    .trim();

  if (!normalized) {
    return undefined;
  }

  return shorten(normalized, maxLength);
}

function shorten(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function isBulletLine(line: string): boolean {
  return /^\s*[-•·]/.test(line);
}

function splitBarValue(value: string): string[] {
  return value
    .split(/[｜|]/)
    .map((part) => cleanShortValue(part))
    .filter((part): part is string => Boolean(part));
}

function splitListValue(value: string): string[] {
  return value
    .split(/[,，、;；/]/)
    .map((part) => cleanShortValue(part))
    .filter((part): part is string => Boolean(part));
}

function sanitizeTextList(
  values: Array<string | undefined>,
  fallback: string,
  limit = 30,
): string[] {
  const list = uniqueStrings(values)
    .map((value) => shorten(value, 230))
    .filter((value) => value.length > 0)
    .slice(0, limit);

  return list.length > 0 ? list : [fallback];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = cleanShortValue(value);

    if (!normalized) {
      continue;
    }

    const key = normalizeKey(normalized);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function toLabelVector(
  vector: AiEcosystemVector,
): Record<AiEcosystemLabel, number> {
  return {
    LLM应用层: vector.llm_application,
    "AI Infra": vector.ai_infra,
    算法研究: vector.algorithm_research,
    具身智能: vector.embodied_ai,
    AI安全: vector.ai_safety,
  };
}

function projectToText(project: ResumeProject): string {
  return [
    project.name,
    project.role,
    project.summary,
    project.impact,
    project.techStack.join(" "),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function experienceToText(experience: ResumeExperience): string {
  return [
    experience.company,
    experience.role,
    experience.period,
    experience.techStack.join(" "),
    experience.highlights.join(" "),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function hasContactValue(contact: ResumeContact): boolean {
  return Boolean(contact.email || contact.phone || contact.website || contact.location);
}

function emptyDomainScores(): Record<AiEcosystemDomain, number> {
  return {
    llm_application: 0,
    ai_infra: 0,
    algorithm_research: 0,
    embodied_ai: 0,
    ai_safety: 0,
  };
}

function emptyPartialDomainScores(): Partial<Record<AiEcosystemDomain, number>> {
  return {};
}

function emptyDomainMatches(): Record<AiEcosystemDomain, string[]> {
  return {
    llm_application: [],
    ai_infra: [],
    algorithm_research: [],
    embodied_ai: [],
    ai_safety: [],
  };
}

function pickPrimaryDomain(
  scores: Record<AiEcosystemDomain, number>,
): AiEcosystemDomain {
  return DOMAIN_ORDER.slice().sort((leftDomain, rightDomain) => {
    const scoreDiff = scores[rightDomain] - scores[leftDomain];

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return DOMAIN_ORDER.indexOf(leftDomain) - DOMAIN_ORDER.indexOf(rightDomain);
  })[0];
}

function domainSignalEntries(): Array<[AiEcosystemDomain, string[]]> {
  return DOMAIN_ORDER.map((domain) => [domain, DOMAIN_SIGNAL_TERMS[domain]]);
}

function domainWeightEntries(
  weights: Partial<Record<AiEcosystemDomain, number>>,
): Array<[AiEcosystemDomain, number]> {
  return DOMAIN_ORDER.map(
    (domain): [AiEcosystemDomain, number] => [domain, weights[domain] ?? 0],
  ).filter((entry) => entry[1] > 0);
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
