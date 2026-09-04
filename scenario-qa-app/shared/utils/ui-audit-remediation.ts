import type { UiAuditIssue, UiAuditRule, UiAuditSeverity } from "../types/ui-audit";

export interface UiAuditRuleGuidance {
  label: string;
  reason: string;
  recommendation: string;
  standard: string;
}

export interface UiAuditIssueGroup {
  rule: UiAuditRule;
  severity: UiAuditSeverity;
  issues: UiAuditIssue[];
  affectedCount: number;
  stateCount: number;
}

export const UI_AUDIT_RULE_GUIDANCE: Record<UiAuditRule, UiAuditRuleGuidance> = {
  horizontal_overflow: {
    label: "가로 넘침",
    reason: "고정 너비, 과도한 최소 너비 또는 화면 밖에 배치된 요소가 페이지 폭을 넓힐 때 발생합니다.",
    recommendation: "고정 width와 min-width를 먼저 확인하고, 콘텐츠에는 max-width: 100%와 유연한 줄바꿈을 적용하세요.",
    standard: "문서 너비가 선택한 뷰포트 너비를 넘지 않아야 합니다.",
  },
  clipped_content: {
    label: "콘텐츠 잘림",
    reason: "표시 영역보다 콘텐츠가 큰데 부모 요소가 overflow: hidden 또는 고정 높이를 사용할 때 발생합니다.",
    recommendation: "불필요한 고정 높이를 제거하고, 필요한 경우 줄바꿈·스크롤·말줄임 중 의도한 처리 방식을 명시하세요.",
    standard: "내용을 읽거나 조작하는 데 필요한 정보가 잘리지 않아야 합니다.",
  },
  element_overlap: {
    label: "요소 겹침",
    reason: "고정·고정형 요소의 위치, z-index 또는 콘텐츠 여백이 충돌하면 중요한 UI가 가려질 수 있습니다.",
    recommendation: "겹치는 두 요소의 position과 z-index를 비교하고, 고정 헤더·플로팅 UI만큼 안전 여백을 확보하세요.",
    standard: "대상 요소의 중앙 영역이 다른 요소에 가려지지 않아야 합니다.",
  },
  small_target: {
    label: "작은 클릭 영역",
    reason: "아이콘 링크나 보조 버튼의 실제 클릭 영역이 시각적 크기보다 작게 설정된 경우가 많습니다.",
    recommendation: "padding 또는 min-width·min-height를 늘리고, 인접한 클릭 요소 사이에도 충분한 간격을 두세요.",
    standard: "자동 판정 기준은 최소 24×24px이며 주요 동작은 더 넓은 영역을 권장합니다.",
  },
  low_contrast: {
    label: "명암 대비",
    reason: "텍스트 색상과 실제 배경색의 차이가 작으면 저시력 사용자와 밝은 환경에서 읽기 어려워집니다.",
    recommendation: "텍스트 또는 배경색을 조정하고, 상태 표현은 색상만이 아니라 문구·아이콘을 함께 사용하세요.",
    standard: "일반 텍스트 4.5:1, 큰 텍스트 3:1 이상의 대비를 권장합니다.",
  },
};

const severityRank: Record<UiAuditSeverity, number> = { high: 0, medium: 1, low: 2 };
const ruleOrder: UiAuditRule[] = ["horizontal_overflow", "element_overlap", "clipped_content", "low_contrast", "small_target"];

export function groupUiAuditIssues(issues: UiAuditIssue[]): UiAuditIssueGroup[] {
  const grouped = new Map<UiAuditRule, UiAuditIssue[]>();
  for (const issue of issues) grouped.set(issue.rule, [...(grouped.get(issue.rule) || []), issue]);

  return [...grouped.entries()]
    .map(([rule, groupedIssues]) => {
      const severity = [...groupedIssues].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])[0].severity;
      return {
        rule,
        severity,
        issues: groupedIssues,
        affectedCount: new Set(groupedIssues.map((issue) => issue.selector)).size,
        stateCount: new Set(groupedIssues.map((issue) => issue.state)).size,
      };
    })
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || ruleOrder.indexOf(a.rule) - ruleOrder.indexOf(b.rule));
}
