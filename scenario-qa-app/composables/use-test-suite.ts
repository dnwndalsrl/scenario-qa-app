export function useTestSuite(
  projectId: MaybeRefOrGetter<string>,
  suiteId: MaybeRefOrGetter<string>
) {
  const request = useApiRequest<TestSuiteDetail>();
  const execute = (): Promise<TestSuiteDetail | null> =>
    request.execute(() =>
      apiFetch<ApiResponse<TestSuiteDetail>>(
        `/api/projects/${toValue(projectId)}/test-suites/${toValue(suiteId)}`
      )
    );
  return { ...request, execute, refresh: execute };
}
