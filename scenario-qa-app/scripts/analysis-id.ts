export function analysisIdFromArgs(args: string[]): string {
  const direct = args.find((value) => value.startsWith("--analysis-id="))?.split("=")[1];
  const index = args.indexOf("--analysis-id"); const value = direct || (index >= 0 ? args[index + 1] : undefined);
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("A valid --analysis-id UUID is required");
  return value;
}
