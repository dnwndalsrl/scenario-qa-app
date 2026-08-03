import type { Locator, Page } from "playwright";
import type { ElementTarget } from "../types/scenario.js";
import { LocatorResolutionError } from "../utils/errors.js";

export async function resolveUniqueLocator(
  page: Page,
  target: ElementTarget
): Promise<Locator> {
  const locator = createLocator(page, target);
  const count = await locator.count();

  if (count !== 1) {
    const message =
      count === 0
        ? "대상 요소를 찾지 못했습니다."
        : "대상 요소가 여러 개이므로 안전하게 하나를 선택할 수 없습니다.";
    throw new LocatorResolutionError(
      {
        strategy: target.strategy,
        value: target.value,
        count
      },
      [
        message,
        `strategy=${target.strategy}`,
        `value=${target.value}`,
        `count=${count}`
      ].join(" ")
    );
  }

  return locator;
}

function createLocator(page: Page, target: ElementTarget): Locator {
  const exact = target.exact ?? true;

  switch (target.strategy) {
    case "testId":
      return page.getByTestId(target.value);
    case "role":
      return target.name === undefined
        ? page.getByRole(target.value)
        : page.getByRole(target.value, {
            name: target.name,
            exact
          });
    case "label":
      return page.getByLabel(target.value, { exact });
    case "placeholder":
      return page.getByPlaceholder(target.value, { exact });
    case "text":
      return page.getByText(target.value, { exact });
    case "css":
      return page.locator(target.value);
  }
}
