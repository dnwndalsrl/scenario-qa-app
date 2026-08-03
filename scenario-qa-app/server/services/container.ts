import { OpenAiScenarioClient } from "../ai/clients/openai.client.js";
import { AiScenarioService } from "../ai/services/ai-scenario.service.js";
import { AiFailureAnalysisService } from "../ai/services/ai-failure-analysis.service.js";
import { AiFailureAnalysisRepository } from "../repositories/ai-failure-analysis.repository.js";
import { AiConversionRepository } from "../repositories/ai-conversion.repository.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { ScenarioRepository } from "../repositories/scenario.repository.js";
import { TestRunRepository } from "../repositories/test-run.repository.js";
import { TestRunComparisonRepository } from "../repositories/test-run-comparison.repository.js";
import { TestSuiteRepository } from "../repositories/test-suite.repository.js";
import { TestSuiteRunRepository } from "../repositories/test-suite-run.repository.js";
import { TestSuiteRunItemRepository } from "../repositories/test-suite-run-item.repository.js";
import { TestScheduleRepository } from "../repositories/test-schedule.repository.js";
import { TestScheduleExecutionRepository } from "../repositories/test-schedule-execution.repository.js";
import { AppNotificationRepository } from "../repositories/app-notification.repository.js";
import { NotificationDeliveryRepository } from "../repositories/notification-delivery.repository.js";
import { TestRunComparisonService } from "../comparisons/services/test-run-comparison.service.js";
import { getComparisonConfig } from "../comparisons/utils/comparison-config.js";
import { ProjectService } from "./project.service.js";
import { ScenarioService } from "./scenario.service.js";
import { TestRunService } from "./test-run.service.js";
import { TestSuiteService } from "./test-suite.service.js";
import { TestSuiteRunService } from "./test-suite-run.service.js";
import { getTestSuiteConfig } from "../test-suites/utils/suite-config.js";
import { getTestScheduleConfig } from "../schedules/utils/schedule-config.js";
import { getNotificationConfig } from "../notifications/utils/notification-config.js";
import { AppNotificationService } from "../notifications/services/app-notification.service.js";
import { NotificationDeliveryService } from "../notifications/services/notification-delivery.service.js";
import { TestScheduleService } from "../schedules/services/test-schedule.service.js";
import { TestSchedulerService } from "../schedules/services/test-scheduler.service.js";
import { ProjectAnalyticsService } from "../analytics/services/project-analytics.service.js";
import { getAnalyticsConfig } from "../analytics/utils/analytics-config.js";
import { OperationalRecoveryService } from "../operations/operational-recovery.service.js";
import { ProductionReadinessService } from "../operations/production-readiness.service.js";

const projectRepository = new ProjectRepository();
const scenarioRepository = new ScenarioRepository();
const testRunRepository = new TestRunRepository();
const aiConversionRepository = new AiConversionRepository();
const aiFailureAnalysisRepository = new AiFailureAnalysisRepository();
const testRunComparisonRepository = new TestRunComparisonRepository();
const testSuiteRepository = new TestSuiteRepository();
const testSuiteRunRepository = new TestSuiteRunRepository();
const testSuiteRunItemRepository = new TestSuiteRunItemRepository();
const testScheduleRepository = new TestScheduleRepository();
const testScheduleExecutionRepository = new TestScheduleExecutionRepository();
const appNotificationRepository = new AppNotificationRepository();
const notificationDeliveryRepository = new NotificationDeliveryRepository();
const testSuiteConfig = getTestSuiteConfig(useRuntimeConfig());
const testScheduleConfig = getTestScheduleConfig(useRuntimeConfig());
const notificationConfig = getNotificationConfig(useRuntimeConfig());

export const aiScenarioService = new AiScenarioService(
  projectRepository,
  aiConversionRepository,
  (config) => new OpenAiScenarioClient(config)
);

export const testRunService = new TestRunService(
  projectRepository,
  scenarioRepository,
  testRunRepository
);

export const testSuiteService = new TestSuiteService(
  projectRepository,
  scenarioRepository,
  testSuiteRepository,
  testSuiteRunRepository,
  testSuiteConfig.maxItems,
  testScheduleRepository
);

export const testSuiteRunService = new TestSuiteRunService(
  projectRepository,
  scenarioRepository,
  testSuiteRepository,
  testSuiteRunRepository,
  testSuiteRunItemRepository,
  testRunService,
  testSuiteConfig
);

export const aiFailureAnalysisService = new AiFailureAnalysisService(
  projectRepository,
  scenarioRepository,
  testRunService,
  aiFailureAnalysisRepository
);

export const testRunComparisonService = new TestRunComparisonService(
  testRunRepository,
  testRunService,
  testRunComparisonRepository,
  getComparisonConfig(useRuntimeConfig())
);

export const appNotificationService = new AppNotificationService(appNotificationRepository);
export const notificationDeliveryService = new NotificationDeliveryService(
  notificationDeliveryRepository,
  appNotificationService,
  notificationConfig,
  testScheduleRepository,
  testScheduleExecutionRepository
);
export const testScheduleService = new TestScheduleService(
  projectRepository,
  testSuiteRepository,
  testScheduleRepository,
  testScheduleExecutionRepository,
  notificationDeliveryRepository,
  testScheduleConfig,
  notificationConfig.encryptionKey
);
export const testSchedulerService = new TestSchedulerService(
  testScheduleRepository,
  testScheduleExecutionRepository,
  testSuiteRepository,
  testSuiteRunRepository,
  testSuiteRunItemRepository,
  testSuiteRunService,
  testRunComparisonService,
  notificationDeliveryService,
  testScheduleConfig
);

export const analyticsConfig = getAnalyticsConfig(useRuntimeConfig() as unknown as Record<string, unknown>);
export const projectAnalyticsService = new ProjectAnalyticsService(
  projectRepository,
  scenarioRepository,
  testRunRepository,
  testRunComparisonRepository,
  testSuiteRepository,
  testSuiteRunRepository,
  testSuiteRunItemRepository,
  testScheduleRepository,
  testScheduleExecutionRepository,
  notificationDeliveryRepository,
  testRunService,
  analyticsConfig
);

export const operationalRecoveryService = new OperationalRecoveryService(
  testRunRepository,
  testSuiteRunRepository,
  testSuiteRunItemRepository,
  testScheduleExecutionRepository,
  testRunComparisonRepository,
  aiFailureAnalysisRepository,
  aiConversionRepository,
  notificationDeliveryRepository
);

export const productionReadinessService = new ProductionReadinessService(
  projectRepository,
  scenarioRepository,
  testRunRepository,
  testScheduleRepository,
  testScheduleExecutionRepository,
  notificationDeliveryRepository,
  testRunService
);

export const projectService = new ProjectService(
  projectRepository,
  scenarioRepository,
  testRunRepository,
  testRunService,
  aiConversionRepository,
  aiFailureAnalysisRepository,
  testRunComparisonRepository,
  testSuiteRepository,
  testSuiteRunService,
  testScheduleRepository,
  testScheduleExecutionRepository,
  appNotificationRepository,
  notificationDeliveryRepository
);

export const scenarioService = new ScenarioService(
  projectRepository,
  scenarioRepository,
  testRunRepository,
  testRunService,
  aiFailureAnalysisRepository,
  testRunComparisonRepository
);
