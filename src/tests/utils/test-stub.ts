/**
 * Test utilities for mocking environment variables
 */

const mockEnv: Record<string, string> = {
  DEBUG: "true",
  INCIDENTIO_WEBHOOK_TOKEN: "test-token",
};

export function setupStubs() {
  const original: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(mockEnv)) {
    original[key] = process.env[key];
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

// Helper function for running tests with mocked environment
export async function withMockedEnv<T>(testFn: () => Promise<T>): Promise<T> {
  const cleanup = setupStubs();
  try {
    return await testFn();
  } finally {
    cleanup();
  }
}
