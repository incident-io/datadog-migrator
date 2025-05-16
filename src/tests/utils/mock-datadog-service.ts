/**
 * Mock implementation of the DatadogService for testing
 */
import type { DatadogService as IDatadogService } from "../../services/datadog.ts";
import { DatadogMonitor } from "../../types/index.ts";

/**
 * Records of API calls made by the mock service
 */
export interface APICallRecord {
  updateMonitor: {
    id: number;
    data: Partial<DatadogMonitor>;
  }[];
  createWebhook: {
    name: string;
    url: string;
    payload: string;
    customHeaders: string;
  }[];
  getWebhook: {
    name: string;
  }[];
}

/**
 * A mock DatadogService implementation for testing
 */
export class MockDatadogService {
  private monitors: DatadogMonitor[] = [];
  private webhooks: Record<string, { url: string; payload: string }> = {};
  
  // Records API calls for verification in tests
  public apiCalls: APICallRecord = {
    updateMonitor: [],
    createWebhook: [],
    getWebhook: [],
  };

  /**
   * Set the mock monitors for testing
   */
  public setMonitors(monitors: DatadogMonitor[]): void {
    this.monitors = [...monitors];
  }

  /**
   * Set existing webhooks for testing
   */
  public setWebhooks(webhooks: Record<string, { url: string; payload: string }>): void {
    this.webhooks = { ...webhooks };
  }

  /**
   * Reset all mocked data and call records
   */
  public reset(): void {
    this.monitors = [];
    this.webhooks = {};
    this.apiCalls = {
      updateMonitor: [],
      createWebhook: [],
      getWebhook: [],
    };
  }

  /**
   * Mock implementation of getMonitors
   */
  public getMonitors(): Promise<DatadogMonitor[]> {
    return Promise.resolve([...this.monitors]);
  }

  /**
   * Mock implementation of updateMonitor
   */
  public updateMonitor(id: number, data: Partial<DatadogMonitor>): Promise<DatadogMonitor> {
    // Record the call
    this.apiCalls.updateMonitor.push({ id, data });
    
    // Find and update the monitor
    const monitorIndex = this.monitors.findIndex(m => m.id === id);
    if (monitorIndex === -1) {
      return Promise.reject(new Error(`Monitor not found: ${id}`));
    }
    
    const monitor = this.monitors[monitorIndex];
    const updatedMonitor = {
      ...monitor,
      ...data,
    };
    
    this.monitors[monitorIndex] = updatedMonitor;
    return Promise.resolve(updatedMonitor);
  }

  /**
   * Mock implementation of getWebhook
   */
  public getWebhook(name: string): Promise<{ url: string; payload: string } | null> {
    // Record the call
    this.apiCalls.getWebhook.push({ name });
    
    return Promise.resolve(this.webhooks[name] || null);
  }

  /**
   * Mock implementation of createWebhook
   */
  public createWebhook({ name, url, payload, customHeaders }: {
    name: string;
    url: string;
    payload: string;
    customHeaders: string;
  }): Promise<void> {
    // Record the call
    this.apiCalls.createWebhook.push({ name, url, payload, customHeaders });
    
    // Add the webhook
    this.webhooks[name] = { url, payload };
    return Promise.resolve();
  }
}