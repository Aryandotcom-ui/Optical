/** A copy of `value` without the given keys. */
export function omitKeys<T extends object>(value: T, keys: readonly string[]): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  ) as Partial<T>;
}
