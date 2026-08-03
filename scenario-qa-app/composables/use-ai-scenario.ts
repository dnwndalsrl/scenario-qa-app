export function useAiScenarioConversion() {
  const request = useApiRequest<AiScenarioConversionResult>();
  let controller: AbortController | null = null;

  async function convert(
    input: AiScenarioConversionRequest
  ): Promise<AiScenarioConversionResult | null> {
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const result = await request.execute(() =>
      apiFetch<ApiResponse<AiScenarioConversionResult>>(
        "/api/ai/scenarios/convert",
        {
          method: "POST",
          body: input,
          signal: activeController.signal
        }
      )
    );
    if (controller === activeController) {
      controller = null;
    }
    return result;
  }

  function cancel(): void {
    controller?.abort();
    controller = null;
  }

  onScopeDispose(cancel);

  return {
    ...request,
    convert,
    cancel
  };
}
