/** Keeps explicit API response typing stable when Nitro route inference is enabled. */
export function apiFetch<T>(
  request: string,
  options?: Record<string, unknown>
): Promise<T> {
  const looseFetch = $fetch as unknown as (
    input: string,
    init?: Record<string, unknown>
  ) => Promise<unknown>;
  return looseFetch(request, options) as Promise<T>;
}
