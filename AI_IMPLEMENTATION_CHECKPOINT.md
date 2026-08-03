# AI 테스트 실패 분석 기능 완료 체크포인트

완료일: 2026-08-03 (Asia/Seoul)

## 현재 완료 상태

기존 테스트 실행 결과를 변경하지 않고 실패 근거를 정제해 OpenAI 구조화 진단을 요청하고, 사실·가설·재현 절차·권장 조치·추가 확인·한계를 화면에 제공하는 로컬 MVP 구현을 완료했다.

## 핵심 구현

- `failed`, `error`, `blocked` 전용 비동기 분석
- pending / processing / completed / failed 독립 상태
- 실패 단계, 콘솔, 네트워크, screenshot metadata 근거 ID
- URL query, token, Authorization, Cookie, 비밀번호, 개인정보, 내부 경로 정제
- 관련 실패 단계 우선 선택과 전체 입력 크기 제한
- SHA-256 inputFingerprint와 완료 결과 재사용·force 재분석
- OpenAI Responses API + Zod strict 구조화 출력
- 존재하지 않는 evidence와 cause 관계 차단
- 확인된 사실과 추정 원인 분리
- 신뢰도, 반대 근거, 확인 방법, 담당 역할
- 재현 절차, 우선순위별 조치, 추가 확인, 분석 한계
- run/analysis 조회와 retry API
- 상세 화면 전용 폴링, 상태, 결과, 근거 이동·강조 UI
- 프로젝트·시나리오 삭제 시 분석 기록 연쇄 삭제

## 최종 검증 결과

- 앱 TypeScript 검사 통과
- Vitest 13개 파일, 54개 테스트 통과
- Nuxt 프로덕션 빌드 통과
- 실패 분석 POST: pending 즉시 생성 확인
- API 키 누락: 분석만 `failed / AI_ANALYSIS_PROVIDER_ERROR`
- 기존 테스트 실행 결과 상태와 errorCount 불변 확인
- 성공 실행 분석 요청: HTTP 400 / `AI_ANALYSIS_NOT_ALLOWED`
- 기존 로그인 Playwright 회귀: success, 6/6, 실제 비밀번호 미노출
- 기존 자연어 변환 민감정보 차단과 API 키 누락 오류 회귀 통과
- 클라이언트 결과물에 API 키·시스템 프롬프트·OpenAI SDK 없음
- UTF-8 replacement 문자와 분석 저장소 민감값 없음

## 주요 경로

- 앱: `outputs/scenario-qa-app`
- 실행기: `outputs/scenario-test-runner`
- 최종 문서: `outputs/scenario-qa-app/README.md`
- 분석 저장소: `outputs/scenario-qa-app/storage/ai-failure-analyses.json`

## 외부 조건과 다음 재개 지점

실제 `completed` 분석은 사용자가 `.env`에 유효한 `OPENAI_API_KEY`와 `OPENAI_FAILURE_ANALYSIS_MODEL`을 설정한 뒤 실패 실행에서 확인할 수 있다. 키는 저장하지 않았고 배포하지 않았다. 검증 서버는 종료했고 분석 저장소는 빈 배열로 정리했다.

다음 단계에서는 작업 큐·분산 잠금·재시작 복구 또는 분석 이력 비교 기능부터 이어갈 수 있다.
