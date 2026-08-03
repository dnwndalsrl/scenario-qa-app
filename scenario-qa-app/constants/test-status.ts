import type { TestRunStatus } from "../shared/types/test-run";
import type {
  TestSuiteRunItemStatus,
  TestSuiteRunStatus,
  TestSuiteStatus
} from "../shared/types/test-suite";
import type { TestScheduleExecutionStatus } from "../shared/types/test-schedule";
import type { NotificationDeliveryStatus } from "../shared/types/notification";

export type DisplayStatus =
  | TestRunStatus
  | TestSuiteStatus
  | TestSuiteRunStatus
  | TestSuiteRunItemStatus
  | TestScheduleExecutionStatus
  | NotificationDeliveryStatus;

export interface StatusPresentation {
  label: string;
  icon: string;
  tone: "neutral" | "info" | "success" | "danger" | "warning";
}

export const TEST_STATUS_PRESENTATION: Record<
  DisplayStatus,
  StatusPresentation
> = {
  pending: { label: "대기", icon: "○", tone: "neutral" },
  running: { label: "실행 중", icon: "◌", tone: "info" },
  success: { label: "성공", icon: "✓", tone: "success" },
  failed: { label: "실패", icon: "!", tone: "danger" },
  blocked: { label: "중단", icon: "—", tone: "warning" },
  error: { label: "오류", icon: "×", tone: "danger" },
  active: { label: "활성", icon: "●", tone: "success" },
  inactive: { label: "비활성", icon: "○", tone: "neutral" },
  partial_success: { label: "일부 성공", icon: "◐", tone: "warning" },
  skipped: { label: "건너뜀", icon: "↷", tone: "neutral" },
  cancelled: { label: "취소", icon: "■", tone: "neutral" }
  ,detected: { label: "감지", icon: "◌", tone: "info" }
  ,queued: { label: "대기열", icon: "…", tone: "warning" }
  ,completed: { label: "완료", icon: "✓", tone: "success" }
  ,sending: { label: "전송 중", icon: "◌", tone: "info" }
  ,sent: { label: "전송 완료", icon: "✓", tone: "success" }
};
