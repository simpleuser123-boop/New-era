import { apiError, apiSuccess } from "@/lib/api-response";
import { getDb } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_NAME = "New Era";

type DatabaseHealth =
  | {
      status: "ok";
      latencyMs: number;
    }
  | {
      status: "unavailable";
    };

function checkDatabase(): DatabaseHealth {
  const startedAt = Date.now();

  try {
    getDb().prepare("SELECT 1").get();

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

export function GET() {
  const timestamp = new Date().toISOString();
  const database = checkDatabase();
  const meta = {
    timestamp,
    database,
    app: APP_NAME,
  };

  if (database.status !== "ok") {
    return apiError(
      {
        code: "DATABASE_UNAVAILABLE",
        message: "Database health check failed.",
        details: {
          database,
        },
      },
      {
        status: 503,
        meta,
      },
    );
  }

  return apiSuccess(meta);
}
