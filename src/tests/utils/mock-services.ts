/**
 * Mock service implementations for testing
 */
import { DatadogMonitor } from "../../types/index.ts";

// Define the webhook interface for our mock
export interface DatadogWebhook {
  name: string;
  url: string;
  payload: string;
  customHeaders?: string;
}

// Mock DatadogService implementation for tests
export class MockDatadogService {
  monitors: DatadogMonitor[] = [];
  mockWebhooks: Record<string, DatadogWebhook> = {};
  
  // Call tracking for assertions
  updateCalls: Array<{ id: number; data: Partial<DatadogMonitor> }> = [];
  webhookCalls: DatadogWebhook[] = [];
  
  // Mock the monitorsApi and webhooksApi properties
  monitorsApi = {};
  webhooksApi = {};
  
  async getMonitors(): Promise<DatadogMonitor[]> {
    console.log("getMonitors called, returning:", JSON.stringify(this.monitors));
    return this.monitors;
  }
  
  async updateMonitor(
    id: number, 
    data: Partial<DatadogMonitor>
  ): Promise<DatadogMonitor> {
    console.log(`updateMonitor called for id ${id} with data:`, JSON.stringify(data));
    this.updateCalls.push({ id, data });
    return { id, name: 'Test Monitor', message: 'Test Message', tags: data.tags || [], ...data };
  }
  
  async getWebhook(name: string): Promise<DatadogWebhook | null> {
    console.log(`getWebhook called for ${name}`);
    return this.mockWebhooks[name] || null;
  }
  
  async createWebhook(webhook: DatadogWebhook): Promise<null> {
    console.log(`createWebhook called for ${webhook.name}`);
    this.webhookCalls.push(webhook);
    this.mockWebhooks[webhook.name] = webhook;
    return null;
  }
}

/**
 * Creates a configured mock Datadog service for testing
 */
export function createMockDatadogService(): MockDatadogService {
  return new MockDatadogService();
}