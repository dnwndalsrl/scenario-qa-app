export function useApiRequest<T>() {
  const data = shallowRef<T | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function execute(
    request: () => Promise<ApiResponse<T>>
  ): Promise<T | null> {
    pending.value = true;
    error.value = null;
    try {
      const response = await request();
      if (!response.success) {
        error.value = response.error.message;
        return null;
      }
      data.value = response.data;
      return response.data;
    } catch (requestError: unknown) {
      error.value = extractApiErrorMessage(requestError);
      return null;
    } finally {
      pending.value = false;
    }
  }

  return {
    data,
    pending,
    error,
    execute,
    refresh: execute
  };
}

export function extractApiErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error
  ) {
    const data = (error as { data?: unknown }).data;
    if (isApiFailure(data)) {
      return data.error.message;
    }
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function isApiFailure(value: unknown): value is ApiFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    value.success === false &&
    "error" in value
  );
}
