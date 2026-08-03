import { MissingEnvironmentVariablesError } from "./errors.js";

const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const SENSITIVE_NAME_PATTERN =
  /(PASSWORD|TOKEN|SECRET|COOKIE|AUTH|API_KEY|PRIVATE_KEY|LOGIN_ID|ADMIN_ID|USERNAME)/i;

export interface EnvironmentResolution {
  value: unknown;
  sensitiveValues: string[];
}

export function resolveEnvironmentPlaceholders(
  input: unknown,
  environment: NodeJS.ProcessEnv
): EnvironmentResolution {
  const missing = new Set<string>();
  const sensitiveValues = new Set<string>();

  const resolveValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.replace(
        PLACEHOLDER_PATTERN,
        (_placeholder: string, variableName: string) => {
          const environmentValue = environment[variableName];
          if (environmentValue === undefined || environmentValue.length === 0) {
            missing.add(variableName);
            return `{{${variableName}}}`;
          }
          if (SENSITIVE_NAME_PATTERN.test(variableName)) {
            sensitiveValues.add(environmentValue);
          }
          return environmentValue;
        }
      );
    }

    if (Array.isArray(value)) {
      return value.map((item) => resolveValue(item));
    }

    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          resolveValue(nestedValue)
        ])
      );
    }

    return value;
  };

  const resolved = resolveValue(input);
  if (missing.size > 0) {
    throw new MissingEnvironmentVariablesError([...missing]);
  }

  return {
    value: resolved,
    sensitiveValues: [...sensitiveValues]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
