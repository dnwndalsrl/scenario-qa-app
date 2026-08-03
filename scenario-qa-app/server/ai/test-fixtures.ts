import type { AiScenarioConversionRequest } from "../../shared/types/ai-scenario.js";
import type { AiScenarioProviderResponse } from "./schemas/ai-scenario-response.schema.js";

export function createConversionInput(): AiScenarioConversionRequest {
  return {
    projectId: "project-ai-test",
    name: "관리자 로그인",
    description: "관리자 로그인을 확인한다.",
    startUrl: "/login",
    naturalLanguage: [
      "로그인 페이지에 접속한다.",
      "아이디 입력창에 TEST_LOGIN_ID 값을 입력한다.",
      "로그인 버튼을 클릭한다.",
      "URL에 /dashboard가 포함되는지 확인한다."
    ].join("\n"),
    stopOnFailure: true,
    timeout: 90000,
    availableEnvironmentVariables: ["TEST_LOGIN_ID"]
  };
}

export function createProviderResponse(): AiScenarioProviderResponse {
  return {
    scenario: {
      name: "관리자 로그인",
      description: "관리자 로그인을 확인한다.",
      startUrl: "/login",
      stopOnFailure: true,
      timeout: 90000,
      steps: [
        {
          temporaryId: "draft-2",
          order: 2,
          name: "아이디 입력",
          originalText: "아이디 입력창에 TEST_LOGIN_ID 값을 입력한다.",
          action: "fill",
          target: {
            strategy: "label",
            value: "아이디",
            name: null,
            exact: null
          },
          value: "{{TEST_LOGIN_ID}}",
          expected: null,
          timeout: 15000,
          required: true,
          confidence: 0.78,
          reviewRequired: true,
          reviewReason: "실제 화면의 라벨을 확인해야 합니다."
        },
        {
          temporaryId: "draft-1",
          order: 1,
          name: "로그인 페이지 이동",
          originalText: "로그인 페이지에 접속한다.",
          action: "goto",
          target: null,
          value: "/login",
          expected: null,
          timeout: 15000,
          required: true,
          confidence: 0.96,
          reviewRequired: false,
          reviewReason: null
        },
        {
          temporaryId: "draft-3",
          order: 3,
          name: "로그인 버튼 클릭",
          originalText: "로그인 버튼을 클릭한다.",
          action: "click",
          target: {
            strategy: "role",
            value: "button",
            name: "로그인",
            exact: true
          },
          value: null,
          expected: null,
          timeout: 15000,
          required: true,
          confidence: 0.92,
          reviewRequired: false,
          reviewReason: null
        },
        {
          temporaryId: "draft-4",
          order: 4,
          name: "대시보드 URL 확인",
          originalText: "URL에 /dashboard가 포함되는지 확인한다.",
          action: "assert_url",
          target: null,
          value: null,
          expected: {
            operator: "contains",
            value: "/dashboard"
          },
          timeout: 15000,
          required: true,
          confidence: 0.98,
          reviewRequired: false,
          reviewReason: null
        }
      ]
    },
    warnings: [],
    missingInformation: [],
    unsupportedSteps: [],
    assumptions: []
  };
}
