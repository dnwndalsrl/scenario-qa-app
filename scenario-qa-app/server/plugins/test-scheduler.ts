import { operationalRecoveryService, testRunService, testSchedulerService } from "../services/container.js";

export default defineNitroPlugin(async (nitroApp) => {
  const recovered = await operationalRecoveryService.recoverInterruptedWork();
  const total = Object.values(recovered).reduce((sum, value) => sum + value, 0);
  if (total > 0) console.warn("[operational-recovery] 서버 재시작으로 중단된 작업을 종료 처리했습니다.", recovered);
  testSchedulerService.start();
  nitroApp.hooks.hook("close", async () => {
    testSchedulerService.stop();
    testRunService.beginShutdown();
    const drained = await testRunService.waitForIdle(25_000);
    if (!drained) console.warn("[shutdown] 실행 중인 테스트가 종료 제한 시간 안에 완료되지 않았습니다.");
  });
});
