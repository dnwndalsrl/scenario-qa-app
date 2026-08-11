const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidArg(args: string[], name: string): string {
  const flag = `--${name}`;
  const direct = args.find((value) => value.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const index = args.indexOf(flag);
  const value = direct || (index >= 0 ? args[index + 1] : undefined);
  if (!value || !uuidPattern.test(value)) throw new Error(`A valid ${flag} UUID is required`);
  return value;
}
