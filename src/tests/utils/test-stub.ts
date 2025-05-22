/**
 * Test utilities for mocking Deno environment functions
 */

// Create mock implementation for Deno.env.get
export function mockEnvGet(key: string): string | undefined {
  const mockEnv: Record<string, string> = {
    DEBUG: "true",
    INCIDENTIO_WEBHOOK_TOKEN: "test-token",
  };
  return mockEnv[key];
}

// Function to create a mock of Deno.env.get
export function setupStubs() {
  // Save original function
  const originalEnvGet = Deno.env.get;
  
  // Replace with mock
  // @ts-ignore: We know what we're doing
  Deno.env.get = mockEnvGet;
  
  // Return cleanup function
  return () => {
    // @ts-ignore: We know what we're doing
    Deno.env.get = originalEnvGet;
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