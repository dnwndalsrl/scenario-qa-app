export const northflankErrorMessages = {
  NORTHFLANK_BUILD_FAILED: "Northflank에서 Docker 이미지를 빌드하지 못했습니다.",
  NORTHFLANK_DEPLOY_FAILED: "Northflank 서비스 배포를 완료하지 못했습니다.",
  NORTHFLANK_HEALTH_CHECK_FAILED: "배포된 서비스가 상태 검사에 응답하지 않습니다.",
  NORTHFLANK_PUBLIC_ENDPOINT_FAILED: "Northflank 공개 HTTPS 주소에 접속하지 못했습니다.",
  NORTHFLANK_STORAGE_NOT_PERSISTENT: "서비스 재시작 또는 재배포 후 저장 데이터가 유지되지 않았습니다.",
  NORTHFLANK_VOLUME_NOT_AVAILABLE: "무료 Sandbox에서 이 서비스에 연결할 영구 볼륨을 사용할 수 없습니다.",
  NORTHFLANK_CHROMIUM_START_FAILED: "Northflank 컨테이너에서 Chromium을 시작하지 못했습니다.",
  NORTHFLANK_MEMORY_LIMIT_EXCEEDED: "무료 실행 환경의 메모리가 부족하여 작업을 완료하지 못했습니다.",
  NORTHFLANK_SERVICE_RESTARTED: "실행 중 Northflank 서비스가 다시 시작되었습니다.",
  NORTHFLANK_CRON_FAILED: "Northflank Cron Job 실행이 실패했습니다.",
  NORTHFLANK_ENVIRONMENT_INVALID: "Northflank 운영 환경변수 설정이 올바르지 않습니다.",
  FREE_SANDBOX_RESOURCE_LIMIT: "무료 Sandbox의 CPU, 메모리 또는 저장 공간 한도에 도달했습니다.",
  FREE_SANDBOX_DATA_NOT_PERSISTENT: "무료 Sandbox의 임시 파일은 재시작 또는 재배포 때 사라질 수 있습니다."
} as const;

export type NorthflankErrorCode = keyof typeof northflankErrorMessages;
