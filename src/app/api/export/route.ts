import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { requireApiAuth } from "@/lib/auth/api";
import { getDataExportSnapshot } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const exportData = getDataExportSnapshot();
    const fileDate = exportData.exportedAt.slice(0, 10);

    return NextResponse.json(exportData, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="new-era-export-${fileDate}.json"`,
      },
    });
  } catch {
    return apiError(
      {
        code: "DATA_EXPORT_FAILED",
        message: "本地数据导出失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
