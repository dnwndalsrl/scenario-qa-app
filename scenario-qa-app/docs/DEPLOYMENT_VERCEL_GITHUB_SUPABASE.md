# Vercel + GitHub Actions + Supabase 배포

1. Supabase 프로젝트를 만들고 `SUPABASE_SETUP.md`의 마이그레이션을 적용합니다.
2. GitHub 저장소 기본 브랜치에 `.github/workflows/run-qa-analysis.yml`을 포함해 푸시합니다.
3. GitHub Secrets를 `GITHUB_ACTIONS_RUNNER.md`대로 등록합니다.
4. Fine-grained GitHub token을 만들고 대상 저장소의 Actions 권한을 Read and write로 제한합니다.
5. Vercel에서 저장소의 `scenario-qa-app` 폴더를 Root Directory로 지정합니다.
6. `VERCEL_SETUP.md`의 환경변수를 등록하고 배포합니다.
7. Supabase Auth URL Configuration에 Vercel 운영 URL과 `/login`을 허용합니다.
8. `/api/health`, 로그인, 새 분석, GitHub Actions 실행, 결과/스크린샷 조회 순서로 스모크 테스트합니다.

외부 계정 로그인과 secret 등록은 저장소에 포함되지 않습니다. 배포 완료 판단은 실제 Vercel URL에서 위 스모크 테스트까지 통과했을 때만 가능합니다.
