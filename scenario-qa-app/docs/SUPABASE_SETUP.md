# Supabase 설정

1. 새 프로젝트를 만들고 SQL Editor에서 `supabase/migrations/202608040001_initial_qa_schema.sql`을 실행합니다.
2. Table Editor에서 `analyses` 등 13개 업무 테이블과 `profiles`가 생성됐는지 확인합니다.
3. Storage의 `qa-artifacts` 버킷이 Private인지 확인합니다.
4. Authentication > Providers에서 Email을 활성화합니다. 초대 전용 운영이면 앱의 `NUXT_PUBLIC_SIGNUP_ENABLED=false`를 유지하고 대시보드에서 사용자를 초대합니다.
5. Project URL, anon key, service_role key를 각각 요구되는 배포 환경에 등록합니다.
6. 로그인 페이지 분석을 사용하려면 `supabase/migrations/202609010001_analysis_authentication.sql`까지 순서대로 적용합니다.

RLS는 사용자가 자기 `user_id` 행만 읽게 합니다. 분석 생성은 `create_analysis_job` RPC만 허용하며 일일 5회·사용자 동시 1회·전체 동시 1회를 트랜잭션 잠금으로 검사합니다. service_role 키는 RLS를 우회하므로 GitHub Actions와 Vercel 서버 변수에만 둡니다.
