import { TRUE_AI_TECH_STACK_WHITELIST } from "./risk-rules";
import type {
  AiEcosystemDomain,
  AiEcosystemProfile,
  AiEcosystemVector,
  EvaluationReport,
  JobExtract,
  ResumeExperience,
  ResumeMatchLevel,
  ResumeMatchResult,
  ResumeMatchedSkill,
  ResumeProfile,
  ResumeProject,
  ResumeSkill,
  ResumeSkillCategory,
  ResumeSkillLevel,
  SkillGap,
} from "./types";

type JobMatchInput = EvaluationReport | JobExtract | string;

type SkillDefinition = {
  name: string;
  category: ResumeSkillCategory;
  aliases: string[];
  domains?: Partial<Record<AiEcosystemDomain, number>>;
  satisfiedBy?: string[];
  longTermByDefault?: boolean;
};

type RequiredSkill = SkillDefinition & {
  evidence?: string;
  weight: number;
};

type JobMatchProfile = {
  job: JobExtract;
  text: string;
  ecosystem: AiEcosystemProfile;
  requiredSkills: RequiredSkill[];
};

type ResumeSkillEvidence = {
  skill: string;
  category?: ResumeSkillCategory;
  level?: ResumeSkillLevel;
  evidence: string;
};

type CoverageItem = {
  requiredSkill: RequiredSkill;
  matchedEvidence?: ResumeSkillEvidence;
};

type DirectionScore = {
  score: number;
  resumePrimaryDomain: AiEcosystemDomain;
  jobPrimaryDomain: AiEcosystemDomain;
  targetReadiness: number;
};

const DOMAIN_ORDER: AiEcosystemDomain[] = [
  "llm_application",
  "ai_infra",
  "algorithm_research",
  "embodied_ai",
  "ai_safety",
];

const DOMAIN_LABELS: Record<AiEcosystemDomain, string> = {
  llm_application: "LLM应用层",
  ai_infra: "AI Infra",
  algorithm_research: "算法研究",
  embodied_ai: "具身智能",
  ai_safety: "AI安全",
};

const DOMAIN_LABEL_PATTERNS: Array<[AiEcosystemDomain, RegExp]> = [
  ["llm_application", /(LLM\s?应用|大模型应用|RAG|Agent|知识库|智能客服)/i],
  ["ai_infra", /(AI\s?Infra|推理平台|模型服务|MLOps|GPU\s?集群|serving)/i],
  ["algorithm_research", /(算法研究|算法工程|模型训练|微调|SFT|RLHF|DPO|论文)/i],
  ["embodied_ai", /(具身智能|机器人|机械臂|仿真|SLAM|导航|轨迹规划)/i],
  ["ai_safety", /(AI\s?安全|大模型安全|安全评测|红队|越狱|Prompt Injection)/i],
];

const DOMAIN_SIGNAL_TERMS: Record<AiEcosystemDomain, string[]> = {
  llm_application: [
    "企业知识库",
    "知识库问答",
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
    "业务 Agent",
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
    "路由",
    "成本看板",
    "服务治理",
    "资源调度",
    "吞吐",
    "P95",
    "P99",
    "首 token 延迟",
  ],
  algorithm_research: [
    "模型训练",
    "微调",
    "偏好数据",
    "数据配比",
    "消融分析",
    "消融实验",
    "论文复现",
    "真实训练",
    "NLP",
    "评测集",
  ],
  embodied_ai: [
    "具身智能",
    "机器人",
    "机械臂",
    "仿真",
    "导航",
    "机器人感知",
    "Sim2Real",
    "视觉导航",
  ],
  ai_safety: [
    "安全评测",
    "红队评测",
    "越狱攻击",
    "敏感信息泄露",
    "工具调用滥用",
    "风险样本库",
    "拒答",
    "事实一致性",
    "引用准确性",
  ],
};

const GENERAL_SKILLS = [
  skill("Python", "language", [], { algorithm_research: 0.3 }),
  skill("TypeScript", "language", ["TS"]),
  skill("JavaScript", "language", ["JS"]),
  skill("Go", "language", ["Golang"]),
  skill("Shell", "language", ["Bash"]),
  skill("SQL", "language"),
  skill("Java", "language"),
  skill("C++", "language"),
  skill("Rust", "language"),
  skill("FastAPI", "framework"),
  skill("Next.js", "framework", ["NextJS"]),
  skill("Node.js", "framework", ["NodeJS"]),
  skill("React", "framework"),
  skill("Redis", "infrastructure"),
  skill("PostgreSQL", "infrastructure", ["Postgres"]),
  skill("MySQL", "infrastructure"),
  skill("Elasticsearch", "infrastructure", [], { llm_application: 0.35 }),
  skill("Docker", "infrastructure", [], { ai_infra: 0.65 }),
  skill("Helm", "infrastructure", [], { ai_infra: 0.55 }),
  skill("Linux", "infrastructure", [], { ai_infra: 0.35 }),
  skill("OpenTelemetry", "evaluation", [], {
    llm_application: 0.25,
    ai_infra: 0.35,
  }),
  skill("A/B Experiment", "evaluation", ["A/B", "A/B 实验", "AB 实验"], {
    llm_application: 0.35,
  }),
  skill("Evaluation Dataset", "evaluation", ["评测集", "问答评测集"], {
    algorithm_research: 0.45,
    ai_safety: 0.55,
    llm_application: 0.35,
  }),
];

const AI_SKILLS = [
  skill("LangChain", "framework", [], { llm_application: 1.35 }),
  skill("LlamaIndex", "framework", [], { llm_application: 1.25 }),
  skill("Semantic Kernel", "framework", [], { llm_application: 1 }),
  skill("CrewAI", "framework", [], { llm_application: 0.9 }),
  skill("AutoGen", "framework", [], { llm_application: 0.9 }),
  skill("RAG", "domain", ["检索增强"], { llm_application: 1.45 }),
  skill("Agent", "domain", ["智能体", "业务 Agent"], { llm_application: 1.35 }),
  skill("Function Calling", "domain", ["函数调用", "Tool Calling", "工具调用"], {
    llm_application: 1.2,
  }),
  skill("Prompt Engineering", "domain", ["Prompt", "提示词", "Prompt 模板"], {
    llm_application: 1.05,
  }),
  skill("Embedding", "domain", ["向量化"], { llm_application: 0.75 }),
  skill("rerank", "domain", ["Rerank", "重排"], { llm_application: 0.75 }),
  skill("BM25", "domain", [], { llm_application: 0.55 }),
  skill("OpenAI-compatible API", "tool", ["OpenAI API", "模型 API"], {
    llm_application: 0.7,
    ai_infra: 0.35,
  }),
  skill(
    "Vector Database",
    "infrastructure",
    ["向量数据库", "Vector Database"],
    { llm_application: 0.75, ai_infra: 0.35 },
    ["Milvus", "pgvector", "Pinecone", "Chroma", "Weaviate", "Qdrant"],
  ),
  skill("Milvus", "infrastructure", [], {
    llm_application: 0.75,
    ai_infra: 0.45,
  }),
  skill("pgvector", "infrastructure", [], {
    llm_application: 0.65,
    ai_infra: 0.35,
  }),
  skill("Pinecone", "infrastructure", [], {
    llm_application: 0.65,
    ai_infra: 0.35,
  }),
  skill("Chroma", "infrastructure", [], {
    llm_application: 0.6,
    ai_infra: 0.3,
  }),
  skill("Weaviate", "infrastructure", [], {
    llm_application: 0.6,
    ai_infra: 0.3,
  }),
  skill("Qdrant", "infrastructure", [], {
    llm_application: 0.6,
    ai_infra: 0.3,
  }),
  skill("RAGAS", "evaluation", [], {
    llm_application: 0.75,
    ai_safety: 0.35,
  }),
  skill("LangSmith", "evaluation", [], {
    llm_application: 0.65,
    ai_safety: 0.2,
  }),
  skill("LangFuse", "evaluation", [], {
    llm_application: 0.65,
    ai_safety: 0.2,
  }),
  skill("DeepEval", "evaluation", [], {
    llm_application: 0.55,
    ai_safety: 0.35,
  }),
  skill("Phoenix", "evaluation", [], {
    llm_application: 0.45,
    ai_safety: 0.25,
  }),
  skill(
    "Model Evaluation",
    "evaluation",
    ["模型评测", "自动化评测", "评测指标", "RAG 质量评测"],
    { llm_application: 0.55, algorithm_research: 0.45, ai_safety: 0.45 },
    ["RAGAS", "LangSmith", "LangFuse", "DeepEval", "Phoenix", "Evaluation Dataset"],
  ),
  skill("Kubernetes", "infrastructure", ["K8s", "Kubernetes GPU"], {
    ai_infra: 1.25,
  }),
  skill("NVIDIA GPU", "infrastructure", ["GPU", "GPU Cluster", "GPU 集群"], {
    ai_infra: 1.1,
  }),
  skill("NVIDIA GPU Operator", "infrastructure", [], { ai_infra: 1.05 }),
  skill("CUDA", "infrastructure", [], { ai_infra: 0.9 }, undefined, true),
  skill("vLLM", "infrastructure", [], { ai_infra: 1.35 }),
  skill("TGI", "infrastructure", [], { ai_infra: 1 }),
  skill("Triton Inference Server", "infrastructure", ["Triton"], {
    ai_infra: 1.25,
  }),
  skill("TensorRT-LLM", "infrastructure", ["TensorRT"], { ai_infra: 1.2 }),
  skill("ONNX Runtime", "infrastructure", ["ONNX"], { ai_infra: 0.95 }),
  skill("Ray", "infrastructure", [], {
    ai_infra: 0.75,
    algorithm_research: 0.35,
  }),
  skill("MLflow", "infrastructure", [], { ai_infra: 1 }),
  skill("Kubeflow", "infrastructure", [], { ai_infra: 0.9 }),
  skill("Prometheus", "evaluation", [], { ai_infra: 0.55 }),
  skill("Grafana", "evaluation", [], { ai_infra: 0.55 }),
  skill("MLOps", "domain", [], { ai_infra: 1.15 }),
  skill("KV Cache", "domain", [], { ai_infra: 1.05 }),
  skill("continuous batching", "domain", ["Continuous Batching"], {
    ai_infra: 1.05,
  }),
  skill("模型量化", "domain", ["量化"], {
    ai_infra: 0.8,
    algorithm_research: 0.25,
  }),
  skill("PyTorch", "framework", [], { algorithm_research: 1.25 }),
  skill("TensorFlow", "framework", [], { algorithm_research: 1.1 }),
  skill("JAX", "framework", [], { algorithm_research: 1.05 }),
  skill("Transformers", "framework", ["HuggingFace Transformers"], {
    algorithm_research: 1.1,
  }),
  skill("HuggingFace", "tool", ["Hugging Face"], {
    algorithm_research: 0.9,
  }),
  skill("SFT", "domain", [], { algorithm_research: 1 }, undefined, true),
  skill("LoRA", "domain", [], { algorithm_research: 1.05 }, undefined, true),
  skill("QLoRA", "domain", [], { algorithm_research: 1.05 }, undefined, true),
  skill("RLHF", "domain", [], { algorithm_research: 1.05 }, undefined, true),
  skill("DPO", "domain", [], { algorithm_research: 1.05 }, undefined, true),
  skill("DeepSpeed", "infrastructure", [], { algorithm_research: 0.9 }, undefined, true),
  skill("FSDP", "infrastructure", [], { algorithm_research: 0.85 }, undefined, true),
  skill("tokenizer", "domain", [], { algorithm_research: 0.5 }),
  skill("attention", "domain", [], { algorithm_research: 0.5 }),
  skill("benchmark", "domain", [], { algorithm_research: 0.7 }),
  skill("ROS", "domain", [], { embodied_ai: 1.1 }, undefined, true),
  skill("ROS2", "domain", [], { embodied_ai: 1.1 }, undefined, true),
  skill("Isaac Sim", "tool", [], { embodied_ai: 1 }, undefined, true),
  skill("Gazebo", "tool", [], { embodied_ai: 0.9 }, undefined, true),
  skill("MuJoCo", "tool", [], { embodied_ai: 0.9 }, undefined, true),
  skill("SLAM", "domain", [], { embodied_ai: 0.95 }, undefined, true),
  skill("Motion Planning", "domain", ["Path Planning", "轨迹规划"], {
    embodied_ai: 0.95,
  }),
  skill("Robot Control", "domain", ["机器人控制"], { embodied_ai: 0.95 }),
  skill("Prompt Injection", "domain", [], { ai_safety: 1.1 }, undefined, true),
  skill("Jailbreak", "domain", ["越狱攻击"], { ai_safety: 1.05 }, undefined, true),
  skill("OWASP LLM Top 10", "domain", [], { ai_safety: 1.1 }, undefined, true),
  skill("Red Teaming", "domain", ["红队评测"], { ai_safety: 1.05 }, undefined, true),
  skill("Guardrails", "tool", [], { ai_safety: 0.85 }),
  skill("对抗样本", "domain", [], { ai_safety: 0.9 }, undefined, true),
  skill("模型对齐", "domain", [], { ai_safety: 0.9 }, undefined, true),
  skill("内容安全", "domain", [], { ai_safety: 0.75 }),
  skill("安全评测", "evaluation", [], { ai_safety: 1 }),
];

const SKILL_DEFINITIONS = mergeSkillDefinitions([
  ...GENERAL_SKILLS,
  ...AI_SKILLS,
  ...buildWhitelistSkillDefinitions(),
]);

export function matchResumeToJob(
  resumeProfile: ResumeProfile,
  jobReportOrJdText: JobMatchInput,
): ResumeMatchResult {
  const jobProfile = buildJobMatchProfile(jobReportOrJdText);
  const direction = calculateDirectionMatch(
    resumeProfile,
    jobProfile.ecosystem,
  );
  const coverageItems = jobProfile.requiredSkills.map((requiredSkill) => ({
    requiredSkill,
    matchedEvidence: findResumeSkillEvidence(resumeProfile, requiredSkill),
  }));
  const matchedItems = coverageItems.filter((item) => item.matchedEvidence);
  const missingItems = coverageItems.filter((item) => !item.matchedEvidence);
  const skillCoverage = calculateSkillCoverage(coverageItems);
  const overallMatch = roundToTwo(
    direction.score * 0.6 + skillCoverage * 0.4,
  );
  const matchedSkills = buildMatchedSkills(matchedItems);
  const { quickGaps, longTermGaps } = buildSkillGaps(
    missingItems,
    resumeProfile,
    direction,
  );
  const gaps = [
    ...matchedSkills.map(toMatchedGap),
    ...quickGaps,
    ...longTermGaps,
  ];
  const optimizationSuggestions = buildOptimizationSuggestions({
    matchedSkills,
    quickGaps,
    longTermGaps,
    direction,
    jobProfile,
    resumeProfile,
  });

  return {
    directionMatch: direction.score,
    skillCoverage,
    overallMatch,
    matchLevel: getMatchLevel(overallMatch),
    matchedSkills,
    quickGaps,
    longTermGaps,
    optimizationSuggestions,
    gaps,
    suggestions: optimizationSuggestions,
  };
}

function buildJobMatchProfile(input: JobMatchInput): JobMatchProfile {
  if (typeof input === "string") {
    return buildProfileFromJdText(input);
  }

  const job = isEvaluationReport(input) ? input.job : input;
  const text = normalizeWhitespace(
    [
      job.company,
      job.role,
      job.department,
      job.location,
      job.aiDirection,
      job.experienceLevel,
      job.techStack.join(" "),
      job.keywords.join(" "),
      job.ecosystem?.evidence.join(" "),
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n"),
  );
  const ecosystem = job.ecosystem ?? inferEcosystemProfile(text, job.aiDirection);

  return {
    job: {
      ...job,
      ecosystem,
      aiDirection: job.aiDirection ?? DOMAIN_LABELS[ecosystem.primaryDomain],
    },
    text,
    ecosystem,
    requiredSkills: extractRequiredSkills(text, ecosystem.primaryDomain),
  };
}

function buildProfileFromJdText(jdText: string): JobMatchProfile {
  const text = normalizeWhitespace(jdText);

  if (text.length < 20) {
    throw new Error("JD text must contain at least 20 characters.");
  }

  const ecosystem = inferEcosystemProfile(text);
  const requiredSkills = extractRequiredSkills(text, ecosystem.primaryDomain);
  const job: JobExtract = {
    company:
      extractLabeledValue(jdText, ["公司名称", "公司", "企业", "招聘主体"]) ??
      "未识别公司",
    role:
      extractLabeledValue(jdText, ["职位名称", "岗位名称", "职位", "岗位"]) ??
      extractRoleFromLines(jdText) ??
      "未识别岗位",
    aiDirection: DOMAIN_LABELS[ecosystem.primaryDomain],
    techStack: requiredSkills.map((skillItem) => skillItem.name),
    keywords: uniqueStrings([
      DOMAIN_LABELS[ecosystem.primaryDomain],
      ...requiredSkills.map((skillItem) => skillItem.name),
      ...ecosystem.evidence,
    ]).slice(0, 120),
    ecosystem,
  };

  return {
    job,
    text,
    ecosystem,
    requiredSkills,
  };
}

function calculateDirectionMatch(
  resumeProfile: ResumeProfile,
  jobEcosystem: AiEcosystemProfile,
): DirectionScore {
  const resumeVector = normalizeVector(resumeProfile.ecosystem);
  const jobVector = normalizeVector(jobEcosystem.vector);
  const resumePrimaryDomain =
    resumeProfile.ecosystemProfile?.primaryDomain ?? pickPrimaryDomain(resumeVector);
  const jobPrimaryDomain = jobEcosystem.primaryDomain;
  const targetReadiness = resumeVector[jobPrimaryDomain];
  const cosine = cosineSimilarity(resumeVector, jobVector);
  const primaryAlignment =
    resumePrimaryDomain === jobPrimaryDomain
      ? 1
      : targetReadiness >= 0.45
        ? 0.7
        : targetReadiness >= 0.25
          ? 0.55
          : 0.35;

  return {
    score: roundToTwo(clamp01(cosine * 0.65 + primaryAlignment * 0.35)),
    resumePrimaryDomain,
    jobPrimaryDomain,
    targetReadiness: roundToTwo(targetReadiness),
  };
}

function calculateSkillCoverage(items: CoverageItem[]): number {
  const totalWeight = items.reduce(
    (sum, item) => sum + item.requiredSkill.weight,
    0,
  );

  if (totalWeight === 0) {
    return 0;
  }

  const matchedWeight = items.reduce(
    (sum, item) =>
      item.matchedEvidence ? sum + item.requiredSkill.weight : sum,
    0,
  );

  return roundToTwo(clamp01(matchedWeight / totalWeight));
}

function buildMatchedSkills(items: CoverageItem[]): ResumeMatchedSkill[] {
  const matchedSkills: ResumeMatchedSkill[] = [];

  for (const item of items) {
    const evidence = item.matchedEvidence;

    if (!evidence) {
      continue;
    }

    matchedSkills.push({
      skill: item.requiredSkill.name,
      category: evidence.category ?? item.requiredSkill.category,
      level: evidence.level,
      resumeEvidence: evidence.evidence,
      jdEvidence: item.requiredSkill.evidence,
    });
  }

  return matchedSkills.slice(0, 40);
}

function buildSkillGaps(
  items: CoverageItem[],
  resumeProfile: ResumeProfile,
  direction: DirectionScore,
): { quickGaps: SkillGap[]; longTermGaps: SkillGap[] } {
  const quickGaps: SkillGap[] = [];
  const longTermGaps: SkillGap[] = [];
  const resumeText = buildResumeSearchText(resumeProfile);

  for (const item of items) {
    const priority = classifyGap(
      item.requiredSkill,
      resumeText,
      direction,
    );
    const gap: SkillGap = {
      skill: item.requiredSkill.name,
      priority,
      evidence:
        item.requiredSkill.evidence ??
        `JD 明确要求 ${item.requiredSkill.name}`,
      suggestion: buildGapSuggestion(
        item.requiredSkill,
        direction.jobPrimaryDomain,
        direction.resumePrimaryDomain,
      ),
    };

    if (priority === "quick_fix") {
      quickGaps.push(gap);
    } else {
      longTermGaps.push(gap);
    }
  }

  return {
    quickGaps: quickGaps.slice(0, 12),
    longTermGaps: longTermGaps.slice(0, 12),
  };
}

function classifyGap(
  skillItem: RequiredSkill,
  resumeText: string,
  direction: DirectionScore,
): "quick_fix" | "long_term" {
  const isPrimaryDomainSkill = Boolean(skillItem.domains?.[direction.jobPrimaryDomain]);
  const hasRelatedSkill = hasAnyRelatedSkill(skillItem, resumeText);

  if (skillItem.longTermByDefault && direction.targetReadiness < 0.45) {
    return "long_term";
  }

  if (
    direction.resumePrimaryDomain !== direction.jobPrimaryDomain &&
    isPrimaryDomainSkill &&
    direction.targetReadiness < 0.35 &&
    !hasRelatedSkill
  ) {
    return "long_term";
  }

  if (skillItem.category === "language" || skillItem.category === "tool") {
    return "quick_fix";
  }

  if (hasRelatedSkill || direction.targetReadiness >= 0.45) {
    return "quick_fix";
  }

  return isPrimaryDomainSkill ? "long_term" : "quick_fix";
}

function hasAnyRelatedSkill(skillItem: RequiredSkill, resumeText: string): boolean {
  const relatedNames = [
    ...(skillItem.satisfiedBy ?? []),
    ...SKILL_DEFINITIONS.filter((definition) =>
      sharesDomain(definition, skillItem),
    ).map((definition) => definition.name),
  ];

  return relatedNames.some((name) => {
    const definition = findSkillDefinition(name);

    return definition
      ? findFirstAliasIndex(resumeText, definition.aliases) >= 0
      : findFirstAliasIndex(resumeText, [name]) >= 0;
  });
}

function buildOptimizationSuggestions(input: {
  matchedSkills: ResumeMatchedSkill[];
  quickGaps: SkillGap[];
  longTermGaps: SkillGap[];
  direction: DirectionScore;
  jobProfile: JobMatchProfile;
  resumeProfile: ResumeProfile;
}): string[] {
  const suggestions: string[] = [];
  const resumeLabel = DOMAIN_LABELS[input.direction.resumePrimaryDomain];
  const jobLabel = DOMAIN_LABELS[input.direction.jobPrimaryDomain];
  const topMatched = input.matchedSkills.slice(0, 4).map((item) => item.skill);
  const topMissing = [...input.quickGaps, ...input.longTermGaps]
    .slice(0, 4)
    .map((gap) => gap.skill);

  if (input.direction.resumePrimaryDomain !== input.direction.jobPrimaryDomain) {
    suggestions.push(
      `简历开头的目标方向要从「${resumeLabel}」改成面向「${jobLabel}」的版本：保留 ${topMatched.join("、") || "可迁移工程能力"}，新增 ${topMissing.join("、") || "目标方向项目证据"} 对应的项目条目，避免让 JD 认为主线方向不一致。`,
    );
  }

  if (topMatched.length > 0) {
    suggestions.push(
      `把已匹配的 ${topMatched.join("、")} 前移到核心技能和最相关项目的技术栈中，并在项目描述里补充你负责的模块、上线场景和一个可验证指标。`,
    );
  }

  for (const gap of input.quickGaps.slice(0, 2)) {
    if (gap.suggestion) {
      suggestions.push(gap.suggestion);
    }
  }

  for (const gap of input.longTermGaps.slice(0, 2)) {
    if (gap.suggestion) {
      suggestions.push(gap.suggestion);
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(
      `这份简历与「${input.jobProfile.job.role}」已经较匹配，建议只做 JD 定制版：项目标题、技术栈顺序和量化指标优先围绕 ${input.jobProfile.requiredSkills
        .slice(0, 5)
        .map((skillItem) => skillItem.name)
        .join("、")} 展开。`,
    );
  }

  return sanitizeTextList(suggestions, "围绕 JD 要求重排项目、技能和量化指标。", 5);
}

function buildGapSuggestion(
  skillItem: RequiredSkill,
  jobDomain: AiEcosystemDomain,
  resumeDomain: AiEcosystemDomain,
): string {
  const skillName = skillItem.name;

  if (/^(RAG|Vector Database|Milvus|pgvector|Pinecone|Chroma|Weaviate|Qdrant)$/i.test(skillName)) {
    return `新增或改写一个知识库/RAG 项目：写清文档解析、切分策略、${skillName} 的索引或过滤方案、Top-K 召回率、响应延迟和答案引用效果。`;
  }

  if (/^(Agent|Function Calling|LangChain|LlamaIndex|CrewAI|AutoGen)$/i.test(skillName)) {
    return `在项目经历中补充 ${skillName} 的工具调用案例：列出接入的业务 API、任务规划、失败重试、人工确认节点和工具调用成功率。`;
  }

  if (/^(RAGAS|LangSmith|LangFuse|DeepEval|Phoenix|Model Evaluation)$/i.test(skillName)) {
    return `把现有项目增加评测闭环段落：说明使用 ${skillName} 评估召回率、事实一致性、幻觉率或引用准确性，并写出上线前拦截的问题数量。`;
  }

  if (/^(vLLM|TGI|Triton Inference Server|TensorRT-LLM|ONNX Runtime|CUDA|NVIDIA GPU|Kubernetes|KV Cache|continuous batching|模型量化)$/i.test(skillName)) {
    return `补充模型 serving 或推理优化项目：写明 ${skillName} 的部署位置、压测场景、吞吐/P95 延迟/GPU 利用率变化和灰度回滚流程。`;
  }

  if (/^(PyTorch|Transformers|HuggingFace|SFT|LoRA|QLoRA|RLHF|DPO|DeepSpeed|FSDP|benchmark)$/i.test(skillName)) {
    return `新增微调或训练实验条目：说明 ${skillName} 用在数据清洗、训练配置、评测集、消融实验或 benchmark 中，并给出样本规模和指标变化。`;
  }

  if (/^(Prompt Injection|Jailbreak|OWASP LLM Top 10|Red Teaming|对抗样本|模型对齐|安全评测)$/i.test(skillName)) {
    return `增加 AI 安全评测案例：围绕 ${skillName} 写出测试用例设计、风险样本库、修复建议和复测结果，不要只写“了解安全”。`;
  }

  if (jobDomain !== resumeDomain) {
    return `为 ${DOMAIN_LABELS[jobDomain]} 单独准备一版简历，在最相关项目中补充 ${skillName} 的实际使用场景、职责边界和量化结果，弱化与该 JD 无关的 ${DOMAIN_LABELS[resumeDomain]} 细节。`;
  }

  return `将 ${skillName} 补进最相关项目而不是只放技能清单：写清使用模块、输入输出、你负责的部分和一个业务或工程指标。`;
}

function toMatchedGap(skillItem: ResumeMatchedSkill): SkillGap {
  return {
    skill: skillItem.skill,
    priority: "matched",
    evidence: skillItem.resumeEvidence,
    suggestion: skillItem.jdEvidence
      ? `已覆盖 JD 证据：${skillItem.jdEvidence}`
      : undefined,
  };
}

function extractRequiredSkills(
  text: string,
  jobPrimaryDomain: AiEcosystemDomain,
): RequiredSkill[] {
  const matches = SKILL_DEFINITIONS.map((definition) => ({
    definition,
    index: findFirstAliasIndex(text, definition.aliases),
  }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((match) => ({
      ...match.definition,
      evidence: extractEvidence(text, match.definition.aliases),
      weight: calculateRequiredSkillWeight(match.definition, jobPrimaryDomain),
    }));

  return uniqueRequiredSkills(matches).slice(0, 60);
}

function calculateRequiredSkillWeight(
  skillItem: SkillDefinition,
  jobPrimaryDomain: AiEcosystemDomain,
): number {
  let weight = 1;

  if (skillItem.domains?.[jobPrimaryDomain]) {
    weight += 0.35;
  }

  if (skillItem.category === "language") {
    weight -= 0.15;
  }

  if (skillItem.category === "domain") {
    weight += 0.15;
  }

  if (skillItem.category === "framework" || skillItem.category === "evaluation") {
    weight += 0.1;
  }

  return roundToTwo(Math.min(1.6, Math.max(0.7, weight)));
}

function findResumeSkillEvidence(
  resumeProfile: ResumeProfile,
  requiredSkill: RequiredSkill,
): ResumeSkillEvidence | undefined {
  const direct = findDirectResumeSkillEvidence(resumeProfile, requiredSkill);

  if (direct) {
    return direct;
  }

  for (const equivalentName of requiredSkill.satisfiedBy ?? []) {
    const equivalentDefinition = findSkillDefinition(equivalentName);

    if (!equivalentDefinition) {
      continue;
    }

    const evidence = findDirectResumeSkillEvidence(resumeProfile, equivalentDefinition);

    if (evidence) {
      return {
        ...evidence,
        evidence: `${evidence.evidence}（可覆盖 JD 的 ${requiredSkill.name} 要求）`,
      };
    }
  }

  return undefined;
}

function findDirectResumeSkillEvidence(
  resumeProfile: ResumeProfile,
  definition: SkillDefinition,
): ResumeSkillEvidence | undefined {
  for (const resumeSkill of collectResumeSkills(resumeProfile)) {
    if (findFirstAliasIndex(resumeSkill.name, definition.aliases) < 0) {
      continue;
    }

    return {
      skill: resumeSkill.name,
      category: resumeSkill.category,
      level: resumeSkill.level,
      evidence:
        resumeSkill.evidence?.[0] ??
        `技能清单：${resumeSkill.name}${resumeSkill.level ? `（${formatSkillLevel(resumeSkill.level)}）` : ""}`,
    };
  }

  for (const project of resumeProfile.content.projects) {
    const projectText = projectToText(project);

    if (findFirstAliasIndex(projectText, definition.aliases) < 0) {
      continue;
    }

    return {
      skill: definition.name,
      category: definition.category,
      evidence: `项目「${project.name}」：${shorten(projectText, 180)}`,
    };
  }

  for (const experience of resumeProfile.content.experiences) {
    const experienceText = experienceToText(experience);

    if (findFirstAliasIndex(experienceText, definition.aliases) < 0) {
      continue;
    }

    return {
      skill: definition.name,
      category: definition.category,
      evidence: `经历「${experience.role}」：${shorten(experienceText, 180)}`,
    };
  }

  const rawEvidence = extractEvidence(
    resumeProfile.content.rawText ?? buildResumeSearchText(resumeProfile),
    definition.aliases,
  );

  return rawEvidence
    ? {
        skill: definition.name,
        category: definition.category,
        evidence: rawEvidence,
      }
    : undefined;
}

function inferEcosystemProfile(
  text: string,
  explicitDirection?: string,
): AiEcosystemProfile {
  const scores = emptyDomainScores();
  const evidenceByDomain = emptyDomainMatches();
  const explicitDomain = explicitDirection
    ? inferDomainFromLabel(explicitDirection)
    : undefined;

  if (explicitDomain) {
    scores[explicitDomain] += 4;
    evidenceByDomain[explicitDomain].push(`岗位方向：${DOMAIN_LABELS[explicitDomain]}`);
  }

  for (const [domain, config] of whitelistEntries()) {
    const matches = findMatchedKeywords(text, [...config.keywords]);

    scores[domain] += matches.length * 1.8;
    evidenceByDomain[domain].push(...matches);
  }

  for (const domain of DOMAIN_ORDER) {
    const matches = findMatchedKeywords(text, DOMAIN_SIGNAL_TERMS[domain]);

    scores[domain] += matches.length;
    evidenceByDomain[domain].push(...matches);
  }

  for (const definition of SKILL_DEFINITIONS) {
    if (findFirstAliasIndex(text, definition.aliases) < 0 || !definition.domains) {
      continue;
    }

    for (const domain of DOMAIN_ORDER) {
      const weight = definition.domains[domain] ?? 0;

      if (weight <= 0) {
        continue;
      }

      scores[domain] += weight;
      evidenceByDomain[domain].push(definition.name);
    }
  }

  if (
    scores.llm_application === 0 &&
    /(AI|人工智能|大模型|LLM|AIGC|ChatGPT|DeepSeek|Qwen|Llama)/i.test(text)
  ) {
    scores.llm_application = 1;
    evidenceByDomain.llm_application.push("大模型弱信号");
  }

  const primaryDomain = pickPrimaryDomain(scores);
  const vector = normalizeRawScores(scores);
  const primaryEvidence = evidenceByDomain[primaryDomain];
  const evidence = sanitizeTextList(
    [
      `${DOMAIN_LABELS[primaryDomain]}：${uniqueStrings(primaryEvidence)
        .slice(0, 8)
        .join("、")}`,
      ...DOMAIN_ORDER.filter((domain) => domain !== primaryDomain)
        .filter((domain) => vector[domain] >= 0.15)
        .map(
          (domain) =>
            `${DOMAIN_LABELS[domain]}：${uniqueStrings(evidenceByDomain[domain])
              .slice(0, 5)
              .join("、")}`,
        ),
    ],
    `${DOMAIN_LABELS[primaryDomain]}证据不足，按弱信号处理`,
    12,
  );

  return {
    primaryDomain,
    vector,
    evidence,
  };
}

function buildResumeSearchText(resumeProfile: ResumeProfile): string {
  const content = resumeProfile.content;

  return normalizeWhitespace(
    [
      content.name,
      content.currentRole,
      content.summary,
      content.rawText,
      ...collectResumeSkills(resumeProfile).map((resumeSkill) =>
        [
          resumeSkill.name,
          resumeSkill.category,
          resumeSkill.level,
          resumeSkill.evidence?.join(" "),
        ].join(" "),
      ),
      ...content.projects.map(projectToText),
      ...content.experiences.map(experienceToText),
      ...content.education.map((education) =>
        [education.school, education.major, education.degree].join(" "),
      ),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function collectResumeSkills(resumeProfile: ResumeProfile): ResumeSkill[] {
  const skills = [...resumeProfile.skills, ...resumeProfile.content.skills];
  const seen = new Set<string>();
  const output: ResumeSkill[] = [];

  for (const resumeSkill of skills) {
    const key = normalizeKey(resumeSkill.name);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(resumeSkill);
  }

  return output;
}

function buildWhitelistSkillDefinitions(): SkillDefinition[] {
  return whitelistEntries().flatMap(([domain, config]) =>
    config.keywords.map((keyword) =>
      skill(keyword, inferCategoryForWhitelist(keyword, domain), [], {
        [domain]: 0.75,
      }),
    ),
  );
}

function inferCategoryForWhitelist(
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
    return /(Milvus|Pinecone|Chroma|Weaviate|Qdrant|pgvector|Database|数据库)/i.test(
      keyword,
    )
      ? "infrastructure"
      : /(RAGAS|DeepEval|LangSmith|LangFuse|Phoenix|Evaluation|评测)/i.test(keyword)
        ? "evaluation"
        : "domain";
  }

  return "domain";
}

function mergeSkillDefinitions(
  definitions: SkillDefinition[],
): SkillDefinition[] {
  const merged: SkillDefinition[] = [];

  for (const definition of definitions) {
    const existingIndex = merged.findIndex((item) =>
      hasAliasOverlap(item, definition),
    );

    if (existingIndex < 0) {
      merged.push({
        ...definition,
        aliases: uniqueStrings([definition.name, ...definition.aliases]),
      });
      continue;
    }

    const existing = merged[existingIndex];

    merged[existingIndex] = {
      ...existing,
      aliases: uniqueStrings([...existing.aliases, definition.name, ...definition.aliases]),
      domains: mergeDomainWeights(existing.domains, definition.domains),
      satisfiedBy: uniqueStrings([
        ...(existing.satisfiedBy ?? []),
        ...(definition.satisfiedBy ?? []),
      ]),
      longTermByDefault:
        existing.longTermByDefault || definition.longTermByDefault || undefined,
    };
  }

  return merged;
}

function hasAliasOverlap(left: SkillDefinition, right: SkillDefinition): boolean {
  const leftKeys = new Set(left.aliases.map(normalizeKey));

  return right.aliases.some((alias) => leftKeys.has(normalizeKey(alias)));
}

function mergeDomainWeights(
  left: Partial<Record<AiEcosystemDomain, number>> | undefined,
  right: Partial<Record<AiEcosystemDomain, number>> | undefined,
): Partial<Record<AiEcosystemDomain, number>> | undefined {
  if (!left && !right) {
    return undefined;
  }

  const merged: Partial<Record<AiEcosystemDomain, number>> = {};

  for (const domain of DOMAIN_ORDER) {
    const weight = Math.max(left?.[domain] ?? 0, right?.[domain] ?? 0);

    if (weight > 0) {
      merged[domain] = weight;
    }
  }

  return merged;
}

function uniqueRequiredSkills(skills: RequiredSkill[]): RequiredSkill[] {
  const seen = new Set<string>();
  const output: RequiredSkill[] = [];

  for (const skillItem of skills) {
    const key = normalizeKey(skillItem.name);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(skillItem);
  }

  return output;
}

function findSkillDefinition(name: string): SkillDefinition | undefined {
  const key = normalizeKey(name);

  return SKILL_DEFINITIONS.find(
    (definition) =>
      normalizeKey(definition.name) === key ||
      definition.aliases.some((alias) => normalizeKey(alias) === key),
  );
}

function sharesDomain(
  left: SkillDefinition,
  right: SkillDefinition,
): boolean {
  if (!left.domains || !right.domains || left.name === right.name) {
    return false;
  }

  return DOMAIN_ORDER.some(
    (domain) => (left.domains?.[domain] ?? 0) > 0 && (right.domains?.[domain] ?? 0) > 0,
  );
}

function skill(
  name: string,
  category: ResumeSkillCategory,
  aliases: string[] = [],
  domains?: Partial<Record<AiEcosystemDomain, number>>,
  satisfiedBy?: string[],
  longTermByDefault?: boolean,
): SkillDefinition {
  return {
    name,
    category,
    aliases: uniqueStrings([name, ...aliases]),
    ...(domains ? { domains } : {}),
    ...(satisfiedBy ? { satisfiedBy } : {}),
    ...(longTermByDefault ? { longTermByDefault } : {}),
  };
}

function isEvaluationReport(input: EvaluationReport | JobExtract): input is EvaluationReport {
  return "job" in input && "score" in input && "sections" in input;
}

function inferDomainFromLabel(label: string): AiEcosystemDomain | undefined {
  for (const [domain, pattern] of DOMAIN_LABEL_PATTERNS) {
    if (pattern.test(label)) {
      return domain;
    }
  }

  return undefined;
}

function normalizeRawScores(
  scores: Record<AiEcosystemDomain, number>,
): AiEcosystemVector {
  const total = DOMAIN_ORDER.reduce((sum, domain) => sum + scores[domain], 0);
  const vector = emptyDomainScores();

  if (total <= 0) {
    vector.llm_application = 1;
    return vector;
  }

  for (const domain of DOMAIN_ORDER) {
    vector[domain] = roundToTwo(scores[domain] / total);
  }

  return vector;
}

function normalizeVector(vector: AiEcosystemVector): AiEcosystemVector {
  const maxValue = Math.max(...DOMAIN_ORDER.map((domain) => vector[domain] ?? 0));
  const scale = maxValue > 1 ? 100 : 1;
  const normalized = emptyDomainScores();

  for (const domain of DOMAIN_ORDER) {
    normalized[domain] = clamp01((vector[domain] ?? 0) / scale);
  }

  return normalized;
}

function cosineSimilarity(
  left: AiEcosystemVector,
  right: AiEcosystemVector,
): number {
  const dot = DOMAIN_ORDER.reduce(
    (sum, domain) => sum + left[domain] * right[domain],
    0,
  );
  const leftNorm = Math.sqrt(
    DOMAIN_ORDER.reduce((sum, domain) => sum + left[domain] ** 2, 0),
  );
  const rightNorm = Math.sqrt(
    DOMAIN_ORDER.reduce((sum, domain) => sum + right[domain] ** 2, 0),
  );

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return clamp01(dot / (leftNorm * rightNorm));
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

function extractLabeledValue(
  text: string,
  labels: string[],
): string | undefined {
  const labelPattern = labels.map(escapeRegex).join("|");
  const pattern = new RegExp(`^\\s*(?:${labelPattern})\\s*[:：]\\s*(.+)$`, "i");

  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    const value = cleanShortValue(line.match(pattern)?.[1]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function extractRoleFromLines(text: string): string | undefined {
  for (const line of text.split(/\r?\n/).slice(0, 12)) {
    const normalized = cleanShortValue(
      line.replace(/^(职位|岗位|招聘)\s*[:：]?\s*/i, ""),
    );

    if (
      normalized &&
      /(工程师|产品经理|研究员|架构师|开发|训练师|评测|平台)/.test(normalized) &&
      !/(岗位职责|任职要求|职位描述|薪资|工作地点|公司)/.test(normalized)
    ) {
      return normalized;
    }
  }

  return undefined;
}

function extractEvidence(text: string, aliases: string[]): string | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (findFirstAliasIndex(line, aliases) >= 0) {
      return shorten(line, 220);
    }
  }

  const alias = aliases.find((value) => findFirstAliasIndex(text, [value]) >= 0);

  return alias ? `JD 要求：${alias}` : undefined;
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

function buildAliasPattern(alias: string): RegExp {
  const escapedAlias = escapeRegex(alias);

  if (/^[A-Za-z0-9.+#-]+$/.test(alias)) {
    return new RegExp(`(^|[^A-Za-z0-9.+#-])(${escapedAlias})(?=$|[^A-Za-z0-9.+#-])`, "i");
  }

  return new RegExp(`()${escapedAlias}`, "i");
}

function projectToText(project: ResumeProject): string {
  return [
    project.name,
    project.role,
    project.summary,
    project.impact,
    DOMAIN_LABELS[project.domain ?? "llm_application"],
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
    DOMAIN_LABELS[experience.domain ?? "llm_application"],
    experience.techStack.join(" "),
    experience.highlights.join(" "),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function formatSkillLevel(level: ResumeSkillLevel): string {
  const labels: Record<ResumeSkillLevel, string> = {
    beginner: "入门",
    proficient: "熟练",
    expert: "精通",
  };

  return labels[level];
}

function getMatchLevel(overallMatch: number): ResumeMatchLevel {
  if (overallMatch >= 0.8) {
    return "高度匹配";
  }

  if (overallMatch >= 0.6) {
    return "中度匹配";
  }

  if (overallMatch >= 0.4) {
    return "低度匹配";
  }

  return "不匹配";
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
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function emptyDomainMatches(): Record<AiEcosystemDomain, string[]> {
  return {
    llm_application: [],
    ai_infra: [],
    algorithm_research: [],
    embodied_ai: [],
    ai_safety: [],
  };
}

function whitelistEntries(): Array<
  [
    AiEcosystemDomain,
    {
      label: string;
      keywords: readonly string[];
    },
  ]
> {
  return Object.entries(TRUE_AI_TECH_STACK_WHITELIST) as Array<
    [
      AiEcosystemDomain,
      {
        label: string;
        keywords: readonly string[];
      },
    ]
  >;
}
