import {
  evaluateAndSaveReport,
  type EvaluateAndSaveReportResult,
  type EvaluateJobOptions,
} from "@/lib/evaluate-engine";

const MAX_CACHE_SIZE = 40;
const CACHE_TTL_MS = 10 * 60 * 1000;

type EvaluationCacheEntry = {
  expiresAt: number;
  promise: Promise<EvaluateAndSaveReportResult>;
};

const evaluationCache = new Map<string, EvaluationCacheEntry>();

export function getOrStartSavedEvaluation(
  clientRequestId: string | undefined,
  jdText: string,
  options: EvaluateJobOptions,
): Promise<EvaluateAndSaveReportResult> {
  if (!clientRequestId) {
    return evaluateAndSaveReport(jdText, options);
  }

  pruneEvaluationCache();

  const existing = evaluationCache.get(clientRequestId);

  if (existing) {
    existing.expiresAt = Date.now() + CACHE_TTL_MS;
    return existing.promise;
  }

  const promise = evaluateAndSaveReport(jdText, options)
    .then((result) => {
      if (result.saveError) {
        evaluationCache.delete(clientRequestId);
      }

      return result;
    })
    .catch((error) => {
      evaluationCache.delete(clientRequestId);
      throw error;
    });

  evaluationCache.set(clientRequestId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    promise,
  });

  trimEvaluationCache();

  return promise;
}

function pruneEvaluationCache() {
  const now = Date.now();

  for (const [key, entry] of evaluationCache.entries()) {
    if (entry.expiresAt <= now) {
      evaluationCache.delete(key);
    }
  }
}

function trimEvaluationCache() {
  while (evaluationCache.size > MAX_CACHE_SIZE) {
    const oldestKey = evaluationCache.keys().next().value;

    if (!oldestKey) {
      return;
    }

    evaluationCache.delete(oldestKey);
  }
}
