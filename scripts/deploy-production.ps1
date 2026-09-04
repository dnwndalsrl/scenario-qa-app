[CmdletBinding()]
param(
  [string]$ProductionUrl = "https://scenario-qa-app.vercel.app",
  [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$appRoot = Join-Path $repoRoot "scenario-qa-app"

function Assert-LastCommand([string]$message) {
  if ($LASTEXITCODE -ne 0) {
    throw $message
  }
}

Push-Location $repoRoot
try {
  $branch = (git branch --show-current).Trim()
  Assert-LastCommand "현재 Git 브랜치를 확인하지 못했습니다."
  if ($branch -ne "main") {
    throw "운영 배포는 main 브랜치에서만 가능합니다. 현재 브랜치: $branch"
  }

  $changes = @(git status --porcelain)
  Assert-LastCommand "Git 작업 트리 상태를 확인하지 못했습니다."
  if ($changes.Count -gt 0) {
    throw "커밋되지 않은 변경사항이 있습니다. 변경사항을 먼저 검토하고 커밋해 주세요."
  }

  Write-Host "[1/4] origin/main 상태 확인"
  git fetch origin main --quiet
  Assert-LastCommand "origin/main을 가져오지 못했습니다. Git 인증 상태를 확인해 주세요."

  $counts = (git rev-list --left-right --count origin/main...HEAD).Trim() -split "\s+"
  Assert-LastCommand "로컬 main과 origin/main의 차이를 확인하지 못했습니다."
  $behind = [int]$counts[0]
  $ahead = [int]$counts[1]
  if ($behind -gt 0) {
    throw "로컬 main이 origin/main보다 $behind개 커밋 뒤에 있습니다. 먼저 동기화해 주세요."
  }
  if (-not $PreflightOnly -and $ahead -eq 0) {
    throw "origin/main에 새로 배포할 커밋이 없습니다."
  }

  Write-Host "[2/4] 릴리스 검사"
  Push-Location $appRoot
  try {
    npm run check
    Assert-LastCommand "릴리스 검사에 실패하여 배포를 중단했습니다."
  }
  finally {
    Pop-Location
  }

  if ($PreflightOnly) {
    Write-Host "사전 점검 완료: 푸시와 운영 확인은 실행하지 않았습니다."
    return
  }

  Write-Host "[3/4] main 푸시 및 Vercel 자동 배포 요청"
  git push origin main
  Assert-LastCommand "main 푸시에 실패했습니다. 같은 인증을 반복하지 말고 Git 인증 상태를 확인해 주세요."

  Write-Host "[4/4] 운영 엔드포인트 확인"
  Start-Sleep -Seconds 30
  $env:PROBE_QA_PRODUCTION_URL = $ProductionUrl.TrimEnd("/")
  $smokeScript = @'
const base = process.env.PROBE_QA_PRODUCTION_URL;
const paths = ["/api/health", "/login"];

Promise.all(paths.map(async (path) => {
  const response = await fetch(base + path, { redirect: "manual" });
  const loginRedirect = path === "/login" && response.status >= 300 && response.status < 400;
  if (!response.ok && !loginRedirect) throw new Error(path + " returned " + response.status);
  return path + " " + response.status;
}))
  .then((values) => console.log(values.join(", ")))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
'@
  & node -e $smokeScript
  Assert-LastCommand "운영 엔드포인트 확인에 실패했습니다. Vercel 배포 상태를 한 번 확인해 주세요."

  Write-Host "배포 요청 및 운영 가용성 확인 완료: $ProductionUrl"
}
finally {
  Remove-Item Env:PROBE_QA_PRODUCTION_URL -ErrorAction SilentlyContinue
  Pop-Location
}
