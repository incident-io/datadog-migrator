/**
 * Tests for add-incidentio command
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import type { DatadogWebhook } from "../utils/mock-datadog-service.ts";
import { createPagerDutyMonitor, createTestConfig, createTestMappings } from "../utils/test-utils.ts";
import { withMockedEnv } from "../utils/test-stub.ts";

/**
 * Test the add-incidentio command with single webhook mode (all services share one webhook)
 * This test verifies:
 * - Additional metadata is added as tags to the monitors
 * - Team tags are added based on mappings
 */
Deno.test("add-incidentio command - single webhook mode with additionalMetadata", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    mockDatadogService.monitors = [
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createPagerDutyMonitor("database", { id: 2, tags: ["env:prod"] })
    ];
    
    // Create test config directly in memory
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: false,
        addTeamTags: true,
        source: "pagerduty"
      }),
      mappings: createTestMappings("pagerduty")
    };
    
    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false }
    );
    
    // Act - run the migration
    console.log("Running migration with single webhook...");
    const result = await migrationService.migrateMonitors({
      type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
      webhookPerTeam: false
    });
    
    // Assert
    console.log("Migration result:", JSON.stringify(result));
    
    // Check that both monitors were processed
    assertEquals(result.processed, 2, "Should process both monitors");
    
    // Verify that updateMonitor was called twice
    assertEquals(mockDatadogService.updateCalls.length, 2, "Should call updateMonitor twice");
    
    // Verify that only one webhook was created
    assertEquals(mockDatadogService.webhookCalls.length, 1, "Should create only one webhook");
    assertEquals(
      mockDatadogService.webhookCalls[0].name, 
      "incident-io", 
      "Should create the default webhook"
    );
    
    // Check that all monitors got the same webhook
    for (const update of mockDatadogService.updateCalls) {
      assertStringIncludes(
        update.data.message || "", 
        "@webhook-incident-io", 
        "All monitors should get the same webhook"
      );
    }
    
    // Check that the monitor for api-critical was updated with correct tags
    const apiUpdate = mockDatadogService.updateCalls
      .find((update: { id: number; data: Partial<{ message: string }> }) => 
        update.data.message?.includes("api-critical"));
    
    if (!apiUpdate) {
      throw new Error("Could not find update for api-critical monitor");
    }
    
    const apiTags = apiUpdate.data.tags || [];
    assertEquals(apiTags.includes("priority:high"), true, "Should add priority:high tag");
    assertEquals(apiTags.includes("service:api"), true, "Should add service:api tag");
    assertEquals(apiTags.includes("team:api-team"), true, "Should add team:api-team tag");
    
    // Check that the monitor for database was updated with correct tags
    const dbUpdate = mockDatadogService.updateCalls
      .find((update: { id: number; data: Partial<{ message: string }> }) => 
        update.data.message?.includes("database"));
    
    if (!dbUpdate) {
      throw new Error("Could not find update for database monitor");
    }
    
    const dbTags = dbUpdate.data.tags || [];
    assertEquals(dbTags.includes("priority:high"), true, "Should add priority:high tag");
    assertEquals(dbTags.includes("service:database"), true, "Should add service:database tag");
    assertEquals(dbTags.includes("team:platform-team"), true, "Should add team:platform-team tag");
  });
});

/**
 * Test the add-incidentio command with team webhook mode (each team gets its own webhook)
 * This test verifies:
 * - Each team gets a unique webhook
 * - Additional metadata is included in webhook payloads
 * - Monitor messages are updated with the correct team-specific webhook
 */
Deno.test("add-incidentio command - team webhook mode with additionalMetadata", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    mockDatadogService.monitors = [
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createPagerDutyMonitor("api-non-critical", { id: 2, tags: ["env:staging"] }),
      createPagerDutyMonitor("database", { id: 3, tags: ["env:prod"] })
    ];
    
    // Create test config directly in memory with team-specific webhooks
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: true,  // Team-specific webhooks
        addTeamTags: false,    // No need for team tags in this mode
        source: "pagerduty"
      }),
      mappings: createTestMappings("pagerduty")
    };
    
    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false }
    );
    
    // Act - run the migration
    console.log("Running migration with team webhooks...");
    const result = await migrationService.migrateMonitors({
      type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
      webhookPerTeam: true
    });
    
    // Assert
    console.log("Migration result:", JSON.stringify(result));
    
    // Check that all monitors were processed
    assertEquals(result.processed, 3, "Should process all monitors");
    
    // Verify that updateMonitor was called for each monitor
    assertEquals(mockDatadogService.updateCalls.length, 3, "Should update all monitors");
    
    // Verify that we created the correct number of webhooks (for each team)
    assertEquals(
      mockDatadogService.webhookCalls.length, 
      2, 
      "Should create a webhook for each team (api-team and platform-team)"
    );
    
    // Verify that we created the expected team-specific webhooks
    const webhookNames = mockDatadogService.webhookCalls.map((call: DatadogWebhook) => call.name);
    assertEquals(
      webhookNames.includes("incident-io-api-team"), 
      true, 
      "Should create a webhook for api-team"
    );
    assertEquals(
      webhookNames.includes("incident-io-platform-team"), 
      true, 
      "Should create a webhook for platform-team"
    );
    
    // Check that each team's webhook includes the correct additionalMetadata
    const apiTeamWebhook = mockDatadogService.webhookCalls
      .find((webhook: DatadogWebhook) => webhook.name === "incident-io-api-team");
    
    if (!apiTeamWebhook) {
      throw new Error("Could not find webhook for api-team");
    }
    
    assertStringIncludes(
      apiTeamWebhook.payload,
      '"team": "api-team"',
      "Webhook payload should include team name"
    );
    assertStringIncludes(
      apiTeamWebhook.payload,
      '"priority": "high"',
      "Webhook payload should include priority metadata"
    );
    assertStringIncludes(
      apiTeamWebhook.payload,
      '"service": "api"',
      "Webhook payload should include service metadata"
    );
    
    // Check that the platform-team webhook has the correct metadata
    const platformTeamWebhook = mockDatadogService.webhookCalls
      .find((webhook: DatadogWebhook) => webhook.name === "incident-io-platform-team");
    
    if (!platformTeamWebhook) {
      throw new Error("Could not find webhook for platform-team");
    }
    
    assertStringIncludes(
      platformTeamWebhook.payload,
      '"team": "platform-team"',
      "Webhook payload should include team name"
    );
    assertStringIncludes(
      platformTeamWebhook.payload,
      '"priority": "high"',
      "Webhook payload should include priority metadata"
    );
    assertStringIncludes(
      platformTeamWebhook.payload,
      '"service": "database"',
      "Webhook payload should include service metadata"
    );
    
    // Verify that monitors for api-team get the api-team webhook
    const apiCriticalUpdate = mockDatadogService.updateCalls
      .find((update: { id: number; data: Partial<{ message: string }> }) => 
        update.data.message?.includes("api-critical"));
    
    if (!apiCriticalUpdate) {
      throw new Error("Could not find update for api-critical monitor");
    }
    
    assertStringIncludes(
      apiCriticalUpdate.data.message || "",
      "@webhook-incident-io-api-team",
      "api-critical monitor should get the api-team webhook"
    );
    
    // Verify that the database monitor gets the platform-team webhook
    const dbUpdate = mockDatadogService.updateCalls
      .find((update: { id: number; data: Partial<{ message: string }> }) => 
        update.data.message?.includes("database"));
    
    if (!dbUpdate) {
      throw new Error("Could not find update for database monitor");
    }
    
    assertStringIncludes(
      dbUpdate.data.message || "",
      "@webhook-incident-io-platform-team",
      "database monitor should get the platform-team webhook"
    );
  });
});