#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_environment
compose exec -T app node --input-type=module -e "
  import { chromium } from './.output/server/node_modules/playwright/index.mjs';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<h1>Scenario QA Chromium smoke test</h1>');
  if (await page.textContent('h1') !== 'Scenario QA Chromium smoke test') process.exitCode = 1;
  await browser.close();
" || fail DEPLOY_CHROMIUM_START_FAILED "Chromium could not launch and close inside the application container."
printf 'Chromium launch, page evaluation, and shutdown passed.\n'
