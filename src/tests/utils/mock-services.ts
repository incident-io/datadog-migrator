/**
 * Re-export the unified MockDatadogService implementation
 * 
 * This file exists for backward compatibility with existing tests
 * that import from mock-services.ts.
 */
export { MockDatadogService, createMockDatadogService } from './mock-datadog-service.ts';
export type { DatadogWebhook } from './mock-datadog-service.ts';