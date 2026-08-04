import { createError } from "h3";
import { AppError } from "../../shared/errors";

export function toHttpError(error: unknown) {
  if (error instanceof AppError) return createError({ statusCode: error.statusCode, statusMessage: error.message, data: { code: error.code, message: error.message, detail: error.detail } });
  return createError({ statusCode: 500, statusMessage: "서버 내부 오류가 발생했습니다.", data: { code: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." } });
}
