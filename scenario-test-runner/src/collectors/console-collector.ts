import type { ConsoleMessage, Page } from "playwright";
import type { ConsoleLogEntry } from "../types/result.js";
import { redactText } from "../utils/redact.js";

export interface ConsoleCollector {
  entries: ConsoleLogEntry[];
  dispose: () => void;
}

export function attachConsoleCollector(
  page: Page,
  sensitiveValues: readonly string[]
): ConsoleCollector {
  const entries: ConsoleLogEntry[] = [];
  const limit = positiveInteger(process.env.MAX_LOG_ITEMS_PER_RUN, 500);

  const onConsole = (message: ConsoleMessage): void => {
    const type = message.type();
    if (type !== "error" && type !== "warning") {
      return;
    }
    if (entries.length >= limit) return;
    entries.push({
      type,
      text: redactText(message.text(), sensitiveValues),
      timestamp: new Date().toISOString()
    });
  };

  const onPageError = (error: Error): void => {
    if (entries.length >= limit) return;
    entries.push({
      type: "pageerror",
      text: redactText(error.message, sensitiveValues),
      timestamp: new Date().toISOString()
    });
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  return {
    entries,
    dispose: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    }
  };
}

function positiveInteger(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
