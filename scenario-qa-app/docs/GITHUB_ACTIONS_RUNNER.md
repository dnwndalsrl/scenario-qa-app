# GitHub Actions 실행기

저장소 루트의 `.github/workflows/run-qa-analysis.yml`은 수동 dispatch 입력으로 `analysis_id` 하나만 받습니다. 실제 URL과 옵션은 service role로 Supabase에서 읽습니다. 작업은 전역 concurrency 1, timeout 10분이며 진단 artifact는 3일 후 삭제됩니다.

Repository Settings > Secrets and variables > Actions에 다음 Secrets를 등록합니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

실행 명령은 `npm run qa:run -- --analysis-id=<uuid>`입니다. 로컬에서도 같은 명령을 사용할 수 있으며 Nuxt 서버가 실행 중일 필요가 없습니다. 실패·시간 초과 시 후처리 단계가 아직 활성 상태인 작업을 `failed`로 바꿉니다. Secret 값은 로그에 출력하지 마세요.
