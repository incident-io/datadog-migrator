/**
 * Custom test implementation for MigrationService tests
 */
import { MigrationService } from "../../services/migration.ts";
import { DatadogMonitor, IncidentioConfig, MigrationMapping, MigrationType } from "../../types/index.ts";
import { assertEquals } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { withMockedEnv } from "../utils/test-stub.ts";

// This is a minimal implementation of v1.WebhooksIntegration for mocking
interface MockWebhooksIntegration {
  name: string;
  url: string;
  payload: string;
  customHeaders?: string;
}

/**
 * Mock DatadogService for testing - implements just enough to make the tests work
 */
export class MockDatadogService {
  private _monitors: DatadogMonitor[] = [];
  private _webhooks: Record<string, MockWebhooksIntegration> = {};
  
  public apiCalls = {
    updateMonitor: [] as { id: number; data: Partial<DatadogMonitor> }[],
    createWebhook: [] as { name: string; url: string; payload: string; customHeaders: string }[],
    getWebhook: [] as { name: string }[],
  };

  // Initialize mock with test data
  setMonitors(monitors: DatadogMonitor[]): void {
    this._monitors = [...monitors];
  }

  setWebhooks(webhooks: Record<string, MockWebhooksIntegration>): void {
    this._webhooks = { ...webhooks };
  }

  // DatadogService API implementations
  async getMonitors(): Promise<DatadogMonitor[]> {
    return [...this._monitors];
  }

  async updateMonitor(id: number, data: Partial<DatadogMonitor>): Promise<DatadogMonitor> {
    this.apiCalls.updateMonitor.push({ id, data });
    
    const index = this._monitors.findIndex(m => m.id === id);
    if (index === -1) {
      throw new Error(`Monitor not found: ${id}`);
    }
    
    const monitor = this._monitors[index];
    const updatedMonitor = { ...monitor, ...data };
    this._monitors[index] = updatedMonitor;
    
    return updatedMonitor;
  }

  async getWebhook(name: string): Promise<MockWebhooksIntegration | null> {
    this.apiCalls.getWebhook.push({ name });
    return this._webhooks[name] || null;
  }

  async createWebhook(webhook: { name: string; url: string; payload: string; customHeaders?: string }): Promise<void> {
    this.apiCalls.createWebhook.push({
      name: webhook.name,
      url: webhook.url,
      payload: webhook.payload,
      customHeaders: webhook.customHeaders || "",
    });
    
    this._webhooks[webhook.name] = {
      name: webhook.name,
      url: webhook.url,
      payload: webhook.payload,
      customHeaders: webhook.customHeaders,
    };
  }
}

/**
 * Run a standardized test for validating additionalMetadata functionality
 * Now uses environment variable stubbing
 */
export async function testAdditionalMetadata(
  mockService: MockDatadogService,
  config: IncidentioConfig,
  mappings: MigrationMapping[],
  monitor: DatadogMonitor,
  expectedTags: string[] | undefined,
  webhookName: string | null,
  assertWebhookPayloadIncludes: string[] | null,
): Promise<void> {
  // Wrap the test in our environment stubbing function
  await withMockedEnv(async () => {
    // Create the migration service with mock dependencies
    const migrationService = new MigrationService(
      mockService as any,
      config,
      mappings,
      { dryRun: false }
    );
    
    // Run the migration
    await migrationService.migrateMonitors({
      type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
      webhookPerTeam: config.webhookPerTeam,
      verbose: true
    });
    
    // Verify update calls
    assertEquals(mockService.apiCalls.updateMonitor.length, 1, "Expected exactly one monitor update call");
    
    // Verify webhook call if a team-specific webhook is expected
    if (webhookName) {
      assertEquals(mockService.apiCalls.createWebhook.length, 1, "Expected exactly one webhook creation call");
      assertEquals(mockService.apiCalls.createWebhook[0].name, webhookName, "Webhook name doesn't match expected value");
      
      // Check webhook payload includes expected fields
      if (assertWebhookPayloadIncludes) {
        for (const expectedText of assertWebhookPayloadIncludes) {
          assertEquals(
            mockService.apiCalls.createWebhook[0].payload.includes(expectedText),
            true,
            `Webhook payload should include: ${expectedText}`
          );
        }
      }
    }
    
    // Check tags if expected
    const updateCall = mockService.apiCalls.updateMonitor[0];
    
    if (expectedTags) {
      assertEquals(
        updateCall.data.tags?.sort(),
        expectedTags.sort(),
        "Tags don't match expected values"
      );
    } else {
      assertEquals(updateCall.data.tags, undefined, "Expected no tags to be added");
    }
  });
}