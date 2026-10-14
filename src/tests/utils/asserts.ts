import { expect } from "bun:test";

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  expect(actual, msg).toEqual(expected);
}

export function assertStringIncludes(
  actual: string,
  expected: string,
  msg?: string,
): void {
  expect(actual, msg).toContain(expected);
}
