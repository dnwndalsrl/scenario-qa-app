# Vercel 설정

Vercel 프로젝트 Root Directory를 `scenario-qa-app`으로 지정하고 Framework Preset은 Nuxt.js, Build Command는 `npm run build`를 사용합니다.

Production/Preview 환경에 다음 값을 등록합니다.

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`
- `NUXT_PUBLIC_SIGNUP_ENABLED=false`
- `NUXT_PUBLIC_APP_URL=https://배포주소`
- `GITHUB_ACTIONS_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`
- `GITHUB_WORKFLOW_ID=run-qa-analysis.yml`, `GITHUB_WORKFLOW_REF=main`

OpenAI 키와 Playwright 브라우저는 Vercel에 등록하지 않습니다. 배포 후 `/api/health`가 200인지 확인하고, 로그인한 상태에서 시스템 상태 화면의 Supabase와 GitHub Actions 설정이 정상인지 확인합니다.
