import type { AiEcosystemDomain, ResumeDirection } from "./types";

export const AI_DOMAIN_DIRECTIONS = [
  "llm_application",
  "ai_infra",
  "algorithm_research",
  "embodied_ai",
  "ai_safety",
] as const satisfies readonly AiEcosystemDomain[];

export const RESUME_DIRECTIONS = [
  "general",
  ...AI_DOMAIN_DIRECTIONS,
] as const satisfies readonly [ResumeDirection, ...ResumeDirection[]];

export const RESUME_DIRECTION_LABELS: Record<ResumeDirection, string> = {
  general: "通用",
  llm_application: "LLM 应用层",
  ai_infra: "AI Infra",
  algorithm_research: "算法研究",
  embodied_ai: "具身智能",
  ai_safety: "AI 安全",
};

export const RESUME_DIRECTION_OPTIONS = RESUME_DIRECTIONS.map((value) => ({
  label: RESUME_DIRECTION_LABELS[value],
  value,
}));

export function isAiDomainDirection(
  direction: ResumeDirection,
): direction is AiEcosystemDomain {
  return direction !== "general";
}

export function normalizeResumeDirection(
  value: unknown,
): ResumeDirection | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLocaleLowerCase();

  if (RESUME_DIRECTIONS.includes(normalized as ResumeDirection)) {
    return normalized as ResumeDirection;
  }

  if (/通用|general/.test(normalized)) {
    return "general";
  }

  if (/llm|大模型应用|rag|agent|应用层/.test(normalized)) {
    return "llm_application";
  }

  if (/infra|基础设施|推理平台|模型服务|mlops|gpu/.test(normalized)) {
    return "ai_infra";
  }

  if (/算法研究|算法工程|模型训练|微调|research|algorithm/.test(normalized)) {
    return "algorithm_research";
  }

  if (/具身|机器人|embodied|robot/.test(normalized)) {
    return "embodied_ai";
  }

  if (/安全|safety|红队|越狱|prompt injection/.test(normalized)) {
    return "ai_safety";
  }

  return undefined;
}
