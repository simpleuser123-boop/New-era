import type { NextRequest } from "next/server";
import { z, type ZodError } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { storyCreateInputSchema } from "@/lib/schemas";
import { createStory, listStories } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_STORY_LIMIT = 50;
const MAX_STORY_LIMIT = 100;

const storiesQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_STORY_LIMIT)
    .default(DEFAULT_STORY_LIMIT),
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

  const query = storiesQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!query.success) {
    return apiError(
      {
        code: "INVALID_STORIES_QUERY",
        message: `limit 必须是 1 到 ${MAX_STORY_LIMIT} 之间的整数。`,
        details: zodErrorDetails(query.error),
      },
      { status: 400 },
    );
  }

  try {
    const stories = listStories(query.data.limit);

    return apiSuccess({
      count: stories.length,
      limit: query.data.limit,
      stories,
    });
  } catch {
    return apiError(
      {
        code: "STORIES_LIST_FAILED",
        message: "STAR 故事库读取失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return apiError(
      {
        code: "INVALID_JSON",
        message: "请求体必须是合法 JSON。",
      },
      { status: 400 },
    );
  }

  const input = storyCreateInputSchema.safeParse(requestBody);

  if (!input.success) {
    return apiError(
      {
        code: "INVALID_STORY_INPUT",
        message: "STAR 故事参数不正确，请至少填写标题，并检查标签长度。",
        details: zodErrorDetails(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const story = createStory(input.data);

    return apiSuccess({ story }, { status: 201 });
  } catch {
    return apiError(
      {
        code: "STORY_CREATE_FAILED",
        message: "STAR 故事保存失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
