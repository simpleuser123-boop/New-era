import type { AiEcosystemDomain, RiskSeverity } from "./types";

export type LocalRiskRuleSource = "regex" | "dictionary";

export type RiskRuleCategory =
  | "training_loan"
  | "training_company_disguise"
  | "traditional_dev_disguise"
  | "non_ai_positioning"
  | "overpromise"
  | "data_labeling_disguise";

type BaseRiskRule = {
  id: string;
  signal: string;
  severity: RiskSeverity;
  source: LocalRiskRuleSource;
  category: RiskRuleCategory;
  explanation: string;
};

export type RegexRiskRule = BaseRiskRule & {
  source: "regex";
  pattern: RegExp;
  keywords?: never;
};

export type DictionaryRiskRule = BaseRiskRule & {
  source: "dictionary";
  keywords: string[];
  pattern?: never;
};

export type RiskRule = RegexRiskRule | DictionaryRiskRule;

export type TrueAiTechStackDomain = {
  label: string;
  keywords: string[];
};

export const RISK_SEVERITY_WEIGHTS: Record<RiskSeverity, number> = {
  critical: 10,
  high: 4,
  medium: 2,
  low: 1,
};

export const RISK_RULE_VERSION = "2026-06-09.risk-rules.v3-1-step42";

export const RISK_RULE_CHANGELOG = [
  {
    version: RISK_RULE_VERSION,
    date: "2026-06-09",
    summary:
      "Step 42 质量收口：锁定当前真假 AI 岗规则版本，补齐 benchmark、反馈和报告解释的可追溯入口。",
    changes: [
      "报告和风险扫描结果写入规则版本，后续规则调整不会静默覆盖历史判断来源。",
      "benchmark 输出记录同一规则版本，便于比较误报、漏报和严重度不准变化。",
      "用户反馈记录规则版本，作为人工规则迭代输入，不自动训练或自动改规则。",
    ],
  },
] as const;

export const RISK_RULES = [
  {
    id: "training-loan-zero-base-ai",
    signal: "零基础转行 AI",
    severity: "critical",
    source: "regex",
    category: "training_loan",
    pattern:
      /((零基础|无经验|小白).{0,16}(转行|入行|学习|就业|可投|可做).{0,24}(AI|人工智能|大模型|AIGC|算法|智能体))|((AI|人工智能|大模型|AIGC|算法|智能体).{0,24}(接受)?(零基础|无经验|小白).{0,16}(转行|入行|学习|就业|可投|可做))/i,
    explanation:
      "以零基础转行作为招聘卖点，是培训贷和招转培岗位最典型的入口话术。",
  },
  {
    id: "training-loan-train-before-work",
    signal: "先培训后上岗",
    severity: "critical",
    source: "regex",
    category: "training_loan",
    pattern: /(先|需|需要).{0,8}(培训|实训|学习).{0,12}(后|再).{0,8}(上岗|就业|入职)/i,
    explanation:
      "正式招聘通常直接说明试用期和岗位职责，先培训再上岗常指向付费培训或招转培链路。",
  },
  {
    id: "training-loan-fee-from-salary",
    signal: "培训费从工资扣",
    severity: "critical",
    source: "regex",
    category: "training_loan",
    pattern: /(培训费|课程费|学费|服务费).{0,16}(从|由).{0,8}(工资|薪资|薪水).{0,8}(扣|抵扣|代扣)/i,
    explanation:
      "费用从工资扣除意味着求职流程被转化为债务或培训合同，是高危收费信号。",
  },
  {
    id: "training-loan-installment-loan",
    signal: "培训分期或贷款",
    severity: "critical",
    source: "regex",
    category: "training_loan",
    pattern: /(办理|支持|可办|提供).{0,10}(分期|贷款|助学贷|培训贷|学费贷|信用贷)/i,
    explanation:
      "招聘场景出现分期、贷款或助学贷，说明岗位可能以就业承诺包装培训产品。",
  },
  {
    id: "training-loan-guaranteed-offer",
    signal: "包就业或保 offer",
    severity: "critical",
    source: "regex",
    category: "training_loan",
    pattern: /(包就业|保\s?offer|保证.{0,8}(就业|入职|录用)|不过退费|未就业退费)/i,
    explanation:
      "真实雇主通常不会承诺包就业或保 offer，这类承诺常用于转化培训付费。",
  },
  {
    id: "training-loan-upfront-fees",
    signal: "入职前收费",
    severity: "critical",
    source: "dictionary",
    category: "training_loan",
    keywords: ["押金", "材料费", "建档费", "服务费", "设备费", "保证金", "报名费"],
    explanation:
      "求职入职前收取押金、材料费或服务费违反正常招聘逻辑，应优先拦截。",
  },
  {
    id: "training-loan-project-packaging",
    signal: "项目包装或面试包装",
    severity: "high",
    source: "dictionary",
    category: "training_loan",
    keywords: ["项目包装", "简历包装", "面试包装", "面试辅导", "就业老师", "就业班主任"],
    explanation:
      "以包装项目和简历作为岗位内容，说明招聘主体可能在销售培训就业服务。",
  },
  {
    id: "training-loan-unified-placement",
    signal: "统一安排城市和岗位",
    severity: "medium",
    source: "regex",
    category: "training_loan",
    pattern: /(服从|接受).{0,8}(公司|统一).{0,8}(安排|分配).{0,12}(城市|岗位|项目|企业)/i,
    explanation:
      "真实岗位通常有明确工作地点和团队，统一分配常见于培训后外派或合作企业安置。",
  },
  {
    id: "training-company-education-company-ai-role",
    signal: "教育培训公司伪装 AI 招聘",
    severity: "critical",
    source: "regex",
    category: "training_company_disguise",
    pattern:
      /((教育|培训|学院|职校|教育咨询)[\s\S]{0,100}(AI|人工智能|大模型|算法).{0,16}(工程师|开发|实习|储备))|((AI|人工智能|大模型|算法).{0,16}(工程师|开发|实习|储备)[\s\S]{0,120}(教育|培训|学院|职校|教育咨询))/i,
    explanation:
      "公司主体带教育、培训、学院等字样，同时招聘 AI 工程师，需要核实是否为培训公司伪装雇主。",
  },
  {
    id: "training-company-course-heavy-jd",
    signal: "JD 大量课程化描述",
    severity: "high",
    source: "dictionary",
    category: "training_company_disguise",
    keywords: ["AI 大模型课程", "Prompt 实战课", "训练营", "课程作业", "学习周期", "结业", "班主任"],
    explanation:
      "正式岗位职责不应以课程、作业、结业和训练营作为核心工作内容。",
  },
  {
    id: "training-company-mentor-training",
    signal: "导师带教替代岗位职责",
    severity: "high",
    source: "regex",
    category: "training_company_disguise",
    pattern: /(导师|讲师|助教).{0,12}(一对一|带教|辅导|答疑).{0,24}(项目|实训|课程|就业)/i,
    explanation:
      "导师带教本身不是风险，但若替代明确岗位职责，岗位可能实际是培训项目。",
  },
  {
    id: "training-company-low-bar-ai",
    signal: "AI 岗任职门槛异常低",
    severity: "high",
    source: "regex",
    category: "training_company_disguise",
    pattern: /(学历不限|经验不限|无经验可培养|不限专业|小白可学|热爱\s?AI\s?即可)/i,
    explanation:
      "真实 AI 岗通常会列出工程、算法、数据或产品经验要求，过低门槛需要与薪资承诺一起核验。",
  },
  {
    id: "training-company-cooperative-enterprise",
    signal: "合作企业安置而非本公司岗位",
    severity: "medium",
    source: "dictionary",
    category: "training_company_disguise",
    keywords: ["合作企业", "合作单位", "推荐就业", "定向培养", "委培", "企业项目组"],
    explanation:
      "岗位主体从本公司转向合作企业或推荐安置时，需核实真实用工主体和劳动合同主体。",
  },
  {
    id: "traditional-dev-ai-title-java-stack",
    signal: "AI 标题下堆叠 Java Web 技术栈",
    severity: "high",
    source: "regex",
    category: "traditional_dev_disguise",
    pattern: /(AI|人工智能|大模型)[\s\S]{0,400}(Java|Spring\s?Boot|Spring\s?Cloud|MyBatis|Vue|Element\s?UI|JSP)/i,
    explanation:
      "标题写 AI，但正文核心技术栈是传统 Java Web，可能是传统开发岗位重新包装。",
  },
  {
    id: "traditional-dev-crud-business-system",
    signal: "工作内容为传统 CRUD 业务系统",
    severity: "high",
    source: "dictionary",
    category: "traditional_dev_disguise",
    keywords: ["CRUD", "OA", "ERP", "CRM", "后台管理系统", "管理系统", "报表导出", "权限菜单", "流程审批"],
    explanation:
      "职责集中在 OA、ERP、CRM 和后台管理系统时，需要警惕 AI 含量不足。",
  },
  {
    id: "traditional-dev-maintain-existing-system",
    signal: "维护现有业务系统",
    severity: "medium",
    source: "regex",
    category: "traditional_dev_disguise",
    pattern: /(维护|二开|迭代).{0,12}(现有|已有|存量).{0,12}(业务系统|后台系统|管理系统|客户系统)/i,
    explanation:
      "维护存量系统可以是正常职责，但与 AI 标题组合时常见于包装型岗位。",
  },
  {
    id: "traditional-dev-onsite-outsourcing",
    signal: "长期驻场外包交付",
    severity: "medium",
    source: "dictionary",
    category: "traditional_dev_disguise",
    keywords: ["长期驻场", "客户现场", "驻场交付", "外包项目", "验收文档", "项目经理安排"],
    explanation:
      "长期客户现场驻场更接近外包交付模式，需确认 AI 研发职责占比和成长空间。",
  },
  {
    id: "traditional-dev-chatgpt-only",
    signal: "仅以了解 ChatGPT 作为 AI 要求",
    severity: "medium",
    source: "regex",
    category: "traditional_dev_disguise",
    pattern: /(了解|使用过|会用).{0,10}(ChatGPT|AI办公工具|AIGC工具|提示词工具).{0,32}(优先|即可|加分)/i,
    explanation:
      "仅要求会用通用 AI 工具，不能证明岗位涉及模型应用、推理、评测或数据闭环。",
  },
  {
    id: "traditional-dev-missing-ai-stack",
    signal: "声称 AI 岗但缺少可核验 AI 技术栈",
    severity: "high",
    source: "dictionary",
    category: "traditional_dev_disguise",
    keywords: ["AI 工程师", "人工智能工程师", "大模型工程师", "算法工程师"],
    explanation:
      "该规则需结合真 AI 技术栈白名单使用：标题声称 AI，但正文没有模型、向量库、推理服务、评测或训练相关技术时，应判为高风险。",
  },
  {
    id: "overpromise-high-salary-low-bar",
    signal: "低门槛绑定高薪承诺",
    severity: "high",
    source: "regex",
    category: "overpromise",
    pattern: /(无经验|零基础|小白|学历不限|热爱\s?AI)[\s\S]{0,300}(月入|高薪|年薪|3万|三万|40K|50K|上不封顶)/i,
    explanation:
      "低门槛和高薪强绑定，常用于吸引求职者进入培训贷或虚假招聘流程。",
  },
  {
    id: "overpromise-uncapped-salary",
    signal: "薪资上不封顶",
    severity: "medium",
    source: "regex",
    category: "overpromise",
    pattern: /(薪资|工资|收入|待遇).{0,32}(上不封顶|不封顶|无上限|多劳多得)/i,
    explanation:
      "上不封顶类表达缺少薪酬结构细节，常与培训贷或销售化岗位绑定出现。",
  },
  {
    id: "overpromise-fast-career-change",
    signal: "短周期速成高薪 AI",
    severity: "high",
    source: "regex",
    category: "overpromise",
    pattern: /(\d{1,2}|一|二|三|四|3|4|6).{0,4}(周|个月|月).{0,24}(速成|转行|拿高薪|入行|就业).{0,12}(AI|人工智能|大模型|算法)/i,
    explanation:
      "AI 岗能力形成周期较长，短周期速成高薪通常是培训营销话术。",
  },
  {
    id: "overpromise-equity-wealth",
    signal: "期权或财富自由式承诺",
    severity: "medium",
    source: "dictionary",
    category: "overpromise",
    keywords: ["财富自由", "原始股", "上市兑现", "期权暴富", "加入即核心", "未来独角兽"],
    explanation:
      "夸大期权或上市收益但缺少融资、岗位和薪酬细节时，容易掩盖真实薪资与岗位风险。",
  },
  {
    id: "overpromise-famous-company-backdoor",
    signal: "大厂内推或名企保录承诺",
    severity: "high",
    source: "dictionary",
    category: "overpromise",
    keywords: ["大厂内推", "名企保录", "保进大厂", "定向输送", "拿到大厂 offer", "合作名企直招"],
    explanation:
      "以大厂 offer 或名企直招作为确定承诺，常见于培训销售和虚假招聘导流。",
  },
  {
    id: "data-labeling-llm-training-disguise",
    signal: "数据标注伪装大模型训练",
    severity: "high",
    source: "regex",
    category: "data_labeling_disguise",
    pattern: /(参与|负责|支持).{0,16}(大模型|LLM|人工智能|AI).{0,24}(训练|优化|迭代).{0,36}(标注|质检|审核|清洗|人工校对)/i,
    explanation:
      "参与大模型训练若实际任务是标注、审核和清洗，岗位可能被包装为算法或模型训练岗。",
  },
  {
    id: "data-labeling-human-correction-heavy",
    signal: "人工校对和质检占比过高",
    severity: "medium",
    source: "dictionary",
    category: "data_labeling_disguise",
    keywords: ["人工校对", "数据质检", "结果质检", "标注协同", "标注团队", "内容审核", "低质量样本"],
    explanation:
      "数据与评测岗位可以包含质检，但若这些词占据核心职责，需要确认研发深度和权限边界。",
  },
  {
    id: "data-labeling-ai-trainer-typing",
    signal: "AI 训练师实为录入标注",
    severity: "high",
    source: "regex",
    category: "data_labeling_disguise",
    pattern: /(AI训练师|大模型训练师|模型训练专员).{0,40}(打字|录入|审核|标注|复制粘贴|整理文本)/i,
    explanation:
      "AI 训练师标题若对应打字、录入、审核和标注，岗位更接近基础数据作业。",
  },
  {
    id: "data-labeling-no-algorithm-access",
    signal: "没有模型训练或参数权限",
    severity: "medium",
    source: "regex",
    category: "data_labeling_disguise",
    pattern: /(不涉及|无需|没有).{0,16}(算法|模型训练|调参|代码|研发|参数).{0,24}(只需|主要|负责)?(标注|审核|清洗|整理)?/i,
    explanation:
      "JD 明确排除算法、代码、训练或参数权限时，不应包装为算法工程或大模型训练岗位。",
  },
  {
    id: "data-labeling-evaluation-without-experiment",
    signal: "只整理评测结果但缺少实验职责",
    severity: "low",
    source: "dictionary",
    category: "data_labeling_disguise",
    keywords: ["评测结果整理", "客户周报", "验收材料", "样本整理", "错误类型归类"],
    explanation:
      "评测整理是有效工作，但缺少实验设计、指标分析和模型迭代权限时，成长价值有限。",
  },
] as const satisfies RiskRule[];

export const TRUE_AI_TECH_STACK_WHITELIST = {
  llm_application: {
    label: "LLM 应用层",
    keywords: [
      "LangChain",
      "LlamaIndex",
      "RAG",
      "RAG 检索增强",
      "检索增强",
      "检索增强生成",
      "Agent",
      "智能体",
      "多智能体",
      "Agentic Workflow",
      "Agentic Search",
      "GraphRAG",
      "Prompt Engineering",
      "提示词工程",
      "Function Calling",
      "函数调用",
      "Tool Calling",
      "工具调用",
      "MCP",
      "Embedding",
      "向量检索",
      "语义检索",
      "混合检索",
      "rerank",
      "重排序",
      "重排",
      "知识库问答",
      "文档分块",
      "向量数据库",
      "Vector Database",
      "Milvus",
      "Pinecone",
      "Chroma",
      "Weaviate",
      "pgvector",
      "Semantic Search",
      "RAGAS",
      "DeepEval",
      "LangSmith",
      "LangFuse",
      "OpenAI-compatible API",
    ],
  },
  ai_infra: {
    label: "AI Infra",
    keywords: [
      "Model Serving",
      "模型部署",
      "模型服务",
      "推理服务",
      "vLLM",
      "TGI",
      "Triton",
      "Triton Inference Server",
      "TensorRT",
      "TensorRT-LLM",
      "ONNX",
      "CUDA",
      "NVIDIA GPU",
      "GPU Cluster",
      "GPU 集群",
      "GPU 调度",
      "算力调度",
      "KV Cache",
      "continuous batching",
      "Kubernetes GPU",
      "模型量化",
      "模型轻量化",
      "推理框架",
      "推理加速",
      "推理优化",
      "MLflow",
      "Kubeflow",
    ],
  },
  algorithm_research: {
    label: "算法研究",
    keywords: [
      "PyTorch",
      "JAX",
      "Transformers",
      "HuggingFace",
      "LoRA",
      "QLoRA",
      "Fine-tuning",
      "微调",
      "指令微调",
      "SFT",
      "RLHF",
      "DPO",
      "GRPO",
      "PPO",
      "后训练",
      "预训练",
      "强化学习",
      "模型训练",
      "模型评测",
      "效果评测",
      "评测基准",
      "数据合成",
      "奖励模型",
      "Reward Model",
      "DeepSpeed",
      "Megatron",
      "LLaMA-Factory",
      "OpenRLHF",
      "TRL",
      "verl",
      "FSDP",
      "tokenizer",
      "attention",
      "Transformer",
      "NLP",
      "benchmark",
      "消融实验",
      "多模态",
      "Diffusion Model",
      "GAN",
      "论文复现",
    ],
  },
  embodied_ai: {
    label: "具身智能",
    keywords: [
      "ROS",
      "ROS2",
      "Isaac Sim",
      "Isaac Gym",
      "Gazebo",
      "MuJoCo",
      "SLAM",
      "Motion Planning",
      "Path Planning",
      "Robot Control",
      "Grasping",
      "Reinforcement Learning",
      "Sim2Real",
      "VLA",
      "视觉导航",
      "机械臂",
      "机器人感知",
      "轨迹规划",
    ],
  },
  ai_safety: {
    label: "AI 安全",
    keywords: [
      "Prompt Injection",
      "Jailbreak",
      "越狱攻击",
      "OWASP LLM Top 10",
      "Red Teaming",
      "红队评测",
      "模型对齐",
      "Safety Evaluation",
      "Guardrails",
      "对抗样本",
      "敏感信息泄露",
      "内容安全",
      "隐私保护",
      "Tool Misuse",
      "Policy Evaluation",
      "安全评测",
      "模型安全",
      "红队",
    ],
  },
} as const satisfies Record<AiEcosystemDomain, TrueAiTechStackDomain>;

export const TRUE_AI_TECH_STACK_KEYWORDS = Object.values(
  TRUE_AI_TECH_STACK_WHITELIST,
).flatMap((domain) => domain.keywords);

export const AI_ROLE_TITLE_KEYWORDS = [
  "AI 工程师",
  "人工智能工程师",
  "大模型工程师",
  "LLM 工程师",
  "算法工程师",
  "机器学习工程师",
  "AI Infra 工程师",
  "AI 安全工程师",
  "具身智能工程师",
  "AI 训练师",
  "AI训练师",
  "人工智能训练师",
  "AI 数据标注师",
  "AI数据标注师",
  "大模型标注工程师",
  "大模型评测工程师",
  "AI 评测工程师",
  "AI评测工程师",
  "AI 测试工程师",
  "AI测试工程师",
  "AI 产品经理",
  "AI产品经理",
] as const;

export const TRADITIONAL_DEV_STACK_KEYWORDS = [
  "Java",
  "Spring Boot",
  "Spring Cloud",
  "MyBatis",
  "Vue",
  "Element UI",
  "CRUD",
  "OA",
  "ERP",
  "CRM",
  "后台管理系统",
  "报表导出",
] as const;

export const TRADITIONAL_NON_AI_ROLE_KEYWORDS = [
  "产品经理",
  "产品专员",
  "产品负责人",
  "Product Manager",
  "产品运营",
  "业务产品",
  "B端产品",
  "C端产品",
  "后台产品",
  "销售",
  "销售顾问",
  "销售代表",
  "电话销售",
  "电销",
  "渠道销售",
  "大客户销售",
  "客户经理",
  "商务BD",
  "BD",
  "客户成功",
  "客服",
  "客服专员",
  "在线客服",
  "售后客服",
  "呼叫中心",
  "运营专员",
  "内容运营",
  "社群运营",
] as const;

export const TRADITIONAL_NON_AI_WORK_KEYWORDS = [
  "PRD",
  "原型",
  "需求文档",
  "需求调研",
  "需求评审",
  "产品规划",
  "竞品分析",
  "用户画像",
  "用户反馈",
  "版本迭代",
  "项目管理",
  "业务流程",
  "数据看板",
  "后台管理",
  "权限配置",
  "流程审批",
  "SaaS",
  "Axure",
  "墨刀",
  "客户开发",
  "客户维护",
  "线索跟进",
  "商机",
  "成单",
  "成交",
  "回款",
  "续费",
  "客情维护",
  "渠道拓展",
  "拜访客户",
  "电话回访",
  "呼入",
  "呼出",
  "工单",
  "客诉处理",
  "在线咨询",
  "售后",
  "话术",
  "业绩目标",
  "转化率",
] as const;
