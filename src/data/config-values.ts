export type ConfigField = {
  key?: string;
  type: string;
  default?: unknown;
  options?: { value: string }[];
  min?: number;
  max?: number;
};

export function resolveConfig(
  fields: ConfigField[],
  saved: unknown,
): Record<string, unknown> {
  const values =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    fields
      .filter((field) => field.type !== "title" && field.key)
      .map((field) => {
        const value = values[field.key!];
        let valid = false;
        switch (field.type) {
          case "select":
            valid = !!field.options?.some((option) => option.value === value);
            break;
          case "number":
            valid =
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= (field.min ?? -Infinity) &&
              value <= (field.max ?? Infinity);
            break;
          case "boolean":
            valid = typeof value === "boolean";
            break;
          default:
            valid = typeof value === "string";
        }
        return [field.key!, valid ? value : field.default];
      }),
  );
}
