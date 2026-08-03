export default defineEventHandler((event) => {
  if (!["POST", "PUT", "PATCH"].includes(event.method)) return;
  const maximum = Number(process.env.MAX_REQUEST_BODY_BYTES ?? 5 * 1024 * 1024);
  const contentLength = Number(getHeader(event, "content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximum) {
    throw createError({
      statusCode: 413,
      statusMessage: "REQUEST_BODY_TOO_LARGE",
      message: "요청 본문은 5MB를 초과할 수 없습니다."
    });
  }
});
