export function parseNumberArray(value: unknown): number[] | undefined {
  if (typeof value === "string" && value)
    return value
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n));
  if (Array.isArray(value)) return value.map(Number).filter((n) => !Number.isNaN(n));
  return undefined;
}
