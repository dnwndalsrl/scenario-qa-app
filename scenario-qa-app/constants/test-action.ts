export const TEST_ACTIONS = [
  "goto",
  "fill",
  "click",
  "assert_url",
  "assert_visible"
] as const satisfies readonly TestAction[];

export const LOCATOR_STRATEGIES = [
  "testId",
  "role",
  "label",
  "placeholder",
  "text",
  "css"
] as const satisfies readonly LocatorStrategy[];

export const TEST_ACTION_LABELS = {
  goto: "페이지 이동",
  fill: "값 입력",
  click: "클릭",
  assert_url: "URL 확인",
  assert_visible: "요소 표시 확인"
} as const;
