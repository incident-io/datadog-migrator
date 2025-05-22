/**
 * Unified mock implementation of the DatadogService for testing
 */
import { DatadogMonitor } from "../../types/index.ts";

/**
 * Interface for Datadog webhook
 */
export interface DatadogWebhook {
  name: string;
  url: string;
  payload: string;
  customHeaders?: string;
}

/**
 * A unified mock DatadogService implementation for all tests
 * This combines features from the previous implementations.
 */
export class MockDatadogService {
  // Data storage
  public monitors: DatadogMonitor[] = [];
  public webhooks: Record<string, DatadogWebhook> = {};

  // Mock API objects for compatibility with real DatadogService
  public monitorsApi = {};
  public webhooksApi = {};

  // Call tracking for assertions
  public updateCalls: Array<{ id: number; data: Partial<DatadogMonitor> }> = [];
  public webhookCalls: DatadogWebhook[] = [];

  /**
   * Set the mock monitors for testing
   * This is a convenience method for setting up test data
   */
  public setMonitors(monitors: DatadogMonitor[]): void {
    this.monitors = [...monitors];
  }

  /**
   * Set existing webhooks for testing
   * This is a convenience method for setting up test data
   */
  public setWebhooks(webhooks: Record<string, DatadogWebhook>): void {
    this.webhooks = { ...webhooks };
  }

  /**
   * Reset all mocked data and call records
   * Useful for cleaning up between tests
   */
  public reset(): void {
    this.monitors = [];
    this.webhooks = {};
    this.updateCalls = [];
    this.webhookCalls = [];
  }

  /**
   * Mock implementation of getMonitors
   */
  // deno-lint-ignore require-await
  public async getMonitors(): Promise<DatadogMonitor[]> {
    try {
      if (Deno.env.get("DEBUG") === "true") {
        console.log(
          "getMonitors called, returning:",
          JSON.stringify(this.monitors),
        );
      }
    } catch (_) {
      // Ignore env errors during testing
    }
    return [...this.monitors];
  }

  /**
   * Mock implementation of updateMonitor
   */
  // deno-lint-ignore require-await
  public async updateMonitor(
    id: number,
    data: Partial<DatadogMonitor>,
  ): Promise<DatadogMonitor> {
    try {
      if (Deno.env.get("DEBUG") === "true") {
        console.log(
          `updateMonitor called for id ${id} with data:`,
          JSON.stringify(data),
        );
      }
    } catch (_) {
      // Ignore env errors during testing
    }

    // Record the call for assertions
    this.updateCalls.push({ id, data });

    // Find and update the monitor in our data store
    const monitorIndex = this.monitors.findIndex((m) => m.id === id);
    if (monitorIndex === -1) {
      const error = new Error(`Monitor not found: ${id}`);
      console.error(error);
      throw error;
    }

    const monitor = this.monitors[monitorIndex];
    const updatedMonitor = {
      ...monitor,
      ...data,
    };

    // Update the stored monitor
    this.monitors[monitorIndex] = updatedMonitor;

    return updatedMonitor;
  }

  /**
   * Mock implementation of getWebhook
   */
  // deno-lint-ignore require-await
  public async getWebhook(name: string): Promise<DatadogWebhook | null> {
    try {
      if (Deno.env.get("DEBUG") === "true") {
        console.log(`getWebhook called for ${name}`);
      }
    } catch (_) {
      // Ignore env errors during testing
    }

    return this.webhooks[name] || null;
  }

  /**
   * Mock implementation of createWebhook
   */
  // deno-lint-ignore require-await
  public async createWebhook(webhook: DatadogWebhook): Promise<void> {
    try {
      if (Deno.env.get("DEBUG") === "true") {
        console.log(`createWebhook called for ${webhook.name}`);
      }
    } catch (_) {
      // Ignore env errors during testing
    }

    // Record the call for assertions
    this.webhookCalls.push(webhook);

    // Store the webhook
    this.webhooks[webhook.name] = webhook;

    return;
  }
}

/**
 * Factory function to create a configured mock DatadogService
 */
export function createMockDatadogService(): MockDatadogService {
  return new MockDatadogService();
}
