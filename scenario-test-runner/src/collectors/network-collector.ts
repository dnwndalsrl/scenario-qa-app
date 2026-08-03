import type { Page, Request, Response } from "playwright";
import type { NetworkErrorEntry } from "../types/result.js";
import { redactText, redactUrl } from "../utils/redact.js";

export interface NetworkCollector {
  entries: NetworkErrorEntry[];
  dispose: () => void;
}

export function attachNetworkCollector(
  page: Page,
  sensitiveValues: readonly string[]
): NetworkCollector {
  const entries: NetworkErrorEntry[] = [];
  const limit = positiveInteger(process.env.MAX_LOG_ITEMS_PER_RUN, 500);

  const onRequestFailed = (request: Request): void => {
    if (entries.length >= limit) return;
    entries.push({
      url: redactUrl(request.url(), sensitiveValues),
      method: request.method(),
      status: null,
      failureText: redactText(
        request.failure()?.errorText ?? "Unknown request failure",
        sensitiveValues
      ),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString()
    });
  };

  const onResponse = (response: Response): void => {
    if (response.status() < 400) {
      return;
    }
    const request = response.request();
    if (entries.length >= limit) return;
    entries.push({
      url: redactUrl(response.url(), sensitiveValues),
      method: request.method(),
      status: response.status(),
      failureText: null,
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString()
    });
  };

  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  return {
    entries,
    dispose: () => {
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    }
  };
}

function positiveInteger(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
