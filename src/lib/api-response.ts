import { NextResponse } from "next/server";

import type { JsonObject, JsonValue } from "./types";

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: JsonValue;
};

export type ApiSuccessBody<TBody extends JsonObject = JsonObject> = {
  ok: true;
} & TBody;

export type ApiErrorBody<TMeta extends JsonObject = Record<string, never>> = {
  ok: false;
  error: ApiErrorPayload;
} & TMeta;

type ApiErrorInit<TMeta extends JsonObject> = ResponseInit & {
  meta?: TMeta;
};

export function apiSuccess<TBody extends JsonObject>(
  body: TBody,
  init?: ResponseInit,
): NextResponse<ApiSuccessBody<TBody>> {
  return NextResponse.json(
    { ok: true, ...body } as ApiSuccessBody<TBody>,
    init,
  );
}

export function apiError<TMeta extends JsonObject = Record<string, never>>(
  error: ApiErrorPayload,
  init?: ApiErrorInit<TMeta>,
): NextResponse<ApiErrorBody<TMeta>> {
  const { meta, ...responseInit } = init ?? {};

  return NextResponse.json(
    { ok: false, ...(meta ?? {}), error } as ApiErrorBody<TMeta>,
    {
      ...responseInit,
      status: responseInit.status ?? 500,
    },
  );
}
