import type { H3Event } from "h3";
import type {
  ApiFailure,
  ApiSuccess
} from "../../shared/types/api.js";
import { StorageDataError } from "./file-storage.js";

export class AppError extends Error {
  override readonly name = "AppError";

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export function defineApiHandler<T>(
  handler: (event: H3Event) => Promise<T>
) {
  return defineEventHandler(async (event): Promise<ApiSuccess<T> | ApiFailure> => {
    try {
      return {
        success: true,
        data: await handler(event)
      };
    } catch (error: unknown) {
      return createApiFailure(event, error);
    }
  });
}

export function createApiFailure(
  event: H3Event,
  error: unknown
): ApiFailure {
  const failure = normalizeError(error);
  setResponseStatus(event, failure.statusCode);
  return {
    success: false,
    error: {
      code: failure.code,
      message: failure.message,
      details: failure.details
    }
  };
}

export async function readBodyObject(
  event: H3Event
): Promise<Record<string, unknown>> {
  const body = await readBody<unknown>(event);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError(400, "INVALID_REQUEST_BODY", "요청 본문은 JSON 객체여야 합니다.");
  }
  return body as Record<string, unknown>;
}

function normalizeError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
} {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof StorageDataError) {
    return {
      statusCode: 500,
      code: "STORAGE_ERROR",
      message: "로컬 저장소를 처리하지 못했습니다. 저장소 파일을 확인해 주세요.",
      details: {}
    };
  }
  return {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    details: {}
  };
}
