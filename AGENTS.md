# Project Agent Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it; don't delete it.

When your changes create orphans:

- Remove imports, variables, or functions that your changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass."
- "Fix the bug" -> "Write a test that reproduces it, then make it pass."
- "Refactor X" -> "Ensure tests pass before and after."

For multi-step tasks, state a brief plan:

1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if there are fewer unnecessary changes in diffs, fewer rewrites caused by overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Token-Efficient Deployment

Apply these rules whenever the user asks to deploy this project. They are the default deployment contract unless the user explicitly requests a different process.

### Preparation

- Read `outputs/PROJECT_STATUS.md` and only the deployment configuration needed for the current release. Do not replay the conversation history to reconstruct deployment state.
- Use the connected GitHub plugin to read the current `main` commit and repository files before preparing a release.
- Reuse a successful typecheck, test, and production build result when no application source, dependency, environment, or runtime deployment configuration has changed since that verification.
- If relevant application code changed after verification, run the smallest targeted check first and the required release check once. Never repeat a successful check without a concrete reason.

### Deployment

- The default Codex release path is the connected GitHub plugin: create one commit whose parent is the current `main` commit, then fast-forward `main` once. The existing GitHub-to-Vercel integration performs the production deployment.
- `scripts/deploy-production.ps1` is a manual operator fallback for a normal user terminal. Do not run it from the Codex sandbox.
- Do not use local Git fetch, temporary clones, alternate credential stores, or direct `vercel --prod` when the GitHub plugin is available.
- Keep tool output compact. Avoid repeated polling, complete DOM dumps, and full build logs unless diagnosing a failure.
- If GitHub plugin access or permissions fail once, stop, summarize the blocker, and request the minimum user action required.

### Verification

- After `main` is updated, make one concise production verification pass for `https://scenario-qa-app.vercel.app/api/health` and `/login`.
- Add a targeted production smoke check only when the deployed change affects a critical path those two checks cannot cover, or when the user explicitly requests broader verification.
- Do not repeat the same verification through browser automation, PowerShell, and deployment tooling after one method succeeds.
- Report only the production URL, commit, deployment result, reused or executed checks, smoke-check result, and unresolved risk.

### Security and Exceptions

- Never print or store authentication tokens in the workspace.
- Correctness and security take priority over token savings. Expand verification for authentication, data migration, payment, destructive operations, or other high-risk changes, and state why.
- A user's explicit request such as "run the full test suite" overrides the corresponding default above, but all other deployment rules still apply.

---

# AGENTS.md — Probe QA 프론트엔드 작업 규칙

> 이 파일을 리포지토리 루트의 `AGENTS.md`에 병합하세요. Codex는 작업 시작 시 이 파일을 자동으로 읽습니다.

## 디자인 (UI를 만들거나 바꾸는 모든 작업에 적용)

- UI 작업 전 **`design/DESIGN.md`를 반드시 먼저 읽고** 그 규칙 안에서만 작업한다. 색·타이포·라운드·간격은 `design/tokens.css`의 변수만 사용한다. 새 값을 만들지 않는다.
- 새 화면·컴포넌트는 `design/screens/`에서 가장 비슷한 레퍼런스 HTML을 열어 구조와 값을 그대로 가져온 뒤 내용만 바꾼다. 레퍼런스에 없는 패턴이 필요하면 만들기 전에 사용자에게 확인한다.
- 상태(성공/실패/진행/대기)는 색이 아니라 `DESIGN.md §5`의 글리프 + 굵기로 표기한다. 유채색은 어디에도 쓰지 않는다.
- 한 화면에 primary(검정 채움) 버튼은 1개. 새로고침·다운로드·재실행·초기화는 secondary 또는 텍스트 링크.
- JetBrains Mono는 라틴·숫자만으로 된 문자열(URL, ID, 타임스탬프, 에러 메시지)에만. 한글이 포함된 텍스트는 Pretendard.
- 버튼·링크 라벨은 `DESIGN.md §7-1` 표의 것만 쓴다. 폼 오류는 브라우저 기본 툴팁 대신 `§6-C` 검증 패턴(필드 아래 ✕ 메시지 / 버튼 아래 배너)으로 표기한다.
- 폰트는 `design/fonts/`의 파일을 `@font-face`로 로드한다. 외부 CDN 사용 금지.
- 표는 CSS grid(고정폭 열 + 1fr 1개), 셀 텍스트는 `nowrap + ellipsis`, 헤더와 셀의 x 시작점을 맞춘다. 행 링크 안에 링크를 중첩하지 않는다.
- UI 변경 후에는 1440×900 뷰포트에서 렌더링해 `DESIGN.md §8-5` 체크리스트를 확인하고, 스크린샷을 PR에 첨부한다.
- 디자인 판단이 필요한 지점(무엇을 숨길지, 무엇을 강조할지, 새 상태의 표기)은 임의로 결정하지 말고 질문으로 남긴다.
