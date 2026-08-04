export async function apiFetch<T>(url: string, options?: Parameters<typeof $fetch<T>>[1]): Promise<T> {
  try { return await $fetch<T>(url, options) as T; }
  catch (error: any) { throw new Error(error?.data?.statusMessage ?? error?.data?.message ?? error?.message ?? "요청에 실패했습니다."); }
}
