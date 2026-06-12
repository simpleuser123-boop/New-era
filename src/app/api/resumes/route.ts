import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { listResumes } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RESUME_LIMIT = 20;
const MAX_RESUME_LIMIT = 100;

const resumesQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_RESUME_LIMIT)
    .default(DEFAULT_RESUME_LIMIT),
});

function zodErrorDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function GET(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const query = resumesQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_RESUMES_QUERY",
        message: `limit 必须是 1 到 ${MAX_RESUME_LIMIT} 之间的整数。`,
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const resumes = listResumes(query.data.limit);

    return apiSuccess({
      resumes,
      count: resumes.length,
      limit: query.data.limit,
    });
  } catch {
    return apiError(
      {
        code: "RESUMES_LIST_FAILED",
        message: "简历列表读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
