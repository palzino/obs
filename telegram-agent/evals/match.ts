import { asStringList } from "./schema.ts";

export const stringifyValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return JSON.stringify(value);
};

export const matchesWhen = (
  input: Record<string, unknown>,
  when: Record<string, unknown> | undefined,
): boolean => {
  if (!when) {
    return true;
  }

  for (const [key, expected] of Object.entries(when)) {
    if (key.endsWith("_includes")) {
      const field = key.slice(0, -"_includes".length);
      const actual = stringifyValue(input[field]);
      if (!asStringList(expected).every((needle) => actual.includes(needle))) {
        return false;
      }
      continue;
    }
    if (key.endsWith("_excludes")) {
      const field = key.slice(0, -"_excludes".length);
      const actual = stringifyValue(input[field]);
      if (asStringList(expected).some((needle) => actual.includes(needle))) {
        return false;
      }
      continue;
    }
    if (key.endsWith("_matches")) {
      const field = key.slice(0, -"_matches".length);
      const actual = stringifyValue(input[field]);
      if (!new RegExp(String(expected)).test(actual)) {
        return false;
      }
      continue;
    }
    if (stringifyValue(input[key]) !== String(expected)) {
      return false;
    }
  }
  return true;
};
