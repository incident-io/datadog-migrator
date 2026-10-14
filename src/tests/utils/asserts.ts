import { expect } from "bun:test";

export function assertEquals<T>(actual: T, expected: T, _msg?: string): void {
  expect(actual).toEqual(expected);
}

export function assertStringIncludes(
  actual: string,
  expected: string,
  _msg?: string,
): void {
  expect(actual).toContain(expected);
}

export async function assertRejects(
  fn: () => Promise<unknown>,
  errorClass?: new (...args: never[]) => Error,
  msgIncludes?: string,
  _msg?: string,
): Promise<void> {
  let thrown: unknown;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeDefined();
  if (errorClass) expect(thrown).toBeInstanceOf(errorClass);
  if (msgIncludes) expect((thrown as Error).message).toContain(msgIncludes);
}
